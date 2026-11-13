-- The Add Bulk sheet kept as a draft per user, so it is the same on every device.

CREATE TABLE "bulk_drafts" (
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bulk_drafts_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "bulk_drafts" ADD CONSTRAINT "bulk_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "bulk_drafts" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "bulk_drafts" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
