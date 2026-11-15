import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { rangeToInstants } from "@/features/quick-pay/datetime";
import { paiseToDecimalString, toPaise } from "@/lib/finance";
import { reconcile } from "../model";

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
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
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
      await tx.creditPortalEntry.createMany({
        data: rows.map((r) => ({
          userId,
          portalId,
          occurredAt: r.occurredAt,
          reason: r.reason.trim().replace(/\s+/g, " ") || null,
          details: r.details?.trim() || null,
          kind: r.kind,
          amount: paiseToDecimalString(r.amountPaise),
          recipientIds: [...new Set(r.recipientIds)],
          dedupeKey: keyFor(r),
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
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
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
        await tx.creditStatementEntry.createMany({
          data: fresh.map((l) => ({
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

/** Everything on a portal for one person: their statement lines and their unbilled transactions that are not settled yet. */
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
  return { statement: statementRows.map((r) => toStatement(r, settled)), unbilled: unbilledRows.map(toUnbilled) };
}
