-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "expenseDefaultsSeededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "parentId" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "isSplit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "expense_parties" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "expense_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_parties_userId_nameKey_key" ON "expense_parties"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "transaction_splits_userId_partyId_idx" ON "transaction_splits"("userId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_splits_transactionId_partyId_key" ON "transaction_splits"("transactionId", "partyId");

-- CreateIndex
CREATE INDEX "accounts_userId_parentId_idx" ON "accounts"("userId", "parentId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_parties" ADD CONSTRAINT "expense_parties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "expense_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

