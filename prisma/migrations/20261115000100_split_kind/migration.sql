-- Whether a Quick Pay entry was shared as a Split or recorded as a Debt (null: neither; older split entries read as Split).
ALTER TABLE "transactions" ADD COLUMN "splitKind" TEXT;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_split_kind_check" CHECK ("splitKind" IS NULL OR "splitKind" IN ('SPLIT', 'DEBT'));
