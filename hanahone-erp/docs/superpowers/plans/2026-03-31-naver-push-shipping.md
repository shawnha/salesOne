# 네이버 3PL 발주서 자동화 + 송장 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shipping 페이지에서 네이버 주문 → 3PL 발주서 Excel 자동 생성 + 3PL 송장 Excel 업로드 → 네이버 발송처리 파일 자동 생성

**Architecture:** DB에 ShippingBatch/ShippingBatchItem 테이블 추가, Product에 tplCode 컬럼 추가. Excel 생성/파싱은 xlsx 라이브러리로 독립 모듈 구현. API route 4개, Shipping 페이지에 네이버 발주/송장 섹션 추가.

**Tech Stack:** Next.js 14, Prisma, xlsx (npm), Vitest, Zod, React (client component)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | ShippingBatch, ShippingBatchItem 모델 + Product.tplCode 추가 |
| `src/lib/shipping/excel-generator.ts` | 3PL 발주서 + 네이버 업로드 Excel 생성 |
| `src/lib/shipping/excel-parser.ts` | 3PL 송장 Excel 파싱 |
| `src/lib/shipping/__tests__/excel-generator.test.ts` | 발주서/네이버 Excel 생성 테스트 |
| `src/lib/shipping/__tests__/excel-parser.test.ts` | 송장 Excel 파싱 테스트 |
| `src/app/api/shipping/batch/route.ts` | POST: 배치 생성 + 발주서 다운로드, GET: 배치 목록 |
| `src/app/api/shipping/upload/route.ts` | POST: 송장 업로드 |
| `src/app/api/shipping/batch/[id]/naver-upload/route.ts` | GET: 네이버 발송처리 파일 다운로드 |
| `src/components/shipping/NaverShippingManager.tsx` | 네이버 발주/송장 관리 클라이언트 컴포넌트 |
| `src/app/shipping/page.tsx` | Shipping 페이지 (기존 shipping-costs를 통합 또는 새 페이지) |

---

### Task 1: xlsx 패키지 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: xlsx 패키지 설치**

```bash
npm install xlsx
```

- [ ] **Step 2: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: add xlsx dependency for Excel generation/parsing"
```

---

### Task 2: Prisma 스키마 변경 (Product.tplCode + ShippingBatch + ShippingBatchItem)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Product 모델에 tplCode 추가**

`prisma/schema.prisma`의 Product 모델에 추가:

```prisma
model Product {
  id          String  @id @default(uuid())
  name        String
  sku         String
  description String?
  category    String
  basePrice   Decimal @map("base_price")
  costPrice   Decimal @map("cost_price")
  salePrice   Decimal? @map("sale_price")
  companyId   String  @map("company_id")
  company     Company @relation(fields: [companyId], references: [id])
  tplCode     String? @map("tpl_code")

  inventories        Inventory[]
  orderItems         OrderItem[]
  productionOrders   ProductionOrder[]
  bomAsFinished      BillOfMaterials[] @relation("FinishedProduct")
  bomAsRawMaterial   BillOfMaterials[] @relation("RawMaterial")
  inventorySnapshots InventorySnapshot[]
  skuMappings        SkuMapping[]

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([sku, companyId])
  @@index([companyId])
  @@map("products")
  @@schema("salesone")
}
```

- [ ] **Step 2: ShippingBatchStatus enum 추가**

`prisma/schema.prisma`에 enum 추가 (다른 enum 근처):

```prisma
enum ShippingBatchStatus {
  PENDING
  SHIPPED
  COMPLETED

  @@schema("salesone")
}
```

- [ ] **Step 3: ShippingBatch 모델 추가**

```prisma
model ShippingBatch {
  id          String              @id @default(uuid())
  companyId   String              @map("company_id")
  company     Company             @relation(fields: [companyId], references: [id])
  platform    Platform            @default(NAVER)
  status      ShippingBatchStatus @default(PENDING)
  carrier     String              @default("CJ대한통운")
  totalOrders Int                 @map("total_orders")
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")

  items       ShippingBatchItem[]

  @@index([companyId, status])
  @@map("shipping_batches")
  @@schema("salesone")
}
```

- [ ] **Step 4: ShippingBatchItem 모델 추가**

```prisma
model ShippingBatchItem {
  id              String        @id @default(uuid())
  batchId         String        @map("batch_id")
  batch           ShippingBatch @relation(fields: [batchId], references: [id])
  rowNumber       Int           @map("row_number")
  orderId         String        @map("order_id")
  order           Order         @relation(fields: [orderId], references: [id])
  productOrderId  String        @map("product_order_id")
  trackingNumber  String?       @map("tracking_number")

  @@unique([batchId, rowNumber])
  @@map("shipping_batch_items")
  @@schema("salesone")
}
```

- [ ] **Step 5: Company 모델에 shippingBatches relation 추가**

Company 모델의 relations 목록에 추가:

```prisma
  shippingBatches             ShippingBatch[]
