import type { Prisma } from "@/generated/prisma/client";
import { mergeEffects, paiseToDecimalString, type BalanceEffect } from "@/lib/finance";

/**
 * Applies the balance changes decided by the ledger rules (src/lib/finance/ledger.ts) inside the
 * caller's database transaction. Every update is scoped to the user and must hit exactly one
 * row, so a wrong or foreign id aborts the whole transaction instead of silently doing nothing.
 */
export async function applyBalanceEffects(
  tx: Prisma.TransactionClient,
  userId: string,
  effects: readonly BalanceEffect[],
): Promise<void> {
  for (const { instrument, delta } of mergeEffects(effects)) {
    const change = { increment: paiseToDecimalString(delta) };
    const where = { id: instrument.id, userId };
    let updated: number;

    switch (instrument.kind) {
      case "ACCOUNT":
      case "CREDIT_LINE":
        updated = (await tx.account.updateMany({ where: { ...where, deletedAt: null }, data: { currentBalance: change } })).count;
        break;
      case "CREDIT_CARD":
        updated = (await tx.creditCard.updateMany({ where: { ...where, deletedAt: null }, data: { outstanding: change } })).count;
        break;
      case "SAVINGS":
        updated = (await tx.savingsAccount.updateMany({ where: { ...where, deletedAt: null }, data: { balance: change } })).count;
        break;
      case "DEBT":
        updated = (await tx.debt.updateMany({ where: { ...where, deletedAt: null }, data: { outstandingPrincipal: change } })).count;
        break;
    }

    if (updated !== 1) throw new Error(`Balance update failed: ${instrument.kind} ${instrument.id} not found`);
  }
}
