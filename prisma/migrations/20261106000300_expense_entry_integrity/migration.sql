-- Security and integrity rules for the expense entry feature (people, splits, sub-accounts).

-- ─────────────────────────────────────────────────────────────
-- 1. Row Level Security: locked for the Supabase REST roles, like every other table.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "expense_parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction_splits" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "expense_parties", "transaction_splits" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Simple rules
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "transaction_splits"
  ADD CONSTRAINT "transaction_splits_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "expense_parties"
  ADD CONSTRAINT "expense_parties_name_valid" CHECK (
    char_length(btrim("name")) BETWEEN 1 AND 60 AND "nameKey" = lower(btrim("name"))
  );

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_parent_not_self" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- ─────────────────────────────────────────────────────────────
-- 3. A sub-account must sit directly under one of the same user's top-level accounts.
-- ─────────────────────────────────────────────────────────────
CREATE FUNCTION accounts_check_parent() RETURNS trigger AS $$
DECLARE
  parent_row record;
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "userId", "parentId" INTO parent_row FROM "accounts" WHERE "id" = NEW."parentId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent account does not exist' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF parent_row."userId" <> NEW."userId" THEN
    RAISE EXCEPTION 'Parent account belongs to another user' USING ERRCODE = 'check_violation';
  END IF;
  IF parent_row."parentId" IS NOT NULL THEN
    RAISE EXCEPTION 'Accounts can only be one level deep' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "accounts_parent_check"
  BEFORE INSERT OR UPDATE OF "parentId", "userId" ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION accounts_check_parent();

-- ─────────────────────────────────────────────────────────────
-- 4. A split row must belong to the same user as its transaction and its person.
-- ─────────────────────────────────────────────────────────────
CREATE FUNCTION transaction_splits_check_owner() RETURNS trigger AS $$
DECLARE
  tx_owner uuid;
  party_owner uuid;
BEGIN
  SELECT "userId" INTO tx_owner FROM "transactions" WHERE "id" = NEW."transactionId";
  SELECT "userId" INTO party_owner FROM "expense_parties" WHERE "id" = NEW."partyId";
  IF tx_owner IS DISTINCT FROM NEW."userId" OR party_owner IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'Split rows must belong to the same user as the expense and the person'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transaction_splits_owner_check"
  BEFORE INSERT OR UPDATE OF "userId", "transactionId", "partyId" ON "transaction_splits"
  FOR EACH ROW EXECUTE FUNCTION transaction_splits_check_owner();

-- ─────────────────────────────────────────────────────────────
-- 5. The split rows of an expense must add up to its amount, exactly.
--    Checked when the transaction commits, so rows can be inserted one at a time.
-- ─────────────────────────────────────────────────────────────
CREATE FUNCTION transaction_splits_check_total(tx_id uuid) RETURNS void AS $$
DECLARE
  expense_amount numeric;
  split_total numeric;
  split_count integer;
BEGIN
  SELECT "amount" INTO expense_amount FROM "transactions" WHERE "id" = tx_id;
  IF expense_amount IS NULL THEN
    RETURN; -- the expense itself was deleted
  END IF;
  SELECT COALESCE(SUM("amount"), 0), COUNT(*) INTO split_total, split_count
    FROM "transaction_splits" WHERE "transactionId" = tx_id;
  IF split_count > 0 AND split_total <> expense_amount THEN
    RAISE EXCEPTION 'Split amounts (%) must add up to the expense amount (%)', split_total, expense_amount
      USING ERRCODE = 'check_violation';
  END IF;
END
$$ LANGUAGE plpgsql;

CREATE FUNCTION transaction_splits_total_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    PERFORM transaction_splits_check_total(NEW."id");
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM transaction_splits_check_total(OLD."transactionId");
  ELSE
    PERFORM transaction_splits_check_total(NEW."transactionId");
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "transaction_splits_total"
  AFTER INSERT OR UPDATE OR DELETE ON "transaction_splits"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION transaction_splits_total_trigger();

CREATE CONSTRAINT TRIGGER "transactions_split_total"
  AFTER UPDATE OF "amount" ON "transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION transaction_splits_total_trigger();
