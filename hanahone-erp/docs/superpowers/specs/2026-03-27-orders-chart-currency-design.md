# Orders Line Chart + Currency Display Design

## Overview

Two features for SalesOne ERP:
1. **Orders Line Chart** — Orders 페이지 상단에 일별 주문 현황 선 그래프 추가
2. **Currency Dual Display** — 환율 API 연동 + 회사별 메인/서브 통화 표시

---

## Feature 1: Orders Line Chart

### Layout

Sales 페이지와 동일한 패턴 — 상단 차트 + 하단 테이블:
- 기존 KPI 요약 (Total | Fulfilled | Paid | Refunded | Amount) 유지
- KPI 아래에 선 그래프 Card 추가
- 기존 테이블은 차트 아래에 그대로 유지

### Chart Type

**Line Chart (Recharts)** — 3개 라인:

| 라인 | 의미 | 색상 | 스타일 |
|---|---|---|---|
| Total Orders | 일별 전체 주문 수 | #3B82F6 (파란색) | 실선 |
| Delivered | 일별 배송완료 수 | #10B981 (초록색) | 실선 |
| Refunded | 일별 환불 건수 | #EF4444 (빨간색) | 점선 |

### Data Source

기존 `Order` 테이블에서 집계:
- X축: 선택된 월의 각 일자 (1일~말일)
- Y축: 주문 건수 (금액 아님)
- Total: 해당 일의 전체 주문 수 (type=SALE)
- Delivered: fulfillmentStatus = DELIVERED인 주문 수
- Refunded: financialStatus = REFUNDED 또는 PARTIALLY_REFUNDED인 주문 수
- 회사 필터 적용 (companyId)
- MonthPicker 연동 (선택된 월)

### Components

- `src/components/orders/OrdersChart.tsx` — 클라이언트 컴포넌트 (Recharts LineChart)
- `src/lib/orders-chart-data.ts` — 서버 사이드 일별 집계 함수
- `src/app/orders/page.tsx` 수정 — 차트 데이터 로딩 + OrdersChart 배치

---

## Feature 2: Currency Dual Display

### Exchange Rate API

**한국수출입은행 Open API**:
- URL: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`
- 파라미터: `authkey`, `searchdate` (YYYYMMDD), `data=AP01`
- 응답: `deal_bas_r` (매매기준율, 문자열에 콤마 포함)
- 일일 제한: 1,000회
- 업데이트: 영업일 11시 전후
- 비영업일/11시 전: null 반환 → 캐싱된 직전 값 사용

### Caching Strategy

- 서버 사이드 메모리 캐시 (1시간 유효)
- 캐시 miss 시 API 호출
- API 실패 시 마지막 캐시값 반환 (fallback)
- 비영업일 대응: 직전 영업일 데이터 캐싱

### Currency Display Rules

| 회사 | 메인 통화 | 서브 통화 (작게) |
|---|---|---|
| **Group (전체)** | USD ($) | KRW (₩) |
| **HOI** | USD ($) | KRW (₩) |
| **HOK** | KRW (₩) | USD ($) |
| **HOR** | KRW (₩) | USD ($) |

표시 예시:
```
HOI:    $12,450.00
        ₩18,762,210 (₩1,506.2/$)

HOK:    ₩5,600,000
        $3,716.42 (₩1,506.2/$)
```

### 적용 범위

- Sales 페이지: KPI (Net Revenue), 도넛 차트 중앙 총액
- Orders 페이지: KPI (Amount)
- 환율 기준 표시: "환율: ₩1,506.2/$ (2026-03-27 기준)" — 차트 Card 상단 또는 KPI 영역에 작게

### Components

- `src/lib/exchange-rate.ts` — 환율 API 호출 + 캐싱 로직
- `src/components/ui/currency-display.tsx` — 메인/서브 통화 표시 컴포넌트
- Sales/Orders 페이지 수정 — CurrencyDisplay 적용

### Environment Variable

```
KOREAEXIM_API_KEY=j7aK0vUSrmDu49FXhIUfhEj2Nu8CkRco
```

---

## Technical Notes

- Recharts LineChart는 이미 설치된 recharts 패키지 사용
- 환율 API는 서버 사이드에서만 호출 (API 키 노출 방지)
- 메모리 캐시는 Next.js 서버 프로세스 내 전역 변수 (개발 중 HMR 시 초기화될 수 있음)
- `deal_bas_r` 값 파싱: `"1,506.2"` → `parseFloat("1506.2")` (콤마 제거 필요)
