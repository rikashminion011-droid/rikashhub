-- Shopping Records: platforms, purchases (with an optional receipt image) and each purchase's item table.

CREATE TABLE "shopping_platforms" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "shopping_platforms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shopping_purchases" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "recipientIds" UUID[],
    "imageData" BYTEA,
    "imageType" TEXT,
    "detailsSaved" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "transactionId" UUID,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "shopping_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_purchases_amount_check" CHECK ("amount" >= 0)
);

CREATE TABLE "shopping_purchase_items" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "recipientIds" UUID[],
    CONSTRAINT "shopping_purchase_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_purchase_items_amounts_check" CHECK ("quantity" >= 0 AND "rate" >= 0 AND "total" >= 0)
);

CREATE UNIQUE INDEX "shopping_platforms_userId_nameKey_key" ON "shopping_platforms"("userId", "nameKey");
CREATE INDEX "shopping_platforms_userId_deletedAt_idx" ON "shopping_platforms"("userId", "deletedAt");
CREATE UNIQUE INDEX "shopping_purchases_userId_dedupeKey_key" ON "shopping_purchases"("userId", "dedupeKey");
CREATE UNIQUE INDEX "shopping_purchases_userId_transactionId_key" ON "shopping_purchases"("userId", "transactionId");
CREATE INDEX "shopping_purchases_userId_platformId_deletedAt_occurredAt_idx" ON "shopping_purchases"("userId", "platformId", "deletedAt", "occurredAt");
CREATE INDEX "shopping_purchase_items_purchaseId_position_idx" ON "shopping_purchase_items"("purchaseId", "position");

ALTER TABLE "shopping_platforms" ADD CONSTRAINT "shopping_platforms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopping_purchases" ADD CONSTRAINT "shopping_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopping_purchases" ADD CONSTRAINT "shopping_purchases_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "shopping_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopping_purchase_items" ADD CONSTRAINT "shopping_purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "shopping_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Locked for the Supabase REST roles, like every other table.
ALTER TABLE "shopping_platforms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopping_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopping_purchase_items" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
  tbl text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      FOREACH tbl IN ARRAY ARRAY['shopping_platforms', 'shopping_purchases', 'shopping_purchase_items'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, api_role);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
