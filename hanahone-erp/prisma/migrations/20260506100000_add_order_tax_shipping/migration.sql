-- Add tax_amount / shipping_amount columns to orders table.
-- Used to separate sales tax (pass-through liability for US entities like HOI)
-- and shipping fees from recognized revenue.
-- NULL = legacy data not yet backfilled, or channel doesn't expose this info.
ALTER TABLE "salesone"."orders"
ADD COLUMN IF NOT EXISTS "tax_amount" DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS "shipping_amount" DECIMAL(12, 2);
