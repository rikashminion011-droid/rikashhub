-- Bank Statement: the rows of imported bank statements (any bank), kept in date order across banks.

CREATE TABLE "bank_statement_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "txDate" DATE NOT NULL,
    "txTime" TEXT NOT NULL DEFAULT '00:00',
    "seq" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT NOT NULL,
    "reason" TEXT,
    "categoryId" UUID,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "bank_statement_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_statement_entries_amounts_check" CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" > 0 OR "credit" > 0))
);

CREATE UNIQUE INDEX "bank_statement_entries_userId_dedupeKey_key" ON "bank_statement_entries"("userId", "dedupeKey");
CREATE INDEX "bank_statement_entries_userId_deletedAt_txDate_txTime_seq_idx" ON "bank_statement_entries"("userId", "deletedAt", "txDate", "txTime", "seq");

ALTER TABLE "bank_statement_entries" ADD CONSTRAINT "bank_statement_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_entries" ADD CONSTRAINT "bank_statement_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statement_entries" ADD CONSTRAINT "bank_statement_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bank_statement_entries" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'bank_statement_entries', api_role);
    END IF;
  END LOOP;
END
$$;
