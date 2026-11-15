"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExpenseError, ensureUserSetup } from "@/features/expenses/server/service";
import { istInstant } from "@/features/quick-pay/datetime";
import { addPersonAction } from "@/features/users/actions";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { parseAmountInput } from "@/lib/finance";
import { RateLimiter } from "@/lib/security/rate-limit";
import {
  addPortal,
  deleteStatementEntry,
  deleteUnbilled,
  importStatement,
  removePortal,
  renamePortal,
  saveUnbilledBulk,
  setCardInfo,
  updateStatementEntry,
  updateUnbilled,
  type PortalRow,
} from "./server/service";

/** Server actions for the Credit Portal. Each one confirms who is signed in and checks its input again on the server. */

export type CpResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

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
  if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw error;
  console.error(`[credit-portal] ${label} failed`, error);
  return { ok: false, error: GENERIC_ERROR };
}

const refresh = () => revalidatePath("/credit-portal", "layout");
const id = z.uuid();
const name = z.string().trim().min(1, "Enter a name.").max(60, "Use at most 60 characters.");

// ───────────────────────── Portals ─────────────────────────

export async function addPortalAction(raw: unknown): Promise<CpResult<{ id: string }>> {
  try {
    const p = z.object({ name }).safeParse(raw);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    const created = await addPortal(db, user.id, p.data.name);
    refresh();
    return { ok: true, id: created };
  } catch (error) {
    return failure(error, "add portal");
  }
}

export async function renamePortalAction(raw: unknown): Promise<CpResult> {
  try {
    const p = z.object({ id, name }).safeParse(raw);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Enter a name." };
    const { user, db } = await context();
    await renamePortal(db, user.id, p.data.id, p.data.name);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "rename portal");
  }
}