```

- [ ] **Step 6: Order 모델에 shippingBatchItems relation 추가**

Order 모델의 relations 목록에 추가:

```prisma
  shippingBatchItems  ShippingBatchItem[]
```

- [ ] **Step 7: DB 마이그레이션 실행**

```bash
npx prisma db push
```

Expected: 스키마 동기화 성공

- [ ] **Step 8: HOK 상품 3종에 tplCode 시드 데이터 입력**

```bash
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  // HOK company ID 조회
  const hok = await prisma.company.findFirst({ where: { name: { contains: 'HOK' } } });
  if (!hok) { console.log('HOK not found'); return; }

  const mappings = [
    { sku: 'ODD-M01', tplCode: 'P00300279' },       // ODD. M-01 오드 영양제
    { sku: 'ODD-M01-SK', tplCode: 'P00300280' },     // 스타터키트 5일분
    { sku: 'ODD-M01-RF', tplCode: 'P00300281' },     // 리필팩 30일분
  ];

  for (const m of mappings) {
    const result = await prisma.product.updateMany({
      where: { sku: m.sku, companyId: hok.id },
      data: { tplCode: m.tplCode },
    });
    console.log(m.sku, '->', m.tplCode, ':', result.count, 'updated');
  }
}
main().then(() => prisma.\$disconnect());
"
```

Note: SKU 값이 실제 DB와 다를 수 있음. `prisma.product.findMany({ where: { companyId: hok.id } })` 로 먼저 확인하고 매핑할 것.

- [ ] **Step 9: Prisma generate 확인**

```bash
npx prisma generate
```

- [ ] **Step 10: 커밋**

```bash
git add prisma/schema.prisma
git commit -m "feat: add ShippingBatch model and Product.tplCode for 3PL integration"
```

---

### Task 3: Excel 생성 모듈 (excel-generator.ts) — 테스트 먼저

**Files:**
- Create: `src/lib/shipping/__tests__/excel-generator.test.ts`
- Create: `src/lib/shipping/excel-generator.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
// src/lib/shipping/__tests__/excel-generator.test.ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  generatePurchaseOrderExcel,
  generateNaverUploadExcel,
  type PurchaseOrderInput,
  type NaverUploadInput,
} from "../excel-generator";

