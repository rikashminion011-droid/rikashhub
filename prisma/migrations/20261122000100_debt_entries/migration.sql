-- Debts added by hand in Debt Management ("Add Debt"): a reason and an amount for one recipient. They count in that person's total.

CREATE TABLE "debt_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "debt_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "debt_entries_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "debt_entries_userId_partyId_deletedAt_occurredAt_idx" ON "debt_entries"("userId", "partyId", "deletedAt", "occurredAt");

ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "expense_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "debt_entries" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'debt_entries', api_role);
    END IF;
  END LOOP;
END
$$;
