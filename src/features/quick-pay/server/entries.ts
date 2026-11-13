import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { recomputeBalances, sinceOpening } from "@/lib/db/balances";
import { paiseToDecimalString, parseAmountInput, parseISODate, toPaise } from "@/lib/finance";
import { buildBalanceGroups, type AccountBalanceInput } from "../balances";
import { istDateOf, rangeToInstants } from "../datetime";
import { resolveShares, type ResolvedShare, type ShareInput, type SplitKind } from "../shares";
import type { CreditSource } from "../settings-model";
import type { PlannedEntry } from "../import/plan";
import { PAGE_SIZE, effectiveRange, type TxFilters } from "../filters";
import type { BalancesData, EntryDetails, RecentCredit, ShareDetail, TxRow, TxTotals } from "../types";
import { MAX_REASON_LENGTH, type EntryType, type ValidBulkRow, type ValidQuickPay } from "../validation";

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

/** A Debit uses a Debit category and a Credit uses a Credit category; the two lists are separate. */
async function resolveCategories(tx: Prisma.TransactionClient, userId: string, ids: readonly (string | null)[], entryType: EntryType = "DEBIT"): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return;
  const found = await tx.transactionCategory.count({ where: { id: { in: unique }, userId, deletedAt: null, type: entryType === "CREDIT" ? "INCOME" : "EXPENSE" } });
  if (found !== unique.length) throw new ExpenseError("A selected category no longer exists. Pick another.", "NOT_FOUND");
}

async function resolvePersons(tx: Prisma.TransactionClient, userId: string, ids: readonly (string | null)[]): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return;
  const found = await tx.expenseParty.count({ where: { id: { in: unique }, userId, deletedAt: null } });
  if (found !== unique.length) throw new ExpenseError("A selected person no longer exists. Pick another.", "NOT_FOUND");
}

// ───────────────────────── Splits and credit links ─────────────────────────

const SELF_KEY = "personal";

/** Your own share of a split is kept under the person "Personal" (the one every account starts with). */
async function selfPartyId(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const existing = await tx.expenseParty.findUnique({ where: { userId_nameKey: { userId, nameKey: SELF_KEY } } });
  if (existing) {
    if (existing.deletedAt) await tx.expenseParty.update({ where: { id: existing.id }, data: { deletedAt: null } });
    return existing.id;
  }
  return (await tx.expenseParty.create({ data: { userId, name: "Personal", nameKey: SELF_KEY } })).id;
}

interface SplitWrite {
  kind: SplitKind;
  shares: readonly ResolvedShare[];
}

/**
 * Replaces the split rows of a transaction. Each chosen person gets their share; whatever is left is your own share,
 * saved under "Personal", so the rows always add up to the amount (the database checks this too).
 */
async function writeSplits(tx: Prisma.TransactionClient, userId: string, transactionId: string, amountPaise: number, split: SplitWrite | null): Promise<void> {
  await tx.transactionSplit.deleteMany({ where: { transactionId, userId } });
  const shares = split ? split.shares.filter((s) => s.sharePaise > 0) : [];
  await tx.transaction.update({ where: { id: transactionId }, data: { isSplit: shares.length > 0, splitKind: shares.length > 0 ? split!.kind : null } });
  if (!split || shares.length === 0) return;

  const self = await selfPartyId(tx, userId);
  // A share given to "Personal" is simply part of your own share.
  const people = shares.filter((s) => s.partyId !== self);
  const given = people.reduce((sum, s) => sum + s.sharePaise, 0);
  if (given > amountPaise) throw new ExpenseError("The shares add up to more than the amount.");
  const rest = amountPaise - given;

  for (const share of people) {
    await tx.transactionSplit.create({ data: { userId, transactionId, partyId: share.partyId, amount: paiseToDecimalString(share.sharePaise), percentage: String(share.percent) } });
  }
  if (rest > 0) {
    const restPercent = Math.round((rest / amountPaise) * 100 * 10_000) / 10_000;
    await tx.transactionSplit.create({ data: { userId, transactionId, partyId: self, amount: paiseToDecimalString(rest), percentage: String(restPercent) } });
  }
}