describe("generatePurchaseOrderExcel", () => {
  const sampleOrders: PurchaseOrderInput[] = [
    {
      recipientName: "김이슬",
      productName: "ODD. M-01 오드 영양제",
      quantity: 1,
      recipientPhone: "010-6458-8923",
      ordererPhone: undefined,
      shippingAddress: "충청남도 천안시 동남구 용수골길 23 3층",
      deliveryMessage: undefined,
      tplCode: "P00300279",
      productOrderId: "2026022473255981",
      batchId: "batch-uuid-123",
    },
    {
      recipientName: "노현석",
      productName: "ODD. M-01 오드 영양제",
      quantity: 1,
      recipientPhone: "010-3671-7307",
      ordererPhone: "010-1234-5678",
      shippingAddress: "전라북도 익산시 부송1로 83 동신 104동 703호",
      deliveryMessage: "문 앞에 놓아주세요",
      tplCode: "P00300279",
      productOrderId: "2026022472704221",
      batchId: "batch-uuid-123",
    },
  ];

  it("generates Excel with correct headers", () => {
    const buffer = generatePurchaseOrderExcel(sampleOrders);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["1차"];
    expect(ws).toBeDefined();
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const headers = data[0];
    expect(headers[0]).toBe("보내는분");
    expect(headers[4]).toBe("수취인명");
    expect(headers[12]).toBe("상품고유코드");
    expect(headers[14]).toBe("운송장번호");
    expect(headers[16]).toBe("productOrderId");
    expect(headers[17]).toBe("batchId");
  });

  it("fills sender info as fixed values", () => {
    const buffer = generatePurchaseOrderExcel(sampleOrders);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["1차"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data[1][0]).toBe("한아원");
    expect(data[1][1]).toBe("010-7701-2732");
    expect(data[1][2]).toBe("서초구 서초대로60길 18, 한아원 9층");
  });

  it("fills order data correctly", () => {
    const buffer = generatePurchaseOrderExcel(sampleOrders);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["1차"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // Row 2 (index 1) = first order
    expect(data[1][3]).toBe(1); // 번호
    expect(data[1][4]).toBe("김이슬"); // 수취인명
    expect(data[1][5]).toBe("ODD. M-01 오드 영양제"); // 상품명
    expect(data[1][6]).toBe(1); // 수량
    expect(data[1][7]).toBe("010-6458-8923"); // 핸드폰
    expect(data[1][9]).toBe("충청남도 천안시 동남구 용수골길 23 3층"); // 주소
    expect(data[1][12]).toBe("P00300279"); // 상품고유코드
    expect(data[1][16]).toBe("2026022473255981"); // productOrderId (hidden)
    expect(data[1][17]).toBe("batch-uuid-123"); // batchId (hidden)
  });

  it("fills ordererPhone in 기타연락처 when present", () => {
    const buffer = generatePurchaseOrderExcel(sampleOrders);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["1차"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data[1][8]).toBeUndefined(); // first order: no ordererPhone
    expect(data[2][8]).toBe("010-1234-5678"); // second order: has ordererPhone
  });

  it("fills deliveryMessage when present", () => {
    const buffer = generatePurchaseOrderExcel(sampleOrders);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["1차"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data[2][10]).toBe("문 앞에 놓아주세요");
  });

  it("handles empty order list", () => {
    const buffer = generatePurchaseOrderExcel([]);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["1차"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data.length).toBe(1); // headers only
  });

  it("creates 참조 sheet with product mappings", () => {
    const buffer = generatePurchaseOrderExcel(sampleOrders);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["참조"];
    expect(ws).toBeDefined();
  });
});

describe("generateNaverUploadExcel", () => {
  const sampleItems: NaverUploadInput[] = [
    { productOrderId: "2026022473255981", trackingNumber: "540729902902" },
    { productOrderId: "2026022472704221", trackingNumber: "540729902913" },
  ];

  it("generates Excel with correct headers", () => {
    const buffer = generateNaverUploadExcel(sampleItems);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["발송처리"];
    expect(ws).toBeDefined();
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data[0]).toEqual(["상품주문번호", "배송방법", "택배사", "송장번호"]);
  });

  it("fills data with correct values", () => {
    const buffer = generateNaverUploadExcel(sampleItems);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["발송처리"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data[1][0]).toBe("2026022473255981");
    expect(data[1][1]).toBe("택배발송 : 택배,등기,소포");
    expect(data[1][2]).toBe("CJ대한통운");
    expect(data[1][3]).toBe("540729902902");
  });

  it("uses custom carrier when provided", () => {
    const buffer = generateNaverUploadExcel(sampleItems, "한진택배");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets["발송처리"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(data[1][2]).toBe("한진택배");
  });

  it("sheet name is exactly 발송처리", () => {
    const buffer = generateNaverUploadExcel(sampleItems);
    const wb = XLSX.read(buffer, { type: "buffer" });
    expect(wb.SheetNames).toContain("발송처리");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/lib/shipping/__tests__/excel-generator.test.ts
```

Expected: FAIL — 모듈이 아직 없음

- [ ] **Step 3: excel-generator.ts 구현**

```typescript
// src/lib/shipping/excel-generator.ts
import * as XLSX from "xlsx";

const SENDER = {
  name: "한아원",
  phone: "010-7701-2732",
  address: "서초구 서초대로60길 18, 한아원 9층",
} as const;

const HEADERS = [
  "보내는분", "보내는분 연락처", "주소 ", "번호", "수취인명",
  "상품명", "수량", "핸드폰", "기타연락처", "주소",
  "배송메세지", "(공란)", "상품고유코드", "배송방식", "운송장번호",
  "택배사", "productOrderId", "batchId",
];

export interface PurchaseOrderInput {
  recipientName: string;
  productName: string;
  quantity: number;
  recipientPhone: string;
  ordererPhone?: string;
  shippingAddress: string;
  deliveryMessage?: string;
  tplCode?: string;
  productOrderId: string;
  batchId: string;
}

export interface NaverUploadInput {
  productOrderId: string;
  trackingNumber: string;
}

export function generatePurchaseOrderExcel(orders: PurchaseOrderInput[]): Buffer {
  const wb = XLSX.utils.book_new();

  // Main sheet: 1차
  const rows: (string | number | undefined)[][] = [HEADERS];
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    rows.push([
      SENDER.name,               // A: 보내는분
      SENDER.phone,              // B: 보내는분 연락처
      SENDER.address,            // C: 주소
      i + 1,                     // D: 번호
      o.recipientName,           // E: 수취인명
      o.productName,             // F: 상품명
      o.quantity,                // G: 수량
      o.recipientPhone,          // H: 핸드폰
      o.ordererPhone || undefined, // I: 기타연락처
      o.shippingAddress,         // J: 주소
      o.deliveryMessage || undefined, // K: 배송메세지
      undefined,                 // L: (공란)
      o.tplCode || undefined,    // M: 상품고유코드
      undefined,                 // N: 배송방식
      undefined,                 // O: 운송장번호
      undefined,                 // P: 택배사
      o.productOrderId,          // Q: productOrderId (숨김)
      o.batchId,                 // R: batchId (숨김)
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "1차");

  // Reference sheet: 참조
  const uniqueProducts = new Map<string, string>();
  for (const o of orders) {
    if (o.tplCode && !uniqueProducts.has(o.productName)) {
      uniqueProducts.set(o.productName, o.tplCode);
    }
  }
  const refRows: string[][] = [];
  for (const [name, code] of uniqueProducts) {
    refRows.push([name, code]);
  }
  if (refRows.length > 0) {
    const refWs = XLSX.utils.aoa_to_sheet(refRows);
    XLSX.utils.book_append_sheet(wb, refWs, "참조");
  }

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function generateNaverUploadExcel(
  items: NaverUploadInput[],
  carrier: string = "CJ대한통운",
): Buffer {
  const wb = XLSX.utils.book_new();
  const rows: string[][] = [
    ["상품주문번호", "배송방법", "택배사", "송장번호"],
  ];
  for (const item of items) {
    rows.push([
      item.productOrderId,
      "택배발송 : 택배,등기,소포",
      carrier,
      item.trackingNumber,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "발송처리");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xls" }));
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
npx vitest run src/lib/shipping/__tests__/excel-generator.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/shipping/excel-generator.ts src/lib/shipping/__tests__/excel-generator.test.ts
git commit -m "feat: add Excel generator for 3PL purchase order and Naver upload"
```

---

### Task 4: Excel 파싱 모듈 (excel-parser.ts) — 테스트 먼저

**Files:**
- Create: `src/lib/shipping/__tests__/excel-parser.test.ts`
- Create: `src/lib/shipping/excel-parser.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
// src/lib/shipping/__tests__/excel-parser.test.ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseTrackingExcel, type ParsedTrackingRow } from "../excel-parser";

function createTestExcel(rows: (string | number | undefined)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "1차");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

const HEADERS = [
  "보내는분", "보내는분 연락처", "주소 ", "번호", "수취인명",
  "상품명", "수량", "핸드폰", "기타연락처", "주소",
  "배송메세지", "(공란)", "상품고유코드", "배송방식", "운송장번호",
  "택배사", "productOrderId", "batchId",
];

describe("parseTrackingExcel", () => {
  it("parses tracking numbers from column O (index 14)", () => {
    const buffer = createTestExcel([
      HEADERS,
      ["한아원", "010-7701-2732", "주소", 1, "김이슬", "상품", 1, "010-1234-5678",
        undefined, "주소", undefined, undefined, "P00300279", undefined,
        "540729902902", undefined, "2026022473255981", "batch-123"],
    ]);
    const result = parseTrackingExcel(buffer);
    expect(result.batchId).toBe("batch-123");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trackingNumber).toBe("540729902902");
    expect(result.rows[0].productOrderId).toBe("2026022473255981");
    expect(result.rows[0].rowNumber).toBe(1);
  });

  it("parses multiple rows", () => {
    const buffer = createTestExcel([
      HEADERS,
      ["한아원", "010-7701-2732", "주소", 1, "김이슬", "상품", 1, "010-1111-1111",
        undefined, "주소1", undefined, undefined, "P00300279", undefined,
        "111111111111", undefined, "order-1", "batch-123"],
      ["한아원", "010-7701-2732", "주소", 2, "노현석", "상품", 1, "010-2222-2222",
        undefined, "주소2", undefined, undefined, "P00300279", undefined,
        "222222222222", undefined, "order-2", "batch-123"],
    ]);
    const result = parseTrackingExcel(buffer);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].trackingNumber).toBe("111111111111");
    expect(result.rows[1].trackingNumber).toBe("222222222222");
  });

  it("skips rows without tracking number", () => {
    const buffer = createTestExcel([
      HEADERS,
      ["한아원", "010-7701-2732", "주소", 1, "김이슬", "상품", 1, "010-1111-1111",
        undefined, "주소1", undefined, undefined, "P00300279", undefined,
        "111111111111", undefined, "order-1", "batch-123"],
      ["한아원", "010-7701-2732", "주소", 2, "노현석", "상품", 1, "010-2222-2222",
        undefined, "주소2", undefined, undefined, "P00300279", undefined,
        undefined, undefined, "order-2", "batch-123"],
    ]);
    const result = parseTrackingExcel(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].productOrderId).toBe("order-1");
  });

  it("extracts batchId from first data row", () => {
    const buffer = createTestExcel([
      HEADERS,
      ["한아원", "010-7701-2732", "주소", 1, "김이슬", "상품", 1, "010-1111-1111",
        undefined, "주소1", undefined, undefined, "P00300279", undefined,
        "111111111111", undefined, "order-1", "my-batch-id"],
    ]);
    const result = parseTrackingExcel(buffer);
    expect(result.batchId).toBe("my-batch-id");
  });

  it("returns empty rows for headers-only file", () => {
    const buffer = createTestExcel([HEADERS]);
    const result = parseTrackingExcel(buffer);
    expect(result.rows).toHaveLength(0);
    expect(result.batchId).toBeNull();
  });

  it("handles numeric tracking numbers", () => {
    const buffer = createTestExcel([
      HEADERS,
      ["한아원", "010-7701-2732", "주소", 1, "김이슬", "상품", 1, "010-1111-1111",
        undefined, "주소1", undefined, undefined, "P00300279", undefined,
        540729902902, undefined, "order-1", "batch-123"],
    ]);
    const result = parseTrackingExcel(buffer);
    expect(result.rows[0].trackingNumber).toBe("540729902902");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/lib/shipping/__tests__/excel-parser.test.ts
```

Expected: FAIL — 모듈이 아직 없음

- [ ] **Step 3: excel-parser.ts 구현**

```typescript
// src/lib/shipping/excel-parser.ts
import * as XLSX from "xlsx";

export interface ParsedTrackingRow {
  rowNumber: number;
  productOrderId: string;
  trackingNumber: string;
  recipientName?: string;
  recipientPhone?: string;
}

export interface ParsedTrackingResult {
  batchId: string | null;
  rows: ParsedTrackingRow[];
}

export function parseTrackingExcel(buffer: Buffer): ParsedTrackingResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(ws, { header: 1 });

  if (data.length <= 1) {
    return { batchId: null, rows: [] };
  }

  let batchId: string | null = null;
  const rows: ParsedTrackingRow[] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const trackingRaw = row[14]; // O열 (index 14)
    const productOrderId = row[16] ? String(row[16]) : ""; // Q열
    const rowBatchId = row[17] ? String(row[17]) : null; // R열

    if (batchId === null && rowBatchId) {
      batchId = rowBatchId;
    }

    if (!trackingRaw) continue;

    rows.push({
      rowNumber: Number(row[3]) || (i), // D열 (번호) or fallback to row index
      productOrderId,
      trackingNumber: String(trackingRaw),
      recipientName: row[4] ? String(row[4]) : undefined,
      recipientPhone: row[7] ? String(row[7]) : undefined,
    });
  }

  return { batchId, rows };
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
npx vitest run src/lib/shipping/__tests__/excel-parser.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/shipping/excel-parser.ts src/lib/shipping/__tests__/excel-parser.test.ts
git commit -m "feat: add Excel parser for 3PL tracking number upload"
```

---

### Task 5: API Route — 배치 생성 + 발주서 다운로드 (POST) & 배치 목록 (GET)

**Files:**
- Create: `src/app/api/shipping/batch/route.ts`

- [ ] **Step 1: API route 구현**

```typescript
// src/app/api/shipping/batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { z } from "zod";
import { generatePurchaseOrderExcel, type PurchaseOrderInput } from "@/lib/shipping/excel-generator";

const CreateBatchSchema = z.object({
  companyId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()).min(1),
  carrier: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = CreateBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { companyId, orderIds, carrier } = parsed.data;

  // Fetch orders with external order data
  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      companyId,
      externalSource: "NAVER",
    },
    include: {
      items: { include: { product: true } },
      externalOrders: {
        where: { platform: "NAVER" },
        take: 1,
      },
    },
  });

  if (orders.length === 0) {
    return NextResponse.json({ error: "No matching NAVER orders found" }, { status: 404 });
  }

  // Create batch
  const batch = await prisma.shippingBatch.create({
    data: {
      companyId,
      platform: "NAVER",
      carrier: carrier || "CJ대한통운",
      totalOrders: orders.length,
      items: {
        create: orders.map((order, index) => {
          const extOrder = order.externalOrders[0];
          return {
            rowNumber: index + 1,
            orderId: order.id,
            productOrderId: extOrder?.externalOrderId || "",
          };
        }),
      },
    },
    include: { items: true },
  });

  // Build Excel input
  const excelInputs: PurchaseOrderInput[] = orders.map((order, index) => {
    const extOrder = order.externalOrders[0];
    const rawData = extOrder?.rawData as any;
    const product = order.items[0]?.product;

    return {
      recipientName: order.recipientName || rawData?.order?.ordererName || "",
      productName: rawData?.productOrder?.productName || order.items[0]?.product?.name || "",
      quantity: order.items[0]?.quantity || 1,
      recipientPhone: order.recipientPhone || "",
      ordererPhone: rawData?.order?.ordererTel || undefined,
      shippingAddress: order.shippingAddress || "",
      deliveryMessage: rawData?.productOrder?.shippingAddress ? undefined : undefined,
      tplCode: product?.tplCode || undefined,
      productOrderId: extOrder?.externalOrderId || "",
      batchId: batch.id,
    };
  });

  // Fix: extract delivery message from rawData
  for (let i = 0; i < orders.length; i++) {
    const extOrder = orders[i].externalOrders[0];
    if (extOrder) {
      const rawData = extOrder.rawData as any;
      // rawData is NaverOrderDetail: { order, productOrder, delivery }
      // The original Naver export has 배송메세지 but we don't store it directly
      // Check if it's in the raw download data (column index 55 in File 1)
      // For now, deliveryMessage stays undefined unless we add it to sync
    }
  }

  const excelBuffer = generatePurchaseOrderExcel(excelInputs);

  return new NextResponse(excelBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="3PL-PO-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const status = req.nextUrl.searchParams.get("status");

  const where: any = {};
  if (companyId) where.companyId = companyId;
  if (status) where.status = status;

  const batches = await prisma.shippingBatch.findMany({
    where,
    include: {
      items: {
        include: {
          order: {
            select: { orderNumber: true, recipientName: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(batches);
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/shipping/batch/route.ts
git commit -m "feat: add API route for shipping batch creation and listing"
```

---

### Task 6: API Route — 송장 업로드 (POST /api/shipping/upload)

**Files:**
- Create: `src/app/api/shipping/upload/route.ts`

- [ ] **Step 1: API route 구현**

```typescript
// src/app/api/shipping/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { parseTrackingExcel } from "@/lib/shipping/excel-parser";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseTrackingExcel(buffer);

  if (!parsed.batchId) {
    return NextResponse.json(
      { error: "Could not find batch ID in uploaded file" },
      { status: 400 },
    );
  }

  // Verify batch exists
  const batch = await prisma.shippingBatch.findUnique({
    where: { id: parsed.batchId },
    include: { items: true },
  });

  if (!batch) {
    return NextResponse.json(
      { error: `Batch ${parsed.batchId} not found` },
      { status: 404 },
    );
  }

  if (batch.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Batch already completed" },
      { status: 400 },
    );
  }

  // Validate and update tracking numbers
  let updatedCount = 0;
  const errors: string[] = [];

  for (const row of parsed.rows) {
    const item = batch.items.find(
      (i) => i.productOrderId === row.productOrderId,
    );

    if (!item) {
      errors.push(`Row ${row.rowNumber}: productOrderId ${row.productOrderId} not found in batch`);
      continue;
    }

    await prisma.shippingBatchItem.update({
      where: { id: item.id },
      data: { trackingNumber: row.trackingNumber },
    });
    updatedCount++;
  }

  // Update batch status
  await prisma.shippingBatch.update({
    where: { id: batch.id },
    data: { status: "SHIPPED" },
  });

  return NextResponse.json({
    batchId: batch.id,
    updatedCount,
    totalItems: batch.items.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/shipping/upload/route.ts
git commit -m "feat: add API route for tracking number upload"
```

---

### Task 7: API Route — 네이버 업로드 파일 다운로드 (GET /api/shipping/batch/[id]/naver-upload)

**Files:**
- Create: `src/app/api/shipping/batch/[id]/naver-upload/route.ts`

- [ ] **Step 1: API route 구현**

```typescript
// src/app/api/shipping/batch/[id]/naver-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { generateNaverUploadExcel } from "@/lib/shipping/excel-generator";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const batch = await prisma.shippingBatch.findUnique({
    where: { id: params.id },
    include: { items: true },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const itemsWithTracking = batch.items.filter((i) => i.trackingNumber);

  if (itemsWithTracking.length === 0) {
    return NextResponse.json(
      { error: "No tracking numbers found. Upload tracking file first." },
      { status: 400 },
    );
  }

  const excelBuffer = generateNaverUploadExcel(
    itemsWithTracking.map((item) => ({
      productOrderId: item.productOrderId,
      trackingNumber: item.trackingNumber!,
    })),
    batch.carrier,
  );

  // Update batch status to COMPLETED
  await prisma.shippingBatch.update({
    where: { id: batch.id },
    data: { status: "COMPLETED" },
  });

  return new NextResponse(excelBuffer, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": `attachment; filename="naver-upload-${new Date().toISOString().slice(0, 10)}.xls"`,
    },
  });
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/shipping/batch/\[id\]/naver-upload/route.ts
git commit -m "feat: add API route for Naver upload file generation"
```

---

### Task 8: 클라이언트 컴포넌트 (NaverShippingManager.tsx)

**Files:**
- Create: `src/components/shipping/NaverShippingManager.tsx`

- [ ] **Step 1: 컴포넌트 구현**

```tsx
// src/components/shipping/NaverShippingManager.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface NaverOrder {
  id: string;
  orderNumber: string;
  externalOrderNumber: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  orderDate: string;
  totalAmount: number;
  items: { product: { name: string } | null; quantity: number }[];
}

interface ShippingBatch {
  id: string;
  status: "PENDING" | "SHIPPED" | "COMPLETED";
  carrier: string;
  totalOrders: number;
  createdAt: string;
  items: {
    id: string;
    rowNumber: number;
    productOrderId: string;
    trackingNumber: string | null;
    order: { orderNumber: string; recipientName: string | null };
  }[];
}

export function NaverShippingManager({ companyId }: { companyId: string }) {
  const [orders, setOrders] = useState<NaverOrder[]>([]);
  const [batches, setBatches] = useState<ShippingBatch[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchOrders();
    fetchBatches();
  }, [companyId]);

  async function fetchOrders() {
    const res = await fetch(
      `/api/orders?companyId=${companyId}&fulfillmentStatus=UNFULFILLED&externalSource=NAVER`,
    );
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders || data);
    }
  }

  async function fetchBatches() {
    const res = await fetch(`/api/shipping/batch?companyId=${companyId}`);
    if (res.ok) {
      setBatches(await res.json());
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  }

  async function handleCreateBatch() {
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/shipping/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          orderIds: Array.from(selectedIds),
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `3PL-PO-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        setSelectedIds(new Set());
        fetchOrders();
        fetchBatches();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadTracking(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/shipping/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        alert(`송장 ${result.updatedCount}건 업로드 완료`);
        fetchBatches();
      } else {
        const err = await res.json();
        alert(`업로드 실패: ${err.error}`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownloadNaverFile(batchId: string) {
    const res = await fetch(`/api/shipping/batch/${batchId}/naver-upload`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `naver-upload-${new Date().toISOString().slice(0, 10)}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      fetchBatches();
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: "대기",
    SHIPPED: "송장 완료",
    COMPLETED: "발송 완료",
  };

  const statusVariant: Record<string, "default" | "success" | "warning"> = {
    PENDING: "warning",
    SHIPPED: "default",
    COMPLETED: "success",
  };

  return (
    <div className="space-y-6">
      {/* Section 1: 발주서 생성 */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">발송 대기 주문</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {selectedIds.size === orders.length ? "전체 해제" : "전체 선택"}
            </Button>
            <Button
              size="sm"
              onClick={handleCreateBatch}
              disabled={selectedIds.size === 0 || loading}
            >
              {loading ? "생성 중..." : `3PL 발주서 다운로드 (${selectedIds.size})`}
            </Button>
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            발송 대기 중인 네이버 주문이 없습니다.
          </p>
        ) : (
          <div className="space-y-1">
            {orders.map((order) => (
              <label
                key={order.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--surface)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(order.id)}
                  onChange={() => toggleSelect(order.id)}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {order.externalOrderNumber || order.orderNumber}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {order.recipientName}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {order.items.map((i) => `${i.product?.name || "?"} x${i.quantity}`).join(", ")}
                  </p>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  ₩{Number(order.totalAmount).toLocaleString()}
                </span>
              </label>
            ))}
          </div>
        )}
      </Card>

      {/* Section 2: 송장 업로드 */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">송장 업로드</h3>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadTracking}
              className="hidden"
              id="tracking-upload"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "업로드 중..." : "3PL 송장 파일 업로드"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Section 3: 배치 이력 */}
      {batches.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-4">발주 이력</h3>
          <div className="space-y-3">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface)]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                    <Badge variant={statusVariant[batch.status]}>
                      {statusLabel[batch.status]}
                    </Badge>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {batch.totalOrders}건 · {batch.carrier}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {batch.status === "SHIPPED" && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleDownloadNaverFile(batch.id)}
                    >
                      네이버 파일 다운로드
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/shipping/NaverShippingManager.tsx
git commit -m "feat: add NaverShippingManager client component"
```

---

### Task 9: Shipping 페이지

**Files:**
- Create: `src/app/shipping/page.tsx`

- [ ] **Step 1: Orders API가 네이버 필터를 지원하는지 확인**

`src/app/api/orders/route.ts`의 GET handler를 읽어서, `externalSource` 필터 파라미터를 지원하는지 확인. 지원하지 않으면 추가 필요:

```typescript
// Orders API GET에 externalSource 필터 추가 (필요한 경우)
const externalSource = req.nextUrl.searchParams.get("externalSource");
// where 조건에 추가:
if (externalSource) where.externalSource = externalSource;
```

또한 `fulfillmentStatus` 필터도 확인.

- [ ] **Step 2: Shipping 페이지 구현**

```tsx
// src/app/shipping/page.tsx
import { prisma } from "@/lib/prisma";
import { NaverShippingManager } from "@/components/shipping/NaverShippingManager";

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  // Default to HOK company
  let companyId = searchParams.company;
  if (!companyId) {
    const hok = await prisma.company.findFirst({
      where: { name: { contains: "HOK" } },
    });
    companyId = hok?.id;
  }

  if (!companyId) {
    return (
      <div className="p-6">
        <p className="text-[var(--text-secondary)]">회사를 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Shipping</h1>
      <NaverShippingManager companyId={companyId} />
    </div>
  );
}
```

- [ ] **Step 3: 사이드바에 Shipping 링크 추가**

사이드바/네비게이션에 `/shipping` 링크가 없다면 추가. 기존 `/shipping-costs` 링크를 `/shipping`으로 변경하거나, 둘 다 유지.

- [ ] **Step 4: 커밋**

```bash
git add src/app/shipping/page.tsx
git commit -m "feat: add Shipping page with NaverShippingManager"
```

---

### Task 10: Orders API 필터 확장 + 통합 테스트

**Files:**
- Modify: `src/app/api/orders/route.ts` (필요 시)

- [ ] **Step 1: Orders API에 externalSource, fulfillmentStatus 필터 지원 확인/추가**

`src/app/api/orders/route.ts`를 읽고, GET handler에서 `externalSource`와 `fulfillmentStatus` query params를 where 조건에 추가. 이미 있으면 스킵.

- [ ] **Step 2: dev 서버에서 전체 플로우 테스트**

```bash
npm run dev
```

1. http://localhost:4000/shipping 접속
2. 발송 대기 네이버 주문 목록 확인
3. 주문 선택 → "3PL 발주서 다운로드" 클릭 → Excel 파일 확인
4. Excel 파일에 Q열(productOrderId), R열(batchId) 있는지 확인
5. O열에 임의 송장번호 입력
6. "3PL 송장 파일 업로드" 클릭 → 업로드 결과 확인
7. "네이버 파일 다운로드" 클릭 → 시트명 "발송처리" 확인
8. 네이버 파일에 상품주문번호, 배송방법, 택배사, 송장번호 4컬럼 확인

- [ ] **Step 3: 모든 테스트 실행**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 4: ESLint 확인**

```bash
npm run lint
```

Expected: 0 warnings

- [ ] **Step 5: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: complete Naver 3PL shipping integration"
```
