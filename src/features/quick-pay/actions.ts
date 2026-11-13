"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { METHOD_KINDS, type MethodKind } from "@/features/expenses/types";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { RateLimiter } from "@/lib/security/rate-limit";
import { istInstant } from "./datetime";
import { MAX_IMPORT_ROWS, banksNeeded, planImport, type ImportRow } from "./import/plan";
import {
  createBulk,
  createEntry,
  deleteEntry,
  getBalances,
  getDayTotals,
  getEntry,
  importEntries,
  listCreditChoices,
  listEntryIds,
  patchEntry,
  setOpeningBalance,
  updateEntry,
} from "./server/entries";
import { getSettings, resetSettingsSection, saveSettingsSection, setCategoryKeywords } from "./server/prefs";
import { SECTION_SCHEMAS, type QuickPaySettingsData, type SettingsSection } from "./settings-model";
import type { EntryPatch } from "./server/entries";
import type { TxRow, TxTotals } from "./types";
import {
  addBank,
  addMainCategory,
  addSubBank,
  addSubCategory,
  getBankTree,
  getCategoryTree,
  getQuickPayOptions,
  removeBank,
  removeCategory,
  renameBank,
  renameCategory,
} from "./server/settings";
import type { BalancesData, BankTreeNode, CategoryTreeNode, EntryDetails, QuickPayOptions, QuickPayResult, RecentCredit } from "./types";
import {
  MAX_BULK_ROWS,
  parseOpeningBalance,
  validateBulk,
  validateQuickPayInput,
  type BulkRowErrors,
  type BulkRowInput,
} from "./validation";

/**
 * Server actions for Quick Pay. Each one confirms who is signed in, validates the input again on
 * the server, does the work through the service layer, and returns fresh data.
 */

const writeLimiter = new RateLimiter(120, 60_000);
const GENERIC_ERROR = "Something went wrong and nothing was saved. Please try again.";

async function context() {
  const user = await requireUser();
  if (!writeLimiter.check(user.id).allowed) throw new ExpenseError("You are doing that too quickly. Wait a moment and try again.");
  const db = getPrisma();
  await ensureUserSetup(db, user);
  return { user, db };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof ExpenseError) return { ok: false, error: error.message };
  // Let sign-in redirects from requireUser() through.
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[quick-pay] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => {
  revalidatePath("/quick-pay", "layout");
};

const id = z.uuid();
const name = z.string().trim().min(1, "Enter a name.").max(60, "Use at most 60 characters.");

// ───────────────────────── Entries ─────────────────────────

const shareSchema = z.object({ partyId: id, method: z.enum(["PERCENT", "FIXED"]), value: z.string().max(20) });

const entrySchema = z.object({
  requestId: id,
  /** When set, the entry with this id is updated instead of a new one being created. */
  entryId: id.nullable(),
  amount: z.string().max(20),
  type: z.enum(["DEBIT", "CREDIT"]),
  reason: z.string().max(1000),
  accountId: id.nullable(),
  categoryId: id.nullable(),
  split: z.object({ enabled: z.boolean(), kind: z.enum(["SPLIT", "DEBT"]).optional(), shares: z.array(shareSchema).max(30).optional() }),
  /** Credits added to this debit. */
  creditIds: z.array(id).max(50).optional(),
  /** When editing: a new date (YYYY-MM-DD) and time (HH:mm) in India time. */
  date: z.string().max(10).optional(),
  time: z.string().max(5).optional(),
});

export async function saveEntryAction(raw: unknown): Promise<QuickPayResult<{ id: string; updated: boolean; duplicate: boolean; amountPaise: number }>> {
  try {
    const parsed = entrySchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That form could not be read. Reload the page and try again." };
    const { requestId, entryId, date, time, ...input } = parsed.data;

    const checked = validateQuickPayInput(input);
    if (!checked.ok) {
      const [first] = Object.values(checked.errors);
      return { ok: false, error: first ?? "Check the form and try again.", fieldErrors: checked.errors as Record<string, string> };
    }

    const { user, db } = await context();
    if (entryId) {
      let occurredAt: Date | undefined;
      if (date) {
        try {
          occurredAt = istInstant(date, time || "00:00");
        } catch {
          return { ok: false, error: "Enter a valid date and time." };
        }
        if (occurredAt.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: "The date and time cannot be in the future." };
      }
      await updateEntry(db, user.id, entryId, checked.value, occurredAt);
      refresh();
      return { ok: true, id: entryId, updated: true, duplicate: false, amountPaise: checked.value.amountPaise };
    }
    const saved = await createEntry(db, user.id, requestId, checked.value);
    refresh();
    return { ok: true, id: saved.id, updated: false, duplicate: saved.duplicate, amountPaise: checked.value.amountPaise };
  } catch (error) {
    return failure(error, "save entry");
  }
}

