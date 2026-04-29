-- CreateEnum
CREATE TYPE "salesone"."InboundStatus" AS ENUM ('PLANNED', 'REQUESTED', 'SHIPPED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "salesone"."rocket_growth_inbounds" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" "salesone"."InboundStatus" NOT NULL DEFAULT 'PLANNED',
    "coupang_inbound_no" TEXT,
    "notes" TEXT,
    "requested_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rocket_growth_inbounds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rocket_growth_inbounds_company_id_status_idx" ON "salesone"."rocket_growth_inbounds"("company_id", "status");

ALTER TABLE "salesone"."rocket_growth_inbounds"
  ADD CONSTRAINT "rocket_growth_inbounds_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "salesone"."rocket_growth_inbound_items" (
    "id" TEXT NOT NULL,
    "inbound_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "vendor_item_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER,
    CONSTRAINT "rocket_growth_inbound_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "salesone"."rocket_growth_inbound_items"
  ADD CONSTRAINT "rocket_growth_inbound_items_inbound_id_fkey"
  FOREIGN KEY ("inbound_id") REFERENCES "salesone"."rocket_growth_inbounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "salesone"."rocket_growth_inbound_items"
  ADD CONSTRAINT "rocket_growth_inbound_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "salesone"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
