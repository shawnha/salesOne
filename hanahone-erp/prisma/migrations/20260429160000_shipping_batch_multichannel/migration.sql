-- AlterTable
ALTER TABLE "salesone"."shipping_batches"
  ADD COLUMN "channel_dispatch" JSONB;

ALTER TABLE "salesone"."shipping_batch_items"
  ADD COLUMN "platform" "salesone"."Platform";

-- Backfill platform on existing items from parent batch.platform
UPDATE "salesone"."shipping_batch_items" sbi
SET platform = sb.platform
FROM "salesone"."shipping_batches" sb
WHERE sbi.batch_id = sb.id AND sbi.platform IS NULL;
