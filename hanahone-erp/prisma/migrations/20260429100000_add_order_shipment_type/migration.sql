-- AlterTable
ALTER TABLE "salesone"."orders"
  ADD COLUMN "shipment_type" TEXT;

-- Backfill existing rocket growth orders detected via notes marker.
UPDATE "salesone"."orders"
  SET "shipment_type" = 'ROCKET_GROWTH'
  WHERE "external_source" = 'COUPANG' AND "notes" LIKE '%로켓그로스%';

-- Backfill marketplace coupang orders.
UPDATE "salesone"."orders"
  SET "shipment_type" = 'THIRD_PARTY'
  WHERE "external_source" = 'COUPANG' AND "shipment_type" IS NULL;
