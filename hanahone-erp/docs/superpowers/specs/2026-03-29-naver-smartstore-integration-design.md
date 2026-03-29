# Naver Smartstore API Integration Design

**Date**: 2026-03-29
**Status**: Draft
**Scope**: 1단계 Pull 동기화 (주문 + 상품/재고 조회)
**Company**: HOK (추후 HOR 확장 가능성 있으나 현재 미정)

---

## 1. Overview

Naver Smartstore 커머스 API를 통해 HOK의 주문과 상품/재고 데이터를 ERP로 동기화한다.

현재 `connectors/naver.ts`에 기본 구현이 있으나 인증 방식이 잘못되어 있고(Basic Auth 사용), 주문 상세와 재고 조회가 없다. 이를 별도 모듈(`src/lib/integrations/naver/`)로 재구성하며, 기존 커넥터 패턴(`Connector` 인터페이스, `sync-runner.ts`)은 그대로 활용한다.

### 범위

**포함 (1단계)**:
- bcrypt 기반 인증 구현
- 주문 조회 (상세 포함: 배송지, 연락처, 환불)
- 상품/재고 조회
- Vercel cron 자동 동기화 (하루 1회)
- 수동 트리거
- API 발급/설정 가이드 문서

**미포함 (2단계, 추후 논의)**:
- ERP → Naver Push (발송 처리, 반품/교환 처리 등)
- N배송 연동 (현재 미사용)

---

## 2. Module Structure

```
src/lib/integrations/naver/
├── auth.ts          # 토큰 발급/캐싱
├── orders.ts        # 주문 조회
├── products.ts      # 상품/재고 조회
├── types.ts         # Naver API 응답 타입
└── index.ts         # Connector 인터페이스 구현 (naverConnector export)
```

기존 `src/lib/integrations/connectors/naver.ts`는 삭제하고, `index.ts`에서 동일한 `naverConnector`를 export한다. `sync/[platform]/route.ts`의 import 경로만 변경.

---

## 3. Authentication (auth.ts)

### 현재 문제

```typescript
// 잘못된 구현 (Basic Auth)
const token = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
headers: { Authorization: `Basic ${token}` }
```

### 올바른 구현

Naver Commerce API는 bcrypt 기반 서명으로 OAuth2 토큰을 발급한다.

**흐름:**
1. `password = "${clientId}_${timestamp}"` 생성 (timestamp: 밀리초, 13자리)
2. `clientSecret`을 bcrypt salt로 사용하여 `bcrypt.hashSync(password, clientSecret)` 실행
3. 결과를 Base64 인코딩 → `client_secret_sign`
4. `POST /external/v1/oauth2/token` (form-urlencoded) 호출
5. 응답: `{ access_token, expires_in: 10800, token_type: "Bearer" }`

**토큰 요청 파라미터:**

| Parameter | Value |
|---|---|
| `client_id` | 애플리케이션 ID |
| `timestamp` | 현재 시간 (밀리초) |
| `client_secret_sign` | Base64(bcrypt hash) |
| `grant_type` | `client_credentials` |
| `type` | `SELF` |

**토큰 캐싱:**
- 인메모리 캐시 (Shopify 커넥터와 동일 패턴)
- 만료 5분 전 자동 재발급
- 토큰 수명: 3시간 (10800초)
- Refresh token 없음 — 매번 새로 발급

**의존성 추가:**
- `bcryptjs` (bcrypt의 순수 JS 구현, native addon 불필요)

**자격증명 저장 형태:**
```json
{
  "clientId": "애플리케이션 ID",
  "clientSecret": "$2a$04$..." // bcrypt salt 형태
}
```

기존 credentials-modal.tsx의 NAVER 필드 (clientId, clientSecret)는 변경 불필요.

---

## 4. Order Sync (orders.ts)

### API Endpoint

```
POST /external/v1/pay-order/seller/orders/last-changed-statuses
```

주문 상태 변경 기반 조회. `since`(lastSyncAt) 이후 상태가 변경된 주문을 가져온다.

**요청 파라미터:**
- `lastChangedFrom`: ISO 8601 시작일시
- `lastChangedTo`: ISO 8601 종료일시 (최대 범위: 24시간)
- 24시간 초과 시 여러 번 호출하여 분할 조회

### 주문 상세 조회

