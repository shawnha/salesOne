# Shopify Product Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product 모델에 salePrice 컬럼을 추가하고, HOI Shopify 상품 데이터를 정리한다 (이름, 가격 수정 + 중복 삭제).

**Architecture:** Prisma migration으로 salePrice 컬럼 추가 → API/UI에 salePrice 반영 → data migration 스크립트로 기존 상품 수정 및 중복 삭제.

**Tech Stack:** Prisma, Next.js API Routes, React (products-table, product-actions)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | (수정) Product 모델에 salePrice 추가 |
| `src/app/api/products/route.ts` | (수정) POST에 salePrice 지원 |
| `src/components/products/products-table.tsx` | (수정) salePrice 컬럼 표시 |
| `src/components/products/product-actions.tsx` | (수정) salePrice 편집 필드 추가 |
| `prisma/seed.ts` | (수정) seed 데이터에 salePrice 추가 |
| `scripts/fix-shopify-products.ts` | (신규) 데이터 마이그레이션 스크립트 |

---

### Task 1: Product 모델에 salePrice 컬럼 추가

**Files:**
- Modify: `prisma/schema.prisma:217-243`

- [ ] **Step 1: schema.prisma에 salePrice 필드 추가**

`prisma/schema.prisma`의 Product 모델에서 `costPrice` 줄 아래에 추가:

```prisma
  salePrice   Decimal? @map("sale_price")
```

수정 후 Product 모델:
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

- [ ] **Step 2: Prisma migration 생성 및 실행**

Run: `cd /Users/admin/Desktop/claude/claude_2/hanahone-erp && npx prisma migrate dev --name add-sale-price`
Expected: Migration 성공, `sale_price` 컬럼 추가됨

- [ ] **Step 3: Prisma Client 재생성 확인**

Run: `npx prisma generate`
Expected: 성공

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add salePrice column to Product model"
```

---

### Task 2: Products API에 salePrice 지원 추가

**Files:**
- Modify: `src/app/api/products/route.ts:21-37`

- [ ] **Step 1: POST handler에 salePrice 추가**

`src/app/api/products/route.ts`의 POST 함수에서 body destructuring과 create data에 salePrice 추가:

변경 전:
```typescript
  const { name, sku, description, category, basePrice, costPrice, companyId } = body;
```

변경 후:
```typescript
  const { name, sku, description, category, basePrice, costPrice, salePrice, companyId } = body;
```

변경 전:
```typescript
    data: { name, sku, description, category, basePrice: basePrice || 0, costPrice: costPrice || 0, companyId },
```

변경 후:
```typescript
    data: { name, sku, description, category, basePrice: basePrice || 0, costPrice: costPrice || 0, salePrice: salePrice || null, companyId },
```

- [ ] **Step 2: TypeScript 빌드 확인**

Run: `cd /Users/admin/Desktop/claude/claude_2/hanahone-erp && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 새 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/app/api/products/route.ts
git commit -m "feat: support salePrice in products API"
```

---

### Task 3: Products 테이블에 salePrice 표시

**Files:**
- Modify: `src/components/products/products-table.tsx`

- [ ] **Step 1: ProductRow 타입에 salePrice 추가**

`products-table.tsx`의 ProductRow 인터페이스에서 `basePrice` 아래에 추가:

```typescript
  salePrice: number | null;
```

- [ ] **Step 2: 테이블 헤더에 Sale Price 컬럼 추가**

기존 "Base Price" 헤더 옆에 "Sale Price" 컬럼 추가.

- [ ] **Step 3: 테이블 행에 salePrice 값 표시**

기존 basePrice 셀 옆에 salePrice 셀 추가. null이면 "-" 표시:

```tsx
<td className="py-3 px-4 text-right">
  {row.salePrice != null ? formatPrice(row.salePrice, row.companyName) : "-"}
</td>
```

- [ ] **Step 4: 브라우저에서 Products 페이지 확인**

`http://localhost:4000/products`에서 Sale Price 컬럼이 보이는지 확인.

- [ ] **Step 5: Commit**

```bash
git add src/components/products/products-table.tsx
git commit -m "feat: show salePrice in products table"
```

---

### Task 4: Product 편집 폼에 salePrice 필드 추가

**Files:**
- Modify: `src/components/products/product-actions.tsx`

- [ ] **Step 1: Product 타입에 salePrice 추가**

`product-actions.tsx`의 product prop 타입에 추가:

```typescript
  salePrice: number | null;
```

- [ ] **Step 2: salePrice state 추가**

기존 basePrice state 아래에:

```typescript
const [salePrice, setSalePrice] = useState(product.salePrice != null ? String(product.salePrice) : "");
```

- [ ] **Step 3: handleSave에 salePrice 포함**

