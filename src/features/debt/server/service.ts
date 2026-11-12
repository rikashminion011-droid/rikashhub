import type { PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { toPaise, paiseToDecimalString } from "@/lib/finance";
import type { DebtHistory, DebtPayment, DebtRow, DebtSplitItem, DebtSummary } from "../types";

/**
 * Debt Management: what each person owes from splits, what they have paid, and what remains.
 * Your own share of a split is kept under "Personal" and is not a debt, so that person is left out.
 * Only debit (money out) transactions count: a split on a debit means the person owes you their share.
 */

const SELF_KEY = "personal";
const MAX_PAYMENT_PAISE = 10_000_000_00;

const paiseOf = (value: { toString(): string }) => toPaise(value.toString());
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100 * 100) / 100 : null);

const splitWhere = (userId: string, partyId?: string) => ({
  userId,
  ...(partyId ? { partyId } : {}),
  // A person you have since removed from your list still counts: what they owe does not disappear with the name.
  party: { is: { nameKey: { not: SELF_KEY } } },
  transaction: { is: { deletedAt: null, quickPay: true, type: "EXPENSE" as const } },
});

export async function getDebtSummary(db: PrismaClient, userId: string): Promise<DebtSummary> {
  const [people, splits, payments] = await Promise.all([
    db.expenseParty.findMany({ where: { userId, nameKey: { not: SELF_KEY } }, orderBy: { createdAt: "asc" } }),
    db.transactionSplit.findMany({ where: splitWhere(userId), select: { partyId: true, amount: true, transaction: { select: { amount: true } } } }),
    db.splitPayment.groupBy({ by: ["partyId"], where: { userId, deletedAt: null }, _sum: { amount: true } }),
  ]);

  const owed = new Map<string, { share: number; whole: number; count: number }>();
  for (const s of splits) {
    const entry = owed.get(s.partyId) ?? { share: 0, whole: 0, count: 0 };
    entry.share += paiseOf(s.amount);
    entry.whole += paiseOf(s.transaction.amount);
    entry.count++;
    owed.set(s.partyId, entry);
  }
  const paid = new Map(payments.map((p) => [p.partyId, p._sum.amount ? paiseOf(p._sum.amount) : 0]));

  const rows: DebtRow[] = people
    // Removed people are listed only while they have something on record.
    .filter((p) => p.deletedAt === null || owed.has(p.id) || (paid.get(p.id) ?? 0) > 0)
    .map((p) => {
    const o = owed.get(p.id) ?? { share: 0, whole: 0, count: 0 };
    const paidPaise = paid.get(p.id) ?? 0;
    return { partyId: p.id, name: p.deletedAt ? `${p.name} (removed)` : p.name, totalSplitPaise: o.share, splitPercent: percentOf(o.share, o.whole), paidPaise, remainingPaise: o.share - paidPaise, splitCount: o.count };
    });
  const sum = (pick: (r: DebtRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  return { rows, totalSplitPaise: sum((r) => r.totalSplitPaise), totalPaidPaise: sum((r) => r.paidPaise), totalRemainingPaise: sum((r) => r.remainingPaise) };
}

/** One person's split transactions and payments, newest first. */
export async function getDebtHistory(db: PrismaClient, userId: string, partyId: string): Promise<DebtHistory> {
  const summary = await getDebtSummary(db, userId);
  const row = summary.rows.find((r) => r.partyId === partyId);
  if (!row) throw new ExpenseError("That person no longer exists.", "NOT_FOUND");

  const [splits, payments] = await Promise.all([
    db.transactionSplit.findMany({
      where: splitWhere(userId, partyId),
      include: { transaction: { select: { id: true, amount: true, occurredAt: true, createdAt: true, description: true, details: true, account: { select: { name: true } } } } },
    }),
    db.splitPayment.findMany({ where: { userId, partyId, deletedAt: null }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }] }),
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
  return { row, splits: items, payments: pays };
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
