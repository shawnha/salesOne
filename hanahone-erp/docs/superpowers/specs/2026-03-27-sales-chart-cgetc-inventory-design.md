# Sales Chart + CGETC Inventory Integration Design

## Overview

Two features for SalesOne ERP:
1. **Channel Sales Chart** — Sales 페이지 상단에 채널별 매출 차트 추가
2. **CGETC Inventory Sync** — CGETC 3PL의 재고 데이터를 Odoo JSON-RPC로 동기화

---

## Feature 1: Channel Sales Chart

### Layout

**Option C (상단 차트 + 하단 테이블)**:
- 기존 KPI (주문 수, 매출액) 유지
- KPI 아래에 차트 영역 추가:
  - 왼쪽: 채널별 도넛 차트 (매출 비율)
  - 오른쪽: 월별 채널 매출 추이 (Stacked Bar Chart)
- 기존 테이블은 차트 아래에 그대로 유지

### Chart Library

**Recharts** — React 네이티브, Next.js 호환, 도넛/막대/라인 모두 지원

### Data Source

기존 `Order` 테이블에서 집계:
- `externalSource` (Platform enum) → 채널 구분
- `netAmount` → 매출 금액
- `orderDate` → 월별 그룹핑
- 필터: `fulfillmentStatus` IN (FULFILLED, DELIVERED) AND `financialStatus` IN (PAID, PARTIALLY_PAID, PARTIALLY_REFUNDED)
- `externalSource`가 null인 주문은 "Manual" 채널로 표시

### Company-Channel Mapping

| 회사 | 코드 | 판매 채널 |
|---|---|---|
| 한아원인터내셔널 | HOI | Shopify, Amazon, TikTok |
| 한아원코리아 | HOK | Naver |
| 한아원리테일 | HOR | Pharmacy |

- **개별 회사 선택**: 해당 회사 채널만 차트에 표시
- **Group (전체)**: 모든 회사 채널 합산

### Chart Details

**도넛 차트:**
- 각 채널별 netAmount 합계의 비율
- 중앙에 총 매출액 표시
- 채널 색상: Shopify(#95BF47), Amazon(#FF9900), TikTok(#000000), Naver(#03C75A), Pharmacy(#6B7280), Manual(#9CA3AF)
- 호버 시 금액/비율 툴팁

**Stacked Bar Chart:**
- X축: 최근 6개월 (현재 선택된 월 기준)
- Y축: 매출 금액 (원화)
- 각 바는 채널별로 색상 구분하여 스택
- 호버 시 채널별 금액 툴팁

### API

기존 Sales 페이지 데이터 로딩에 차트용 집계 쿼리 추가:
- 채널별 매출 합계 (도넛 차트용)
- 월별 + 채널별 매출 합계 (Stacked Bar용, 최근 6개월)

### Components

- `src/components/sales/SalesChart.tsx` — 차트 영역 전체 (클라이언트 컴포넌트, Recharts 사용)
- 기존 `src/app/sales/page.tsx` 수정 — 차트 데이터 로딩 + SalesChart 배치

---

## Feature 2: CGETC Inventory Sync

### CGETC 시스템 정보

- **플랫폼**: Odoo 15 Enterprise
- **URL**: https://erp.cgetc.com
- **용도**: HOI의 3PL 물류/재고 관리 파트너 (판매 채널 아님)
- **제품**: SKU 2종류 (모든 채널에서 동일 SKU, 표시명만 다름)

### 인증 흐름

1. POST `/web/session/authenticate` — 이메일/비번으로 로그인
2. 세션 쿠키 획득 (`session_id`)
3. 이후 JSON-RPC 호출 시 쿠키 포함

```typescript
// credentials 구조
{
  url: "https://erp.cgetc.com",
  email: "it@hanah1.com",
  password: "1111",  // IntegrationConfig에 암호화 저장
  db: "linkup2017-cgetc-master-4705026"
}
```

### 데이터 수집

**Odoo JSON-RPC API** (`/web/dataset/call_kw`):

```typescript
// stock.quant 조회
{
  model: 'stock.quant',
  method: 'search_read',
  args: [[['quantity', '>', 0], ['location_id.usage', '=', 'internal']]],
  kwargs: {
    fields: ['product_id', 'quantity', 'location_id', 'lot_id', 'product_uom_id']
  }
}
```

- `product_id`: [id, "[SKU] 제품명"] 형태 — SKU 추출 가능 (대괄호 안)
- `quantity`: 현재 수량
- `location_id`: [id, "창고/위치"] — warehouseLocation 매핑
- 같은 SKU가 여러 location에 분산될 수 있음 → SKU별 합산 (제품 2개뿐이라 location 분리 불필요)

### 동기화 로직

1. CGETC 로그인 (세션 쿠키 획득)
2. `stock.quant` 전체 조회 (internal location만)
3. product_id에서 SKU 추출
4. SKU로 우리 ERP의 Product 테이블 매칭
5. Inventory 테이블에 upsert (productId + companyId + warehouseLocation 기준)
6. 변동 있으면 InventoryAdjustment 레코드 생성

### Connector 구현

기존 `src/lib/integrations/connectors/cgetc.ts` stub을 실제 구현으로 교체:
- `fetchInventory()` 메서드 구현 (기존 Connector 인터페이스의 optional 메서드)
- `fetchOrders()`는 빈 배열 유지 (이번 범위 아님)

### 동기화 주기

기존 sync-runner 인프라 활용, 기본 15분 간격.

---

## Future TODO: CGETC 추가 연동 (통합 ERP 완성 후)

SalesOne 앱 테스트 완료 → 통합 ERP에 기능 합칠 때 아래 항목 추가:

### Sale Orders 연동
- **모델**: `sale.order` + `sale.order.line`
- **용도**: CGETC 출고 주문 vs Shopify/Amazon/TikTok 판매 데이터 **수량 대조**
- **시점**: 매출 채널별 판매 수량과 CGETC 출고 수량이 맞는지 검증 필요할 때

### BOL Orders 연동
- **용도**: 입고 예정 수량 관리 (어떤 화물이 들어오는지)
- **시점**: 입고 예정/발주 관리 기능 구현할 때

### Shipment 연동
- **모델**: `stock.picking` (Odoo delivery orders)
- **용도**: 배송 상태 추적, 트래킹 번호 관리
- **시점**: 고객 배송 조회 기능 또는 물류 대시보드 구현할 때

### 우선순위 (통합 ERP 단계)
1. Sale Orders → 매출 대조 (가장 임팩트 큼)
2. Shipment → 배송 관리
3. BOL Orders → 입고 관리

---

## Technical Notes

- Recharts는 클라이언트 컴포넌트 필요 (`'use client'`)
- CGETC Odoo JSON-RPC는 서버 사이드에서만 호출 (CORS 제한)
- CGETC 세션 쿠키는 일정 시간 후 만료 → 매 동기화 시 재로그인
- SKU 2종류만 있으므로 대량 데이터 처리 최적화는 불필요
- CGETC는 판매 채널이 아니므로 매출 차트에 표시하지 않음
