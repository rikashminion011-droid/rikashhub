-- Credit History: the credit source new debits are allocated to (at most one default for each user) and how it is chosen.

CREATE TABLE "credit_preferences" (
    "userId" UUID NOT NULL,
    "defaultCreditId" UUID,
    "mode" TEXT NOT NULL DEFAULT 'DEFAULT',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_preferences_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "credit_preferences_mode_check" CHECK ("mode" IN ('DEFAULT', 'RECENT'))
);

CREATE INDEX "credit_preferences_defaultCreditId_idx" ON "credit_preferences"("defaultCreditId");

ALTER TABLE "credit_preferences" ADD CONSTRAINT "credit_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_preferences" ADD CONSTRAINT "credit_preferences_defaultCreditId_fkey" FOREIGN KEY ("defaultCreditId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Debits linked to a credit are looked up by credit.
CREATE INDEX IF NOT EXISTS "transaction_credit_links_creditId_idx" ON "transaction_credit_links"("creditId");

ALTER TABLE "credit_preferences" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'credit_preferences', api_role);
    END IF;
  END LOOP;
END
$$;
