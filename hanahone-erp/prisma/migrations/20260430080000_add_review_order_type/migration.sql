-- Add REVIEW to OrderType enum for 지인 리뷰 작업 orders.
-- Postgres requires ALTER TYPE for enum value addition.
ALTER TYPE "salesone"."OrderType" ADD VALUE IF NOT EXISTS 'REVIEW';
