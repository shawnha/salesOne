-- Preserve raw pricing/subscription markers from channel rawData on OrderItem.
-- DB-only — UI surfaces only original_unit_price (정가) and a Subscription badge.
-- discount_amount and selling_plan_id are kept for downstream margin/promo analysis.
ALTER TABLE "salesone"."order_items"
  ADD COLUMN IF NOT EXISTS "original_unit_price" DECIMAL(65, 30),
  ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(65, 30),
  ADD COLUMN IF NOT EXISTS "selling_plan_id" TEXT;