export async function deleteEntryAction(raw: unknown): Promise<QuickPayResult> {
  try {
    const parsed = z.object({ id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That entry could not be found." };
    const { user, db } = await context();
    await deleteEntry(db, user.id, parsed.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete entry");
  }
}

export async function getEntryAction(raw: unknown): Promise<QuickPayResult<{ entry: EntryDetails }>> {
  try {
    const parsed = z.object({ id }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That entry could not be found." };
    const user = await requireUser();
    const entry = await getEntry(getPrisma(), user.id, parsed.data.id);
    return entry ? { ok: true, entry } : { ok: false, error: "That entry no longer exists." };
  } catch (error) {
    return failure(error, "load entry");
  }
}

export async function getEntryIdsAction(): Promise<QuickPayResult<{ ids: string[] }>> {
  try {
    const user = await requireUser();
    return { ok: true, ids: await listEntryIds(getPrisma(), user.id) };
  } catch (error) {
    return failure(error, "list entries");
  }
}

/** The Credits Added choices, as chosen in Customized Settings (which transactions, and how many). */
export async function getRecentCreditsAction(): Promise<QuickPayResult<{ credits: RecentCredit[] }>> {
  try {
    const user = await requireUser();
    const db = getPrisma();
    const { credits } = await getSettings(db, user.id);
    return { ok: true, credits: await listCreditChoices(db, user.id, credits.source, credits.listSize) };
  } catch (error) {
    return failure(error, "load credits");
  }
}

const patchSchema = z.object({
  id,
  reason: z.string().max(1000).optional(),
  categoryId: id.nullable().optional(),
  split: z.object({ kind: z.enum(["SPLIT", "DEBT"]), shares: z.array(shareSchema).min(1).max(30) }).nullable().optional(),
});

/** Changes one field of a saved entry in place (Reason, category or split) and returns the row as the table shows it. */
export async function patchEntryAction(raw: unknown): Promise<QuickPayResult<{ row: TxRow }>> {
  try {
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That change could not be read." };
    const { id: entryId, ...patch } = parsed.data;
    const { user, db } = await context();
    const row = await patchEntry(db, user.id, entryId, patch as EntryPatch);
    refresh();
    return { ok: true, row };
  } catch (error) {
    return failure(error, "patch entry");
  }
}

/** Debit and credit totals for one day, for the Today's Summary calendar. */
export async function getDayTotalsAction(raw: unknown): Promise<QuickPayResult<{ totals: TxTotals }>> {
  try {
    const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Choose a valid date." };
    const user = await requireUser();
    return { ok: true, totals: await getDayTotals(getPrisma(), user.id, parsed.data.date) };
  } catch (error) {
    return failure(error, "day totals");
  }
}

export async function getOptionsAction(): Promise<QuickPayResult<{ options: QuickPayOptions }>> {
  try {
    const { user, db } = await context();
    return { ok: true, options: await getQuickPayOptions(db, user.id) };
  } catch (error) {
    return failure(error, "load options");
  }
}

// ───────────────────────── Bulk ─────────────────────────

const bulkSchema = z.object({
  requestId: id,
  rows: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        date: z.string().max(10),
        time: z.string().max(5),
        debit: z.string().max(20),
        credit: z.string().max(20),
        reason: z.string().max(1000),
        accountId: id.nullable(),
        categoryId: id.nullable(),
        partyId: id.nullable(),
      }),
    )
    .max(MAX_BULK_ROWS + 200),
});

export async function saveBulkAction(
  raw: unknown,
): Promise<QuickPayResult<{ count: number; duplicate: boolean }> | { ok: false; error: string; rowErrors: Record<string, BulkRowErrors> }> {
  try {
    const parsed = bulkSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That sheet could not be read. Reload the page and try again." };

    const checked = validateBulk(parsed.data.rows as BulkRowInput[], new Date());
    if (!checked.ok) return { ok: false, error: checked.message, rowErrors: checked.errors };

    const { user, db } = await context();
    const saved = await createBulk(db, user.id, parsed.data.requestId, checked.rows);
    refresh();
    return { ok: true, count: saved.count, duplicate: saved.duplicate };
  } catch (error) {
    return failure(error, "save bulk");
  }
}

// ───────────────────────── Balances ─────────────────────────

export async function getBalancesAction(): Promise<QuickPayResult<{ balances: BalancesData }>> {
  try {
    const { user, db } = await context();
    return { ok: true, balances: await getBalances(db, user.id) };
  } catch (error) {
    return failure(error, "load balances");
  }
}

export async function setOpeningBalanceAction(raw: unknown): Promise<QuickPayResult<{ balances: BalancesData }>> {
  try {
    const parsed = z.object({ accountId: id, amount: z.string().max(20), date: z.string().max(10).optional(), time: z.string().max(5).optional() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That balance could not be read." };
    const openingPaise = parseOpeningBalance(parsed.data.amount);
    if (openingPaise === null) return { ok: false, error: "Enter a valid amount, for example 2000 or -500.", fieldErrors: { amount: "Invalid amount" } };

    let openingAt: Date | null = null;
    if (parsed.data.date) {
      try {
        openingAt = istInstant(parsed.data.date, parsed.data.time || "00:00");
      } catch {
        return { ok: false, error: "Enter a valid date and time.", fieldErrors: { date: "Invalid date or time" } };
      }
      if (Number.isNaN(openingAt.getTime())) return { ok: false, error: "Enter a valid date and time." };
    }

    const { user, db } = await context();
    await setOpeningBalance(db, user.id, { accountId: parsed.data.accountId, openingPaise, openingAt });
    refresh();
    return { ok: true, balances: await getBalances(db, user.id) };
  } catch (error) {
    return failure(error, "set opening balance");
  }
}

// ───────────────────────── Import ─────────────────────────

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        id: z.string().max(40),
        kind: z.enum(["DEBIT", "CREDIT", "SELF_TRANSFER"]),
        occurredAt: z.string().max(40),
        amountPaise: z.number(),
        reason: z.string().max(400),
        bank: z.string().max(120),
        toBank: z.string().max(120).nullable(),
      }),
    )
    .max(MAX_IMPORT_ROWS),
  bankMap: z.record(z.string().max(120), z.string().nullable()),
  includeSelfTransfers: z.boolean(),
});