export async function removePortalAction(raw: unknown): Promise<CpResult> {
  try {
    const p = z.object({ id }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That portal could not be found." };
    const { user, db } = await context();
    await removePortal(db, user.id, p.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "remove portal");
  }
}

/** Total credit and used credit, typed as amounts ("76000"). The balance is worked out, never typed. */
export async function setCardInfoAction(raw: unknown): Promise<CpResult<{ portal: PortalRow }>> {
  try {
    const p = z.object({ id, total: z.string().max(20), used: z.string().max(20) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That card information could not be read." };
    const total = parseAmountInput(p.data.total.trim() === "" ? "0" : p.data.total);
    const used = parseAmountInput(p.data.used.trim() === "" ? "0" : p.data.used);
    if (total === null) return { ok: false, error: "Enter the total credit like 76000." };
    if (used === null) return { ok: false, error: "Enter the used credit like 45000." };
    const { user, db } = await context();
    const portal = await setCardInfo(db, user.id, p.data.id, { totalPaise: total, usedPaise: used });
    refresh();
    return { ok: true, portal };
  } catch (error) {
    return failure(error, "card info");
  }
}

// ───────────────────────── Unbilled ─────────────────────────

const unbilledRow = z.object({
  key: z.string().min(1).max(40),
  date: z.string().max(10),
  time: z.string().max(5),
  reason: z.string().max(1000),
  kind: z.enum(["DEBIT", "CREDIT"]),
  amount: z.string().max(20),
  recipientIds: z.array(id).max(60),
});

function toInput(row: z.infer<typeof unbilledRow>) {
  const amountPaise = parseAmountInput(row.amount);
  if (amountPaise === null || amountPaise <= 0) throw new ExpenseError("Enter an amount above zero (at most 2 decimals).");
  let occurredAt: Date;
  try {
    occurredAt = istInstant(row.date, row.time);
  } catch {
    throw new ExpenseError("Choose a valid date and time.");
  }
  return { key: row.key, occurredAt, reason: row.reason, kind: row.kind, amountPaise, recipientIds: row.recipientIds };
}

export async function saveUnbilledBulkAction(raw: unknown): Promise<CpResult<{ count: number; duplicate: boolean }>> {
  try {
    const p = z.object({ requestId: id, portalId: id, rows: z.array(unbilledRow).min(1).max(500) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That sheet could not be read. Reload the page and try again." };
    const rows = p.data.rows.map(toInput);
    const { user, db } = await context();
    const saved = await saveUnbilledBulk(db, user.id, p.data.portalId, p.data.requestId, rows);
    refresh();
    return { ok: true, ...saved };
  } catch (error) {
    return failure(error, "save unbilled");
  }
}

export async function updateUnbilledAction(raw: unknown): Promise<CpResult> {
  try {
    const p = z.object({ id, row: unbilledRow }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That change could not be read." };
    const { key: _key, ...input } = toInput(p.data.row);
    void _key;
    const { user, db } = await context();
    await updateUnbilled(db, user.id, p.data.id, input);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "update unbilled");
  }
}

export async function deleteUnbilledAction(raw: unknown): Promise<CpResult> {
  try {
    const p = z.object({ id }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That transaction could not be found." };
    const { user, db } = await context();
    await deleteUnbilled(db, user.id, p.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete unbilled");
  }
}

// ───────────────────────── Statement ─────────────────────────

const statementLine = z.object({
  key: z.string().min(1).max(200),
  at: z.string().max(40),
  details: z.string().max(400),
  debitPaise: z.number().int().min(0).max(99_999_999_99),
  creditPaise: z.number().int().min(0).max(99_999_999_99),
  reason: z.string().max(1000),
  recipientIds: z.array(id).max(60),
  categoryId: id.nullable(),
});

/** Saves the lines of a previewed statement. A line already imported is skipped. Unbilled transactions it shows are settled. */
export async function importStatementAction(raw: unknown): Promise<CpResult<{ imported: number; duplicates: number; settled: number }>> {
  try {
    const p = z.object({ portalId: id, lines: z.array(statementLine).min(1).max(2000) }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That import could not be read. Upload the statement again." };
    const lines = p.data.lines.map((l) => {
      const at = new Date(l.at);
      if (Number.isNaN(at.getTime())) throw new ExpenseError("A line has a date that cannot be read.");
      return { key: l.key, occurredAt: at, details: l.details, debitPaise: l.debitPaise, creditPaise: l.creditPaise, reason: l.reason, recipientIds: l.recipientIds, categoryId: l.categoryId };
    });
    const { user, db } = await context();
    const result = await importStatement(db, user.id, p.data.portalId, lines);
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    return failure(error, "import statement");
  }
}

export async function updateStatementEntryAction(raw: unknown): Promise<CpResult> {
  try {
    const p = z.object({ id, reason: z.string().max(1000), recipientIds: z.array(id).max(60), categoryId: id.nullable() }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That change could not be read." };
    const { user, db } = await context();
    await updateStatementEntry(db, user.id, p.data.id, { reason: p.data.reason, recipientIds: p.data.recipientIds, categoryId: p.data.categoryId });
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "update statement line");
  }
}

export async function deleteStatementEntryAction(raw: unknown): Promise<CpResult> {
  try {
    const p = z.object({ id }).safeParse(raw);
    if (!p.success) return { ok: false, error: "That line could not be found." };
    const { user, db } = await context();
    await deleteStatementEntry(db, user.id, p.data.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "delete statement line");
  }
}

/** Adds a person from a recipient list. */
export async function addRecipientAction(name: string): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const r = await addPersonAction({ name });
  if (!r.ok) return { ok: false, error: r.error };
  const created = r.createdId ? r.people.find((p) => p.id === r.createdId) : undefined;
  if (!created) return { ok: false, error: "The person was added but could not be found. Reload the page." };
  return { ok: true, id: created.id, name: created.name };
}

export interface PortalActions {
  addPortal: typeof addPortalAction;
  renamePortal: typeof renamePortalAction;
  removePortal: typeof removePortalAction;
  setCardInfo: typeof setCardInfoAction;
  saveUnbilledBulk: typeof saveUnbilledBulkAction;
  updateUnbilled: typeof updateUnbilledAction;
  deleteUnbilled: typeof deleteUnbilledAction;
  importStatement: typeof importStatementAction;
  updateStatementEntry: typeof updateStatementEntryAction;
  deleteStatementEntry: typeof deleteStatementEntryAction;
}
