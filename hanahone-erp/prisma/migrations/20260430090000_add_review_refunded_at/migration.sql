-- Add review_refunded_at column for REVIEW orders. NULL = refund pending.
ALTER TABLE "salesone"."orders"
ADD COLUMN IF NOT EXISTS "review_refunded_at" TIMESTAMP(3);