/** Replaces the credits added to a debit. Only your own saved credit entries can be added. */
async function writeCreditLinks(tx: Prisma.TransactionClient, userId: string, debitId: string, creditIds: readonly string[]): Promise<void> {
  await tx.transactionCreditLink.deleteMany({ where: { debitId, userId } });
  if (creditIds.length === 0) return;
  const found = await tx.transaction.count({ where: { id: { in: [...creditIds] }, userId, quickPay: true, deletedAt: null, type: "INCOME" } });
  if (found !== creditIds.length) throw new ExpenseError("A credit you added no longer exists. Pick again.", "NOT_FOUND");
  await tx.transactionCreditLink.createMany({ data: creditIds.map((creditId) => ({ userId, debitId, creditId })) });
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
      await resolveCategories(tx, userId, [entry.categoryId], entry.type);
      await resolvePersons(tx, userId, entry.shares.map((x) => x.partyId));

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
          isSplit: false,
          quickPay: true,
          dedupeKey,
        },
        select: { id: true },
      });
      await writeSplits(tx, userId, created.id, entry.amountPaise, entry.splitKind ? { kind: entry.splitKind, shares: entry.shares } : null);
      await writeCreditLinks(tx, userId, created.id, entry.type === "DEBIT" ? entry.creditIds : []);
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

/** Changes a saved entry. Its date and time stay as they were unless `occurredAt` is given. Balances of the old and new bank are recalculated. */
export async function updateEntry(db: PrismaClient, userId: string, id: string, entry: ValidQuickPay, occurredAt?: Date): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId, quickPay: true, deletedAt: null, type: { not: "TRANSFER" } } });
    if (!existing) throw new ExpenseError("That entry no longer exists.", "NOT_FOUND");

    await resolveBanks(tx, userId, [entry.accountId]);
    await resolveCategories(tx, userId, [entry.categoryId], entry.type);
    await resolvePersons(tx, userId, entry.shares.map((x) => x.partyId));

    const amount = paiseToDecimalString(entry.amountPaise);
    await tx.transaction.update({
      where: { id },
      data: {
        ...typeFields(entry.type, entry.accountId),
        amount,
        description: entry.reason || null,
        categoryId: entry.categoryId,
        ...(occurredAt ? { occurredAt, date: parseISODate(istDateOf(occurredAt)) } : {}),
      },
    });
    await writeSplits(tx, userId, id, entry.amountPaise, entry.splitKind ? { kind: entry.splitKind, shares: entry.shares } : null);
    await writeCreditLinks(tx, userId, id, entry.type === "DEBIT" ? entry.creditIds : []);

    await recomputeBalances(tx, userId, [existing.accountId ?? existing.toAccountId ?? entry.accountId, entry.accountId]);
    await tx.auditLog.create({ data: { userId, action: "quickpay.update", entity: "transaction", entityId: id, after: { type: entry.type, amountPaise: entry.amountPaise, accountId: entry.accountId } } });
  });
}

/**
 * Moves money from one bank to another as a single transaction: the first bank goes down and the second goes up by the same
 * amount, and it appears once in GPay Transactions. `requestId` makes a double click save it once.
 */
