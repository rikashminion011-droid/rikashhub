-- DropIndex
DROP INDEX "transaction_categories_userId_type_name_key";

-- AlterTable
ALTER TABLE "transaction_categories" ADD COLUMN     "parentId" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "occurredAt" TIMESTAMPTZ(3),
ADD COLUMN     "quickPay" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "transaction_categories_userId_parentId_idx" ON "transaction_categories"("userId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_categories_userId_type_parentId_name_key" ON "transaction_categories"("userId", "type", "parentId", "name");

-- CreateIndex
CREATE INDEX "transactions_userId_quickPay_occurredAt_idx" ON "transactions"("userId", "quickPay", "occurredAt");

-- AddForeignKey
ALTER TABLE "transaction_categories" ADD CONSTRAINT "transaction_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "transaction_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

