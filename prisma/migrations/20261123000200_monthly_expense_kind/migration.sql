-- Monthly Due now has two lists with the same features: "My other expenses" (OTHER, the old Monthly Expenses) and "My monthly bills" (BILL).

CREATE TYPE "MonthlyExpenseKind" AS ENUM ('OTHER', 'BILL');

ALTER TABLE "monthly_expenses" ADD COLUMN "kind" "MonthlyExpenseKind" NOT NULL DEFAULT 'OTHER';

DROP INDEX IF EXISTS "monthly_expenses_userId_month_deletedAt_idx";
CREATE INDEX "monthly_expenses_userId_kind_month_deletedAt_idx" ON "monthly_expenses"("userId", "kind", "month", "deletedAt");