export interface ImportResult {
  imported: number;
  duplicates: number;
  skipped: number;
  invalid: { id: string; reason: string; why: string }[];
}

/**
 * Saves the rows of a previewed statement as GPay transactions. The server makes the plan again from the rows and the
 * chosen banks, so it never relies on what the browser worked out. Payments already imported are skipped, not doubled.
 */
export async function importGpayAction(raw: unknown): Promise<QuickPayResult<{ result: ImportResult }>> {
  try {
    const parsed = importSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That import could not be read. Upload the file again." };
    const { rows, bankMap, includeSelfTransfers } = parsed.data;
    if (rows.length === 0) return { ok: false, error: "There is nothing to import." };
    for (const name of banksNeeded(rows as ImportRow[], includeSelfTransfers)) {
      if (!(name in bankMap)) return { ok: false, error: `Choose a bank for ${name}, or skip it.` };
    }

    const plan = planImport(rows as ImportRow[], { bankMap, includeSelfTransfers }, new Set());
    const { user, db } = await context();
    const saved = await importEntries(db, user.id, plan.entries);
    refresh();
    return {
      ok: true,
      result: {
        imported: saved.imported,
        duplicates: saved.duplicates + plan.counts.duplicate,
        skipped: plan.counts.skipped,
        invalid: plan.statuses.flatMap((s, i) => (s.state === "invalid" ? [{ id: rows[i]!.id, reason: rows[i]!.reason, why: s.why }] : [])),
      },
    };
  } catch (error) {
    return failure(error, "import");
  }
}

// ───────────────────────── Customized settings: labels, split, credits, keywords ─────────────────────────

