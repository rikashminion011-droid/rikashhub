-- Credit Portal: portals (cards and pay-later accounts), their unbilled transactions and imported statement lines.

CREATE TABLE "credit_portals" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "totalCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "usedCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cardInfoSaved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "credit_portals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_portals_amounts_check" CHECK ("totalCredit" >= 0 AND "usedCredit" >= 0)
);

CREATE TABLE "credit_portal_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "portalId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "details" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DEBIT',
    "amount" DECIMAL(14,2) NOT NULL,
    "recipientIds" UUID[],
    "reconciledStatementId" UUID,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "credit_portal_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_portal_entries_kind_check" CHECK ("kind" IN ('DEBIT', 'CREDIT')),
    CONSTRAINT "credit_portal_entries_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "credit_statement_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "portalId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "details" TEXT NOT NULL,
    "reason" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recipientIds" UUID[],
    "categoryId" UUID,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "credit_statement_entries_pkey" PRIMARY KEY ("id"),
    -- A line is a debit or a credit, never both and never neither.
    CONSTRAINT "credit_statement_entries_amount_check" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);

CREATE UNIQUE INDEX "credit_portals_userId_nameKey_key" ON "credit_portals"("userId", "nameKey");
CREATE INDEX "credit_portals_userId_deletedAt_idx" ON "credit_portals"("userId", "deletedAt");
CREATE UNIQUE INDEX "credit_portal_entries_userId_dedupeKey_key" ON "credit_portal_entries"("userId", "dedupeKey");
CREATE INDEX "credit_portal_entries_userId_portalId_deletedAt_occurredAt_idx" ON "credit_portal_entries"("userId", "portalId", "deletedAt", "occurredAt");
CREATE UNIQUE INDEX "credit_statement_entries_userId_dedupeKey_key" ON "credit_statement_entries"("userId", "dedupeKey");
CREATE INDEX "credit_statement_entries_userId_portalId_deletedAt_occurredAt_idx" ON "credit_statement_entries"("userId", "portalId", "deletedAt", "occurredAt");

ALTER TABLE "credit_portals" ADD CONSTRAINT "credit_portals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_portal_entries" ADD CONSTRAINT "credit_portal_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_portal_entries" ADD CONSTRAINT "credit_portal_entries_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "credit_portals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_statement_entries" ADD CONSTRAINT "credit_statement_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_statement_entries" ADD CONSTRAINT "credit_statement_entries_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "credit_portals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "credit_portals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_portal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_statement_entries" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
  tbl text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      FOREACH tbl IN ARRAY ARRAY['credit_portals', 'credit_portal_entries', 'credit_statement_entries'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, api_role);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
