# 네이버 Push 2단계: 3PL 발주서 자동화 + 송장 업로드

## 1. 개요

Shipping 페이지에 네이버 발주/송장 관리 기능 추가. 현재 수동으로 진행하는 4단계 Excel 워크플로우를 ERP에서 자동화한다.

### 현재 수동 워크플로우
```
1. 네이버 스마트스토어 주문 다운로드 (비밀번호 보호 Excel)
2. 수동으로 3PL 발주서 양식에 A2~M2 복사/붙여넣기
3. 3PL 업체가 송장번호 기입하여 반환
4. 네이버 업로드 양식에 상품주문번호+송장번호 수동 기입 → 스마트스토어 업로드
```

### 자동화 후
```
1. ERP에서 발송 대기 주문 선택 → "3PL 발주서 다운로드" 클릭 → Excel 자동 생성
2. 3PL에 전달
3. 3PL이 송장번호 기입하여 반환
4. ERP에 송장 파일 업로드 → 네이버 업로드용 Excel 자동 생성 (다운로드)
```

## 2. 기능 A: 3PL 발주서 자동 생성

### 입력
- ERP DB의 네이버 주문 (ExternalOrder + Order 테이블)
- 발송 대기 상태 (fulfillmentStatus = UNFULFILLED, platform = NAVER)

### 출력: 3PL 발주서 Excel (File 2 형식)

**헤더 (Row 1):**

| Col | 헤더 | 값 소스 |
|-----|------|---------|
| A | 보내는분 | 고정: "한아원" |
| B | 보내는분 연락처 | 고정: "010-7701-2732" |
| C | 주소 | 고정: "서초구 서초대로60길 18, 한아원 9층" |
| D | 번호 | 순번 (1, 2, 3...) |
| E | 수취인명 | Order.recipientName |
| F | 상품명 | ExternalOrder.rawData.productOrder.productName |
| G | 수량 | OrderItem.quantity |
| H | 핸드폰 | Order.recipientPhone |
| I | 기타연락처 | ExternalOrder.rawData.order.ordererTel (주문자 연락처, 수취인과 다를 때) |
| J | 주소 | Order.shippingAddress |
| K | 배송메세지 | ExternalOrder.rawData의 배송메세지 |
| L | (공란) | 빈 값 |
| M | 상품고유코드 | Product.tplCode (3PL 상품고유코드) |
| N | 배송방식 | 빈 값 (3PL이 채움) |
| O | 운송장번호 | 빈 값 (3PL이 채움) |
| P | 택배사 | 빈 값 (3PL이 채움) |
| Q | productOrderId | 네이버 상품주문번호 (숨김 컬럼) |
| R | batchId | ShippingBatch ID (숨김 컬럼) |

**참조 시트:** 기존 상품명 ↔ 상품고유코드 매핑 포함 (DB SkuMapping에서 생성)

**발주 배치 저장:**
- 발주서 생성 시 DB에 배치 레코드 생성
- 각 행의 상품주문번호(productOrderId) ↔ 행번호 매핑 저장
- 송장 업로드 시 이 매핑으로 상품주문번호 역추적

### 고정 발송인 정보
```
보내는분: 한아원
연락처: 010-7701-2732
주소: 서초구 서초대로60길 18, 한아원 9층
```
이 값은 HOK company 설정 또는 하드코딩으로 관리. 변경 빈도가 낮으므로 초기에는 하드코딩 허용.

## 3. 기능 B: 송장 업로드 → 네이버 발송처리 파일 생성

### 입력
- 3PL에서 반환된 Excel (File 3 형식 — File 2 + O열 송장번호)
- 기존 발주 배치의 상품주문번호 매핑

### 처리
1. 업로드된 Excel에서 O열(운송장번호) 파싱
2. 발주 배치 매핑으로 각 행의 상품주문번호 조회
3. 네이버 업로드용 Excel 생성

### 출력: 네이버 업로드 Excel (File 4 형식)

| Col | 헤더 | 값 |
|-----|------|----|
| A | 상품주문번호 | 발주 배치 매핑에서 조회 |
| B | 배송방법 | 고정: "택배발송 : 택배,등기,소포" |
| C | 택배사 | 기본: "CJ대한통운" (변경 가능) |
| D | 송장번호 | File 3의 O열 값 |

시트명: "발송처리" (네이버 업로드 요구사항)

### 매핑 전략
- 3PL은 File 2의 순서/내용을 변경하지 않고 송장번호만 추가
- 1차: Excel Q열(productOrderId) + R열(batchId)로 직접 매핑
- 2차: DB ShippingBatchItem으로 검증
- 안전장치: 수취인명+전화번호 일치 검증

## 4. 데이터 모델

