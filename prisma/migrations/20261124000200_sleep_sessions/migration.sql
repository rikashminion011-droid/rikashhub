-- Sleep Tracker: one row for each sleep. A row with no endedAt is a sleep in progress; it stays until the wake-up is recorded.

CREATE TABLE "sleep_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "sleep_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sleep_sessions_order_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
    CONSTRAINT "sleep_sessions_duration_check" CHECK (("endedAt" IS NULL AND "durationMinutes" IS NULL) OR ("endedAt" IS NOT NULL AND "durationMinutes" >= 0))
);

CREATE INDEX "sleep_sessions_userId_deletedAt_endedAt_idx" ON "sleep_sessions"("userId", "deletedAt", "endedAt");

-- A person can be asleep only once at a time: two double-taps at the same instant cannot start two sessions.
CREATE UNIQUE INDEX "sleep_sessions_one_active_per_user" ON "sleep_sessions"("userId") WHERE "endedAt" IS NULL AND "deletedAt" IS NULL;

ALTER TABLE "sleep_sessions" ADD CONSTRAINT "sleep_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sleep_sessions" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'sleep_sessions', api_role);
    END IF;
  END LOOP;
END
$$;
