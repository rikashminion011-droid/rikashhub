-- Customized Settings, split percentages, debt payments, credit links, and a separate "details" column.

ALTER TABLE "transactions" ADD COLUMN "details" TEXT;
ALTER TABLE "transaction_splits" ADD COLUMN "percentage" DECIMAL(7,4);

-- Imported statement text moves from the Reason to its own column; the Reason is left for the user to write.
UPDATE "transactions" SET "details" = "description", "description" = NULL
  WHERE "dedupeKey" LIKE 'gpay-import:%' AND "details" IS NULL;

CREATE TABLE "quick_pay_settings" (
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quick_pay_settings_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "split_payments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "split_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transaction_credit_links" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "debitId" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transaction_credit_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "split_payments_userId_partyId_deletedAt_idx" ON "split_payments"("userId", "partyId", "deletedAt");
CREATE UNIQUE INDEX "transaction_credit_links_debitId_creditId_key" ON "transaction_credit_links"("debitId", "creditId");
CREATE INDEX "transaction_credit_links_userId_debitId_idx" ON "transaction_credit_links"("userId", "debitId");

ALTER TABLE "quick_pay_settings" ADD CONSTRAINT "quick_pay_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "expense_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction_credit_links" ADD CONSTRAINT "transaction_credit_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_credit_links" ADD CONSTRAINT "transaction_credit_links_debitId_fkey" FOREIGN KEY ("debitId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_credit_links" ADD CONSTRAINT "transaction_credit_links_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the database enforces itself.
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_amount_positive" CHECK ("amount" > 0 AND "amount" <= 1000000000);
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_percentage_valid" CHECK ("percentage" IS NULL OR ("percentage" > 0 AND "percentage" <= 100));
ALTER TABLE "transaction_credit_links" ADD CONSTRAINT "transaction_credit_links_distinct" CHECK ("debitId" <> "creditId");

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "quick_pay_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "split_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction_credit_links" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "quick_pay_settings", "split_payments", "transaction_credit_links" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
