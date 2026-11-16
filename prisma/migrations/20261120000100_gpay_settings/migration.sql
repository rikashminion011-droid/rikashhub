-- GPay Transactions (and its Add Bulk) can have their own Customized Settings. A section not saved here follows Quick Entry.
ALTER TABLE "quick_pay_settings" ADD COLUMN "gpayData" JSONB;
