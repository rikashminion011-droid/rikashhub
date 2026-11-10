import type { Prisma } from "@/generated/prisma/client";
import { currentBalance } from "@/features/quick-pay/balances";
import { paiseToDecimalString, toPaise } from "@/lib/finance";

/**
 * Limits transactions to those at or after an account's opening moment. Entries without an exact
 * time (other modules) are compared by calendar date in IST.
 */
export function sinceOpening(openingAt: Date | null): Prisma.TransactionWhereInput {
  if (!openingAt) return {};
  const istDate = new Date(openingAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return { OR: [{ occurredAt: { gte: openingAt } }, { occurredAt: null, date: { gte: new Date(`${istDate}T00:00:00.000Z`) } }] };
}

/**
 * Recomputes the stored current balance of accounts from the ledger:
 *   opening balance + credits (income into the account) - debits (expenses out of it),
 * reversed for credit lines. Because it is recalculated from the records every time, adding,
 * editing or deleting any transaction (in any module) always leaves an exact balance.
 * Call inside the same database transaction as the change.
 */
export async function recomputeBalances(tx: Prisma.TransactionClient, userId: string, accountIds: readonly string[]): Promise<void> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return;

  const accounts = await tx.account.findMany({ where: { id: { in: ids }, userId } });

  for (const account of accounts) {
    const since = sinceOpening(account.openingAt);
    const [credit, debit] = await Promise.all([
      tx.transaction.aggregate({ where: { userId, deletedAt: null, type: "INCOME", toAccountId: account.id, ...since }, _sum: { amount: true } }),
      tx.transaction.aggregate({ where: { userId, deletedAt: null, type: "EXPENSE", accountId: account.id, ...since }, _sum: { amount: true } }),
    ]);
    const creditOf = new Map([[account.id, credit._sum.amount ? toPaise(credit._sum.amount.toString()) : 0]]);
    const debitOf = new Map([[account.id, debit._sum.amount ? toPaise(debit._sum.amount.toString()) : 0]]);
    const balance = currentBalance({
      openingPaise: toPaise(account.openingBalance.toString()),
      creditsPaise: creditOf.get(account.id) ?? 0,
      debitsPaise: debitOf.get(account.id) ?? 0,
      kind: account.kind === "CREDIT_LINE" ? "CREDIT_LINE" : "ASSET",
    });
    await tx.account.update({ where: { id: account.id }, data: { currentBalance: paiseToDecimalString(balance) } });
  }
}
