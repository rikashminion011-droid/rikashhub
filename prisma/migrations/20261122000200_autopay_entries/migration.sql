-- Auto Pay of a credit portal: dated amounts, kept apart for "My Autopay" and "Office Autopay".

CREATE TYPE "AutopayOwner" AS ENUM ('MY', 'OFFICE');

CREATE TABLE "autopay_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "portalId" UUID NOT NULL,
    "owner" "AutopayOwner" NOT NULL,
    "payDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "autopay_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "autopay_entries_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "autopay_entries_userId_portalId_owner_deletedAt_payDate_idx" ON "autopay_entries"("userId", "portalId", "owner", "deletedAt", "payDate");

ALTER TABLE "autopay_entries" ADD CONSTRAINT "autopay_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "autopay_entries" ADD CONSTRAINT "autopay_entries_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "credit_portals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "autopay_entries" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'autopay_entries', api_role);
    END IF;
  END LOOP;
END
$$;
