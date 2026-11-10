import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { recomputeBalances } from "@/lib/db/balances";
import { paiseToDecimalString, parseISODate, toPaise } from "@/lib/finance";
import { buildBalanceGroups, type AccountBalanceInput } from "../balances";
import { istDateOf, rangeToInstants } from "../datetime";
import { PAGE_SIZE, effectiveRange, type TxFilters } from "../filters";
import type { BalancesData, EntryDetails, RecentCredit, TxRow, TxTotals } from "../types";
import type { EntryType, ValidBulkRow, ValidQuickPay } from "../validation";

/** Saving, reading, editing and deleting Quick Pay entries (single and bulk), and the bank balances. Every query is scoped to `userId`. */

const arrow = (main: string | null | undefined, name: string) => (main ? `${main} → ${name}` : name);

/** Debit = an expense out of the bank; Credit = income into the bank. */
function typeFields(type: EntryType, accountId: string) {
  return type === "DEBIT"
    ? { type: "EXPENSE" as const, accountId, toAccountId: null }
    : { type: "INCOME" as const, accountId: null, toAccountId: accountId };
}

const typeOf = (t: { type: string }): EntryType => (t.type === "INCOME" ? "CREDIT" : "DEBIT");
const paiseOf = (amount: { toString(): string }) => toPaise(amount.toString());

// ───────────────────────── Checking what an entry points at ─────────────────────────

async function resolveBanks(tx: Prisma.TransactionClient, userId: string, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const accounts = await tx.account.findMany({
    where: { id: { in: unique }, userId, deletedAt: null },
    include: { children: { where: { deletedAt: null }, select: { id: true } } },
  });
  if (accounts.length !== unique.length) throw new ExpenseError("A selected bank no longer exists. Pick another.", "NOT_FOUND");
  const withAccounts = accounts.find((a) => a.children.length > 0);
  if (withAccounts) throw new ExpenseError(`Choose one of the accounts under ${withAccounts.name}.`);
}

async function resolveCategories(tx: Prisma.TransactionClient, userId: string, ids: readonly (string | null)[]): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return;
  const found = await tx.transactionCategory.count({ where: { id: { in: unique }, userId, deletedAt: null } });
  if (found !== unique.length) throw new ExpenseError("A selected category no longer exists. Pick another.", "NOT_FOUND");
}

async function resolvePersons(tx: Prisma.TransactionClient, userId: string, ids: readonly (string | null)[]): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return;
  const found = await tx.expenseParty.count({ where: { id: { in: unique }, userId, deletedAt: null } });
  if (found !== unique.length) throw new ExpenseError("A selected person no longer exists. Pick another.", "NOT_FOUND");
}

// ───────────────────────── Single entry ─────────────────────────

/**
 * Saves one entry with the exact moment it happened. `requestId` makes it idempotent: the same
 * form sent twice (double click, retry) returns the first entry.
 */
export async function createEntry(
  db: PrismaClient,
  userId: string,
  requestId: string,
  entry: ValidQuickPay,
  occurredAt: Date = new Date(),
): Promise<{ id: string; duplicate: boolean }> {
  const dedupeKey = `quick-pay:${requestId}`;
  try {
    return await db.$transaction(async (tx) => {
      const already = await tx.transaction.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } }, select: { id: true } });
      if (already) return { id: already.id, duplicate: true };

      await resolveBanks(tx, userId, [entry.accountId]);
      await resolveCategories(tx, userId, [entry.categoryId]);
      await resolvePersons(tx, userId, [entry.partyId]);

      const amount = paiseToDecimalString(entry.amountPaise);
      const created = await tx.transaction.create({
        data: {
          userId,
          ...typeFields(entry.type, entry.accountId),
          amount,
          date: parseISODate(istDateOf(occurredAt)),
          occurredAt,
          description: entry.reason || null,
          categoryId: entry.categoryId,
          isSplit: entry.partyId !== null,
          quickPay: true,
          dedupeKey,
        },
        select: { id: true },
      });
      if (entry.partyId) {
        await tx.transactionSplit.create({ data: { userId, transactionId: created.id, partyId: entry.partyId, amount } });
      }
      await recomputeBalances(tx, userId, [entry.accountId]);
      await tx.auditLog.create({
        data: { userId, action: "quickpay.create", entity: "transaction", entityId: created.id, after: { type: entry.type, amountPaise: entry.amountPaise, accountId: entry.accountId } },
      });
      return { id: created.id, duplicate: false };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await db.transaction.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } }, select: { id: true } });
      if (winner) return { id: winner.id, duplicate: true };
    }
    throw error;
  }
}

