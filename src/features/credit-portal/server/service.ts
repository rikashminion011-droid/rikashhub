import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { rangeToInstants } from "@/features/quick-pay/datetime";
import { divideEvenly, paiseToDecimalString, toPaise } from "@/lib/finance";
import { reconcile, recipientShare } from "../model";

/**
 * Credit Portal data: portals (cards and pay-later accounts with their limits), unbilled transactions, and imported statement
 * lines. Every read and write is scoped to `userId`. Statement lines that show an unbilled transaction settle it, so nothing is
 * counted twice.
 */

const paiseOf = (d: { toString(): string }) => toPaise(d.toString());
const MAX_PAISE = 99_999_999_99;
export const DEFAULT_PORTALS = ["HDFC", "Slice", "Amazon Pay Later", "Flipkart Pay Later"] as const;

export interface PortalRow {
  id: string;
  name: string;
  totalPaise: number;
  usedPaise: number;
  /** False until card information has been entered. */
  cardInfoSaved: boolean;
}

export interface UnbilledRow {
  id: string;
  portalId: string;
  occurredAt: string;
  reason: string;
  details: string;
  kind: "DEBIT" | "CREDIT";
  amountPaise: number;
  recipientIds: string[];
  /** True once a statement line shows this transaction (it is settled, and no longer counts as unbilled). */
  settled: boolean;
  /** Only in one person's report, when the line is for several people: how many, and the whole amount that was shared. */
  sharedWith?: number;
  fullPaise?: number;
}

export interface StatementRow {
  id: string;
  portalId: string;
  occurredAt: string;
  details: string;
  reason: string;
  debitPaise: number;
  creditPaise: number;
  recipientIds: string[];
  categoryId: string | null;
  /** True when this line settled an unbilled transaction. */
  settledUnbilled: boolean;
  /** Only in one person's report, when the line is for several people: how many, and the whole amount that was shared. */
  sharedWith?: number;
  fullPaise?: number;
}

const cleanName = (raw: string) => {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new ExpenseError("Enter a name.");
  if (name.length > 60) throw new ExpenseError("Use at most 60 characters.");
  return name;
};
const keyOf = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

// ───────────────────────── Portals ─────────────────────────

const toPortal = (p: { id: string; name: string; totalCredit: { toString(): string }; usedCredit: { toString(): string }; cardInfoSaved: boolean }): PortalRow => ({
  id: p.id,
  name: p.name,
  totalPaise: paiseOf(p.totalCredit),
  usedPaise: paiseOf(p.usedCredit),
  cardInfoSaved: p.cardInfoSaved,
});