### 새 테이블: ShippingBatch (발주 배치)

```prisma
model ShippingBatch {
  id          String   @id @default(uuid())
  companyId   String   @map("company_id")
  company     Company  @relation(fields: [companyId], references: [id])
  platform    Platform @default(NAVER)
  status      ShippingBatchStatus @default(PENDING)
  carrier     String   @default("CJ대한통운")
  totalOrders Int      @map("total_orders")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  items       ShippingBatchItem[]

  @@index([companyId, status])
  @@map("shipping_batches")
  @@schema("salesone")
}

model ShippingBatchItem {
  id                String   @id @default(uuid())
  batchId           String   @map("batch_id")
  batch             ShippingBatch @relation(fields: [batchId], references: [id])
  rowNumber         Int      @map("row_number")
  orderId           String   @map("order_id")
  order             Order    @relation(fields: [orderId], references: [id])
  productOrderId    String   @map("product_order_id")  // 네이버 상품주문번호
  trackingNumber    String?  @map("tracking_number")

  @@unique([batchId, rowNumber])
  @@map("shipping_batch_items")
  @@schema("salesone")
}

enum ShippingBatchStatus {
  PENDING        // 발주서 생성됨, 3PL에 전달 전/후
  SHIPPED        // 송장 업로드 완료
  COMPLETED      // 네이버 발송처리 완료
}
```

## 5. UI 위치: Shipping 페이지

Shipping 페이지에 "네이버 발주/송장" 섹션 추가.

### 발주서 생성 화면
- 발송 대기 중인 네이버 주문 목록 (체크박스 선택)
- "3PL 발주서 다운로드" 버튼
- 클릭 시: 선택된 주문으로 Excel 생성 + 다운로드 + DB에 배치 저장

### 송장 업로드 화면
- 기존 발주 배치 목록 (상태별: PENDING / SHIPPED / COMPLETED)
- PENDING 배치 선택 → "송장 파일 업로드" 버튼
- 업로드 시: Excel 파싱 → 송장번호 매핑 → "네이버 업로드 파일 다운로드" 버튼 표시
- 다운로드하면 배치 상태 SHIPPED로 변경

## 6. API Routes

### POST /api/shipping/batch
- 선택된 주문 ID 목록 받아서 ShippingBatch + ShippingBatchItem 생성
- 3PL 발주서 Excel 생성하여 응답 (blob)

### POST /api/shipping/upload
- File 3 (송장 포함) Excel 업로드
- Excel R열에서 batchId 자동 추출 (URL에 ID 불필요)
- Q열 productOrderId + DB 매핑으로 이중 검증
- 파싱하여 ShippingBatchItem.trackingNumber 업데이트
- 배치 상태 SHIPPED로 변경

### GET /api/shipping/batch/[id]/naver-upload
- File 4 (네이버 업로드) Excel 생성하여 다운로드
- 배치 상태 COMPLETED로 변경

### GET /api/shipping/batches
- 배치 목록 조회 (상태 필터)

## 7. 데이터 모델 변경: Product.tplCode

Product 테이블에 `tplCode` 컬럼 추가 (3PL 상품고유코드):
```prisma
model Product {
  // ... 기존 필드
  tplCode  String?  @map("tpl_code")  // 3PL 상품고유코드 (예: P00300279)
}
```

현재 3PL 코드 매핑:
| 상품명 | tplCode |
|--------|---------|
| ODD. M-01 오드 영양제 | P00300279 |
| 오드 M-01 스타터키트 5일분 | P00300280 |
| 오드 M-01 리필팩 30일분 | P00300281 |

## 8. 의존성

- `xlsx` npm 패키지: Excel 생성/파싱 (서버사이드)
- 기존 모듈: ExternalOrder, Order, Product

## 9. 택배사

- 기본값: CJ대한통운
- 배치 생성 시 택배사 선택 가능 (향후 다른 택배사 추가 대비)
- 네이버 택배사 코드 매핑은 현재 "CJ대한통운" 문자열 그대로 사용

## 10. 추후 자동화 연결점

- 발주서 생성 함수를 독립 모듈로 분리 → 팀원의 메일 자동화 연동 가능
- 송장 파싱 함수도 독립 모듈로 분리 → 메일 수신 시 자동 처리 가능
- 네이버 API 직접 발송처리 (현재는 Excel 다운로드, 추후 API 호출로 전환 가능)

## 11. 범위 외 (이번 구현에서 제외)

- 네이버 API 직접 발송처리 (Excel 다운로드 방식 우선)
- 메일 자동 발송/수신 (팀원이 별도 개발 중)
- 재고 Push (별도 작업으로 분리)
- 다른 플랫폼(Shopify, Amazon) 발주서