/** Saves one section of the settings ("fields", "split" or "credits"). The server checks it again and returns what is saved. */
export async function saveSettingsAction(raw: unknown): Promise<QuickPayResult<{ settings: QuickPaySettingsData }>> {
  try {
    const parsed = z.object({ section: z.enum(["fields", "split", "credits"]), value: z.unknown() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Those settings could not be read." };
    const section = parsed.data.section as SettingsSection;
    const checked = SECTION_SCHEMAS[section].safeParse(parsed.data.value);
    if (!checked.success) return { ok: false, error: checked.error.issues[0]?.message ?? "Check the settings and try again." };
    const { user, db } = await context();
    const settings = await saveSettingsSection(db, user.id, section, checked.data);
    refresh();
    return { ok: true, settings };
  } catch (error) {
    return failure(error, "save settings");
  }
}

export async function resetSettingsAction(raw: unknown): Promise<QuickPayResult<{ settings: QuickPaySettingsData }>> {
  try {
    const parsed = z.object({ section: z.enum(["fields", "split", "credits"]) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "That section could not be found." };
    const { user, db } = await context();
    const settings = await resetSettingsSection(db, user.id, parsed.data.section);
    refresh();
    return { ok: true, settings };
  } catch (error) {
    return failure(error, "reset settings");
  }
}

/** Sets the keywords of one category (replacing its list) and returns the refreshed category tree. */
export async function setKeywordsAction(raw: unknown): Promise<QuickPayResult<{ tree: CategoryTreeNode[] }>> {
  const parsed = z.object({ categoryId: id, keywords: z.array(z.string().max(80)).max(200) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Those keywords could not be read." };
  return categoryTree((db, uid) => setCategoryKeywords(db, uid, parsed.data), "set keywords");
}

// ───────────────────────── Customized settings: banks and categories ─────────────────────────

type BankTreeResult = QuickPayResult<{ tree: BankTreeNode[] }>;
type CategoryTreeResult = QuickPayResult<{ tree: CategoryTreeNode[] }>;

async function bankTree(run: (db: ReturnType<typeof getPrisma>, userId: string) => Promise<unknown>, label: string): Promise<BankTreeResult> {
  try {
    const { user, db } = await context();
    await run(db, user.id);
    refresh();
    return { ok: true, tree: await getBankTree(db, user.id) };
  } catch (error) {
    return failure(error, label);
  }
}

async function categoryTree(run: (db: ReturnType<typeof getPrisma>, userId: string) => Promise<unknown>, label: string): Promise<CategoryTreeResult> {
  try {
    const { user, db } = await context();
    await run(db, user.id);
    refresh();
    return { ok: true, tree: await getCategoryTree(db, user.id) };
  } catch (error) {
    return failure(error, label);
  }
}

const bad = (message: string) => ({ ok: false as const, error: message });
const kinds = METHOD_KINDS.map((k) => k.value) as [string, ...string[]];

export async function addBankAction(raw: unknown): Promise<BankTreeResult> {
  const p = z.object({ name, kind: z.enum(kinds) }).safeParse(raw);
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Enter a name.");
  return bankTree((db, uid) => addBank(db, uid, { name: p.data.name, kind: p.data.kind as MethodKind }), "add bank");
}
export async function addSubBankAction(raw: unknown): Promise<BankTreeResult> {
  const p = z.object({ mainId: id, name }).safeParse(raw);
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Enter a name.");
  return bankTree((db, uid) => addSubBank(db, uid, p.data), "add account");
}
export async function renameBankAction(raw: unknown): Promise<BankTreeResult> {
  const p = z.object({ id, name }).safeParse(raw);
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Enter a name.");
  return bankTree((db, uid) => renameBank(db, uid, p.data), "rename bank");
}
export async function removeBankAction(raw: unknown): Promise<BankTreeResult> {
  const p = z.object({ id }).safeParse(raw);
  if (!p.success) return bad("That bank could not be found.");
  return bankTree((db, uid) => removeBank(db, uid, p.data), "remove bank");
}

export async function addCategoryAction(raw: unknown): Promise<CategoryTreeResult> {
  const p = z.object({ name }).safeParse(raw);
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Enter a name.");
  return categoryTree((db, uid) => addMainCategory(db, uid, p.data), "add category");
}
export async function addSubCategoryAction(raw: unknown): Promise<CategoryTreeResult> {
  const p = z.object({ mainId: id, name }).safeParse(raw);
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Enter a name.");
  return categoryTree((db, uid) => addSubCategory(db, uid, p.data), "add sub-category");
}
export async function renameCategoryAction(raw: unknown): Promise<CategoryTreeResult> {
  const p = z.object({ id, name }).safeParse(raw);
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Enter a name.");
  return categoryTree((db, uid) => renameCategory(db, uid, p.data), "rename category");
}
export async function removeCategoryAction(raw: unknown): Promise<CategoryTreeResult> {
  const p = z.object({ id }).safeParse(raw);
  if (!p.success) return bad("That category could not be found.");
  return categoryTree((db, uid) => removeCategory(db, uid, p.data), "remove category");
}

/** The action set the Quick Pay screens use. Passed in as props so the components can also run against stand-ins. */
export interface QuickPayActions {
  saveEntry: typeof saveEntryAction;
  deleteEntry: typeof deleteEntryAction;
  getEntry: typeof getEntryAction;
  getEntryIds: typeof getEntryIdsAction;
  getRecentCredits: typeof getRecentCreditsAction;
  getOptions: typeof getOptionsAction;
}

/** What the "add here" boxes in the entry form call, so a category or person can be added without leaving the page. */
export interface QuickAddActions {
  addCategory: typeof addCategoryAction;
  addPerson: typeof import("@/features/users/actions").addPersonAction;
}
