-- Monthly Food Tracking: default meal prices, priced food items, saved food entries.

CREATE TYPE "FoodMeal" AS ENUM ('TIFFIN', 'LUNCH', 'DINNER');

CREATE TABLE "food_meal_prices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "meal" "FoodMeal" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "food_meal_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "meal" "FoodMeal" NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "food_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "meal" "FoodMeal" NOT NULL,
    "notes" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "food_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_meal_prices_userId_meal_key" ON "food_meal_prices"("userId", "meal");
CREATE INDEX "food_items_userId_meal_nameKey_idx" ON "food_items"("userId", "meal", "nameKey");
CREATE UNIQUE INDEX "food_entries_userId_dedupeKey_key" ON "food_entries"("userId", "dedupeKey");
CREATE INDEX "food_entries_userId_deletedAt_occurredAt_idx" ON "food_entries"("userId", "deletedAt", "occurredAt");

ALTER TABLE "food_meal_prices" ADD CONSTRAINT "food_meal_prices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the database enforces itself.
ALTER TABLE "food_meal_prices" ADD CONSTRAINT "food_meal_prices_price_valid" CHECK ("price" >= 0 AND "price" <= 100000);
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_price_valid" CHECK ("price" >= 0 AND "price" <= 100000);
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_name_valid" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60 AND char_length("nameKey") BETWEEN 1 AND 60);
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_amount_valid" CHECK ("amount" >= 0 AND "amount" <= 1000000);
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_notes_valid" CHECK (char_length(btrim("notes")) BETWEEN 1 AND 200);
-- An item name is unique within its meal for each user (deleted items do not count).
CREATE UNIQUE INDEX "food_items_active_name_key" ON "food_items"("userId", "meal", "nameKey") WHERE "deletedAt" IS NULL;

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "food_meal_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_entries" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "food_meal_prices", "food_items", "food_entries" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
