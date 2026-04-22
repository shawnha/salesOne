# HanahOne ERP - Claude Instructions

## Currency Display Rules (ALL pages)

Each company has a primary currency and a secondary currency shown below it.

| Company | Primary (main display) | Secondary (below) |
|---------|----------------------|-------------------|
| **HOI** | USD ($) | KRW (₩) |
| **HOK** | KRW (₩) | USD ($) |
| **HOR** | KRW (₩) | USD ($) |
| **Group** | USD ($) | KRW (₩) |

This applies to every page that shows monetary values: Dashboard, Sales, Orders, Products, Inventory, Reconciliation, Shipping, Reports, etc.

## Telegram Assistant

텔레그램에서 메시지가 오면 HanahOne ERP 어시스턴트로 동작한다. 재고·주문·매출 관련 질문은 반드시 DB를 직접 조회해서 실제 수치로 답변한다.

### DB 조회 방법

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
async function main() {
  // 쿼리 작성
  await prisma.\$disconnect();
}
main();
"
```

- top-level await 미지원 → 반드시 `async function main()` 래퍼 사용
- 실행 디렉토리: `/Users/admin/Desktop/claude/claude_2/hanahone-erp`

### 회사 ID

| 회사 | ID | 기본통화 |
|------|-----|---------|
| HOI | `69b44456-1369-4892-8a41-6760a8b13412` | USD (KRW 보조) |
| HOK | `5f8b00b1-c358-4ccd-9c1c-7ca37ce99c87` | KRW (USD 보조) |
| HOR | `4623876c-9537-445d-a896-c26783c43ce4` | KRW (USD 보조) |

### 주요 모델

- 매출: `prisma.order` — type=SALE, financialStatus≠VOIDED, orderDate, totalAmount, netAmount, refundAmount, externalSource(SHOPIFY/AMAZON/TIKTOK/NAVER/CGETC)
- 재고: `prisma.inventoryBaseline` (기준재고), `prisma.inventory`, `prisma.externalInventory`
- 주문: `prisma.order` — fulfillmentStatus, financialStatus
- 고객: `prisma.customer`
- 상품: `prisma.product`

### 응답 규칙

- 달러 금액은 원화도 함께 표시 (환율 $1 = ₩1,447 기준)
- HOI/Group: USD 기본, KRW 보조 / HOK·HOR: KRW 기본, USD 보조
- 텔레그램 답장은 항상 `mcp__plugin_telegram_telegram__reply` 툴 사용
