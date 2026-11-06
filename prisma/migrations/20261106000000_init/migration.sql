-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'WALLET', 'DEBIT_CARD', 'SLICE', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('ASSET', 'CREDIT_LINE');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'CREDIT_CARD_PAYMENT', 'DEBT_PAYMENT', 'SAVINGS_DEPOSIT', 'SAVINGS_WITHDRAWAL', 'EMI_PAYMENT', 'SUBSCRIPTION_PAYMENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'NET_BANKING', 'WALLET', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "DueCategory" AS ENUM ('CREDIT_CARD_BILL', 'EMI', 'PERSONAL_LOAN', 'SUBSCRIPTION', 'RENT', 'INSURANCE', 'UTILITY', 'INTERNET', 'MOBILE', 'OTHER');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PAID', 'PARTIALLY_PAID');

-- CreateEnum
CREATE TYPE "DebtDirection" AS ENUM ('OWE', 'OWED_TO_ME');

-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('PERSONAL_LOAN', 'BORROWED', 'LENT', 'FRIENDS_FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "InterestModel" AS ENUM ('REDUCING_BALANCE', 'FLAT', 'INTEREST_FREE');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SavingsPurpose" AS ENUM ('GENERAL', 'EMERGENCY', 'GOAL');

-- CreateEnum
CREATE TYPE "SavingsTxType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'INTEREST');

-- CreateEnum
CREATE TYPE "MilestoneCategory" AS ENUM ('VEHICLE', 'HOUSE', 'EMERGENCY_FUND', 'TRAVEL', 'INVESTMENT', 'EDUCATION', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('DUE_UPCOMING', 'DUE_OVERDUE', 'CARD_DUE', 'DEBT_DUE', 'MILESTONE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "userId" UUID NOT NULL,
    "fullName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "reminderLeadDays" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "type" "AccountType" NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'ASSET',
    "maskedNumber" VARCHAR(4),
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(14,2),
    "linkedCardLast4" VARCHAR(4),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bankName" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "cardLast4" VARCHAR(4) NOT NULL,
    "cardNumberEnc" TEXT,
    "network" TEXT,
    "creditLimit" DECIMAL(14,2) NOT NULL,
    "outstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "billingDay" INTEGER NOT NULL,
    "statementDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "minimumDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "annualFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_statements" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "creditCardId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "statementDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "totalDue" DECIMAL(14,2) NOT NULL,
    "minimumDue" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "StatementStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_categories" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "keywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "transaction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "paymentMethod" "PaymentMethod",
    "accountId" UUID,
    "creditCardId" UUID,
    "toAccountId" UUID,
    "toCreditCardId" UUID,
    "savingsAccountId" UUID,
    "debtId" UUID,
    "monthlyDueId" UUID,
    "categoryId" UUID,
    "description" TEXT,
    "notes" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transactionId" UUID,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_payments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DueCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "recurrence" "Recurrence" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "dayOfMonth" INTEGER,
    "paymentMethod" "PaymentMethod",
    "accountId" UUID,
    "creditCardId" UUID,
    "debtId" UUID,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "generatedThrough" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recurring_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_dues" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "recurringPaymentId" UUID,
    "name" TEXT NOT NULL,
    "category" "DueCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "reminderDate" DATE,
    "status" "DueStatus" NOT NULL DEFAULT 'UPCOMING',
    "paymentMethod" "PaymentMethod",
    "accountId" UUID,
    "creditCardId" UUID,
    "debtId" UUID,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "monthly_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "monthlyDueId" UUID NOT NULL,
    "transactionId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "direction" "DebtDirection" NOT NULL,
    "type" "DebtType" NOT NULL,
    "counterparty" TEXT NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "interestRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "interestModel" "InterestModel" NOT NULL DEFAULT 'INTEREST_FREE',
    "termMonths" INTEGER,
    "startDate" DATE NOT NULL,
    "dueDate" DATE,
    "emiAmount" DECIMAL(14,2),
    "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "outstandingPrincipal" DECIMAL(14,2) NOT NULL,
    "principalPaidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestPaidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "debtId" UUID NOT NULL,
    "transactionId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "principalPart" DECIMAL(14,2) NOT NULL,
    "interestPart" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidOn" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "purpose" "SavingsPurpose" NOT NULL DEFAULT 'GENERAL',
    "interestRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "targetAmount" DECIMAL(14,2),
    "monthlyTarget" DECIMAL(14,2),
    "milestoneId" UUID,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "savings_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "savingsAccountId" UUID NOT NULL,
    "type" "SavingsTxType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "transactionId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "savings_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MilestoneCategory" NOT NULL DEFAULT 'OTHER',
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "currentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "startDate" DATE NOT NULL,
    "targetDate" DATE NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_contributions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "milestoneId" UUID NOT NULL,
    "savingsAccountId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "milestone_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "remindOn" DATE NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_summaries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "income" DECIMAL(14,2) NOT NULL,
    "expense" DECIMAL(14,2) NOT NULL,
    "saved" DECIMAL(14,2) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_userId_deletedAt_idx" ON "accounts"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "accounts_userId_type_idx" ON "accounts"("userId", "type");

-- CreateIndex
CREATE INDEX "credit_cards_userId_deletedAt_idx" ON "credit_cards"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "credit_card_statements_userId_dueDate_idx" ON "credit_card_statements"("userId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_statements_creditCardId_periodEnd_key" ON "credit_card_statements"("creditCardId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_categories_userId_type_name_key" ON "transaction_categories"("userId", "type", "name");

-- CreateIndex
CREATE INDEX "transactions_userId_date_idx" ON "transactions"("userId", "date");

-- CreateIndex
CREATE INDEX "transactions_userId_type_date_idx" ON "transactions"("userId", "type", "date");

-- CreateIndex
CREATE INDEX "transactions_userId_deletedAt_idx" ON "transactions"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "transactions_accountId_idx" ON "transactions"("accountId");

-- CreateIndex
CREATE INDEX "transactions_creditCardId_idx" ON "transactions"("creditCardId");

-- CreateIndex
CREATE INDEX "transactions_categoryId_idx" ON "transactions"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_userId_dedupeKey_key" ON "transactions"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "attachments_userId_transactionId_idx" ON "attachments"("userId", "transactionId");

-- CreateIndex
CREATE INDEX "recurring_payments_userId_active_idx" ON "recurring_payments"("userId", "active");

-- CreateIndex
CREATE INDEX "monthly_dues_userId_dueDate_status_idx" ON "monthly_dues"("userId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_dues_recurringPaymentId_dueDate_key" ON "monthly_dues"("recurringPaymentId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_transactionId_key" ON "payment_records"("transactionId");

-- CreateIndex
CREATE INDEX "payment_records_userId_monthlyDueId_idx" ON "payment_records"("userId", "monthlyDueId");

-- CreateIndex
CREATE INDEX "debts_userId_direction_status_idx" ON "debts"("userId", "direction", "status");

-- CreateIndex
CREATE UNIQUE INDEX "debt_payments_transactionId_key" ON "debt_payments"("transactionId");

-- CreateIndex
CREATE INDEX "debt_payments_userId_debtId_paidOn_idx" ON "debt_payments"("userId", "debtId", "paidOn");

-- CreateIndex
CREATE INDEX "savings_accounts_userId_deletedAt_idx" ON "savings_accounts"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "savings_transactions_transactionId_key" ON "savings_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "savings_transactions_userId_savingsAccountId_date_idx" ON "savings_transactions"("userId", "savingsAccountId", "date");

-- CreateIndex
CREATE INDEX "milestones_userId_status_idx" ON "milestones"("userId", "status");

-- CreateIndex
CREATE INDEX "milestone_contributions_userId_milestoneId_date_idx" ON "milestone_contributions"("userId", "milestoneId", "date");

-- CreateIndex
CREATE INDEX "reminders_userId_readAt_remindOn_idx" ON "reminders"("userId", "readAt", "remindOn");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_userId_kind_refType_refId_remindOn_key" ON "reminders"("userId", "kind", "refType", "refId", "remindOn");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_summaries_userId_month_key" ON "monthly_summaries"("userId", "month");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_categories" ADD CONSTRAINT "transaction_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_toCreditCardId_fkey" FOREIGN KEY ("toCreditCardId") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "savings_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_monthlyDueId_fkey" FOREIGN KEY ("monthlyDueId") REFERENCES "monthly_dues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_dues" ADD CONSTRAINT "monthly_dues_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_dues" ADD CONSTRAINT "monthly_dues_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES "recurring_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_dues" ADD CONSTRAINT "monthly_dues_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_dues" ADD CONSTRAINT "monthly_dues_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_dues" ADD CONSTRAINT "monthly_dues_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_monthlyDueId_fkey" FOREIGN KEY ("monthlyDueId") REFERENCES "monthly_dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "savings_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_contributions" ADD CONSTRAINT "milestone_contributions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_contributions" ADD CONSTRAINT "milestone_contributions_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_contributions" ADD CONSTRAINT "milestone_contributions_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "savings_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_summaries" ADD CONSTRAINT "monthly_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

