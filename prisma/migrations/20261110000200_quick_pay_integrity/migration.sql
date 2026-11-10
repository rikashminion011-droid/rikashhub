-- Integrity rules for Quick Pay: sub-categories and the exact time of an entry.

ALTER TABLE "transaction_categories"
  ADD CONSTRAINT "categories_parent_not_self" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- A sub-category must sit directly under a main category of the same user and of the same type.
CREATE FUNCTION categories_check_parent() RETURNS trigger AS $$
DECLARE
  parent_row record;
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "userId", "parentId", "type" INTO parent_row FROM "transaction_categories" WHERE "id" = NEW."parentId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent category does not exist' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF parent_row."userId" <> NEW."userId" THEN
    RAISE EXCEPTION 'Parent category belongs to another user' USING ERRCODE = 'check_violation';
  END IF;
  IF parent_row."parentId" IS NOT NULL THEN
    RAISE EXCEPTION 'Categories can only be one level deep' USING ERRCODE = 'check_violation';
  END IF;
  IF parent_row."type" <> NEW."type" THEN
    RAISE EXCEPTION 'A sub-category must have the same type as its main category' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "categories_parent_check"
  BEFORE INSERT OR UPDATE OF "parentId", "userId", "type" ON "transaction_categories"
  FOR EACH ROW EXECUTE FUNCTION categories_check_parent();

-- Quick Pay entries always carry the exact moment they happened.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_quickpay_has_time" CHECK (NOT "quickPay" OR "occurredAt" IS NOT NULL);
