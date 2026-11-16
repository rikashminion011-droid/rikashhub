-- Debt Management and Monthly Due:
--  * a payment can come from a Quick Entry Credit ("Credited By"),
--  * an Unbilled row can come from a Quick Entry or GPay transaction on a credit-portal bank,
--  * Monthly Due keeps its typed monthly expenses and which person is "me".

ALTER TABLE "split_payments" ADD COLUMN "transactionId" UUID;
CREATE UNIQUE INDEX "split_payments_userId_transactionId_key" ON "split_payments"("userId", "transactionId");

ALTER TABLE "credit_portal_entries" ADD COLUMN "transactionId" UUID;
CREATE UNIQUE INDEX "credit_portal_entries_userId_transactionId_key" ON "credit_portal_entries"("userId", "transactionId");

CREATE TABLE "monthly_expenses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "monthly_expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthly_expenses_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "monthly_expenses_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE TABLE "monthly_due_settings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "personalPartyId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "monthly_due_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "monthly_expenses_userId_month_deletedAt_idx" ON "monthly_expenses"("userId", "month", "deletedAt");
CREATE UNIQUE INDEX "monthly_due_settings_userId_key" ON "monthly_due_settings"("userId");

ALTER TABLE "monthly_expenses" ADD CONSTRAINT "monthly_expenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_due_settings" ADD CONSTRAINT "monthly_due_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "monthly_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monthly_due_settings" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
  tbl text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      FOREACH tbl IN ARRAY ARRAY['monthly_expenses', 'monthly_due_settings'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, api_role);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
