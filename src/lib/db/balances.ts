import type { Prisma } from "@/generated/prisma/client";
import { currentBalance } from "@/features/quick-pay/balances";
import { paiseToDecimalString, toPaise } from "@/lib/finance";

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

  const [accounts, credits, debits] = await Promise.all([
    tx.account.findMany({ where: { id: { in: ids }, userId } }),
    tx.transaction.groupBy({
      by: ["toAccountId"],
      where: { userId, deletedAt: null, type: "INCOME", toAccountId: { in: ids } },
      _sum: { amount: true },
    }),
    tx.transaction.groupBy({
      by: ["accountId"],
      where: { userId, deletedAt: null, type: "EXPENSE", accountId: { in: ids } },
      _sum: { amount: true },
    }),
  ]);
  const creditOf = new Map(credits.map((c) => [c.toAccountId, c._sum.amount ? toPaise(c._sum.amount.toString()) : 0]));
  const debitOf = new Map(debits.map((d) => [d.accountId, d._sum.amount ? toPaise(d._sum.amount.toString()) : 0]));

  for (const account of accounts) {
    const balance = currentBalance({
      openingPaise: toPaise(account.openingBalance.toString()),
      creditsPaise: creditOf.get(account.id) ?? 0,
      debitsPaise: debitOf.get(account.id) ?? 0,
      kind: account.kind === "CREDIT_LINE" ? "CREDIT_LINE" : "ASSET",
    });
    await tx.account.update({ where: { id: account.id }, data: { currentBalance: paiseToDecimalString(balance) } });
  }
}
