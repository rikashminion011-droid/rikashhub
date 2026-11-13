-- Side navigator layout per user.

CREATE TABLE "navigation_settings" (
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "navigation_settings_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "navigation_settings" ADD CONSTRAINT "navigation_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "navigation_settings" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "navigation_settings" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
