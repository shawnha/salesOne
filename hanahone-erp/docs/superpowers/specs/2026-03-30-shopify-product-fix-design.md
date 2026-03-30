# Shopify Product Fix — Design Spec

**Date:** 2026-03-30
**Goal:** 진단 결과를 바탕으로 ERP Products 데이터를 정리하고, salePrice 컬럼을 추가한다.

## 변경 사항

### 1. Product 모델에 `salePrice` 컬럼 추가

`Product` 모델에 nullable `salePrice` (Decimal) 추가:
- basePrice = 정가 (list price)
- salePrice = 현재 판매가 (할인 중일 때만 설정, null이면 정가로 판매 중)

### 2. HOI Shopify 상품 데이터 수정

| 현재 이름 | 현재 SKU | 변경 후 이름 | basePrice | salePrice |
|-----------|----------|-------------|-----------|-----------|
| ODD M-01 Starter-kit | `8800316050001` | 5 Bottle Pack | $49 | $29 |
| ODD M-01 30day Refill-pack | `XG-MNLD-D8SM` | 30 Bottle Pack | $159 | $129 |
| Monthly Subscription | `8800316050018` | Monthly Subscription | $129 | $109 |

### 3. 중복 `-SH` 상품 삭제

| 삭제 대상 | SKU | 사유 |
|-----------|-----|------|
| Starter Kit | `8800316050001-SH` | 중복 (잘못 생성됨) |
| Monthly Plan | `XG-MNLD-D8SM-SH` | 중복 (잘못 생성됨) |

삭제 전 연결된 OrderItem, Inventory 등 의존 레코드 확인 필요. 있으면 원본 상품으로 재연결.

### 4. 오타 SKU 수정

ExternalOrder rawData에서 SKU `a8800316050018` (1건) — DB에서 직접 수정하거나 SkuMapping으로 매핑.

## 범위 제한

- order-mapper 로직 변경 없음
- UI 변경 없음 (salePrice 표시는 추후)
- Shopify 상품명 혼동은 수정하지 않음 (SKU 기준 매칭이므로 기능 문제 없음)

## Files to Change

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Product 모델에 salePrice 추가 |
| Prisma migration | ALTER TABLE 실행 |
| `prisma/seed.ts` | seed 데이터에 salePrice 반영 |
| Data migration script | 기존 상품 이름/가격 수정 + 중복 삭제 |