```
POST /external/v1/pay-order/seller/product-orders/query
```

주문 ID 목록으로 상세 정보 조회 (한 번에 최대 300건).

**응답에서 추출할 필드:**
- `productOrderId`: 상품주문번호 (externalOrderId로 사용)
- `orderId`: 주문번호
- `orderDate`, `paymentDate`
- `productOrderStatus`: 주문 상태
- `totalPaymentAmount`: 결제 금액
- `productName`, `quantity`, `unitPrice`
- `sellerProductCode`: SKU
- `shippingAddress`: 배송지 정보 (수취인명, 주소, 전화번호) → **Order 모델 필드에 저장**
- `ordererName`, `ordererTel`: 주문자 정보
- `claimType`, `claimStatus`: 클레임(취소/반품/교환) 정보

### DB 스키마 변경 (Order 모델)

배송지/연락처 저장을 위해 Order 테이블에 필드 추가:

```prisma
model Order {
  // ... 기존 필드 ...
  shippingAddress   String?   // 배송지 주소
  recipientName     String?   // 수취인명
  recipientPhone    String?   // 수취인 전화번호
}
```

Naver 외 다른 플랫폼(Shopify 등)에서도 활용 가능한 범용 필드. nullable이므로 기존 데이터에 영향 없음.

### 상태 매핑

Naver의 `productOrderStatus`를 ERP의 FulfillmentStatus/FinancialStatus로 매핑:

| Naver Status | FulfillmentStatus | FinancialStatus | 설명 |
|---|---|---|---|
| `PAYMENT_WAITING` | UNFULFILLED | PENDING | 입금 대기 |
| `PAYED` | UNFULFILLED | PAID | 결제 완료 |
| `DELIVERING` | PARTIALLY_FULFILLED | PAID | 배송 중 |
| `DELIVERED` | FULFILLED | PAID | 배송 완료 |
| `PURCHASE_DECIDED` | DELIVERED | PAID | 구매 확정 |
| `EXCHANGED` | FULFILLED | PARTIALLY_REFUNDED | 교환 완료 |
| `CANCELED` | CANCELLED | VOIDED | 취소 |
| `RETURNED` | CANCELLED | REFUNDED | 반품 완료 |

### 환불 금액

클레임 정보에서 환불 금액을 추출. `claimType`이 `CANCEL`, `RETURN`, `EXCHANGE`인 경우 해당 금액을 `refundAmount`에 반영.

### Pagination

주문 상태 변경 조회는 최대 24시간 범위. `since`가 24시간 이상 전이면 24시간 단위로 분할하여 순차 호출.

---

## 5. Product & Inventory Sync (products.ts)

### 상품 목록 조회

```
GET /external/v2/products?
```

페이지네이션: offset 기반, `size` 파라미터로 한 페이지당 최대 100개.

**추출 필드:**
- `originProductNo`: 상품 번호
- `name`: 상품명
- `salePrice`: 판매가
- `stockQuantity`: 재고 수량
- `sellerManagementCode`: 판매자 관리코드 (SKU)
- `productOptionList`: 옵션별 SKU/재고

### fetchInventory() 구현

`Connector.fetchInventory()` 인터페이스를 구현하여 `ExternalInventoryData[]` 반환.

상품 목록을 조회하고, 각 상품/옵션의 재고 수량을 추출:

```typescript
{
  sku: sellerManagementCode || originProductNo,
  productName: name,
  quantity: stockQuantity,
}
```

기존 sync-runner.ts의 ExternalInventory upsert 로직을 활용하되, **Inventory 테이블 직접 업데이트는 건너뛴다.**

### HOK 재고 계산과의 관계

현재 HOK 재고는 `InventorySnapshot` 기반 계산(초기수량 - 판매량 + 조정량).

**Naver 재고는 ExternalInventory에만 저장하고, SkuMapping이 있어도 Inventory 직접 업데이트는 하지 않는다.** sync-runner의 기본 동작(SkuMapping → Inventory upsert)을 Naver에서는 건너뛰어야 한다. 이유:
- HOK은 InventorySnapshot 기반 계산을 사용하므로 직접 덮어쓰면 충돌
- Naver 재고는 참고용이며, 실제 재고는 3PL 업체가 관리
- warehouse 라벨도 "CGETC"로 잘못 설정되는 문제 방지