export async function createTransfer(
  db: PrismaClient,
  userId: string,
  requestId: string,
  input: { fromId: string; toId: string; amountPaise: number; reason: string },
  occurredAt: Date = new Date(),
): Promise<{ id: string; duplicate: boolean }> {
  const dedupeKey = `quick-transfer:${requestId}`;
  if (input.fromId === input.toId) throw new ExpenseError("Choose two different banks.");
  try {
    return await db.$transaction(async (tx) => {
      const already = await tx.transaction.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } }, select: { id: true } });
      if (already) return { id: already.id, duplicate: true };

      await resolveBanks(tx, userId, [input.fromId, input.toId]);
      const created = await tx.transaction.create({
        data: {
          userId,
          type: "TRANSFER",
          accountId: input.fromId,
          toAccountId: input.toId,
          amount: paiseToDecimalString(input.amountPaise),
          date: parseISODate(istDateOf(occurredAt)),
          occurredAt,
          description: input.reason || null,
          isSplit: false,
          quickPay: true,
          dedupeKey,
        },
        select: { id: true },
      });
      await recomputeBalances(tx, userId, [input.fromId, input.toId]);
      await tx.auditLog.create({
        data: { userId, action: "quickpay.transfer", entity: "transaction", entityId: created.id, after: { amountPaise: input.amountPaise, fromId: input.fromId, toId: input.toId } },
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

/** Deletes an entry (kept in the database, hidden everywhere) and recalculates its bank. */
export async function deleteEntry(db: PrismaClient, userId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId, quickPay: true, deletedAt: null } });
    if (!existing) throw new ExpenseError("That entry no longer exists.", "NOT_FOUND");
    await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    // A self transfer touches two banks; both are recalculated.
    const accountIds = [existing.accountId, existing.toAccountId].filter((x): x is string => x !== null);
    if (accountIds.length > 0) await recomputeBalances(tx, userId, accountIds);
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

        await resolveBanks(tx, userId, rows.flatMap((r) => [r.accountId, ...(r.transfer ? [r.transfer.toId] : [])]));
        await resolveCategories(tx, userId, rows.filter((r) => r.type === "DEBIT").map((r) => r.categoryId), "DEBIT");
        await resolveCategories(tx, userId, rows.filter((r) => r.type === "CREDIT").map((r) => r.categoryId), "CREDIT");
        await resolvePersons(tx, userId, rows.flatMap((r) => r.shares.map((s) => s.partyId)));

        const ids = rows.map(() => randomUUID());
        await tx.transaction.createMany({
          data: rows.map((row, i) => ({
            id: ids[i]!,
            userId,
            // A self transfer row moves money from one bank to another and counts as one transaction.
            ...(row.transfer ? { type: "TRANSFER" as const, accountId: row.accountId, toAccountId: row.transfer.toId } : typeFields(row.type, row.accountId)),
            amount: paiseToDecimalString(row.amountPaise),
            date: parseISODate(istDateOf(row.occurredAt)),
            occurredAt: row.occurredAt,
            description: row.reason || null,
            categoryId: row.categoryId,
            isSplit: row.shares.length > 0,
            splitKind: row.shares.length > 0 ? "SPLIT" : null,
            quickPay: true,
            dedupeKey: keyOf(row),
          })),
        });
        // Each split row gives its people their shares, and what is left stays with you under "Personal".
        const withPeople = rows.map((row, i) => ({ row, id: ids[i]! })).filter((x) => x.row.shares.length > 0);
        if (withPeople.length > 0) {
          const self = await selfPartyId(tx, userId);
          const data: Prisma.TransactionSplitCreateManyInput[] = [];
          for (const { row, id } of withPeople) {
            const people = row.shares.filter((s) => s.sharePaise > 0 && s.partyId !== self);
            const given = people.reduce((sum, s) => sum + s.sharePaise, 0);
            if (given > row.amountPaise) throw new ExpenseError("The shares add up to more than the amount.");
            for (const s of people) data.push({ userId, transactionId: id, partyId: s.partyId, amount: paiseToDecimalString(s.sharePaise), percentage: String(s.percent) });
            const rest = row.amountPaise - given;
            if (rest > 0) data.push({ userId, transactionId: id, partyId: self, amount: paiseToDecimalString(rest), percentage: String(Math.round((rest / row.amountPaise) * 100 * 10_000) / 10_000) });
          }
          await tx.transactionSplit.createMany({ data });
        }
        await recomputeBalances(tx, userId, rows.flatMap((r) => [r.accountId, ...(r.transfer ? [r.transfer.toId] : [])]));
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
  const row = await db.transaction.findFirst({
    where: { id, userId, quickPay: true, deletedAt: null, type: { not: "TRANSFER" } },
    include: { splits: { include: { party: { select: { name: true, nameKey: true } } }, orderBy: { createdAt: "asc" } }, creditLinksAsDebit: { select: { creditId: true } } },
  });
  if (!row || !row.occurredAt) return null;
  const shares = sharesOf(row.splits, paiseOf(row.amount));
  return {
    id: row.id,
    type: typeOf(row),
    amountPaise: paiseOf(row.amount),
    reason: row.description ?? "",
    accountId: (row.accountId ?? row.toAccountId)!,
    categoryId: row.categoryId,
    splitKind: kindOf(row, shares),
    shares,
    creditIds: row.creditLinksAsDebit.map((l) => l.creditId),
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

/**
 * What the "Credits Added" panel offers, newest first. `source` is a Customized Setting:
 *  recent_credits (money in), recent_transactions (anything), credit_values (each different credit amount once),
 *  last_transaction (only the latest).
 */
export async function listCreditChoices(db: PrismaClient, userId: string, source: CreditSource = "recent_credits", size = 10): Promise<RecentCredit[]> {
  const creditsOnly = source === "recent_credits" || source === "credit_values";
  const rows = await db.transaction.findMany({
    where: { userId, quickPay: true, deletedAt: null, ...(creditsOnly ? { type: "INCOME" as const } : {}) },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: source === "last_transaction" ? 1 : source === "credit_values" ? 400 : size,
  });
  let mapped: RecentCredit[] = rows.map((r) => ({ id: r.id, type: typeOf(r), amountPaise: paiseOf(r.amount), reason: r.description ?? r.details ?? "", occurredAt: (r.occurredAt ?? r.createdAt).toISOString() }));
  if (source === "credit_values") {
    const seen = new Set<number>();
    mapped = mapped.filter((m) => (seen.has(m.amountPaise) ? false : (seen.add(m.amountPaise), true))).slice(0, size);
  }
  return mapped;
}

/** The latest credits, for older callers. */
export const listRecentCredits = (db: PrismaClient, userId: string, limit = 10) => listCreditChoices(db, userId, "recent_credits", limit);

// ───────────────────────── GPay Transactions ─────────────────────────

const includeForRows = {
  account: { select: { name: true, parent: { select: { name: true } } } },
  toAccount: { select: { name: true, parent: { select: { name: true } } } },
  category: { select: { name: true, parent: { select: { name: true } } } },
  splits: { include: { party: { select: { name: true, nameKey: true } } }, orderBy: { createdAt: "asc" as const } },
  creditLinksAsDebit: { select: { credit: { select: { amount: true } } } },
} satisfies Prisma.TransactionInclude;

/**
 * The people a transaction is shared with, with their shares. Your own "Personal" remainder is not one of them (unless it
 * is the only row there is, as on older entries).
 */
function sharesOf<T extends { partyId: string; amount: { toString(): string }; percentage: { toString(): string } | null; party: { name: string; nameKey: string } }>(
  splits: readonly T[],
  txAmountPaise: number,
): ShareDetail[] {
  const people = splits.filter((s) => s.party.nameKey !== SELF_KEY);
  return (people.length > 0 ? people : splits).map((s) => ({
    partyId: s.partyId,
    name: s.party.name,
    percent: splitPercentOf(s, txAmountPaise),
    sharePaise: paiseOf(s.amount),
  }));
}

const kindOf = (row: { splitKind: string | null }, shares: readonly unknown[]): SplitKind | null =>
  shares.length === 0 ? null : row.splitKind === "DEBT" ? "DEBT" : "SPLIT";

function splitPercentOf(split: { amount: { toString(): string }; percentage: { toString(): string } | null }, txAmountPaise: number): number {
  if (split.percentage !== null) return Number(split.percentage.toString());
  return txAmountPaise > 0 ? Math.round((paiseOf(split.amount) / txAmountPaise) * 100 * 10_000) / 10_000 : 0;
}

export function buildWhere(userId: string, filters: Pick<TxFilters, "month" | "from" | "to" | "q"> & Partial<Pick<TxFilters, "banks" | "categories" | "people" | "types">>): Prisma.TransactionWhereInput {
  const { from, to } = effectiveRange(filters);
  const bounds = rangeToInstants(from, to);
  const where: Prisma.TransactionWhereInput = { userId, quickPay: true, deletedAt: null };
  if (bounds.gte || bounds.lt) where.occurredAt = bounds;

  const q = filters.q.trim();
  if (q) {
    const has = { contains: q, mode: "insensitive" as const };
    where.OR = [
      { description: has },
      { details: has },
      { account: { is: { OR: [{ name: has }, { parent: { is: { name: has } } }] } } },
      { toAccount: { is: { OR: [{ name: has }, { parent: { is: { name: has } } }] } } },
      { category: { is: { OR: [{ name: has }, { parent: { is: { name: has } } }] } } },
      { splits: { some: { party: { name: has } } } },
    ];
  }

  // Several choices at once: a transaction matches a filter when it fits any one of the choices in it.
  const and: Prisma.TransactionWhereInput[] = [];
  if (filters.banks?.length) and.push({ OR: [{ accountId: { in: filters.banks } }, { toAccountId: { in: filters.banks } }] });
  if (filters.categories?.length) and.push({ OR: [{ categoryId: { in: filters.categories } }, { category: { is: { parentId: { in: filters.categories } } } }] });
  if (filters.people?.length) and.push({ splits: { some: { partyId: { in: filters.people } } } });
  if (filters.types?.length) {
    const kinds = filters.types.map((t) => (t === "DEBIT" ? "EXPENSE" : t === "CREDIT" ? "INCOME" : "TRANSFER")) as ("EXPENSE" | "INCOME" | "TRANSFER")[];
    and.push({ type: { in: kinds } });
  }
  if (and.length > 0) where.AND = and;
  return where;
}

type RowWithRelations = Prisma.TransactionGetPayload<{ include: typeof includeForRows }>;

function toRow(row: RowWithRelations): TxRow {
  const bankAccount = row.account ?? row.toAccount;
  const amountPaise = paiseOf(row.amount);
  const nameOf = (a: { name: string; parent: { name: string } | null } | null) => (a ? arrow(a.parent?.name, a.name) : "");
  const transfer = row.type === "TRANSFER" ? { from: nameOf(row.account), to: nameOf(row.toAccount), fromShort: row.account?.name ?? "", toShort: row.toAccount?.name ?? "" } : null;
  const shares = sharesOf(row.splits, amountPaise);
  return {
    id: row.id,
    occurredAt: (row.occurredAt ?? row.createdAt).toISOString(),
    type: typeOf(row),
    amountPaise,
    reason: row.description ?? "",
    details: row.details ?? "",
    bank: transfer ? `${transfer.from} → ${transfer.to}` : bankAccount ? arrow(bankAccount.parent?.name, bankAccount.name) : "",
    bankName: transfer ? `${transfer.fromShort} → ${transfer.toShort}` : (bankAccount?.name ?? ""),
    transfer: transfer ? { from: transfer.from, to: transfer.to } : null,
    bankId: row.accountId ?? row.toAccountId ?? null,
    category: row.category ? arrow(row.category.parent?.name, row.category.name) : "",
    categoryId: row.categoryId,
    splitKind: kindOf(row, shares),
    shares,
    linkedCreditsPaise: row.creditLinksAsDebit.reduce((sum, l) => sum + paiseOf(l.credit.amount), 0),
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
  const accounts = await db.account.findMany({ where: { userId, deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });
  const creditOf = new Map<string, number>();
  const debitOf = new Map<string, number>();
  // Each account counts only the entries from its own opening date and time onwards.
  await Promise.all(
    accounts.map(async (a) => {
      const since = sinceOpening(a.openingAt);
      const [credit, debit] = await Promise.all([
        db.transaction.aggregate({ where: { userId, deletedAt: null, type: { in: ["INCOME", "TRANSFER"] }, toAccountId: a.id, ...since }, _sum: { amount: true } }),
        db.transaction.aggregate({ where: { userId, deletedAt: null, type: { in: ["EXPENSE", "TRANSFER"] }, accountId: a.id, ...since }, _sum: { amount: true } }),
      ]);
      creditOf.set(a.id, credit._sum.amount ? paiseOf(credit._sum.amount) : 0);
      debitOf.set(a.id, debit._sum.amount ? paiseOf(debit._sum.amount) : 0);
    }),
  );

  const inputs: AccountBalanceInput[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind === "CREDIT_LINE" ? "CREDIT_LINE" : "ASSET",
    parentId: a.parentId,
    openingPaise: paiseOf(a.openingBalance),
    openingAt: a.openingAt ? a.openingAt.toISOString() : null,
    creditsPaise: creditOf.get(a.id) ?? 0,
    debitsPaise: debitOf.get(a.id) ?? 0,
  }));
  const groups = buildBalanceGroups(inputs);
  return { groups, totalCurrentPaise: groups.reduce((s, g) => s + g.total.currentPaise, 0) };
}

/** Sets an account's opening balance (it may be negative) and recalculates its current balance. */
export async function setOpeningBalance(db: PrismaClient, userId: string, input: { accountId: string; openingPaise: number; openingAt?: Date | null }): Promise<void> {
  await db.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: { id: input.accountId, userId, deletedAt: null },
      data: { openingBalance: paiseToDecimalString(input.openingPaise), openingAt: input.openingAt ?? null },
    });
    if (updated.count !== 1) throw new ExpenseError("That bank no longer exists.", "NOT_FOUND");
    await recomputeBalances(tx, userId, [input.accountId]);
    await tx.auditLog.create({ data: { userId, action: "quickpay.opening-balance", entity: "account", entityId: input.accountId, after: { openingPaise: input.openingPaise, openingAt: input.openingAt?.toISOString() ?? null } } });
  });
}