/** Changes a saved entry. Its date and time stay as they were. Balances of the old and new bank are recalculated. */
export async function updateEntry(db: PrismaClient, userId: string, id: string, entry: ValidQuickPay): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId, quickPay: true, deletedAt: null } });
    if (!existing) throw new ExpenseError("That entry no longer exists.", "NOT_FOUND");

    await resolveBanks(tx, userId, [entry.accountId]);
    await resolveCategories(tx, userId, [entry.categoryId]);
    await resolvePersons(tx, userId, [entry.partyId]);

    const amount = paiseToDecimalString(entry.amountPaise);
    await tx.transaction.update({
      where: { id },
      data: { ...typeFields(entry.type, entry.accountId), amount, description: entry.reason || null, categoryId: entry.categoryId, isSplit: entry.partyId !== null },
    });
    await tx.transactionSplit.deleteMany({ where: { transactionId: id, userId } });
    if (entry.partyId) await tx.transactionSplit.create({ data: { userId, transactionId: id, partyId: entry.partyId, amount } });

    await recomputeBalances(tx, userId, [existing.accountId ?? existing.toAccountId ?? entry.accountId, entry.accountId]);
    await tx.auditLog.create({ data: { userId, action: "quickpay.update", entity: "transaction", entityId: id, after: { type: entry.type, amountPaise: entry.amountPaise, accountId: entry.accountId } } });
  });
}

/** Deletes an entry (kept in the database, hidden everywhere) and recalculates its bank. */
export async function deleteEntry(db: PrismaClient, userId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId, quickPay: true, deletedAt: null } });
    if (!existing) throw new ExpenseError("That entry no longer exists.", "NOT_FOUND");
    await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    const accountId = existing.accountId ?? existing.toAccountId;
    if (accountId) await recomputeBalances(tx, userId, [accountId]);
    await tx.auditLog.create({ data: { userId, action: "quickpay.delete", entity: "transaction", entityId: id } });
  });
}

// ───────────────────────── Bulk ─────────────────────────

/**
 * Saves every row of a bulk sheet as its own entry under its own date and time, all or nothing.
 * `requestId` makes a repeated submission save nothing a second time.
 */
