import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { toPaise } from "@/lib/finance";
import { divideEvenly } from "@/lib/finance/divide";

/**
 * Credit History: how each credited amount is used by debit transactions. Every credit (money in, in Quick Entry) is a credit
 * source; the debits linked to it (Credits Added) are what it has paid for. Balance = credit - linked debits, worked out for each
 * source on its own: it can be zero or negative and is never moved between sources. A debit linked to several credits (older data)
 * is shared evenly between them so nothing is counted twice. Everything is worked out from the links, so editing or deleting an
 * entry changes the balances at once. Reads and writes are scoped to `userId`.
 */

const paiseOf = (d: { toString(): string } | null | undefined) => (d ? toPaise(d.toString()) : 0);

export type AllocationMode = "DEFAULT" | "RECENT";

export interface CreditSource {
  id: string;
  amountPaise: number;
  reason: string;
  /** ISO instant */
  occurredAt: string;
  usedPaise: number;
  /** credit - used; may be zero or negative */
  balancePaise: number;
  debitCount: number;
  isDefault: boolean;
  /** The latest credit. */
  isLatest: boolean;
}

export interface CreditSummary {
  creditedPaise: number;
  debitedPaise: number;
  /** Total credited - total linked debit, negative balances included. */
  remainingPaise: number;
}

export interface CreditDebit {
  id: string;
  occurredAt: string;
  reason: string;
  category: string;
  amountPaise: number;
  /** What this credit is charged for the debit (the whole amount unless the debit is shared by several credits). */
  chargedPaise: number;
  through: string;
  recipients: string;
}

export async function getCreditPreferences(db: PrismaClient, userId: string): Promise<{ mode: AllocationMode; defaultCreditId: string | null }> {
  const row = await db.creditPreference.findUnique({ where: { userId } });
  if (!row) return { mode: "DEFAULT", defaultCreditId: null };
  // A default credit that was deleted since is no longer a default.
  const alive = row.defaultCreditId ? await db.transaction.count({ where: { id: row.defaultCreditId, userId, deletedAt: null, type: "INCOME", quickPay: true } }) : 0;
  return { mode: row.mode === "RECENT" ? "RECENT" : "DEFAULT", defaultCreditId: alive ? row.defaultCreditId : null };
}

export async function setAllocationMode(db: PrismaClient, userId: string, mode: AllocationMode): Promise<void> {
  await db.creditPreference.upsert({ where: { userId }, create: { userId, mode }, update: { mode } });
}

/** Makes one credit the default (the only one), or clears it with null. */
export async function setDefaultCredit(db: PrismaClient, userId: string, creditId: string | null): Promise<void> {
  if (creditId) {
    const found = await db.transaction.count({ where: { id: creditId, userId, deletedAt: null, type: "INCOME", quickPay: true } });
    if (!found) throw new ExpenseError("That credit no longer exists.", "NOT_FOUND");
  }
  await db.creditPreference.upsert({ where: { userId }, create: { userId, defaultCreditId: creditId }, update: { defaultCreditId: creditId } });
}

/** What each credit has been charged: the sum, over its live debits, of the debit's amount (shared evenly when a debit has several credits). */
export async function usageOf(db: PrismaClient | Prisma.TransactionClient, userId: string, creditIds?: readonly string[]): Promise<Map<string, { usedPaise: number; count: number }>> {
  const links = await db.transactionCreditLink.findMany({
    where: { userId, debit: { deletedAt: null, quickPay: true }, ...(creditIds ? { creditId: { in: [...creditIds] } } : {}) },
    select: { debitId: true, creditId: true, debit: { select: { amount: true } } },
  });
  // A debit's other credits matter for sharing even when only some credits were asked for.
  const debitIds = [...new Set(links.map((l) => l.debitId))];
  const all = creditIds && debitIds.length > 0 ? await db.transactionCreditLink.findMany({ where: { userId, debitId: { in: debitIds } }, select: { debitId: true, creditId: true } }) : links;
  const byDebit = new Map<string, string[]>();
  for (const l of all) byDebit.set(l.debitId, [...(byDebit.get(l.debitId) ?? []), l.creditId].sort());
  const out = new Map<string, { usedPaise: number; count: number }>();
  for (const l of links) {
    const parts = divideEvenly(paiseOf(l.debit.amount), byDebit.get(l.debitId) ?? [l.creditId]);
    const mine = parts.find((p) => p.id === l.creditId)?.paise ?? 0;
    const cur = out.get(l.creditId) ?? { usedPaise: 0, count: 0 };
    out.set(l.creditId, { usedPaise: cur.usedPaise + mine, count: cur.count + 1 });
  }
  return out;
}

