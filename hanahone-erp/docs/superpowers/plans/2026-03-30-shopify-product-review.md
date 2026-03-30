# Shopify Product Review — Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shopify API에서 실제 상품 카탈로그를 가져오고, ERP DB 데이터와 대조하여 SKU 매핑 불일치의 근본 원인을 진단하는 읽기 전용 리포트를 만든다.

**Architecture:** Shopify connector에 `fetchShopifyProducts()` 함수를 추가하고, 진단 API 엔드포인트에서 Shopify 상품 + ERP Products + 주문 rawData의 line_items를 대조하여 불일치 리포트를 JSON으로 반환한다.

**Tech Stack:** Next.js API Route, Prisma, Shopify REST Admin API

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/integrations/connectors/shopify.ts` | (수정) `fetchShopifyProducts()` 함수 추가 — Shopify Products API 호출 |
| `src/app/api/shopify/product-review/route.ts` | (신규) 진단 API — 3소스 대조 리포트 생성 |

---

### Task 1: Shopify connector에 `fetchShopifyProducts()` 추가

**Files:**
- Modify: `src/lib/integrations/connectors/shopify.ts`

- [ ] **Step 1: `ShopifyProduct` 인터페이스와 `fetchShopifyProducts()` 함수 추가**

`shopify.ts` 파일 맨 아래, `shopifyConnector` export 뒤에 추가:

```typescript
export interface ShopifyProduct {
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

export async function fetchShopifyProducts(
  credentials: ShopifyCredentials,
): Promise<ShopifyProduct[]> {
  const shop = credentials.shop || credentials.storeUrl;
  if (!shop) throw new Error("Missing shop URL");

  const token = await getAccessToken({ ...credentials, shop });
  const baseUrl = `https://${shop}/admin/api/2024-01`;
  const headers = {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  };

  const products: ShopifyProduct[] = [];
  let url: string | null = `${baseUrl}/products.json?limit=250`;

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Shopify Products API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();

    for (const p of data.products || []) {
      products.push({
        id: p.id,
        title: p.title,
        status: p.status,
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          sku: v.sku || "",
          price: v.price,
          compareAtPrice: v.compare_at_price,
        })),
      });
    }

    const linkHeader = res.headers.get("Link");
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return products;
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

