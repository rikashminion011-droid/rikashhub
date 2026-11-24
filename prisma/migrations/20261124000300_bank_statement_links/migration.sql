-- Bank Statement rows can be linked to the Transaction History entry they match, so the Reason and Category follow it.

ALTER TABLE "bank_statement_entries" ADD COLUMN IF NOT EXISTS "transactionId" UUID;
ALTER TABLE "bank_statement_entries" ADD COLUMN IF NOT EXISTS "manualReason" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bank_statement_entries" ADD COLUMN IF NOT EXISTS "manualCategory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bank_statement_entries" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_entries_transactionId_fkey') THEN
    ALTER TABLE "bank_statement_entries" ADD CONSTRAINT "bank_statement_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "bank_statement_entries_transactionId_idx" ON "bank_statement_entries"("transactionId");

-- One entry is linked to at most one live statement row.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_statement_entries_one_row_per_transaction" ON "bank_statement_entries"("userId", "transactionId") WHERE "transactionId" IS NOT NULL AND "deletedAt" IS NULL;