export async function createBulk(
  db: PrismaClient,
  userId: string,
  requestId: string,
  rows: readonly ValidBulkRow[],
): Promise<{ count: number; duplicate: boolean }> {
  const keyOf = (row: ValidBulkRow) => `quick-pay-bulk:${requestId}:${row.key}`;
  try {
    return await db.$transaction(
      async (tx) => {
        const existing = await tx.transaction.count({ where: { userId, dedupeKey: { in: rows.map(keyOf) } } });
        if (existing > 0) return { count: existing, duplicate: true };

        await resolveBanks(tx, userId, rows.map((r) => r.accountId));
        await resolveCategories(tx, userId, rows.map((r) => r.categoryId));
        await resolvePersons(tx, userId, rows.map((r) => r.partyId));

        const ids = rows.map(() => randomUUID());
        await tx.transaction.createMany({
          data: rows.map((row, i) => ({
            id: ids[i]!,
            userId,
            ...typeFields(row.type, row.accountId),
            amount: paiseToDecimalString(row.amountPaise),
            date: parseISODate(istDateOf(row.occurredAt)),
            occurredAt: row.occurredAt,
            description: row.reason || null,
            categoryId: row.categoryId,
            isSplit: row.partyId !== null,
            quickPay: true,
            dedupeKey: keyOf(row),
          })),
        });
        const withPerson = rows.map((row, i) => ({ row, id: ids[i]! })).filter((x) => x.row.partyId !== null);
        if (withPerson.length > 0) {
          await tx.transactionSplit.createMany({
            data: withPerson.map(({ row, id }) => ({ userId, transactionId: id, partyId: row.partyId!, amount: paiseToDecimalString(row.amountPaise) })),
          });
        }
        await recomputeBalances(tx, userId, rows.map((r) => r.accountId));
        await tx.auditLog.create({ data: { userId, action: "quickpay.bulk", entity: "transaction", after: { rows: rows.length } } });
        return { count: rows.length, duplicate: false };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const count = await db.transaction.count({ where: { userId, dedupeKey: { in: rows.map(keyOf) } } });
      if (count > 0) return { count, duplicate: true };
    }
    throw error;
  }
}

// ───────────────────────── Reading ─────────────────────────

export async function getEntry(db: PrismaClient, userId: string, id: string): Promise<EntryDetails | null> {
  const row = await db.transaction.findFirst({ where: { id, userId, quickPay: true, deletedAt: null }, include: { splits: true } });
  if (!row || !row.occurredAt) return null;
  return {
    id: row.id,
    type: typeOf(row),
    amountPaise: paiseOf(row.amount),
    reason: row.description ?? "",
    accountId: (row.accountId ?? row.toAccountId)!,
    categoryId: row.categoryId,
    partyId: row.splits[0]?.partyId ?? null,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/** Ids of saved entries, newest first: what the Previous / Next switch walks through. */
export async function listEntryIds(db: PrismaClient, userId: string, limit = 500): Promise<string[]> {
  const rows = await db.transaction.findMany({
    where: { userId, quickPay: true, deletedAt: null },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** The latest credits (money in), newest first, for the "Credits Added" panel. */
export async function listRecentCredits(db: PrismaClient, userId: string, limit = 10): Promise<RecentCredit[]> {
  const rows = await db.transaction.findMany({
    where: { userId, quickPay: true, deletedAt: null, type: "INCOME" },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map((r) => ({ id: r.id, amountPaise: paiseOf(r.amount), reason: r.description ?? "", occurredAt: (r.occurredAt ?? r.createdAt).toISOString() }));
}

// ───────────────────────── GPay Transactions ─────────────────────────

const includeForRows = {
  account: { select: { name: true, parent: { select: { name: true } } } },
  toAccount: { select: { name: true, parent: { select: { name: true } } } },
  category: { select: { name: true, parent: { select: { name: true } } } },
  splits: { include: { party: { select: { name: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.TransactionInclude;

export function buildWhere(userId: string, filters: Pick<TxFilters, "month" | "from" | "to" | "q">): Prisma.TransactionWhereInput {
  const { from, to } = effectiveRange(filters);
  const bounds = rangeToInstants(from, to);
  const where: Prisma.TransactionWhereInput = { userId, quickPay: true, deletedAt: null };
  if (bounds.gte || bounds.lt) where.occurredAt = bounds;

  const q = filters.q.trim();
  if (q) {
    const has = { contains: q, mode: "insensitive" as const };
    where.OR = [
      { description: has },
      { account: { is: { OR: [{ name: has }, { parent: { is: { name: has } } }] } } },
      { toAccount: { is: { OR: [{ name: has }, { parent: { is: { name: has } } }] } } },
      { category: { is: { OR: [{ name: has }, { parent: { is: { name: has } } }] } } },
      { splits: { some: { party: { name: has } } } },
    ];
  }
  return where;
}

type RowWithRelations = Prisma.TransactionGetPayload<{ include: typeof includeForRows }>;

function toRow(row: RowWithRelations): TxRow {
  const bankAccount = row.account ?? row.toAccount;
  return {
    id: row.id,
    occurredAt: (row.occurredAt ?? row.createdAt).toISOString(),
    type: typeOf(row),
    amountPaise: paiseOf(row.amount),
    reason: row.description ?? "",
    bank: bankAccount ? arrow(bankAccount.parent?.name, bankAccount.name) : "",
    category: row.category ? arrow(row.category.parent?.name, row.category.name) : "",
    person: row.splits[0]?.party.name ?? null,
  };
}

async function totalsFor(db: PrismaClient, where: Prisma.TransactionWhereInput): Promise<TxTotals> {
  const groups = await db.transaction.groupBy({ by: ["type"], where, _sum: { amount: true }, _count: { _all: true } });
  const sum = (type: string) => {
    const g = groups.find((x) => x.type === type);
    return g?._sum.amount ? paiseOf(g._sum.amount) : 0;
  };
  return { debitPaise: sum("EXPENSE"), creditPaise: sum("INCOME"), count: groups.reduce((n, g) => n + g._count._all, 0) };
}

/** One page of the filtered transactions (newest first) and the totals for the whole filtered set. */
export async function listTransactions(
  db: PrismaClient,
  userId: string,
  filters: TxFilters,
  options: { pageSize?: number } = {},
): Promise<{ rows: TxRow[]; totals: TxTotals; page: number; pageCount: number }> {
  const size = options.pageSize ?? PAGE_SIZE;
  const where = buildWhere(userId, filters);
  const totals = await totalsFor(db, where);
  const pageCount = Math.max(1, Math.ceil(totals.count / size));
  const page = Math.min(filters.page, pageCount);

  const rows = await db.transaction.findMany({
    where,
    include: includeForRows,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * size,
    take: size,
  });
  return { rows: rows.map(toRow), totals, page, pageCount };
}

/** Every transaction matching the filters (for export), newest first. */
export async function listForExport(db: PrismaClient, userId: string, filters: TxFilters, limit = 20_000): Promise<{ rows: TxRow[]; totals: TxTotals; truncated: boolean }> {
  const where = buildWhere(userId, filters);
  const totals = await totalsFor(db, where);
  const rows = await db.transaction.findMany({
    where,
    include: includeForRows,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return { rows: rows.map(toRow), totals, truncated: totals.count > rows.length };
}

// ───────────────────────── Balances ─────────────────────────

export async function getBalances(db: PrismaClient, userId: string): Promise<BalancesData> {
  const [accounts, credits, debits] = await Promise.all([
    db.account.findMany({ where: { userId, deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] }),
    db.transaction.groupBy({ by: ["toAccountId"], where: { userId, deletedAt: null, type: "INCOME", toAccountId: { not: null } }, _sum: { amount: true } }),
    db.transaction.groupBy({ by: ["accountId"], where: { userId, deletedAt: null, type: "EXPENSE", accountId: { not: null } }, _sum: { amount: true } }),
  ]);
  const creditOf = new Map(credits.map((c) => [c.toAccountId, c._sum.amount ? paiseOf(c._sum.amount) : 0]));
  const debitOf = new Map(debits.map((d) => [d.accountId, d._sum.amount ? paiseOf(d._sum.amount) : 0]));

  const inputs: AccountBalanceInput[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind === "CREDIT_LINE" ? "CREDIT_LINE" : "ASSET",
    parentId: a.parentId,
    openingPaise: paiseOf(a.openingBalance),
    creditsPaise: creditOf.get(a.id) ?? 0,
    debitsPaise: debitOf.get(a.id) ?? 0,
  }));
  const groups = buildBalanceGroups(inputs);
  return { groups, totalCurrentPaise: groups.reduce((s, g) => s + g.total.currentPaise, 0) };
}

/** Sets an account's opening balance (it may be negative) and recalculates its current balance. */
export async function setOpeningBalance(db: PrismaClient, userId: string, input: { accountId: string; openingPaise: number }): Promise<void> {
  await db.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: { id: input.accountId, userId, deletedAt: null },
      data: { openingBalance: paiseToDecimalString(input.openingPaise) },
    });
    if (updated.count !== 1) throw new ExpenseError("That bank no longer exists.", "NOT_FOUND");
    await recomputeBalances(tx, userId, [input.accountId]);
    await tx.auditLog.create({ data: { userId, action: "quickpay.opening-balance", entity: "account", entityId: input.accountId, after: { openingPaise: input.openingPaise } } });
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
