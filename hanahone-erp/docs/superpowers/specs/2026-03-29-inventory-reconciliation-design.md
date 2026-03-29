# Inventory Reconciliation Design Spec

## Problem

CGETC 3PL에서 관리하는 HOI 재고의 기대 수량과 실제 수량이 다르다. 초기 입고(purchase order) 대비 판매(sale order) 수량을 빼면 기대 재고가 나와야 하는데, CGETC 실재고와 차이가 있다. 이 차이의 원인을 파악하고, 조정(reconciliation)할 수 있는 기능이 필요하다.

## Solution

### 데이터 소스

| 데이터 | 소스 | 방식 | 용도 |
|--------|------|------|------|
| 초기 입고수량 | `purchase.order` + `purchase.order.line` | JSON-RPC API | 입고 기록 자동 파악 |
| 판매 수량 | `sale.order` (이미 sync 중) | JSON-RPC API | 출고 계산 |
| 현재 실재고 | `stock.quant` | JSON-RPC API | 실시간 재고 비교 |
| 배송 기록 | `stock.picking` (기본 정보만) | JSON-RPC API | 참고용 |
| 고객 정보 | `res.partner` | JSON-RPC API | 이름, 이메일, 전화, 주소 |
| 배송비 | `/my/invoices` portal | 스크래핑 | 주문별 배송비 (`account.move` API는 도메인 필터 에러로 사용 불가) |

### 기대재고 계산 로직 (Eng Review 반영)

```
기대재고 = Σ PO 입고수량
         - Σ 전체 판매수량 (환불 포함, 환불은 재고 복귀로 간주하지 않음)
         - Σ 조정수량 (수동 reconciliation 기록)
```

환불된 주문도 판매에서 빼지 않음. 반품이 실제로 돌아오면 CGETC 실재고가 기대보다 많아지고, 그 차이를 reconciliation으로 수동 조정.

### 데이터 모델 변경

**1. 새 테이블: `PurchaseOrder` (salesone schema)**

CGETC purchase order를 저장. 초기 입고 기록의 source of truth.

```
PurchaseOrder
  id            String  @id @default(uuid())
  companyId     String
  platform      Platform (CGETC)
  externalPoId  String  (PO69554 등)
  poNumber      String
  supplierName  String
  orderDate     DateTime
  totalAmount   Decimal
  state         String  (draft/done/cancel)
  rawData       Json
  createdAt     DateTime
  updatedAt     DateTime
  @@unique([companyId, platform, externalPoId])
```

**2. 새 테이블: `PurchaseOrderLine`**

PO별 품목 상세. SKU별 입고수량.

```
PurchaseOrderLine
  id              String  @id @default(uuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder
  productName     String
  sku             String?
  quantity        Decimal
  unitPrice       Decimal
  subtotal        Decimal
  createdAt       DateTime
```

**3. 새 테이블: `ShippingCost`**

주문별 CGETC 배송비 기록.

```
ShippingCost
  id            String   @id @default(uuid())
  companyId     String
  orderId       String?  (매핑된 Order ID, null이면 미매핑)
  soNumber      String   (CGETC SO번호)
  invoiceDate   DateTime
  amount        Decimal
  currency      String   @default("USD")
  rawData       Json?
  createdAt     DateTime
  @@unique([companyId, soNumber])
```

**4. 새 테이블: `ReconciliationAdjustment` (Eng Review 반영)**

별도 테이블로 분리. 기존 InventoryAdjustment는 sync가 Inventory.quantity를 덮어쓰므로, reconciliation 기록이 소실될 위험.

```
ReconciliationAdjustment
  id            String   @id @default(uuid())
  companyId     String
  sku           String
  productName   String
  quantity      Int      (양수: 재고 추가, 음수: 재고 차감)
  reason        String   (SEEDING/DAMAGED/SAMPLE/PROMOTION/OTHER)
  memo          String?
  createdBy     String
  createdAt     DateTime @default(now())
  @@index([companyId, sku])
```

### API

**1. `POST /api/purchase-orders/sync`** (Eng Review: mutating은 POST로)
- CGETC에서 purchase order 동기화 + DB 저장
- PO 목록과 line items 반환