/** The portals, oldest first. A new user starts with HDFC, Slice, Amazon Pay Later and Flipkart Pay Later. */
export async function listPortals(db: PrismaClient, userId: string): Promise<PortalRow[]> {
  const everMade = await db.creditPortal.count({ where: { userId } });
  if (everMade === 0) {
    const start = Date.now();
    // A millisecond apart, so they stay in this order.
    await db.creditPortal.createMany({ data: DEFAULT_PORTALS.map((name, i) => ({ userId, name, nameKey: keyOf(name), createdAt: new Date(start + i) })), skipDuplicates: true });
  }
  const rows = await db.creditPortal.findMany({ where: { userId, deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });
  return rows.map(toPortal);
}

export async function addPortal(db: PrismaClient, userId: string, name: string): Promise<string> {
  const clean = cleanName(name);
  const existing = await db.creditPortal.findUnique({ where: { userId_nameKey: { userId, nameKey: keyOf(clean) } } });
  if (existing && !existing.deletedAt) throw new ExpenseError(`"${existing.name}" already exists.`, "CONFLICT");
  if (existing) {
    // A portal removed earlier comes back with its records.
    await db.creditPortal.update({ where: { id: existing.id }, data: { deletedAt: null, name: clean } });
    return existing.id;
  }
  return (await db.creditPortal.create({ data: { userId, name: clean, nameKey: keyOf(clean) } })).id;
}

export async function renamePortal(db: PrismaClient, userId: string, id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  const clash = await db.creditPortal.findFirst({ where: { userId, nameKey: keyOf(clean), id: { not: id } } });
  if (clash) throw new ExpenseError(`"${clash.name}" already exists.`, "CONFLICT");
  const done = await db.creditPortal.updateMany({ where: { id, userId, deletedAt: null }, data: { name: clean, nameKey: keyOf(clean) } });
  if (done.count !== 1) throw new ExpenseError("That portal no longer exists.", "NOT_FOUND");
}

/** Hides a portal. Its transactions are kept (history is never lost), and it comes back if it is added again. */
export async function removePortal(db: PrismaClient, userId: string, id: string): Promise<void> {
  const done = await db.creditPortal.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (done.count !== 1) throw new ExpenseError("That portal no longer exists.", "NOT_FOUND");
}

/** Total credit and used credit; the balance is always total minus used. */
export async function setCardInfo(db: PrismaClient, userId: string, id: string, input: { totalPaise: number; usedPaise: number }): Promise<PortalRow> {
  const { totalPaise, usedPaise } = input;
  if (!Number.isSafeInteger(totalPaise) || !Number.isSafeInteger(usedPaise) || totalPaise < 0 || usedPaise < 0) throw new ExpenseError("Enter amounts of zero or more.");
  if (totalPaise > MAX_PAISE || usedPaise > MAX_PAISE) throw new ExpenseError("That amount is too large.");
  const done = await db.creditPortal.updateMany({
    where: { id, userId, deletedAt: null },
    data: { totalCredit: paiseToDecimalString(totalPaise), usedCredit: paiseToDecimalString(usedPaise), cardInfoSaved: true },
  });
  if (done.count !== 1) throw new ExpenseError("That portal no longer exists.", "NOT_FOUND");
  return toPortal((await db.creditPortal.findFirstOrThrow({ where: { id, userId } })));
}

async function requirePortal(db: Pick<PrismaClient, "creditPortal">, userId: string, id: string) {
  const portal = await db.creditPortal.findFirst({ where: { id, userId, deletedAt: null } });
  if (!portal) throw new ExpenseError("That portal no longer exists.", "NOT_FOUND");
  return portal;
}

async function checkRecipients(db: Pick<PrismaClient, "expenseParty">, userId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await db.expenseParty.count({ where: { id: { in: unique }, userId, deletedAt: null } });
  if (found !== unique.length) throw new ExpenseError("A selected person no longer exists. Pick again.", "NOT_FOUND");
}

// ───────────────────────── Unbilled transactions ─────────────────────────

const toUnbilled = (r: {
  id: string; portalId: string; occurredAt: Date; reason: string | null; details: string | null; kind: string; amount: { toString(): string }; recipientIds: string[]; reconciledStatementId: string | null;
}): UnbilledRow => ({
  id: r.id,
  portalId: r.portalId,
  occurredAt: r.occurredAt.toISOString(),
  reason: r.reason ?? "",
  details: r.details ?? "",
  kind: r.kind === "CREDIT" ? "CREDIT" : "DEBIT",
  amountPaise: paiseOf(r.amount),
  recipientIds: r.recipientIds,
  settled: r.reconciledStatementId !== null,
});

export async function listUnbilled(db: PrismaClient, userId: string, portalId: string, range: { from: string | null; to: string | null }): Promise<UnbilledRow[]> {
  const bounds = rangeToInstants(range.from, range.to);
  const rows = await db.creditPortalEntry.findMany({
    where: { userId, portalId, deletedAt: null, ...(bounds.gte || bounds.lt ? { occurredAt: bounds } : {}) },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toUnbilled);
}

export interface UnbilledInput {
  key: string;
  occurredAt: Date;
  reason: string;
  kind: "DEBIT" | "CREDIT";
  amountPaise: number;
  recipientIds: string[];
  details?: string;
}

function checkUnbilled(input: UnbilledInput) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new ExpenseError("Enter an amount above zero.");
  if (input.amountPaise > MAX_PAISE) throw new ExpenseError("That amount is too large.");
  if (input.reason.trim().length > 200) throw new ExpenseError("Keep the reason under 200 characters.");
  if (Number.isNaN(input.occurredAt.getTime())) throw new ExpenseError("Choose a valid date and time.");
  if (input.occurredAt.getTime() > Date.now() + 5 * 60_000) throw new ExpenseError("The date and time cannot be in the future.");
}

/** Saves a sheet of unbilled transactions together (all or nothing). The same request id saves it once. */
export async function saveUnbilledBulk(db: PrismaClient, userId: string, portalId: string, requestId: string, rows: readonly UnbilledInput[]): Promise<{ count: number; duplicate: boolean }> {
  if (rows.length === 0) throw new ExpenseError("Add at least one row with an amount.");
  rows.forEach(checkUnbilled);
  return db.$transaction(
    async (tx) => {
      await requirePortal(tx, userId, portalId);
      await checkRecipients(tx, userId, rows.flatMap((r) => r.recipientIds));
      const keyFor = (r: UnbilledInput) => `cp-bulk:${requestId}:${r.key}`;
      const already = await tx.creditPortalEntry.count({ where: { userId, dedupeKey: { in: rows.map(keyFor) } } });
      if (already > 0) return { count: already, duplicate: true };
      // Stamped in sheet order, so rows on the same date and time stay in the order they were typed.
      const stamp = Date.now();
      await tx.creditPortalEntry.createMany({
        data: rows.map((r, i) => ({
          userId,
          portalId,
          occurredAt: r.occurredAt,
          reason: r.reason.trim().replace(/\s+/g, " ") || null,
          details: r.details?.trim() || null,
          kind: r.kind,
          amount: paiseToDecimalString(r.amountPaise),
          recipientIds: [...new Set(r.recipientIds)],
          dedupeKey: keyFor(r),
          createdAt: new Date(stamp + i),
        })),
      });
      await reconcilePortal(tx, userId, portalId);
      return { count: rows.length, duplicate: false };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export async function updateUnbilled(db: PrismaClient, userId: string, id: string, input: Omit<UnbilledInput, "key">): Promise<void> {
  checkUnbilled({ ...input, key: id });
  await db.$transaction(async (tx) => {
    const row = await tx.creditPortalEntry.findFirst({ where: { id, userId, deletedAt: null } });
    if (!row) throw new ExpenseError("That transaction no longer exists.", "NOT_FOUND");
    await checkRecipients(tx, userId, input.recipientIds);
    await tx.creditPortalEntry.update({
      where: { id },
      data: {
        occurredAt: input.occurredAt,
        reason: input.reason.trim().replace(/\s+/g, " ") || null,
        kind: input.kind,
        amount: paiseToDecimalString(input.amountPaise),
        recipientIds: [...new Set(input.recipientIds)],
        // Changed, so it is looked at again: a settled one is released and matched afresh below.
        reconciledStatementId: null,
      },
    });
    await reconcilePortal(tx, userId, row.portalId);
  });
}

export async function deleteUnbilled(db: PrismaClient, userId: string, id: string): Promise<void> {
  const done = await db.creditPortalEntry.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (done.count !== 1) throw new ExpenseError("That transaction no longer exists.", "NOT_FOUND");
}

// ───────────────────────── Statement ─────────────────────────

const toStatement = (r: { id: string; portalId: string; occurredAt: Date; details: string; reason: string | null; debit: { toString(): string }; credit: { toString(): string }; recipientIds: string[]; categoryId: string | null }, settled: Set<string>): StatementRow => ({
  id: r.id,
  portalId: r.portalId,
  occurredAt: r.occurredAt.toISOString(),
  details: r.details,
  reason: r.reason ?? "",
  debitPaise: paiseOf(r.debit),
  creditPaise: paiseOf(r.credit),
  recipientIds: r.recipientIds,
  categoryId: r.categoryId,
  settledUnbilled: settled.has(r.id),
});

async function settledIds(db: Pick<PrismaClient, "creditPortalEntry">, userId: string, portalId: string): Promise<Set<string>> {
  const rows = await db.creditPortalEntry.findMany({ where: { userId, portalId, deletedAt: null, reconciledStatementId: { not: null } }, select: { reconciledStatementId: true } });
  return new Set(rows.map((r) => r.reconciledStatementId!));
}

export async function listStatement(db: PrismaClient, userId: string, portalId: string, range: { from: string | null; to: string | null }): Promise<{ rows: StatementRow[]; totals: { debitPaise: number; creditPaise: number } }> {
  const bounds = rangeToInstants(range.from, range.to);
  const [rows, settled] = await Promise.all([
    db.creditStatementEntry.findMany({
      where: { userId, portalId, deletedAt: null, ...(bounds.gte || bounds.lt ? { occurredAt: bounds } : {}) },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    settledIds(db, userId, portalId),
  ]);
  const mapped = rows.map((r) => toStatement(r, settled));
  return { rows: mapped, totals: { debitPaise: mapped.reduce((s, r) => s + r.debitPaise, 0), creditPaise: mapped.reduce((s, r) => s + r.creditPaise, 0) } };
}

export interface StatementInput {
  key: string;
  occurredAt: Date;
  details: string;
  debitPaise: number;
  creditPaise: number;
  reason: string;
  recipientIds: string[];
  categoryId: string | null;
}

/** The keys of statement lines already saved for a portal, so an upload can show what is new and what is a repeat. */
export async function savedStatementKeys(db: PrismaClient, userId: string, portalId: string): Promise<string[]> {
  const rows = await db.creditStatementEntry.findMany({ where: { userId, portalId, deletedAt: null }, select: { dedupeKey: true } });
  const prefix = `${portalId}|`;
  return rows.map((r) => (r.dedupeKey.startsWith(prefix) ? r.dedupeKey.slice(prefix.length) : r.dedupeKey));
}

/**
 * Saves imported statement lines. A line already imported for this portal is skipped, not doubled. Afterwards the portal's
 * unbilled transactions are matched to the statement, and the ones the statement shows are settled.
 */
export async function importStatement(db: PrismaClient, userId: string, portalId: string, lines: readonly StatementInput[]): Promise<{ imported: number; duplicates: number; settled: number }> {
  if (lines.length === 0) throw new ExpenseError("There is nothing to import.");
  for (const l of lines) {
    const debit = l.debitPaise > 0;
    const credit = l.creditPaise > 0;
    if (debit === credit) throw new ExpenseError("Each line must be a debit or a credit.");
    if (l.debitPaise > MAX_PAISE || l.creditPaise > MAX_PAISE) throw new ExpenseError("That amount is too large.");
  }
  return db.$transaction(
    async (tx) => {
      await requirePortal(tx, userId, portalId);
      await checkRecipients(tx, userId, lines.flatMap((l) => l.recipientIds));
      const keyFor = (l: StatementInput) => `${portalId}|${l.key}`;
      const existing = new Set((await tx.creditStatementEntry.findMany({ where: { userId, dedupeKey: { in: lines.map(keyFor) } }, select: { dedupeKey: true } })).map((r) => r.dedupeKey));
      const fresh = lines.filter((l) => !existing.has(keyFor(l)));
      if (fresh.length > 0) {
        // Each line is stamped one millisecond after the one before, so lines printed at the same minute keep the order the
        // statement prints them in (the list sorts by date, then by this time).
        const stamp = Date.now();
        await tx.creditStatementEntry.createMany({
          data: fresh.map((l, i) => ({
            userId,
            portalId,
            occurredAt: l.occurredAt,
            details: l.details.slice(0, 300),
            reason: l.reason.trim().replace(/\s+/g, " ").slice(0, 200) || null,
            debit: paiseToDecimalString(l.debitPaise),
            credit: paiseToDecimalString(l.creditPaise),
            recipientIds: [...new Set(l.recipientIds)],
            categoryId: l.categoryId,
            dedupeKey: keyFor(l),
            createdAt: new Date(stamp + i),
          })),
        });
      }
      const settled = await reconcilePortal(tx, userId, portalId);
      return { imported: fresh.length, duplicates: lines.length - fresh.length, settled };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

export async function updateStatementEntry(db: PrismaClient, userId: string, id: string, input: { reason: string; recipientIds: string[]; categoryId: string | null }): Promise<void> {
  if (input.reason.trim().length > 200) throw new ExpenseError("Keep the reason under 200 characters.");
  await db.$transaction(async (tx) => {
    const row = await tx.creditStatementEntry.findFirst({ where: { id, userId, deletedAt: null } });
    if (!row) throw new ExpenseError("That statement line no longer exists.", "NOT_FOUND");
    await checkRecipients(tx, userId, input.recipientIds);
    if (input.categoryId) {
      const type = Number(row.credit) > 0 ? "INCOME" : "EXPENSE";
      const ok = await tx.transactionCategory.count({ where: { id: input.categoryId, userId, deletedAt: null, type } });
      if (ok !== 1) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");
    }
    await tx.creditStatementEntry.update({ where: { id }, data: { reason: input.reason.trim().replace(/\s+/g, " ") || null, recipientIds: [...new Set(input.recipientIds)], categoryId: input.categoryId } });
    // Free whatever this line had settled; it is matched again with its new recipients.
    await tx.creditPortalEntry.updateMany({ where: { userId, reconciledStatementId: id }, data: { reconciledStatementId: null } });
    await reconcilePortal(tx, userId, row.portalId);
  });
}

export async function deleteStatementEntry(db: PrismaClient, userId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const done = await tx.creditStatementEntry.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (done.count !== 1) throw new ExpenseError("That statement line no longer exists.", "NOT_FOUND");
    // What it settled is unbilled again.
    await tx.creditPortalEntry.updateMany({ where: { userId, reconciledStatementId: id }, data: { reconciledStatementId: null } });
  });
}

// ───────────────────────── Matching ─────────────────────────

/**
 * Settles unbilled transactions that a statement line shows (same amount, kind and people, dated a few days apart). Each one is
 * used once on each side. Returns how many were settled by this run.
 */
export async function reconcilePortal(tx: Pick<PrismaClient, "creditPortalEntry" | "creditStatementEntry">, userId: string, portalId: string): Promise<number> {
  const [unbilled, statement, usedRows] = await Promise.all([
    tx.creditPortalEntry.findMany({ where: { userId, portalId, deletedAt: null, reconciledStatementId: null } }),
    tx.creditStatementEntry.findMany({ where: { userId, portalId, deletedAt: null } }),
    tx.creditPortalEntry.findMany({ where: { userId, portalId, deletedAt: null, reconciledStatementId: { not: null } }, select: { reconciledStatementId: true } }),
  ]);
  const used = new Set(usedRows.map((r) => r.reconciledStatementId!));
  const pairs = reconcile(
    unbilled.map((u) => ({ id: u.id, occurredAt: u.occurredAt, kind: u.kind === "CREDIT" ? ("CREDIT" as const) : ("DEBIT" as const), amountPaise: paiseOf(u.amount), recipientIds: u.recipientIds })),
    statement
      .filter((s) => !used.has(s.id))
      .map((s) => ({ id: s.id, occurredAt: s.occurredAt, kind: Number(s.credit) > 0 ? ("CREDIT" as const) : ("DEBIT" as const), amountPaise: paiseOf(Number(s.credit) > 0 ? s.credit : s.debit), recipientIds: s.recipientIds })),
  );
  for (const p of pairs) await tx.creditPortalEntry.update({ where: { id: p.unbilledId }, data: { reconciledStatementId: p.statementId } });
  return pairs.length;
}

// ───────────────────────── One recipient ─────────────────────────

/**
 * Everything on a portal for one person: their statement lines and their unbilled transactions that are not settled yet.
 * A line that is for several people shows this person's share only (the amount divided evenly between them), with
 * `sharedWith` and `fullPaise` saying how it was shared, so adding up a person's rows never counts the same money twice.
 */
export async function listForRecipient(
  db: PrismaClient,
  userId: string,
  portalId: string,
  partyId: string,
  range: { from: string | null; to: string | null },
): Promise<{ statement: StatementRow[]; unbilled: UnbilledRow[] }> {
  const bounds = rangeToInstants(range.from, range.to);
  const when: Prisma.DateTimeFilter | undefined = bounds.gte || bounds.lt ? bounds : undefined;
  const [statementRows, unbilledRows, settled] = await Promise.all([
    db.creditStatementEntry.findMany({ where: { userId, portalId, deletedAt: null, recipientIds: { has: partyId }, ...(when ? { occurredAt: when } : {}) }, orderBy: [{ occurredAt: "asc" }] }),
    db.creditPortalEntry.findMany({ where: { userId, portalId, deletedAt: null, reconciledStatementId: null, recipientIds: { has: partyId }, ...(when ? { occurredAt: when } : {}) }, orderBy: [{ occurredAt: "asc" }] }),
    settledIds(db, userId, portalId),
  ]);
  const statement = statementRows.map((r): StatementRow => {
    const row = toStatement(r, settled);
    const people = row.recipientIds.length;
    if (people <= 1) return row;
    return {
      ...row,
      debitPaise: recipientShare(row.debitPaise, row.recipientIds, partyId),
      creditPaise: recipientShare(row.creditPaise, row.recipientIds, partyId),
      sharedWith: people,
      fullPaise: row.creditPaise > 0 ? row.creditPaise : row.debitPaise,
    };
  });
  const unbilled = unbilledRows.map((r): UnbilledRow => {
    const row = toUnbilled(r);
    const people = row.recipientIds.length;
    if (people <= 1) return row;
    return { ...row, amountPaise: recipientShare(row.amountPaise, row.recipientIds, partyId), sharedWith: people, fullPaise: row.amountPaise };
  });
  return { statement, unbilled };
}

// ───────────────────────── For Debt Management ─────────────────────────

/** One person's part of a credit-portal transaction. A refund or credit counts as negative. */
export interface PortalShare {
  id: string;
  partyId: string;
  amountPaise: number;
  occurredAt: string;
  reason: string;
  portalId: string;
  portal: string;
  category: string;
  source: "STATEMENT" | "UNBILLED";
}

/**
 * What each person owes from credit portals in the period. A statement line with recipients counts; an unbilled transaction with
 * recipients counts only until a statement line settles it, so nothing is counted twice. Several recipients share evenly.
 */
export async function portalShares(db: PrismaClient, userId: string, range: { from: string | null; to: string | null }): Promise<PortalShare[]> {
  const bounds = rangeToInstants(range.from, range.to);
  const when: Prisma.DateTimeFilter | undefined = bounds.gte || bounds.lt ? bounds : undefined;
  const [statement, unbilled, portals, categories] = await Promise.all([
    db.creditStatementEntry.findMany({ where: { userId, deletedAt: null, portal: { deletedAt: null }, recipientIds: { isEmpty: false }, ...(when ? { occurredAt: when } : {}) }, orderBy: { occurredAt: "asc" } }),
    db.creditPortalEntry.findMany({ where: { userId, deletedAt: null, portal: { deletedAt: null }, reconciledStatementId: null, recipientIds: { isEmpty: false }, ...(when ? { occurredAt: when } : {}) }, orderBy: { occurredAt: "asc" } }),
    db.creditPortal.findMany({ where: { userId }, select: { id: true, name: true } }),
    db.transactionCategory.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const portalName = new Map(portals.map((p) => [p.id, p.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const out: PortalShare[] = [];
  for (const s of statement) {
    const signed = paiseOf(s.debit) - paiseOf(s.credit);
    for (const part of divideEvenly(signed, s.recipientIds)) {
      out.push({ id: s.id, partyId: part.id, amountPaise: part.paise, occurredAt: s.occurredAt.toISOString(), reason: s.reason || s.details, portalId: s.portalId, portal: portalName.get(s.portalId) ?? "", category: s.categoryId ? (categoryName.get(s.categoryId) ?? "") : "", source: "STATEMENT" });
    }
  }
  for (const u of unbilled) {
    const signed = u.kind === "CREDIT" ? -paiseOf(u.amount) : paiseOf(u.amount);
    for (const part of divideEvenly(signed, u.recipientIds)) {
      out.push({ id: u.id, partyId: part.id, amountPaise: part.paise, occurredAt: u.occurredAt.toISOString(), reason: u.reason || u.details || "", portalId: u.portalId, portal: portalName.get(u.portalId) ?? "", category: "", source: "UNBILLED" });
    }
  }
  return out;
}

/**
 * Keeps the Unbilled row of a Quick Entry or GPay transaction in step with it. When the bank it went through is one of your
 * credit portals (by name, for example HDFC), the transaction is listed under that portal's Unbilled Transactions; if it is
 * changed to another bank, or deleted, the row follows. The row starts without recipients, so it adds nothing to Debt
 * Management until you choose some (the transaction's own Split or Debt is counted on its own).
 */
export async function syncQuickEntryUnbilled(
  db: PrismaClient,
  userId: string,
  transactionId: string,
  entry: { accountId: string | null; kind: "DEBIT" | "CREDIT"; occurredAt: Date; reason: string; amountPaise: number } | null,
): Promise<void> {
  const existing = await db.creditPortalEntry.findUnique({ where: { userId_transactionId: { userId, transactionId } } });
  let portalId: string | null = null;
  if (entry?.accountId) {
    const account = await db.account.findFirst({ where: { id: entry.accountId, userId }, select: { name: true, parent: { select: { name: true } } } });
    const names = [account?.name, account?.parent?.name].filter((n): n is string => !!n).map(keyOf);
    if (names.length > 0) {
      const portals = await listPortals(db, userId);
      portalId = portals.find((p) => names.includes(keyOf(p.name)))?.id ?? null;
    }
  }
  if (!entry || !portalId) {
    if (existing && !existing.deletedAt) {
      await db.creditPortalEntry.update({ where: { id: existing.id }, data: { deletedAt: new Date(), reconciledStatementId: null } });
      await reconcilePortal(db, userId, existing.portalId);
    }
    return;
  }
  const data = { portalId, occurredAt: entry.occurredAt, reason: entry.reason.trim() || null, kind: entry.kind, amount: paiseToDecimalString(entry.amountPaise) };
  if (!existing) {
    await db.creditPortalEntry.create({ data: { userId, transactionId, ...data } });
  } else {
    const changed = existing.deletedAt !== null || existing.portalId !== portalId || existing.kind !== entry.kind || existing.occurredAt.getTime() !== entry.occurredAt.getTime() || paiseOf(existing.amount) !== entry.amountPaise;
    // A changed amount, day or portal no longer matches the statement line it settled, so it is matched again.
    await db.creditPortalEntry.update({ where: { id: existing.id }, data: { ...data, deletedAt: null, ...(changed ? { reconciledStatementId: null } : {}) } });
    if (existing.portalId !== portalId) await reconcilePortal(db, userId, existing.portalId);
  }
  await reconcilePortal(db, userId, portalId);
}

/**
 * The Unbilled rows for a whole Add Bulk sheet, made in one go. A row whose bank has the name of a credit portal (for example
 * HDFC) is listed under that portal, without recipients, and then matched against any statement lines already there.
 */
export async function linkBulkToPortals(
  tx: Pick<PrismaClient, "account" | "creditPortal" | "creditPortalEntry" | "creditStatementEntry">,
  userId: string,
  items: readonly { transactionId: string; accountId: string; kind: "DEBIT" | "CREDIT"; occurredAt: Date; reason: string; amountPaise: number }[],
): Promise<void> {
  if (items.length === 0) return;
  const portals = await tx.creditPortal.findMany({ where: { userId, deletedAt: null }, select: { id: true, nameKey: true } });
  if (portals.length === 0) return;
  const accounts = await tx.account.findMany({ where: { userId, id: { in: [...new Set(items.map((i) => i.accountId))] } }, select: { id: true, name: true, parent: { select: { name: true } } } });
  const portalOf = new Map<string, string>();
  for (const a of accounts) {
    const names = [a.name, a.parent?.name].filter((n): n is string => !!n).map(keyOf);
    const hit = portals.find((p) => names.includes(p.nameKey));
    if (hit) portalOf.set(a.id, hit.id);
  }
  const data = items.filter((i) => portalOf.has(i.accountId)).map((i) => ({ userId, transactionId: i.transactionId, portalId: portalOf.get(i.accountId)!, occurredAt: i.occurredAt, reason: i.reason.trim() || null, kind: i.kind, amount: paiseToDecimalString(i.amountPaise) }));
  if (data.length === 0) return;
  await tx.creditPortalEntry.createMany({ data });
  for (const portalId of new Set(data.map((d) => d.portalId))) await reconcilePortal(tx, userId, portalId);
}
