-- Debt Management: which columns each recipient's page shows and in what order, kept for each user and recipient.

CREATE TABLE "recipient_view_prefs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "columns" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recipient_view_prefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipient_view_prefs_userId_partyId_key" ON "recipient_view_prefs"("userId", "partyId");

ALTER TABLE "recipient_view_prefs" ADD CONSTRAINT "recipient_view_prefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipient_view_prefs" ADD CONSTRAINT "recipient_view_prefs_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "expense_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipient_view_prefs" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'recipient_view_prefs', api_role);
    END IF;
  END LOOP;
END
$$;