/** Every credit with its used amount and balance, newest first, and the totals over all of them (zero and negative balances included). */
export async function listCreditSources(db: PrismaClient, userId: string): Promise<{ sources: CreditSource[]; summary: CreditSummary; mode: AllocationMode; defaultCreditId: string | null }> {
  const [credits, usage, prefs] = await Promise.all([
    db.transaction.findMany({ where: { userId, quickPay: true, deletedAt: null, type: "INCOME" }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }] }),
    usageOf(db, userId),
    getCreditPreferences(db, userId),
  ]);
  const sources: CreditSource[] = credits.map((c, i) => {
    const amountPaise = paiseOf(c.amount);
    const u = usage.get(c.id) ?? { usedPaise: 0, count: 0 };
    return { id: c.id, amountPaise, reason: c.description ?? c.details ?? "", occurredAt: (c.occurredAt ?? c.createdAt).toISOString(), usedPaise: u.usedPaise, balancePaise: amountPaise - u.usedPaise, debitCount: u.count, isDefault: c.id === prefs.defaultCreditId, isLatest: i === 0 };
  });
  const creditedPaise = sources.reduce((s, c) => s + c.amountPaise, 0);
  const debitedPaise = sources.reduce((s, c) => s + c.usedPaise, 0);
  return { sources, summary: { creditedPaise, debitedPaise, remainingPaise: creditedPaise - debitedPaise }, mode: prefs.mode, defaultCreditId: prefs.defaultCreditId };
}

/** The debits charged to one credit, newest first. */
export async function getCreditDebits(db: PrismaClient, userId: string, creditId: string): Promise<CreditDebit[]> {
  const links = await db.transactionCreditLink.findMany({
    where: { userId, creditId, debit: { deletedAt: null, quickPay: true } },
    include: { debit: { include: { category: { select: { name: true } }, account: { select: { name: true } }, splits: { include: { party: { select: { name: true, nameKey: true } } } } } } },
  });
  const ids = [...new Set(links.map((l) => l.debitId))];
  const others = ids.length ? await db.transactionCreditLink.findMany({ where: { userId, debitId: { in: ids } }, select: { debitId: true, creditId: true } }) : [];
  const byDebit = new Map<string, string[]>();
  for (const l of others) byDebit.set(l.debitId, [...(byDebit.get(l.debitId) ?? []), l.creditId].sort());
  return links
    .map((l) => {
      const d = l.debit;
      const amountPaise = paiseOf(d.amount);
      const charged = divideEvenly(amountPaise, byDebit.get(d.id) ?? [creditId]).find((p) => p.id === creditId)?.paise ?? amountPaise;
      return {
        id: d.id,
        occurredAt: (d.occurredAt ?? d.createdAt).toISOString(),
        reason: d.description ?? d.details ?? "",
        category: d.category?.name ?? "",
        amountPaise,
        chargedPaise: charged,
        through: d.account?.name ?? "",
        recipients: d.splits.filter((s) => s.party.nameKey !== "personal").map((s) => s.party.name).join(", "),
      };
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * Charges a debit to one credit (replacing any credit it had), or to none with null. A debit has one source here, so changing it
 * moves the amount from the old credit to the new one and nothing is counted twice. Done in one transaction.
 */
export async function linkDebitToCredit(db: PrismaClient, userId: string, debitId: string, creditId: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const debit = await tx.transaction.findFirst({ where: { id: debitId, userId, deletedAt: null, quickPay: true, type: "EXPENSE" }, select: { id: true } });
    if (!debit) throw new ExpenseError("That debit no longer exists.", "NOT_FOUND");
    if (creditId) {
      const credit = await tx.transaction.findFirst({ where: { id: creditId, userId, deletedAt: null, quickPay: true, type: "INCOME" }, select: { id: true } });
      if (!credit) throw new ExpenseError("That credit no longer exists.", "NOT_FOUND");
    }
    await tx.transactionCreditLink.deleteMany({ where: { userId, debitId, ...(creditId ? { creditId: { not: creditId } } : {}) } });
    if (creditId) await tx.transactionCreditLink.upsert({ where: { debitId_creditId: { debitId, creditId } }, create: { userId, debitId, creditId }, update: {} });
  });
}

/** The credit a new debit goes to by itself: the default credit source, or the latest credit, depending on the chosen mode. */
export async function allocationTarget(db: PrismaClient, userId: string): Promise<string | null> {
  const prefs = await getCreditPreferences(db, userId);
  if (prefs.mode === "DEFAULT") return prefs.defaultCreditId;
  const latest = await db.transaction.findFirst({ where: { userId, quickPay: true, deletedAt: null, type: "INCOME" }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  return latest?.id ?? null;
}

/** A new debit with no credit chosen goes to the allocation target (if there is one). The balance may go below zero: allocation continues. */
export async function autoAllocateDebit(db: PrismaClient, userId: string, debitId: string): Promise<string | null> {
  const target = await allocationTarget(db, userId);
  if (!target) return null;
  const already = await db.transactionCreditLink.count({ where: { userId, debitId } });
  if (already > 0) return null;
  await linkDebitToCredit(db, userId, debitId, target);
  return target;
}
