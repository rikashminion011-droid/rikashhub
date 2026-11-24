-- Shopping Cart: things planned to be bought, numbered Cart 01, Cart 02... for ever (a number is never reused), with their own categories.

CREATE TABLE "shopping_cart_categories" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "shopping_cart_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopping_cart_categories_userId_nameKey_key" ON "shopping_cart_categories"("userId", "nameKey");

CREATE TABLE "shopping_cart_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cartNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "plannedMonth" TEXT NOT NULL,
    "categoryId" UUID,
    "productLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "shopping_cart_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_cart_items_month_check" CHECK ("plannedMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX "shopping_cart_items_userId_cartNo_key" ON "shopping_cart_items"("userId", "cartNo");
CREATE INDEX "shopping_cart_items_userId_deletedAt_plannedMonth_idx" ON "shopping_cart_items"("userId", "deletedAt", "plannedMonth");

ALTER TABLE "shopping_cart_categories" ADD CONSTRAINT "shopping_cart_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopping_cart_items" ADD CONSTRAINT "shopping_cart_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopping_cart_items" ADD CONSTRAINT "shopping_cart_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shopping_cart_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shopping_cart_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopping_cart_items" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
  t text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      FOREACH t IN ARRAY ARRAY['shopping_cart_categories', 'shopping_cart_items'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, api_role);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
