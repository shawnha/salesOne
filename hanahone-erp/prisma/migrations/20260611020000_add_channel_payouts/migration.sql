-- CreateTable: channel_payouts — platform-reported payout batches (Coupang/Naver settlement APIs).
-- Distinct from settlement_reconciliations (manual monthly check). See ChannelPayout model docs.
CREATE TABLE "salesone"."channel_payouts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "platform" "salesone"."Platform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "payout_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "fee_amount" DECIMAL(14,2),
    "status" TEXT,
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_payouts_platform_external_id_key" ON "salesone"."channel_payouts"("platform", "external_id");

-- CreateIndex
CREATE INDEX "channel_payouts_company_id_platform_payout_date_idx" ON "salesone"."channel_payouts"("company_id", "platform", "payout_date");

-- AddForeignKey
ALTER TABLE "salesone"."channel_payouts" ADD CONSTRAINT "channel_payouts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