// ───────────────────────── Import ─────────────────────────

/**
 * Saves entries made from an imported statement. Each entry carries a unique key built from the payment's UPI
 * Transaction ID, so importing the same statement (or an overlapping one) again adds only what is new.
 * Everything is saved in one database transaction and the affected bank balances are recalculated from the records.
 */
export async function importEntries(db: PrismaClient, userId: string, entries: readonly PlannedEntry[]): Promise<{ imported: number; duplicates: number }> {
  if (entries.length === 0) return { imported: 0, duplicates: 0 };
  return db.$transaction(
    async (tx) => {
      await resolveBanks(tx, userId, entries.map((e) => e.accountId));

      const existing = new Set<string>();
      const keys = entries.map((e) => e.key);
      for (let i = 0; i < keys.length; i += 1000) {
        const found = await tx.transaction.findMany({ where: { userId, dedupeKey: { in: keys.slice(i, i + 1000) } }, select: { dedupeKey: true } });
        for (const f of found) if (f.dedupeKey) existing.add(f.dedupeKey);
      }
      const fresh = entries.filter((e) => !existing.has(e.key));
      if (fresh.length === 0) return { imported: 0, duplicates: entries.length };

      for (let i = 0; i < fresh.length; i += 500) {
        await tx.transaction.createMany({
          data: fresh.slice(i, i + 500).map((e) => ({
            userId,
            ...typeFields(e.type, e.accountId),
            amount: paiseToDecimalString(e.amountPaise),
            date: parseISODate(istDateOf(e.occurredAt)),
            occurredAt: e.occurredAt,
            description: null,
            details: e.details || null,
            categoryId: null,
            isSplit: false,
            quickPay: true,
            dedupeKey: e.key,
          })),
          // If the same statement is imported twice at the same moment, the database's unique key keeps one copy.
          skipDuplicates: true,
        });
      }
      await recomputeBalances(tx, userId, fresh.map((e) => e.accountId));
      await tx.auditLog.create({ data: { userId, action: "quickpay.import", entity: "transaction", after: { rows: fresh.length, duplicates: entries.length - fresh.length } } });
      return { imported: fresh.length, duplicates: entries.length - fresh.length };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

/** Which of these import keys are already saved, so the preview can say "already imported". */
export async function findImportedKeys(db: PrismaClient, userId: string, keys: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    const found = await db.transaction.findMany({ where: { userId, dedupeKey: { in: keys.slice(i, i + 1000) } }, select: { dedupeKey: true } });
    for (const f of found) if (f.dedupeKey) out.push(f.dedupeKey);
  }
  return out;
}

// ───────────────────────── Editing one field in place ─────────────────────────

export interface EntryPatch {
  /** The Reason (an empty string clears it). */
  reason?: string;
  categoryId?: string | null;
  /** The people and their shares (as a Split or a Debt), or null to remove the sharing. */
  split?: { kind: SplitKind; shares: readonly ShareInput[] } | null;
}

/**
 * Changes some fields of a saved entry without touching the rest: the Reason, the category, or the split. Used by the
 * table's inline editing. Returns the entry as the table shows it.
 */
export async function patchEntry(db: PrismaClient, userId: string, id: string, patch: EntryPatch): Promise<TxRow> {
  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId, quickPay: true, deletedAt: null, type: { not: "TRANSFER" } } });
    if (!existing) throw new ExpenseError("That entry no longer exists.", "NOT_FOUND");

    const data: Prisma.TransactionUpdateInput = {};
    if (patch.reason !== undefined) {
      const reason = patch.reason.trim().replace(/[ \t]+/g, " ");
      if (reason.length > MAX_REASON_LENGTH) throw new ExpenseError(`Reason can be at most ${MAX_REASON_LENGTH} characters.`);
      data.description = reason || null;
    }
    if (patch.categoryId !== undefined) {
      await resolveCategories(tx, userId, [patch.categoryId], existing.type === "INCOME" ? "CREDIT" : "DEBIT");
      data.category = patch.categoryId ? { connect: { id: patch.categoryId } } : { disconnect: true };
    }
    if (Object.keys(data).length > 0) await tx.transaction.update({ where: { id }, data });

    if (patch.split !== undefined) {
      if (patch.split === null) await writeSplits(tx, userId, id, paiseOf(existing.amount), null);
      else {
        await resolvePersons(tx, userId, patch.split.shares.map((x) => x.partyId));
        const amountPaise = paiseOf(existing.amount);
        const resolved = resolveShares(amountPaise, patch.split.shares, parseAmountInput);
        if (!resolved.ok) throw new ExpenseError(resolved.error);
        if (patch.split.kind === "DEBT" && existing.type !== "EXPENSE") throw new ExpenseError("A Debt can only be added to a Debit.");
        await writeSplits(tx, userId, id, amountPaise, { kind: patch.split.kind, shares: resolved.shares });
      }
    }
    await tx.auditLog.create({ data: { userId, action: "quickpay.patch", entity: "transaction", entityId: id, after: { fields: Object.keys(patch) } } });
  });

  const row = await db.transaction.findFirst({ where: { id, userId }, include: includeForRows });
  if (!row) throw new ExpenseError("That entry no longer exists.", "NOT_FOUND");
  return toRow(row);
}

/** Debit and credit totals for one day (India time), for the Today's Summary calendar. */
export async function getDayTotals(db: PrismaClient, userId: string, date: string): Promise<TxTotals> {
  const where = buildWhere(userId, { month: null, from: date, to: date, q: "" });
  return totalsFor(db, where);
}

/** Debit and credit totals between two days (India time, inclusive), for the header above the tabs. */
export async function getPeriodTotals(db: PrismaClient, userId: string, from: string, to: string): Promise<TxTotals> {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return totalsFor(db, buildWhere(userId, { month: null, from: a, to: b, q: "" }));
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
