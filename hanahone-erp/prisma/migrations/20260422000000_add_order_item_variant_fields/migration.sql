-- Preserve channel-level variant lineage (Shopify line_item.title/sku) on OrderItem.
-- Inventory deduction still flows through productId → master SKU; these fields are
-- purely for reporting / channel breakdown.
ALTER TABLE "salesone"."order_items"
  ADD COLUMN IF NOT EXISTS "external_variant_name" TEXT,
  ADD COLUMN IF NOT EXISTS "external_variant_sku" TEXT;
