import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hdfcCycle } from "@/features/credit-portal/model";
import { portalShares } from "@/features/credit-portal/server/service";
import { ExpenseError } from "@/features/expenses/server/service";
import { rangeToInstants } from "@/features/quick-pay/datetime";
import { shoppingShares } from "@/features/shopping/server/service";
import { toPaise, paiseToDecimalString } from "@/lib/finance";
import { totals } from "../view";
import type { DebtHistory, DebtItem, DebtPayment, DebtQuery, DebtRow, DebtSplitItem, DebtSummary } from "../types";

/**
 * Debt Management: what each person owes, what they have paid, and what remains. It gathers everything recorded for a person:
 * splits and debts from Quick Entry, Shopping Records, and Credit Portal transactions. Payments come from Credit entries
 * ("Credited By") and from payments added by hand. Your own share of a split is kept under "Personal" and is not a debt, so
 * that person is left out. Only debit (money out) transactions count for splits and debts.
 */

const SELF_KEY = "personal";
const MAX_PAYMENT_PAISE = 10_000_000_00;

const paiseOf = (value: { toString(): string }) => toPaise(value.toString());
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100 * 100) / 100 : null);

const periodOf = (q: DebtQuery) => {
  const bounds = rangeToInstants(q.from ?? null, q.to ?? null);
  return bounds.gte || bounds.lt ? (bounds as Prisma.DateTimeFilter) : undefined;
};

const splitWhere = (userId: string, q: DebtQuery, partyId?: string) => {
  const when = periodOf(q);
  return {
    userId,
    ...(partyId ? { partyId } : {}),
    // A person you have since removed from your list still counts: what they owe does not disappear with the name.
    party: { is: { nameKey: { not: SELF_KEY } } },
    transaction: { is: { deletedAt: null, quickPay: true, type: "EXPENSE" as const, ...(when ? { occurredAt: when } : {}) } },
  };
};

const rangeOf = (q: DebtQuery) => ({ from: q.from ?? null, to: q.to ?? null });
/** HDFC's own period for the month the chosen period ends in: its 15th to 15th cycle. With no end date, HDFC follows the period like the rest. */
const hdfcOf = (q: DebtQuery) => (q.to ? hdfcCycle(q.to) : null);

export async function getDebtSummary(db: PrismaClient, userId: string, q: DebtQuery = {}): Promise<DebtSummary> {
  const skip = new Set(q.excludePartyIds ?? []);
  const when = periodOf(q);
  const [people, splits, payments, shopping, portal] = await Promise.all([
    db.expenseParty.findMany({ where: { userId, nameKey: { not: SELF_KEY } }, orderBy: { createdAt: "asc" } }),
    db.transactionSplit.findMany({ where: splitWhere(userId, q), select: { partyId: true, amount: true, transaction: { select: { amount: true, splitKind: true } } } }),
    db.splitPayment.groupBy({ by: ["partyId"], where: { userId, deletedAt: null, ...(when ? { paidAt: when } : {}) }, _sum: { amount: true } }),
    shoppingShares(db, userId, rangeOf(q)),
    portalShares(db, userId, rangeOf(q), hdfcOf(q)),
  ]);

  const owed = new Map<string, { share: number; whole: number; count: number; direct: number }>();
  for (const s of splits) {
    const entry = owed.get(s.partyId) ?? { share: 0, whole: 0, count: 0, direct: 0 };
    const share = paiseOf(s.amount);
    entry.share += share;
    entry.whole += paiseOf(s.transaction.amount);
    entry.count++;
    if (s.transaction.splitKind === "DEBT") entry.direct += share;
    owed.set(s.partyId, entry);
  }
  const paid = new Map(payments.map((p) => [p.partyId, p._sum.amount ? paiseOf(p._sum.amount) : 0]));
  const shop = new Map<string, number>();
  for (const s of shopping) shop.set(s.partyId, (shop.get(s.partyId) ?? 0) + s.amountPaise);
  const port = new Map<string, number>();
  for (const s of portal) port.set(s.partyId, (port.get(s.partyId) ?? 0) + s.amountPaise);

  const rows: DebtRow[] = people
    .filter((p) => !skip.has(p.id))
    // Removed people are listed only while they have something on record.
    .filter((p) => p.deletedAt === null || owed.has(p.id) || shop.has(p.id) || port.has(p.id) || (paid.get(p.id) ?? 0) > 0)
    .map((p) => {
      const o = owed.get(p.id) ?? { share: 0, whole: 0, count: 0, direct: 0 };
      const paidPaise = paid.get(p.id) ?? 0;
      const shoppingPaise = shop.get(p.id) ?? 0;
      const portalPaise = port.get(p.id) ?? 0;
      const totalDebtPaise = o.share + shoppingPaise + portalPaise;
      return {
        partyId: p.id,
        name: p.deletedAt ? `${p.name} (removed)` : p.name,
        totalSplitPaise: o.share,
        splitPercent: percentOf(o.share, o.whole),
        paidPaise,
        remainingPaise: totalDebtPaise - paidPaise,
        splitCount: o.count,
        directPaise: o.direct,
        shoppingPaise,
        portalPaise,
        totalDebtPaise,
      };
    });
  return totals(rows);
}

