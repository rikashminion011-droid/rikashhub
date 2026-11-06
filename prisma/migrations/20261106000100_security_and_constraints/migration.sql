-- Security hardening and data-integrity rules that Prisma cannot express.

-- ─────────────────────────────────────────────────────────────
-- 1. Row Level Security
--    Every table is locked for the Supabase REST roles (anon / authenticated): RLS is on and
--    there are NO policies, so the public API can read or write nothing. The application
--    reaches the data only through the server (Prisma) using the database owner role, which
--    bypasses RLS, and every query there is filtered by the verified user id.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_card_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monthly_dues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debt_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "savings_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "savings_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestone_contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monthly_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Belt and braces: also remove the table privileges from the REST roles (they exist on Supabase only).
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Integrity constraints (the database refuses impossible financial data)
-- ─────────────────────────────────────────────────────────────

-- Transactions: positive amounts, one source instrument, transfers go between different accounts.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "transactions_single_source" CHECK (num_nonnulls("accountId", "creditCardId") <= 1),
  ADD CONSTRAINT "transactions_transfer_distinct" CHECK (
    "type" <> 'TRANSFER' OR ("accountId" IS NOT NULL AND "toAccountId" IS NOT NULL AND "accountId" <> "toAccountId")
  );

-- Credit cards: day-of-month fields are real days, money is not negative.
ALTER TABLE "credit_cards"
  ADD CONSTRAINT "credit_cards_limit_nonneg" CHECK ("creditLimit" >= 0),
  ADD CONSTRAINT "credit_cards_fee_nonneg" CHECK ("annualFee" >= 0),
  ADD CONSTRAINT "credit_cards_due_nonneg" CHECK ("minimumDue" >= 0 AND "totalDue" >= 0),
  ADD CONSTRAINT "credit_cards_days_valid" CHECK (
    "billingDay" BETWEEN 1 AND 31 AND "statementDay" BETWEEN 1 AND 31 AND "dueDay" BETWEEN 1 AND 31
  );

ALTER TABLE "credit_card_statements"
  ADD CONSTRAINT "statements_amounts_nonneg" CHECK ("totalDue" >= 0 AND "minimumDue" >= 0 AND "paidAmount" >= 0),
  ADD CONSTRAINT "statements_period_valid" CHECK ("periodEnd" >= "periodStart");

-- Monthly dues and recurring rules.
ALTER TABLE "recurring_payments"
  ADD CONSTRAINT "recurring_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "recurring_day_valid" CHECK ("dayOfMonth" IS NULL OR "dayOfMonth" BETWEEN 1 AND 31),
  ADD CONSTRAINT "recurring_reminder_nonneg" CHECK ("reminderDaysBefore" >= 0),
  ADD CONSTRAINT "recurring_dates_valid" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

ALTER TABLE "monthly_dues"
  ADD CONSTRAINT "dues_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "dues_paid_nonneg" CHECK ("paidAmount" >= 0);

ALTER TABLE "payment_records"
  ADD CONSTRAINT "payment_records_amount_positive" CHECK ("amount" > 0);

-- Debts: a payment is exactly principal part + interest part.
ALTER TABLE "debts"
  ADD CONSTRAINT "debts_principal_positive" CHECK ("principal" > 0),
  ADD CONSTRAINT "debts_rate_valid" CHECK ("interestRate" >= 0 AND "interestRate" <= 100),
  ADD CONSTRAINT "debts_outstanding_nonneg" CHECK ("outstandingPrincipal" >= 0),
  ADD CONSTRAINT "debts_paid_nonneg" CHECK ("principalPaidTotal" >= 0 AND "interestPaidTotal" >= 0),
  ADD CONSTRAINT "debts_term_valid" CHECK ("termMonths" IS NULL OR "termMonths" > 0);

ALTER TABLE "debt_payments"
  ADD CONSTRAINT "debt_payments_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "debt_payments_parts_nonneg" CHECK ("principalPart" >= 0 AND "interestPart" >= 0),
  ADD CONSTRAINT "debt_payments_parts_add_up" CHECK ("amount" = "principalPart" + "interestPart");

-- Savings: balances cannot go below zero, entries are positive.
ALTER TABLE "savings_accounts"
  ADD CONSTRAINT "savings_balance_nonneg" CHECK ("balance" >= 0),
  ADD CONSTRAINT "savings_rate_valid" CHECK ("interestRate" >= 0 AND "interestRate" <= 100);

ALTER TABLE "savings_transactions"
  ADD CONSTRAINT "savings_entries_amount_positive" CHECK ("amount" > 0);

-- Milestones.
ALTER TABLE "milestones"
  ADD CONSTRAINT "milestones_target_positive" CHECK ("targetAmount" > 0),
  ADD CONSTRAINT "milestones_current_nonneg" CHECK ("currentAmount" >= 0),
  ADD CONSTRAINT "milestones_dates_valid" CHECK ("targetDate" >= "startDate");

ALTER TABLE "milestone_contributions"
  ADD CONSTRAINT "milestone_contributions_amount_positive" CHECK ("amount" > 0);

-- Only the last four digits of any card/account number may be stored in the plain columns.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_masked_last4" CHECK ("maskedNumber" IS NULL OR "maskedNumber" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "accounts_linked_card_last4" CHECK ("linkedCardLast4" IS NULL OR "linkedCardLast4" ~ '^[0-9]{4}$');

ALTER TABLE "credit_cards"
  ADD CONSTRAINT "credit_cards_last4" CHECK ("cardLast4" ~ '^[0-9]{4}$');

-- Attachments: bounded size (5 MB).
ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_size_valid" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880);

-- ─────────────────────────────────────────────────────────────
-- 3. Private storage bucket for receipts (Supabase only; skipped on plain Postgres)
--    No storage policies are created: uploads and signed URLs go through the server only.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'receipts', 'receipts', false, 5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;