Run: `cd /Users/admin/Desktop/claude/claude_2/hanahone-erp && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음 (또는 기존 에러만)

- [ ] **Step 3: Commit**

```bash
git add src/lib/integrations/connectors/shopify.ts
git commit -m "feat: add fetchShopifyProducts() to Shopify connector"
```

---

### Task 2: 진단 API 엔드포인트 생성

**Files:**
- Create: `src/app/api/shopify/product-review/route.ts`

- [ ] **Step 1: 진단 API 라우트 파일 생성**

```typescript
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchShopifyProducts } from "@/lib/integrations/connectors/shopify";
import type { ShopifyProduct } from "@/lib/integrations/connectors/shopify";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  // 1. HOI의 Shopify integration config 가져오기
  const config = await prisma.integrationConfig.findFirst({
    where: {
      platform: "SHOPIFY",
      isActive: true,
    },
    include: { company: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active Shopify integration found" },
      { status: 404 },
    );
  }

  const companyId = config.companyId;
  const credentials = JSON.parse(decrypt(config.credentials));

  // 2. Shopify 실제 상품 가져오기
  let shopifyProducts: ShopifyProduct[] = [];
  let shopifyError: string | null = null;
  try {
    shopifyProducts = await fetchShopifyProducts(credentials);
  } catch (err) {
    shopifyError = (err as Error).message;
  }

  // 3. ERP Products 조회
  const erpProducts = await prisma.product.findMany({
    where: { companyId },
    select: { id: true, name: true, sku: true, basePrice: true, costPrice: true },
  });

  // 4. ExternalOrders rawData에서 line_items SKU 추출
  const externalOrders = await prisma.externalOrder.findMany({
    where: { companyId, platform: "SHOPIFY" },
    select: { rawData: true },
  });

  // SKU별 집계
  const skuStats = new Map<
    string,
    { productName: string; names: Set<string>; count: number; prices: number[] }
  >();

  for (const eo of externalOrders) {
    const raw = eo.rawData as any;
    for (const item of raw.line_items || []) {
      const sku = item.sku || "(empty)";
      const existing = skuStats.get(sku);
      const price = parseFloat(item.price);
      if (existing) {
        existing.names.add(item.title);
        existing.count += item.quantity;
        existing.prices.push(price);
      } else {
        skuStats.set(sku, {
          productName: item.title,
          names: new Set([item.title]),
          count: item.quantity,
          prices: [price],
        });
      }
    }
  }

  // 5. 대조 리포트 생성
  const erpSkuMap = new Map(erpProducts.map((p) => [p.sku, p]));

  const orderSkuUsage = Array.from(skuStats.entries()).map(([sku, stats]) => {
    const matched = erpSkuMap.get(sku);
    return {
      sku,
      productName: stats.productName,
      orderCount: stats.count,
      priceRange: {
        min: Math.min(...stats.prices),
        max: Math.max(...stats.prices),
      },
      matchedErpProduct: matched ? matched.name : null,
      matchedErpBasePrice: matched ? Number(matched.basePrice) : null,
    };
  });

  const droppedItems = orderSkuUsage
    .filter((item) => item.matchedErpProduct === null)
    .map(({ sku, productName, orderCount }) => ({ sku, productName, count: orderCount }));

  const nameConflicts = Array.from(skuStats.entries())
    .filter(([, stats]) => stats.names.size > 1)
    .map(([sku, stats]) => ({ sku, names: Array.from(stats.names) }));

  return NextResponse.json({
    companyName: config.company.name,
    shopifyError,
    shopifyProducts: shopifyProducts.map((p) => ({
      title: p.title,
      status: p.status,
      variants: p.variants.map((v) => ({
        title: v.title,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
      })),
    })),
    erpProducts: erpProducts.map((p) => ({
      name: p.name,
      sku: p.sku,
      basePrice: Number(p.basePrice),
      costPrice: Number(p.costPrice),
    })),
    orderSkuUsage,
    droppedItems,
    nameConflicts,
    summary: {
      totalShopifyProducts: shopifyProducts.length,
      totalShopifyVariants: shopifyProducts.reduce((sum, p) => sum + p.variants.length, 0),
      totalErpProducts: erpProducts.length,
      totalOrderSkus: skuStats.size,
      totalDroppedSkus: droppedItems.length,
      totalNameConflicts: nameConflicts.length,
      totalExternalOrders: externalOrders.length,
    },
  });
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

Run: `cd /Users/admin/Desktop/claude/claude_2/hanahone-erp && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/app/api/shopify/product-review/route.ts
git commit -m "feat: add Shopify product review diagnostic API"
```

---

### Task 3: 진단 실행 및 결과 확인

- [ ] **Step 1: dev 서버 실행 확인**

Run: `cd /Users/admin/Desktop/claude/claude_2/hanahone-erp && npm run dev`
(이미 실행 중이면 스킵)

- [ ] **Step 2: 진단 API 호출**

Run: `curl -s http://localhost:3000/api/shopify/product-review -H "Cookie: $(cat .dev-cookie 2>/dev/null || echo '')" | jq .`

쿠키가 없으면 브라우저에서 `http://localhost:3000/api/shopify/product-review` 직접 접속.

- [ ] **Step 3: 결과 분석**

리포트에서 확인할 사항:
1. `shopifyProducts` — Shopify에 실제 등록된 상품/variant/SKU/가격
2. `erpProducts` — ERP에 등록된 HOI 상품 (현재 2개: Omega-3, Vitamin D3)
3. `orderSkuUsage` — 실제 주문에서 사용된 SKU별 통계, ERP 매칭 여부
4. `droppedItems` — SKU 매칭 실패로 드롭된 아이템 (이것이 핵심 문제)
5. `nameConflicts` — 같은 SKU인데 다른 이름으로 들어온 케이스
6. `summary` — 전체 요약 숫자

이 결과를 바탕으로 다음 단계 (수정안) 설계를 진행한다.
