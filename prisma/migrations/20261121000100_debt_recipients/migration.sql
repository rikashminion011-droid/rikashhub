-- The recipients chosen in Debt Management are kept as the default there and are the ones counted in Monthly Due. Empty means everyone.
ALTER TABLE "monthly_due_settings" ADD COLUMN "debtPartyIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
