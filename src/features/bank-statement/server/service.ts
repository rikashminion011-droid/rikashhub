import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { istDateOf, rangeToInstants } from "@/features/quick-pay/datetime";
import { effectiveRange, type TxFilters } from "@/features/quick-pay/filters";
import { paiseToDecimalString, toPaise } from "@/lib/finance";
import type { BsPage, BsPreviewRow, BsRow, BsTotals } from "../types";

/**
 * Bank Statement: the rows of imported bank statements. Every bank's rows are in one list, in date order (then the time, then
 * the row's place in its statement), never grouped by bank. Reads are scoped to `userId`.
 */

export const MAX_STATEMENT_ROWS = 20_000;
export const MAX_EXPORT_ROWS = 20_000;

const paiseOf = (d: { toString(): string } | null | undefined) => (d ? toPaise(d.toString()) : 0);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** A key that is the same for the same statement row every time it is imported. The nth identical row of a file gets its own key. */
export function dedupeKeys(accountId: string, rows: readonly BsPreviewRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [accountId, r.date, r.time, r.details.toLowerCase().replace(/\s+/g, " ").trim(), r.debitPaise, r.creditPaise, r.balancePaise ?? ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("sha1").update(`${base}|${n}`).digest("hex");
  });
}

function whereOf(userId: string, f: TxFilters, options: { withType: boolean } = { withType: true }): Prisma.BankStatementEntryWhereInput {
  const { from, to } = effectiveRange(f);
  const and: Prisma.BankStatementEntryWhereInput[] = [];
  if (f.types?.length && options.withType) {
    const kinds = f.types.filter((t) => t === "DEBIT" || t === "CREDIT");
    if (kinds.length === 1) and.push(kinds[0] === "DEBIT" ? { debit: { gt: 0 } } : { credit: { gt: 0 } });
    else if (kinds.length === 0) and.push({ id: { in: [] } });
  }
  if (f.q) {
    const q = f.q;
    and.push({ OR: [{ details: { contains: q, mode: "insensitive" } }, { reason: { contains: q, mode: "insensitive" } }, { account: { name: { contains: q, mode: "insensitive" } } }, { category: { name: { contains: q, mode: "insensitive" } } }] });
  }
  return {
    userId,
    deletedAt: null,
    ...(from || to ? { txDate: { ...(from ? { gte: day(from) } : {}), ...(to ? { lte: day(to) } : {}) } } : {}),
    ...(f.banks?.length ? { accountId: { in: f.banks } } : {}),
    ...(f.categories?.length ? { categoryId: { in: f.categories } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

const include = { account: { select: { name: true } }, category: { select: { name: true } } } as const;

type EntryWithNames = Prisma.BankStatementEntryGetPayload<{ include: typeof include }>;

const toRow = (e: EntryWithNames): BsRow => ({
  id: e.id,
  date: e.txDate.toISOString().slice(0, 10),
  time: e.txTime,
  details: e.details,
  reason: e.reason ?? "",
  categoryId: e.categoryId,
  category: e.category?.name ?? "",
  accountId: e.accountId,
  bank: e.account.name,
  debitPaise: paiseOf(e.debit),
  creditPaise: paiseOf(e.credit),
  balancePaise: e.balance === null ? null : paiseOf(e.balance),
});

const orderOf = (f: TxFilters): Prisma.BankStatementEntryOrderByWithRelationInput[] => {
  const dir = f.order === "asc" ? "asc" : "desc";
  return [{ txDate: dir }, { txTime: dir }, { seq: dir }, { id: dir }];
};

export async function listBankStatement(db: PrismaClient, userId: string, f: TxFilters): Promise<BsPage> {
  const where = whereOf(userId, f);
  const size = f.size ?? 50;
  const [count, sums, debitCount, creditCount] = await Promise.all([
    db.bankStatementEntry.count({ where }),
    db.bankStatementEntry.aggregate({ where, _sum: { debit: true, credit: true } }),
    db.bankStatementEntry.count({ where: { ...whereOf(userId, f, { withType: false }), debit: { gt: 0 } } }),
    db.bankStatementEntry.count({ where: { ...whereOf(userId, f, { withType: false }), credit: { gt: 0 } } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(count / size));
  const page = Math.min(Math.max(1, f.page), pageCount);
  const entries = await db.bankStatementEntry.findMany({ where, include, orderBy: orderOf(f), skip: (page - 1) * size, take: size });
  const totals: BsTotals = { count, debitPaise: paiseOf(sums._sum.debit), creditPaise: paiseOf(sums._sum.credit) };
  return { rows: entries.map(toRow), totals, page, pageCount, typeCounts: { debit: debitCount, credit: creditCount } };
}

/** Everything that matches the filters (no paging), for the exported report. */
export async function listBankStatementForExport(db: PrismaClient, userId: string, f: TxFilters): Promise<{ rows: BsRow[]; totals: BsTotals; truncated: boolean }> {
  const where = whereOf(userId, f);
  const [entries, sums, count] = await Promise.all([
    db.bankStatementEntry.findMany({ where, include, orderBy: orderOf(f), take: MAX_EXPORT_ROWS }),
    db.bankStatementEntry.aggregate({ where, _sum: { debit: true, credit: true } }),
    db.bankStatementEntry.count({ where }),
  ]);
  return { rows: entries.map(toRow), totals: { count, debitPaise: paiseOf(sums._sum.debit), creditPaise: paiseOf(sums._sum.credit) }, truncated: count > entries.length };
}

export const countBankStatementRows = (db: PrismaClient, userId: string) => db.bankStatementEntry.count({ where: { userId, deletedAt: null } });

/** How many of the rows of a statement are already saved (so the preview can say what an import would add). */
export async function countAlreadySaved(db: PrismaClient, userId: string, accountId: string, rows: readonly BsPreviewRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const keys = dedupeKeys(accountId, rows);
  return db.bankStatementEntry.count({ where: { userId, dedupeKey: { in: keys } } });
}

export async function importBankRows(db: PrismaClient, userId: string, accountId: string, rows: readonly BsPreviewRow[]): Promise<{ imported: number; duplicates: number }> {
  if (rows.length === 0) throw new ExpenseError("There is nothing to import.");
  if (rows.length > MAX_STATEMENT_ROWS) throw new ExpenseError(`At most ${MAX_STATEMENT_ROWS} rows can be imported at once.`);
  const bank = await db.account.findFirst({ where: { id: accountId, userId, deletedAt: null }, select: { id: true } });
  if (!bank) throw new ExpenseError("Choose the bank this statement is from.", "NOT_FOUND");
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^\d{2}:\d{2}$/.test(r.time)) throw new ExpenseError("A row has a date that could not be read.");
    if (!Number.isSafeInteger(r.debitPaise) || !Number.isSafeInteger(r.creditPaise) || r.debitPaise < 0 || r.creditPaise < 0 || (r.debitPaise === 0 && r.creditPaise === 0)) throw new ExpenseError("A row has an amount that could not be read.");
  }
  const keys = dedupeKeys(bank.id, rows);
  const created = await db.bankStatementEntry.createMany({
    data: rows.map((r, seq) => ({
      userId,
      accountId: bank.id,
      txDate: day(r.date),
      txTime: r.time,
      seq,
      details: r.details.trim().slice(0, 500) || "(no details)",
      debit: paiseToDecimalString(r.debitPaise),
      credit: paiseToDecimalString(r.creditPaise),
      balance: r.balancePaise === null ? null : paiseToDecimalString(r.balancePaise),
      dedupeKey: keys[seq]!,
    })),
    skipDuplicates: true,
  });
  await db.auditLog.create({ data: { userId, action: "bank-statement.import", entity: "bank_statement_entry", entityId: bank.id, after: { rows: rows.length, imported: created.count } } });
  return { imported: created.count, duplicates: rows.length - created.count };
}

/** Changes the Reason or Category of a row. */
export async function patchBankEntry(db: PrismaClient, userId: string, id: string, patch: { reason?: string; categoryId?: string | null }): Promise<BsRow> {
  const data: Prisma.BankStatementEntryUpdateInput = {};
  if (patch.reason !== undefined) {
    const reason = patch.reason.trim().replace(/\s+/g, " ");
    if (reason.length > 200) throw new ExpenseError("Keep the reason under 200 characters.");
    data.reason = reason || null;
  }
  if (patch.categoryId !== undefined) {
    if (patch.categoryId) {
      const found = await db.transactionCategory.count({ where: { id: patch.categoryId, userId, deletedAt: null } });
      if (!found) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");
      data.category = { connect: { id: patch.categoryId } };
    } else data.category = { disconnect: true };
  }
  const exists = await db.bankStatementEntry.count({ where: { id, userId, deletedAt: null } });
  if (!exists) throw new ExpenseError("That row no longer exists.", "NOT_FOUND");
  const updated = await db.bankStatementEntry.update({ where: { id }, data, include });
  return toRow(updated);
}

export async function deleteBankEntry(db: PrismaClient, userId: string, id: string): Promise<void> {
  const updated = await db.bankStatementEntry.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (updated.count !== 1) throw new ExpenseError("That row no longer exists.", "NOT_FOUND");
}

// ───────────────────────── Balances and what is missing from Transaction History ─────────────────────────

export interface BankBalance {
  accountId: string;
  bank: string;
  balancePaise: number;
  /** YYYY-MM-DD of the statement row the balance comes from. */
  asOf: string;
}

/** The balance of every bank that has statement rows: the balance on its last row (latest date, then time, then place in the statement). */
export async function getBankBalances(db: PrismaClient, userId: string): Promise<BankBalance[]> {
  const rows = await db.bankStatementEntry.findMany({
    where: { userId, deletedAt: null, balance: { not: null } },
    orderBy: [{ txDate: "desc" }, { txTime: "desc" }, { seq: "desc" }],
    distinct: ["accountId"],
    include: { account: { select: { name: true } } },
  });
  return rows.map((r) => ({ accountId: r.accountId, bank: r.account.name, balancePaise: paiseOf(r.balance), asOf: r.txDate.toISOString().slice(0, 10) })).sort((a, b) => a.bank.localeCompare(b.bank));
}

export interface NotEnteredRow {
  id: string;
  date: string;
  time: string;
  bank: string;
  details: string;
  debitPaise: number;
  creditPaise: number;
}

/**
 * Statement rows that have no matching entry in Transaction History: the same bank, the same day (India time), the same kind
 * and the same amount. Each entry covers one statement row, so two identical payments need two entries.
 */
export async function listNotEntered(db: PrismaClient, userId: string, range: { from: string | null; to: string | null }): Promise<{ rows: NotEnteredRow[]; totals: { debitPaise: number; creditPaise: number } }> {
  const entries = await db.bankStatementEntry.findMany({
    where: { userId, deletedAt: null, ...(range.from || range.to ? { txDate: { ...(range.from ? { gte: day(range.from) } : {}), ...(range.to ? { lte: day(range.to) } : {}) } } : {}) },
    include: { account: { select: { name: true } } },
    orderBy: [{ txDate: "desc" }, { txTime: "desc" }, { seq: "desc" }],
  });
  if (entries.length === 0) return { rows: [], totals: { debitPaise: 0, creditPaise: 0 } };

  // Transactions a day either side of the range, so a late-night entry is still compared on its own date.
  const bounds = rangeToInstants(range.from, range.to);
  const widen = (d: Date | undefined, by: number) => (d ? new Date(d.getTime() + by * 86_400_000) : undefined);
  const txns = await db.transaction.findMany({
    where: { userId, quickPay: true, deletedAt: null, ...(bounds.gte || bounds.lt ? { occurredAt: { ...(bounds.gte ? { gte: widen(bounds.gte, -1) } : {}), ...(bounds.lt ? { lt: widen(bounds.lt, 1) } : {}) } } : {}) },
    select: { type: true, amount: true, occurredAt: true, accountId: true, toAccountId: true },
  });
  const have = new Map<string, number>();
  const add = (key: string) => have.set(key, (have.get(key) ?? 0) + 1);
  for (const t of txns) {
    if (!t.occurredAt) continue;
    const date = istDateOf(t.occurredAt);
    const paise = paiseOf(t.amount);
    if (t.type === "EXPENSE" && t.accountId) add(`${t.accountId}|${date}|D|${paise}`);
    else if (t.type === "INCOME" && t.toAccountId) add(`${t.toAccountId}|${date}|C|${paise}`);
    else if (t.type === "TRANSFER") {
      if (t.accountId) add(`${t.accountId}|${date}|D|${paise}`);
      if (t.toAccountId) add(`${t.toAccountId}|${date}|C|${paise}`);
    }
  }
  const rows: NotEnteredRow[] = [];
  // Oldest first so that the earlier of two identical payments is the one matched.
  for (const e of [...entries].reverse()) {
    const debit = paiseOf(e.debit);
    const credit = paiseOf(e.credit);
    const date = e.txDate.toISOString().slice(0, 10);
    const key = debit > 0 ? `${e.accountId}|${date}|D|${debit}` : `${e.accountId}|${date}|C|${credit}`;
    const left = have.get(key) ?? 0;
    if (left > 0) have.set(key, left - 1);
    else rows.push({ id: e.id, date, time: e.txTime, bank: e.account.name, details: e.details, debitPaise: debit, creditPaise: credit });
  }
  rows.reverse();
  return { rows, totals: { debitPaise: rows.reduce((s, r) => s + r.debitPaise, 0), creditPaise: rows.reduce((s, r) => s + r.creditPaise, 0) } };
}