/** One person's debts from every source and their payments, newest first. */
export async function getDebtHistory(db: PrismaClient, userId: string, partyId: string, q: DebtQuery = {}): Promise<DebtHistory> {
  const summary = await getDebtSummary(db, userId, q);
  const row = summary.rows.find((r) => r.partyId === partyId);
  if (!row) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");
  const when = periodOf(q);

  const [splits, payments, shopping, portal] = await Promise.all([
    db.transactionSplit.findMany({
      where: splitWhere(userId, q, partyId),
      include: { transaction: { select: { id: true, amount: true, occurredAt: true, createdAt: true, description: true, details: true, splitKind: true, account: { select: { name: true } }, category: { select: { name: true } } } } },
    }),
    db.splitPayment.findMany({ where: { userId, partyId, deletedAt: null, ...(when ? { paidAt: when } : {}) }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }] }),
    shoppingShares(db, userId, rangeOf(q)),
    portalShares(db, userId, rangeOf(q), hdfcOf(q)),
  ]);

  const items: DebtSplitItem[] = splits
    .map((s) => {
      const txAmount = paiseOf(s.transaction.amount);
      const share = paiseOf(s.amount);
      return {
        transactionId: s.transaction.id,
        occurredAt: (s.transaction.occurredAt ?? s.transaction.createdAt).toISOString(),
        description: s.transaction.description ?? s.transaction.details ?? "",
        bank: s.transaction.account?.name ?? "",
        txAmountPaise: txAmount,
        percent: s.percentage !== null ? Number(s.percentage.toString()) : (percentOf(share, txAmount) ?? 0),
        sharePaise: share,
      };
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const pays: DebtPayment[] = payments.map((p) => ({ id: p.id, amountPaise: paiseOf(p.amount), paidAt: p.paidAt.toISOString(), note: p.note ?? "" }));

  const all: DebtItem[] = [
    ...splits.map((s): DebtItem => ({
      id: `tx:${s.transaction.id}`,
      source: s.transaction.splitKind === "DEBT" ? "DEBT" : "SPLIT",
      occurredAt: (s.transaction.occurredAt ?? s.transaction.createdAt).toISOString(),
      reason: s.transaction.description ?? s.transaction.details ?? "",
      category: s.transaction.category?.name ?? "",
      related: s.transaction.account?.name ?? "",
      amountPaise: paiseOf(s.amount),
      href: `/quick-pay?entry=${s.transaction.id}`,
    })),
    ...shopping
      .filter((s) => s.partyId === partyId)
      .map((s, i): DebtItem => ({ id: `shop:${s.purchaseId}:${i}`, source: "SHOPPING", occurredAt: s.occurredAt, reason: s.reason, category: "", related: s.platform, amountPaise: s.amountPaise, href: `/shopping/${s.purchaseId}` })),
    ...portal
      .filter((s) => s.partyId === partyId)
      .map((s): DebtItem => ({ id: `portal:${s.source}:${s.id}`, source: "CREDIT_PORTAL", occurredAt: s.occurredAt, reason: s.reason, category: s.category, related: `${s.portal} · ${s.source === "STATEMENT" ? "Statement" : "Unbilled"}`, amountPaise: s.amountPaise, href: `/credit-cards?portal=${s.portalId}&tab=${s.source === "STATEMENT" ? "statement" : "unbilled"}` })),
    ...payments.map((p): DebtItem => ({ id: `pay:${p.id}`, source: "PAYMENT", occurredAt: p.paidAt.toISOString(), reason: p.note ?? "Payment", category: "", related: p.transactionId ? "Credited By" : "Paid", amountPaise: paiseOf(p.amount), href: p.transactionId ? `/quick-pay?entry=${p.transactionId}` : null })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return { row, splits: items, payments: pays, items: all };
}

/** Records money a person has paid back. Allowed to be more than they owe (they have paid ahead). */
export async function addSplitPayment(
  db: PrismaClient,
  userId: string,
  input: { partyId: string; amountPaise: number; paidAt: Date; note: string },
): Promise<string> {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new ExpenseError("Enter the amount paid, above zero.");
  if (input.amountPaise > MAX_PAYMENT_PAISE) throw new ExpenseError("That amount is too large.");
  if (Number.isNaN(input.paidAt.getTime())) throw new ExpenseError("Choose a valid date and time.");
  if (input.paidAt.getTime() > Date.now() + 5 * 60_000) throw new ExpenseError("The date and time cannot be in the future.");
  const note = input.note.trim().replace(/\s+/g, " ");
  if (note.length > 200) throw new ExpenseError("Keep the note under 200 characters.");

  const person = await db.expenseParty.findFirst({ where: { id: input.partyId, userId, nameKey: { not: SELF_KEY } } });
  if (!person) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");

  const created = await db.splitPayment.create({
    data: { userId, partyId: person.id, amount: paiseToDecimalString(input.amountPaise), paidAt: input.paidAt, note: note || null },
  });
  await db.auditLog.create({ data: { userId, action: "debt.payment", entity: "split_payment", entityId: created.id, after: { amountPaise: input.amountPaise } } });
  return created.id;
}

export async function deleteSplitPayment(db: PrismaClient, userId: string, id: string): Promise<void> {
  const updated = await db.splitPayment.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (updated.count !== 1) throw new ExpenseError("That payment no longer exists.", "NOT_FOUND");
  await db.auditLog.create({ data: { userId, action: "debt.payment.delete", entity: "split_payment", entityId: id } });
}

/**
 * Keeps the payment made by a Quick Entry Credit in step with it. "Credited By" a person records the credit's amount as money
 * that person has paid; "Others" (or no one) records nothing. Changing the person, the amount or the day updates the payment,
 * and removing it (or deleting the entry) takes the payment away.
 */
export async function syncCreditedBy(
  db: PrismaClient,
  userId: string,
  transactionId: string,
  partyId: string | null,
  entry: { occurredAt: Date; amountPaise: number; reason: string },
): Promise<void> {
  const existing = await db.splitPayment.findUnique({ where: { userId_transactionId: { userId, transactionId } } });
  if (!partyId) {
    if (existing && !existing.deletedAt) await db.splitPayment.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return;
  }
  const person = await db.expenseParty.findFirst({ where: { id: partyId, userId, deletedAt: null, nameKey: { not: SELF_KEY } } });
  if (!person) throw new ExpenseError("The person who credited this no longer exists. Choose again.", "NOT_FOUND");
  const data = { partyId: person.id, amount: paiseToDecimalString(entry.amountPaise), paidAt: entry.occurredAt, note: entry.reason.trim() || "Credit", deletedAt: null };
  if (existing) await db.splitPayment.update({ where: { id: existing.id }, data });
  else await db.splitPayment.create({ data: { userId, transactionId, ...data } });
}

/** Who credited an entry, or null (Others). */
export async function creditedByOf(db: PrismaClient, userId: string, transactionId: string): Promise<string | null> {
  const row = await db.splitPayment.findFirst({ where: { userId, transactionId, deletedAt: null }, select: { partyId: true } });
  return row?.partyId ?? null;
}
