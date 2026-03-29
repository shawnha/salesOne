# Inventory Reconciliation Design Spec

## Problem

CGETC 3PL에서 관리하는 HOI 재고의 기대 수량과 실제 수량이 다르다. 초기 입고(purchase order) 대비 판매(sale order) 수량을 빼면 기대 재고가 나와야 하는데, CGETC 실재고와 차이가 있다. 이 차이의 원인을 파악하고, 조정(reconciliation)할 수 있는 기능이 필요하다.

## Solution

### 데이터 소스 (전부 CGETC Odoo JSON-RPC API)

| 데이터 | Odoo 모델 | 용도 |
|--------|-----------|------|
| 초기 입고수량 | `purchase.order` + `purchase.order.line` | 입고 기록 자동 파악 |
| 판매 수량 | `sale.order` (이미 sync 중) | 출고 계산 |
| 현재 실재고 | `stock.quant` | 실시간 재고 비교 |
| 배송 기록 | `stock.picking` (기본 정보만) | 참고용 |

### 기대재고 계산 로직

```
기대재고 = Σ purchase order 입고수량
         - Σ 판매수량 (FULFILLED/DELIVERED 주문)
         + Σ 환불반환수량 (CANCELLED/REFUNDED 주문)
         - Σ 조정수량 (수동 reconciliation 기록)
```

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

**3. 기존 `InventoryAdjustment` 테이블 활용**

adjustmentType에 `RECONCILIATION` 값 추가. 조정 시 사유(reason)에 구체적 원인 기록.

### API

**1. `GET /api/purchase-orders`**
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

### UI

**1. Inventory 페이지 수정**
- CGETC 제품에 "기대재고" | "실재고" | "차이" 컬럼 추가
- 차이 > 0이면 초록, < 0이면 빨강
- "Reconcile" 링크 → Reconciliation 페이지로 이동

**2. 신규 Reconciliation 페이지 (`/reconciliation`)**

상단: SKU별 비교 카드
- 제품명, SKU
- 입고 | 판매 | 환불 | 조정 | 기대재고 | 실재고 | 차이
- 차이 = 0이면 "Reconciled" 배지 (초록)
- 차이 ≠ 0이면 "Unreconciled" 배지 (빨강) + 조정 버튼

하단: 조정 이력 테이블
- 날짜 | SKU | 수량 | 사유 | 메모 | 작성자

조정 입력 모달:
- SKU (자동)
- 수량 (양수: 재고 추가, 음수: 재고 차감)
- 사유 선택: 시딩/파손/샘플/프로모션/기타
- 메모 (자유 입력)

**3. Nav 메뉴에 "Reconciliation" 추가**

### CGETC Purchase Order Sync

기존 sync-runner 패턴을 따르지 않음 (PO는 주문/재고와 다른 흐름).
별도 함수로 구현:

```typescript
async function syncPurchaseOrders(credentials, companyId): Promise<PurchaseOrder[]>
```

- `purchase.order` API로 전체 PO 목록 조회
- `purchase.order.line` API로 line items 조회
- DB에 upsert
- 최초 sync 시 전체, 이후는 write_date 기준 delta

### Scope 외

- stock.move 기반 자동 추적 (CGETC 권한 필요, 나중에 가능)
- 배송비 인보이스 연동 (account.move — 별도 기능)
- 자동 조정 (항상 수동 확인 후 조정)
- Purchase order 생성/수정 (읽기 전용)