**구현**: Connector 인터페이스의 `fetchInventory()`는 구현하지 않는다. 대신 naver/index.ts 내부에서 별도 함수로 ExternalInventory만 직접 upsert한다. 이렇게 하면 sync-runner.ts를 수정할 필요가 없고, 플랫폼별 분기가 sync-runner에 들어가지 않는다.

---

## 6. Scheduling

### 자동 동기화 (Vercel Cron)

**파일:** `src/app/api/cron/naver-sync/route.ts`

- 매일 03:00 KST (CGETC 02:00 이후)
- `vercel.json` cron schedule 추가
- `maxDuration = 300` (Vercel Pro 플랜, 5분)
- CRON_SECRET 검증 (기존 `validateCronSecret()` 재사용)
- HOK의 active NAVER IntegrationConfig를 찾아 실행
- 동기화 후 `recalculateHokInventory()` 호출

**vercel.json 추가:**
```json
{
  "crons": [
    { "path": "/api/cron/cgetc-sync", "schedule": "0 17 * * *" },
    { "path": "/api/cron/naver-sync", "schedule": "0 18 * * *" }
  ]
}
```
(UTC 18:00 = KST 03:00)

### 수동 트리거

기존 `POST /api/sync/naver` 엔드포인트 그대로 사용. import 경로만 변경:

```typescript
// Before
import { naverConnector } from "@/lib/integrations/connectors/naver";
// After
import { naverConnector } from "@/lib/integrations/naver";
```

---

## 7. Error Handling

### Rate Limiting (429)

Naver API는 Token Bucket 방식 rate limit을 적용한다.

- 429 응답 시 1-2초 대기 후 재시도 (최대 3회)
- 재시도 실패 시 SyncJob에 에러 기록

### Token Expiry

- 토큰 캐시에 만료 시간 저장
- API 호출 전 만료 확인, 5분 이내면 재발급
- 토큰 발급 실패 시 즉시 sync 중단
- **보안**: 에러 throw 시 상태코드만 포함, 응답 본문/토큰/서명값은 절대 에러 메시지에 포함하지 않음

### Fetch 실패 처리

- 모든 API 호출에서 응답 상태코드와 간략한 에러 메시지를 포함하여 throw
- sync-runner의 catch-all이 SyncJob에 FAILED로 기록
- 상세 조회(product-orders/query) 시 300건 단위로 배치 처리

### IP Whitelist

Naver Commerce API는 등록된 IP에서만 호출 가능. Vercel Serverless는 동적 IP이므로:

- Vercel Pro의 Static IP 기능 사용, 또는
- Vercel의 IP 대역을 Naver API Center에 등록 (변동 가능성 있음)
- 설정 가이드에 이 내용 포함

### 24시간 범위 제한

주문 조회 API는 최대 24시간 범위만 지원. 첫 동기화 시 또는 긴 기간 미동기화 시 24시간 단위로 분할 호출. 실패한 구간이 있으면 다음 sync에서 재시도.

---

## 8. Data Flow

```
[Naver Commerce API]
        │
        ▼
  naver/auth.ts ──── bcrypt 서명 → 토큰 발급
        │
        ▼
  naver/orders.ts ── 상태변경 주문 조회 → 상세 조회
  naver/products.ts ── 상품/재고 목록 조회
        │
        ▼
  naver/index.ts ──── Connector 인터페이스 통합
        │
        ▼
  sync-runner.ts ──── ExternalOrder upsert
        │                  → order-mapper.ts → Order + OrderItems 생성
        │              ExternalInventory upsert
        │                  → SkuMapping → Inventory 업데이트
        │
        ▼
  inventory-calculator.ts ── HOK 재고 재계산 (Naver/Pharmacy sync 후)
```

---

## 9. File Changes Summary

### 새로 생성

| File | 설명 |
|---|---|
| `src/lib/integrations/naver/auth.ts` | bcrypt 기반 토큰 발급/캐싱 |
| `src/lib/integrations/naver/orders.ts` | 주문 조회 (상태변경 + 상세) |
| `src/lib/integrations/naver/products.ts` | 상품/재고 조회 |
| `src/lib/integrations/naver/types.ts` | Naver API 응답 타입 |
| `src/lib/integrations/naver/index.ts` | Connector 구현, naverConnector export |
| `src/app/api/cron/naver-sync/route.ts` | Vercel cron 엔드포인트 |