PUT 요청 body에 추가:

```typescript
salePrice: salePrice ? parseFloat(salePrice) : null,
```

- [ ] **Step 4: 폼에 Sale Price 입력 필드 추가**

기존 Base Price Input 옆에:

```tsx
<Input label="Sale Price" type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="할인가 (없으면 비워두기)" />
```

- [ ] **Step 5: 브라우저에서 상품 편집 확인**

Products 페이지에서 상품 편집 시 Sale Price 필드가 보이고, 저장이 되는지 확인.

- [ ] **Step 6: Commit**

```bash
git add src/components/products/product-actions.tsx
git commit -m "feat: add salePrice field to product edit form"
```

---

### Task 5: 데이터 마이그레이션 — 상품 정리

**Files:**
- Create: `scripts/fix-shopify-products.ts`

- [ ] **Step 1: 마이그레이션 스크립트 생성**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. HOI 회사 찾기
  const hoi = await prisma.company.findFirst({ where: { name: "HOI" } });
  if (!hoi) throw new Error("HOI company not found");

  console.log(`HOI company: ${hoi.id}`);

  // 2. 기존 상품 조회
  const products = await prisma.product.findMany({ where: { companyId: hoi.id } });
  console.log(`Found ${products.length} HOI products:`);
  for (const p of products) {
    console.log(`  - ${p.name} (SKU: ${p.sku}, base: ${p.basePrice}, cost: ${p.costPrice})`);
  }

  // 3. 원본 상품 업데이트 (이름, basePrice, salePrice)
  const updates = [
    { sku: "8800316050001", name: "5 Bottle Pack", basePrice: 49, salePrice: 29 },
    { sku: "XG-MNLD-D8SM", name: "30 Bottle Pack", basePrice: 159, salePrice: 129 },
    { sku: "8800316050018", name: "Monthly Subscription", basePrice: 129, salePrice: 109 },
  ];

  for (const upd of updates) {
    const product = products.find((p) => p.sku === upd.sku);
    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: { name: upd.name, basePrice: upd.basePrice, salePrice: upd.salePrice },
      });
      console.log(`✓ Updated ${upd.sku}: name="${upd.name}", base=$${upd.basePrice}, sale=$${upd.salePrice}`);
    } else {
      console.log(`✗ SKU ${upd.sku} not found — skipping`);
    }
  }

  // 4. -SH 중복 상품 삭제 (merge into 원본)
  const shProducts = [
    { shSku: "8800316050001-SH", originalSku: "8800316050001" },
    { shSku: "XG-MNLD-D8SM-SH", originalSku: "XG-MNLD-D8SM" },
  ];

  for (const { shSku, originalSku } of shProducts) {
    const shProduct = products.find((p) => p.sku === shSku);
    const original = products.find((p) => p.sku === originalSku);

    if (!shProduct) {
      console.log(`✗ ${shSku} not found — already deleted?`);
      continue;
    }
    if (!original) {
      console.log(`✗ Original ${originalSku} not found — cannot merge`);
      continue;
    }

    // Check dependencies
    const [orderItems, productionOrders, inventory, snapshots, skuMappings] = await Promise.all([
      prisma.orderItem.count({ where: { productId: shProduct.id } }),
      prisma.productionOrder.count({ where: { productId: shProduct.id } }),
      prisma.inventory.count({ where: { productId: shProduct.id } }),
      prisma.inventorySnapshot.count({ where: { productId: shProduct.id } }),
      prisma.skuMapping.count({ where: { productId: shProduct.id } }),
    ]);

    console.log(`\n${shSku} dependencies: ${orderItems} orderItems, ${productionOrders} prodOrders, ${inventory} inventory, ${snapshots} snapshots, ${skuMappings} skuMappings`);

    // Merge: reassign linked records to original, then delete
    await prisma.$transaction([
      ...(orderItems > 0 ? [prisma.orderItem.updateMany({ where: { productId: shProduct.id }, data: { productId: original.id } })] : []),
      ...(productionOrders > 0 ? [prisma.productionOrder.updateMany({ where: { productId: shProduct.id }, data: { productId: original.id } })] : []),
      prisma.inventory.deleteMany({ where: { productId: shProduct.id } }),
      prisma.inventorySnapshot.deleteMany({ where: { productId: shProduct.id } }),
      prisma.skuMapping.deleteMany({ where: { productId: shProduct.id } }),
      prisma.product.delete({ where: { id: shProduct.id } }),
    ]);
    console.log(`✓ Deleted ${shSku}, merged ${orderItems} orderItems into ${originalSku}`);
  }

  // 5. 오타 SKU 수정: ExternalOrder rawData에서 a8800316050018 → 8800316050018
  // 이건 rawData(JSON) 안의 line_items.sku이므로 SQL로 직접 수정
  const typoOrders = await prisma.externalOrder.findMany({
    where: {
      platform: "SHOPIFY",
      companyId: hoi.id,
    },
    select: { id: true, rawData: true },
  });

  let typoFixed = 0;
  for (const eo of typoOrders) {
    const raw = eo.rawData as any;
    let changed = false;
    for (const item of raw.line_items || []) {
      if (item.sku === "a8800316050018") {
        item.sku = "8800316050018";
        changed = true;
      }
    }
    if (changed) {
      await prisma.externalOrder.update({
        where: { id: eo.id },
        data: { rawData: raw },
      });
      typoFixed++;
    }
  }
  console.log(`\n✓ Fixed ${typoFixed} orders with typo SKU a8800316050018`);

  // 6. 최종 상태 확인
  const finalProducts = await prisma.product.findMany({
    where: { companyId: hoi.id },
    orderBy: { sku: "asc" },
  });
  console.log(`\nFinal HOI products (${finalProducts.length}):`);
  for (const p of finalProducts) {
    console.log(`  - ${p.name} | SKU: ${p.sku} | base: $${p.basePrice} | sale: ${p.salePrice ? "$" + p.salePrice : "null"} | cost: $${p.costPrice}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 스크립트 실행**

Run: `cd /Users/admin/Desktop/claude/claude_2/hanahone-erp && npx tsx scripts/fix-shopify-products.ts`
Expected: 3개 상품 업데이트, 2개 삭제, 1개 오타 수정 로그 출력

- [ ] **Step 3: 진단 API로 결과 검증**

브라우저에서 `http://localhost:4000/api/shopify/product-review` 확인:
- `erpProducts`에 3개만 남아야 함 (5 Bottle Pack, 30 Bottle Pack, Monthly Subscription)
- `-SH` 상품 없어야 함
- `droppedItems`가 0이어야 함 (오타 수정으로)

- [ ] **Step 4: Commit**

```bash
git add scripts/fix-shopify-products.ts
git commit -m "fix: clean up HOI Shopify products — names, prices, remove duplicates"
```

---

### Task 6: seed 데이터 업데이트

**Files:**
- Modify: `prisma/seed.ts:91-96`

- [ ] **Step 1: HOI seed 상품을 Shopify 실제 상품으로 교체**

`prisma/seed.ts`에서 기존 HOI 상품 2개 (omega3Hoi, vitD3Hoi)를 Shopify 실제 상품 3개로 교체:

변경 전:
```typescript
  const omega3Hoi = await prisma.product.create({
    data: { name: "Omega-3 Fish Oil 1000mg", sku: "OMEGA3-1000", category: "Fish Oil", basePrice: 35000, costPrice: 18000, companyId: hoi.id },
  });
  const vitD3Hoi = await prisma.product.create({
    data: { name: "Vitamin D3 5000IU", sku: "VITD3-5000", category: "Vitamins", basePrice: 22000, costPrice: 10000, companyId: hoi.id },
  });
```

변경 후:
```typescript
  const starterKit = await prisma.product.create({
    data: { name: "5 Bottle Pack", sku: "8800316050001", category: "Shopify", basePrice: 49, costPrice: 0, salePrice: 29, companyId: hoi.id },
  });
  const monthlyPack = await prisma.product.create({
    data: { name: "30 Bottle Pack", sku: "XG-MNLD-D8SM", category: "Shopify", basePrice: 159, costPrice: 0, salePrice: 129, companyId: hoi.id },
  });
  const subscription = await prisma.product.create({
    data: { name: "Monthly Subscription", sku: "8800316050018", category: "Shopify", basePrice: 129, costPrice: 0, salePrice: 109, companyId: hoi.id },
  });
```

- [ ] **Step 2: Inventory seed에서 HOI 참조 업데이트**

변경 전:
```typescript
      { productId: omega3Hoi.id, companyId: hoi.id, quantity: 127, warehouseLocation: "HOI-Main", reorderLevel: 500 },
      { productId: vitD3Hoi.id, companyId: hoi.id, quantity: 84, warehouseLocation: "HOI-Main", reorderLevel: 300 },
```

변경 후:
```typescript
      { productId: starterKit.id, companyId: hoi.id, quantity: 659, warehouseLocation: "HOI-Main", reorderLevel: 100 },
      { productId: monthlyPack.id, companyId: hoi.id, quantity: 248, warehouseLocation: "HOI-Main", reorderLevel: 100 },
      { productId: subscription.id, companyId: hoi.id, quantity: 248, warehouseLocation: "HOI-Main", reorderLevel: 100 },
```

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix: update HOI seed products to match Shopify catalog"
```
