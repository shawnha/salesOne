# Shopify Product Review — Diagnostic Design

**Date:** 2026-03-30
**Goal:** Shopify 실제 상품 카탈로그와 ERP 데이터를 대조하여 SKU 매핑 불일치의 근본 원인을 파악한다.

## Background

현재 문제:
- Shopify 상품 3종 (Starter Kit, Monthly Plan, Monthly Subscription) 중 일부가 ERP에서 제대로 매칭 안 됨
- Monthly Plan vs Monthly Subscription 혼동 발생
- 할인가가 Products basePrice에 미반영
- order-mapper가 `Product.sku` 직접 매칭만 사용 — `SkuMapping` 테이블 미활용
- SKU 매칭 실패 시 OrderItem이 조용히 드롭됨

## Design

### 1. Shopify Connector — `fetchProducts()` 추가

**파일:** `src/lib/integrations/connectors/shopify.ts`

기존 `Connector` 인터페이스를 변경하지 않고, export 함수로 추가:

```typescript
export async function fetchShopifyProducts(credentials: ShopifyCredentials): Promise<ShopifyProduct[]>
```

- `GET /admin/api/2024-01/products.json?limit=250` 호출
- 페이지네이션 처리 (Link header)
- 반환 타입:

```typescript
interface ShopifyProduct {
  id: number;
  title: string;
  status: string;
  variants: {
    id: number;
    title: string;
    sku: string;
    price: string;
    compareAtPrice: string | null;
  }[];
}
```

### 2. 진단 API 엔드포인트

**파일:** `src/app/api/shopify/product-review/route.ts`

**Method:** `GET`

**로직:**
1. HOI 회사의 Shopify integration credentials 가져오기
2. `fetchShopifyProducts()` 호출 — Shopify 실제 상품 목록
3. DB에서 HOI Products 조회 — ERP에 등록된 상품
4. DB에서 HOI ExternalOrders (platform=SHOPIFY) rawData 조회 — 실제 주문에 사용된 SKU들
5. 3개 소스 대조 후 리포트 생성

**반환 리포트 구조:**

```typescript
interface ProductReviewReport {
  // Shopify 실제 상품
  shopifyProducts: {
    title: string;
    variants: { title: string; sku: string; price: string; compareAtPrice: string | null }[];
  }[];

  // ERP에 등록된 HOI 상품
  erpProducts: {
    name: string;
    sku: string;
    basePrice: number;
    costPrice: number;
  }[];

  // 주문에서 실제 사용된 SKU 목록 (빈도, 가격 범위 포함)
  orderSkuUsage: {
    sku: string;
    productName: string;
    orderCount: number;
    priceRange: { min: number; max: number };
    matchedErpProduct: string | null;  // 매칭된 ERP product name, 없으면 null
  }[];

  // 매칭 실패로 드롭된 아이템 통계
  droppedItems: {
    sku: string;
    productName: string;
    count: number;
  }[];

  // 상품명 혼동 케이스 (같은 SKU, 다른 이름)
  nameConflicts: {
    sku: string;
    names: string[];
  }[];
}
```

### 3. 범위 제한

- **읽기 전용** — DB 쓰기 없음
- Connector 인터페이스 변경 없음
- UI 변경 없음 — API 응답을 터미널에서 확인
- 이 진단 결과를 바탕으로 다음 단계 (수정안) 별도 설계

## Files to Change

| File | Change |
|------|--------|
| `src/lib/integrations/connectors/shopify.ts` | `fetchShopifyProducts()` 함수 추가 |
| `src/app/api/shopify/product-review/route.ts` | 새 파일 — 진단 API |

## Out of Scope

- Product 자동 sync/생성
- order-mapper 수정
- SkuMapping 활용 로직
- UI 변경
- 가격 업데이트

이상은 진단 결과를 본 후 별도 설계한다.