### 수정

| File | 변경 내용 |
|---|---|
| `src/app/api/sync/[platform]/route.ts` | naverConnector import 경로 변경 |
| `vercel.json` | naver-sync cron schedule 추가 |
| `package.json` | `bcryptjs` 의존성 추가 |
| `prisma/schema.prisma` | Order 모델에 shippingAddress, recipientName, recipientPhone 추가 |

### 삭제

| File | 사유 |
|---|---|
| `src/lib/integrations/connectors/naver.ts` | naver/ 모듈로 대체 |

---

## 10. API Credential Setup Guide

### Step 1: 커머스 API 센터 접속

1. https://apicenter.commerce.naver.com 접속
2. 스마트스토어 계정으로 로그인 (통합매니저 권한 필요)

### Step 2: 애플리케이션 등록

1. "내 애플리케이션" 메뉴 진입
2. "새 애플리케이션 등록" 클릭
3. 앱 정보 입력:
   - 앱 이름: "HanahOne ERP"
   - API 그룹: 주문/결제/상품 관련 그룹 선택
4. **API 호출 IP 등록** (필수):
   - Vercel 서버의 IP 주소 등록
   - 로컬 개발 시 본인 IP도 추가
5. 등록 완료 후 `client_id`(애플리케이션 ID)와 `client_secret`(시크릿) 확인
   - `client_secret`은 `$2a$04$...` 형태의 bcrypt salt

### Step 3: ERP 설정

1. ERP > Settings > Integrations 페이지 이동
2. HOK 회사의 NAVER 카드에서 "Configure" 클릭
3. `Client ID`와 `Client Secret` 입력
4. "Save" → 자격증명이 AES-256-GCM으로 암호화 저장

### Step 4: 동기화 테스트

1. NAVER 카드에서 "Sync Now" 클릭
2. Sync History에서 결과 확인
3. Orders 페이지에서 Naver 주문 확인

### Troubleshooting

| 증상 | 원인 | 해결 |
|---|---|---|
| 401 Unauthorized | 잘못된 client_id/secret | API 센터에서 재확인, secret은 bcrypt salt 형태여야 함 |
| 403 Forbidden | IP 미등록 | API 센터 > 내 앱 > IP 목록에 서버 IP 추가 |
| 429 Too Many Requests | Rate limit 초과 | 자동 재시도 (1-2초 대기), 지속 시 sync 간격 조정 |
| 토큰 발급 실패 | timestamp 불일치 | 서버 시간 확인, NTP 동기화 |
| 주문 0건 | 조회 기간 문제 | lastSyncAt 확인, 수동으로 기간 넓혀서 재시도 |

---

## 11. Testing Strategy

- **Unit**: auth.ts 토큰 서명 생성 로직 (bcrypt hash + base64)
- **Unit**: orders.ts 상태 매핑 함수
- **Integration**: 실제 Naver API 호출 (테스트 환경 또는 staging)
- **E2E**: sync 트리거 → Order 생성 확인

---

## 12. Known Issues (기존 코드, 이번 스펙 범위 밖)

Codex 리뷰에서 발견된 기존 sync-runner/inventory-calculator 이슈:

1. **취소/반품 주문 재고 차감**: `recalculateHokInventory`가 CANCELLED 주문도 판매량에 포함. `financialStatus`가 VOIDED/REFUNDED인 주문은 제외해야 함.
2. **refundAmount 변경 감지 누락**: sync-runner의 needsUpdate 조건에 refundAmount가 없어 환불 금액 업데이트가 누락될 수 있음.
3. **ExternalOrder unique 제약**: `(platform, externalOrderId)`이므로 동일 플랫폼에 여러 회사가 사용하면 충돌. HOR 확장 시 `(companyId, platform, externalOrderId)`로 변경 필요.
4. **IntegrationConfig 활성화 경로**: credentials 저장 시 isActive가 자동 활성화되는지 확인 필요.

---

## 13. Future Considerations (2단계)

추후 Push 기능 추가 시 고려 사항:

- `naver/shipping.ts`: 발송 처리 (운송장 등록)
- `naver/claims.ts`: 반품/교환 처리
- Connector 인터페이스에 `pushOrderStatus?()` 추가 필요
- 현재 모듈 구조가 파일 단위로 분리되어 있어 확장 용이