**2. `GET /api/reconciliation`**
- SKU별 기대재고 계산 (PO 입고 - 판매 + 환불 - 조정)
- CGETC 실재고 (stock.quant API)
- 차이 계산
- Response:
```json
[{
  "sku": "8800316050001",
  "productName": "Starter Kit",
  "purchased": 8840,
  "sold": 8154,
  "refunded": 71,
  "adjusted": 0,
  "expectedStock": 686,
  "actualStock": 660,
  "difference": -26,
  "status": "UNRECONCILED"
}]
```

**3. `POST /api/reconciliation`**
- 조정 기록 생성
- Body: `{ sku, quantity, reason, memo }`
- reason 값: `SEEDING` | `DAMAGED` | `SAMPLE` | `PROMOTION` | `OTHER`
- InventoryAdjustment에 RECONCILIATION 타입으로 저장

**4. `POST /api/shipping-costs/sync`** (Eng Review: mutating은 POST로)
- CGETC `/my/invoices` portal 스크래핑으로 배송비 데이터 수집
- SO번호로 주문 매핑, 금액 파싱
- Response:
```json
[{
  "soNumber": "SO1414438",
  "date": "2025-07-29",
  "shippingCost": 10.78,
  "orderId": "uuid-of-matched-order"
}]
```

**5. `GET /api/shipping-costs/summary`**
- 월별/기간별 배송비 총액 리포트
- Query params: `from`, `to` (날짜 범위)
- Response:
```json
{
  "total": 5432.10,
  "count": 843,
  "byMonth": [
    { "month": "2025-07", "total": 1234.56, "count": 150 },
    { "month": "2025-06", "total": 987.65, "count": 120 }
  ]
}

### UI (Design Review 반영)

**기존 컴포넌트 재사용:** KpiCard, DataTable (sticky headers), Badge, MonthPicker, EmptyState, CurrencyDisplay, Card, Button, Input

**반응형:** 데스크탑 우선. 모바일은 기본 수평 스크롤.

**접근성:** 모달 Tab/Escape 키보드 네비게이션, 테이블 ARIA roles, 색상+텍스트 이중 표시 (색맹 고려)

---

**1. Inventory 페이지 수정**
- CGETC 제품에 "Expected" | "Actual" | "Diff" 컬럼 추가
- Diff 표시: 0이면 회색, 음수면 rose-500 텍스트, 양수면 teal-600 텍스트
- "Reconcile" 링크 → Reconciliation 페이지
- PO sync 안 된 제품은 Expected/Actual/Diff 컬럼 숨김

**2. 신규 Reconciliation 페이지 (`/reconciliation`)**

```
정보 계층:
1순위: KPI 카드 2개 (Total Difference, Unreconciled Items)
2순위: SKU 비교 테이블
3순위: 조정 이력
```

상단: KpiCard x 2
- Total Difference (전체 차이 합계, rose-500 if negative)
- Unreconciled Items (미조정 SKU 수)

중단: DataTable (SKU 비교)
- 컬럼: SKU | Product | Purchased | Sold | Adjusted | Expected | Actual (CGETC) | Diff | Status
- Diff: teal-600 if 0, rose-500 if negative, amber-500 if positive
- Status: Badge "Reconciled" (초록) or "Unreconciled" (빨강) + "Adjust" Button

하단: DataTable (조정 이력)
- 컬럼: Date | SKU | Quantity | Reason | Memo | Created By

조정 모달 (overlay):
- SKU (read-only, 자동 채움)
- Quantity input (number, +/-)
- Reason dropdown: Seeding | Damaged | Sample | Promotion | Other
- Memo textarea
- Cancel / Submit 버튼

**상태 커버리지:**

| Feature | Loading | Empty | Error |
|---------|---------|-------|-------|
| SKU 비교 테이블 | Skeleton rows | "No tracked products. Sync POs first." + Sync 버튼 | "Failed to load" + Retry |
| 조정 모달 Submit | Button spinner | N/A | Toast "Failed to save" |
| 조정 이력 | Skeleton rows | "No adjustments yet." | 에러 메시지 |
| CGETC 실재고 조회 실패 | N/A | N/A | Actual 컬럼 "N/A", Diff 계산 불가 표시 |

**조정 워크플로우:**
1. 사용자가 SKU 테이블에서 차이 확인 (예: -26)
2. "Adjust" 버튼 클릭 → 모달 열림
3. 수량 -20 입력, Reason: Seeding, Memo: "인플루언서 시딩"
4. Submit → 성공 토스트 → 테이블 자동 갱신 (차이 -26 → -6)
5. 추가 조정 반복 → 차이 0 → "Reconciled" 배지 전환

**3. 주문 상세에 배송비 표시**
- Order Detail 페이지에 배송비 금액 표시 (ShippingCost 테이블에서 soNumber 매핑)
- 배송비 없으면 표시하지 않음

**4. 신규 Shipping Costs 페이지 (`/shipping-costs`)**

```
정보 계층:
1순위: KPI 카드 2개 (이달 총액, 주문당 평균)
2순위: 월별 bar chart
3순위: 상세 테이블
```

상단: KpiCard x 2
- This Month Total (CurrencyDisplay)
- Avg per Order (CurrencyDisplay)

중단: Recharts BarChart (월별 배송비 추이)

하단: DataTable + MonthPicker 필터
- 컬럼: Date | SO# | Order# | Amount
- SO#에 미매핑 주문은 "Unmapped" Badge

**상태 커버리지:**

| Feature | Loading | Empty | Error |
|---------|---------|-------|-------|
| 배송비 테이블 | Skeleton rows | "No shipping costs. Sync from CGETC first." | "Scraping failed" |
| 월별 차트 | Chart placeholder | "No data for selected period" | 빈 차트 |

**5. Nav 메뉴에 "Reconciliation", "Shipping Costs" 추가**
- Inventory 아래에 배치

### CGETC 고객 정보 연동

현재 CGETC 주문의 고객 정보는 portal 스크래핑(`/portal/sale/{id}`)으로 주소/전화/이메일을 파싱하고 있다. `res.partner` JSON-RPC API로 대체하면:

- 더 빠르고 안정적 (HTML 파싱 불필요)
- 구조화된 데이터: name, email, phone, street, city, state_id, zip, country_id
- 주문의 `partner_id`, `partner_shipping_id`로 직접 조회

**구현:**
- `sale.order`의 `partner_shipping_id`로 배송 고객 ID 확보 (이미 sync 중)
- `res.partner.read([ids], { fields })` 로 고객 상세 조회
- Customer 테이블에 저장 (기존 고객 자동 생성 로직 개선)

**API:** `GET /api/customers/fetch-cgetc-details` 기존 endpoint를 portal 스크래핑에서 `res.partner` API로 전환

### CGETC Connector 파일 분리 (Eng Review 반영)

`cgetc.ts` (527줄)에서 `authenticate()`와 `odooRpc()`를 export하고, 기능별 파일로 분리:

- `cgetc.ts` — 인증, JSON-RPC helper, 기존 sale order/inventory connector (변경 최소)
- `cgetc-purchase.ts` — PO sync 함수
- `cgetc-shipping.ts` — 배송비 스크래핑
- `cgetc-partners.ts` — res.partner 고객 정보

### CGETC JSON-RPC 도메인 필터 (Eng Review 반영)

Portal 스크래핑은 자동으로 Hanah 데이터만 필터링되지만, JSON-RPC API는 전체 데이터에 접근 가능. 반드시 도메인 필터 적용:

- `purchase.order`: `[['partner_id', '=', HANAH_PARTNER_ID]]`
- `stock.quant`: `[['location_id.usage', '=', 'internal']]` + warehouse 필터
- `res.partner`: partner_shipping_id로 직접 조회 (검색 아님)

### CGETC Purchase Order Sync

별도 함수로 구현:

```typescript
// cgetc-purchase.ts
async function syncPurchaseOrders(credentials, companyId): Promise<PurchaseOrder[]>
```

- `purchase.order` API로 PO 목록 조회 (partner_id 필터)
- `purchase.order.line` API로 line items 조회
- SKU 추출: `[8800316050001] Product Name` → bracket 파싱
- DB에 upsert
- 최초 sync 시 전체, 이후는 write_date 기준 delta

### Scope 외

- stock.move 기반 자동 추적 (CGETC 권한 필요, 나중에 가능)
- account.move API 연동 (현재 도메인 필터 에러, 스크래핑으로 대체)
- 자동 조정 (항상 수동 확인 후 조정)
- Purchase order 생성/수정 (읽기 전용)
- 고객 정보 UI 개선 (이번에는 API 전환만, 고객 페이지 리디자인은 별도)
- 배송비 분석 (캐리어별, 무게별 등 — 추후 확장)
