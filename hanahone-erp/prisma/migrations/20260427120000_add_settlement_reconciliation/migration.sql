-- Monthly settlement reconciliation rows. expected_amount is auto-computed
-- from Order.settlement_amount over the period; actual_amount is manually
-- entered from the bank deposit. variance is read-time only.
CREATE TABLE IF NOT EXISTS "salesone"."settlement_reconciliations" (
    "id"              TEXT NOT NULL,
    "company_id"      TEXT NOT NULL,
    "platform"        "salesone"."Platform" NOT NULL,
    "period_start"    TIMESTAMP(3) NOT NULL,
    "period_end"      TIMESTAMP(3) NOT NULL,
    "expected_amount" DECIMAL(14, 2) NOT NULL,
    "actual_amount"   DECIMAL(14, 2),
    "notes"           TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "settlement_reconciliations_company_id_platform_period_start_key"
    ON "salesone"."settlement_reconciliations" ("company_id", "platform", "period_start");

CREATE INDEX IF NOT EXISTS "settlement_reconciliations_company_id_platform_period_start_idx"
    ON "salesone"."settlement_reconciliations" ("company_id", "platform", "period_start");

ALTER TABLE "salesone"."settlement_reconciliations"
    ADD CONSTRAINT "settlement_reconciliations_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
