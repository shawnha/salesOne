# Naver Smartstore Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Naver Smartstore 커머스 API를 통해 HOK 주문/상품/재고를 ERP로 Pull 동기화

**Architecture:** 기존 Connector 인터페이스 + sync-runner 패턴을 재사용하되, Naver 커넥터만 별도 모듈(`src/lib/integrations/naver/`)로 분리. bcrypt 기반 인증, 24시간 분할 주문 조회, ExternalInventory 전용 재고 저장.

**Tech Stack:** Next.js 15, Prisma, bcryptjs, Vercel Cron

**Spec:** `docs/superpowers/specs/2026-03-29-naver-smartstore-integration-design.md`

---

### Task 1: Add bcryptjs dependency and DB migration

**Files:**
- Modify: `package.json`
- Modify: `prisma/schema.prisma:264-303`

- [ ] **Step 1: Install bcryptjs**

```bash
npm install bcryptjs && npm install -D @types/bcryptjs
```

- [ ] **Step 2: Add shipping fields to Order model**

In `prisma/schema.prisma`, add three fields to the Order model after `notes`:

```prisma
  notes                 String?
  shippingAddress       String?   @map("shipping_address")
  recipientName         String?   @map("recipient_name")
  recipientPhone        String?   @map("recipient_phone")
```

- [ ] **Step 3: Generate and apply migration**

```bash
npx prisma migrate dev --name add-order-shipping-fields
```

Expected: Migration creates `shipping_address`, `recipient_name`, `recipient_phone` nullable columns on `salesone.orders`.

- [ ] **Step 4: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json prisma/schema.prisma prisma/migrations/
git commit -m "feat: add bcryptjs dep + Order shipping fields migration"
```

---

### Task 2: Naver API types (naver/types.ts)

**Files:**
- Create: `src/lib/integrations/naver/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/lib/integrations/naver/types.ts

export interface NaverCredentials {
  clientId: string;
  clientSecret: string; // bcrypt salt format: $2a$04$...
}

export interface NaverTokenResponse {
  access_token: string;
  expires_in: number;  // 10800 (3 hours)
  token_type: string;  // "Bearer"
}

export interface NaverProductOrder {
  productOrderId: string;
  orderId: string;
  orderDate: string;
  paymentDate: string;
  productOrderStatus: string;
  totalPaymentAmount: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  sellerProductCode: string;
  ordererName: string;
  ordererTel?: string;
  shippingAddress?: {
    name: string;
    tel1: string;
    baseAddress: string;
    detailAddress: string;
    zipCode: string;
  };
  claimType?: string;    // CANCEL, RETURN, EXCHANGE
  claimStatus?: string;
  claimPrice?: number;
}

export interface NaverLastChangedStatusesResponse {
  data: {
    lastChangeStatuses: Array<{
      productOrderId: string;
      orderId: string;
      lastChangedDate: string;
      lastChangedType: string;
    }>;
  };
}

export interface NaverProductOrdersResponse {
  data: NaverProductOrder[];
}

export interface NaverProduct {
  originProductNo: number;
  name: string;
  salePrice: number;
  stockQuantity: number;
  sellerManagementCode?: string;
  channelProducts?: Array<{
    channelProductNo: number;
    name: string;
    statusType: string;
  }>;
}

export interface NaverProductsResponse {
  contents: NaverProduct[];
  totalElements: number;
  totalPages: number;
  size: number;
  page: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/integrations/naver/types.ts
git commit -m "feat: add Naver Commerce API type definitions"
```

---

### Task 3: Authentication module (naver/auth.ts)

**Files:**
- Create: `src/lib/integrations/naver/auth.ts`

- [ ] **Step 1: Create auth module**

```typescript
// src/lib/integrations/naver/auth.ts
import bcrypt from "bcryptjs";
import type { NaverCredentials, NaverTokenResponse } from "./types";

const NAVER_API_BASE = "https://api.commerce.naver.com/external";
const TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function generateClientSecretSign(
  clientId: string,
  clientSecret: string,
  timestamp: number,
): string {
  const password = `${clientId}_${timestamp}`;
  const hashed = bcrypt.hashSync(password, clientSecret);
  return Buffer.from(hashed).toString("base64");
}

export async function getAccessToken(
  credentials: NaverCredentials,
): Promise<string> {
  const { clientId, clientSecret } = credentials;

  const cacheKey = clientId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
    return cached.token;
  }

  const timestamp = Date.now();
  const clientSecretSign = generateClientSecretSign(
    clientId,
    clientSecret,
    timestamp,
  );

  const res = await fetch(`${NAVER_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      timestamp: String(timestamp),
      client_secret_sign: clientSecretSign,
      grant_type: "client_credentials",
      type: "SELF",
    }),
  });

  if (!res.ok) {
    throw new Error(`Naver token request failed: ${res.status}`);
  }

  const data: NaverTokenResponse = await res.json();

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

export async function naverFetch(
  credentials: NaverCredentials,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(credentials);

  const res = await fetch(`${NAVER_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Retry on 429
  if (res.status === 429) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise((r) => setTimeout(r, attempt * 1500));
      const retry = await fetch(`${NAVER_API_BASE}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (retry.status !== 429) return retry;
    }
    throw new Error(`Naver API rate limited after 3 retries: ${path}`);
  }

  return res;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/integrations/naver/auth.ts
git commit -m "feat: Naver bcrypt-based auth + token caching + 429 retry"
```

---

### Task 4: Order sync module (naver/orders.ts)

**Files:**
- Create: `src/lib/integrations/naver/orders.ts`

- [ ] **Step 1: Create order status mapping**

```typescript
// src/lib/integrations/naver/orders.ts
import type { NaverCredentials, NaverProductOrder } from "./types";
import type { ExternalOrderData } from "../types";
import { naverFetch } from "./auth";

const STATUS_MAP: Record<string, { fulfillment: string; financial: string }> = {
  PAYMENT_WAITING:  { fulfillment: "UNFULFILLED",          financial: "PENDING" },
  PAYED:            { fulfillment: "UNFULFILLED",          financial: "PAID" },
  DELIVERING:       { fulfillment: "PARTIALLY_FULFILLED",  financial: "PAID" },
  DELIVERED:        { fulfillment: "FULFILLED",            financial: "PAID" },
  PURCHASE_DECIDED: { fulfillment: "DELIVERED",            financial: "PAID" },
  EXCHANGED:        { fulfillment: "FULFILLED",            financial: "PARTIALLY_REFUNDED" },
  CANCELED:         { fulfillment: "CANCELLED",            financial: "VOIDED" },
  RETURNED:         { fulfillment: "CANCELLED",            financial: "REFUNDED" },
};

export function mapNaverStatus(status: string): { fulfillment: string; financial: string } {
  return STATUS_MAP[status] || { fulfillment: "UNFULFILLED", financial: "PENDING" };
}
```

- [ ] **Step 2: Add 24-hour time window splitter**

Append to `orders.ts`:

```typescript
function splitInto24HourWindows(from: Date, to: Date): Array<{ from: Date; to: Date }> {
  const windows: Array<{ from: Date; to: Date }> = [];
  const MS_24H = 24 * 60 * 60 * 1000;
  let current = from.getTime();
  const end = to.getTime();

  while (current < end) {
    const windowEnd = Math.min(current + MS_24H, end);
    windows.push({ from: new Date(current), to: new Date(windowEnd) });
    current = windowEnd;
  }

  return windows;
}
```

- [ ] **Step 3: Add fetchChangedOrderIds**

Append to `orders.ts`:

```typescript
async function fetchChangedOrderIds(
  credentials: NaverCredentials,
  from: Date,
  to: Date,
): Promise<string[]> {
  const res = await naverFetch(credentials, "/v1/pay-order/seller/orders/last-changed-statuses", {
    method: "POST",
    body: JSON.stringify({
      lastChangedFrom: from.toISOString(),
      lastChangedTo: to.toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Naver order status fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const statuses = data?.data?.lastChangeStatuses || [];
  return [...new Set(statuses.map((s: any) => s.productOrderId))];
}
```

- [ ] **Step 4: Add fetchOrderDetails (300-item batch)**

Append to `orders.ts`:

```typescript
async function fetchOrderDetails(
  credentials: NaverCredentials,
  productOrderIds: string[],
): Promise<NaverProductOrder[]> {
  const results: NaverProductOrder[] = [];
  const BATCH_SIZE = 300;

  for (let i = 0; i < productOrderIds.length; i += BATCH_SIZE) {
    const batch = productOrderIds.slice(i, i + BATCH_SIZE);
    const res = await naverFetch(credentials, "/v1/pay-order/seller/product-orders/query", {
      method: "POST",
      body: JSON.stringify({ productOrderIds: batch }),
    });

    if (!res.ok) {
      throw new Error(`Naver order detail fetch failed: ${res.status}`);
    }

    const data = await res.json();
    results.push(...(data?.data || []));
  }

  return results;
}
```

- [ ] **Step 5: Add main fetchOrders function**

Append to `orders.ts`:

```typescript
export async function fetchNaverOrders(
  credentials: NaverCredentials,
  since: Date | null,
): Promise<ExternalOrderData[]> {
  const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Split into 24-hour windows
  const windows = splitInto24HourWindows(sinceDate, now);

  // Collect all changed productOrderIds
  const allIds: string[] = [];
  for (const window of windows) {
    const ids = await fetchChangedOrderIds(credentials, window.from, window.to);
    allIds.push(...ids);
  }

  if (allIds.length === 0) return [];

  // Deduplicate
  const uniqueIds = [...new Set(allIds)];

  // Fetch details in batches of 300
  const orders = await fetchOrderDetails(credentials, uniqueIds);

  // Map to ExternalOrderData
  return orders.map((order) => {
    const { fulfillment, financial } = mapNaverStatus(order.productOrderStatus);
    const refundAmount = order.claimPrice || 0;

    return {
      externalOrderId: order.productOrderId,
      externalOrderNumber: order.orderId,
      rawData: order,
      orderDate: new Date(order.orderDate || order.paymentDate),
      fulfillmentStatus: fulfillment,
      financialStatus: financial,
      totalAmount: order.totalPaymentAmount || 0,
      refundAmount: refundAmount > 0 ? refundAmount : undefined,
      customerName: order.ordererName,
      shippingAddress: order.shippingAddress
        ? [order.shippingAddress.baseAddress, order.shippingAddress.detailAddress].filter(Boolean).join(" ")
        : undefined,
      recipientName: order.shippingAddress?.name,
      recipientPhone: order.shippingAddress?.tel1,
      items: [{
        externalItemId: order.productOrderId,
        productName: order.productName || "",
        sku: order.sellerProductCode || "",
        quantity: order.quantity || 1,
        unitPrice: order.unitPrice || order.totalPaymentAmount || 0,
      }],
    };
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/naver/orders.ts
git commit -m "feat: Naver order sync — status mapping, 24h splitting, batch detail fetch"
```

---

### Task 5: Update ExternalOrderData interface for shipping fields

**Files:**
- Modify: `src/lib/integrations/types.ts`
- Modify: `src/lib/integrations/mappers/order-mapper.ts`

- [ ] **Step 1: Add shipping fields to ExternalOrderData**

In `src/lib/integrations/types.ts`, add after `customerEmail?`:

```typescript
  customerEmail?: string;
  shippingAddress?: string;
  recipientName?: string;
  recipientPhone?: string;
```

- [ ] **Step 2: Update order-mapper to pass shipping fields**

In `src/lib/integrations/mappers/order-mapper.ts`, update the `tx.order.create` call inside `mapExternalOrder` to include:

```typescript
        shippingAddress: extOrder.shippingAddress || null,
        recipientName: extOrder.recipientName || null,
        recipientPhone: extOrder.recipientPhone || null,
```

Add these three lines after the `notes` field (around line 120).

- [ ] **Step 3: Commit**

```bash
git add src/lib/integrations/types.ts src/lib/integrations/mappers/order-mapper.ts
git commit -m "feat: add shipping fields to ExternalOrderData and order mapper"
```

---

### Task 6: Product/inventory sync module (naver/products.ts)

**Files:**
- Create: `src/lib/integrations/naver/products.ts`

- [ ] **Step 1: Create products module**

```typescript
// src/lib/integrations/naver/products.ts
import type { NaverCredentials, NaverProduct } from "./types";
import type { ExternalInventoryData } from "../types";
import { naverFetch } from "./auth";

export async function fetchNaverInventory(
  credentials: NaverCredentials,
): Promise<ExternalInventoryData[]> {
  const results: ExternalInventoryData[] = [];
  let page = 0;
  const PAGE_SIZE = 100;
  let hasMore = true;

  while (hasMore) {
    const res = await naverFetch(
      credentials,
      `/v2/products?page=${page}&size=${PAGE_SIZE}`,
    );

    if (!res.ok) {
      throw new Error(`Naver products fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const products: NaverProduct[] = data?.contents || [];

    for (const product of products) {
      results.push({
        sku: product.sellerManagementCode || String(product.originProductNo),
        productName: product.name,
        quantity: product.stockQuantity || 0,
      });
    }

    hasMore = products.length === PAGE_SIZE;
    page++;

    // Safety: max 100 pages (10,000 products)
    if (page >= 100) break;
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/integrations/naver/products.ts
git commit -m "feat: Naver product/inventory sync with pagination"
```

---

### Task 7: Connector integration (naver/index.ts)

**Files:**
- Create: `src/lib/integrations/naver/index.ts`
- Delete: `src/lib/integrations/connectors/naver.ts`
- Modify: `src/app/api/sync/[platform]/route.ts`

- [ ] **Step 1: Create naver/index.ts with Connector + ExternalInventory upsert**

```typescript
// src/lib/integrations/naver/index.ts
import type { Connector, ExternalOrderData } from "../types";
import type { NaverCredentials } from "./types";
import { fetchNaverOrders } from "./orders";
import { fetchNaverInventory } from "./products";
import { prisma } from "@/lib/prisma";

async function syncNaverInventory(
  credentials: NaverCredentials,
  companyId: string,
): Promise<void> {
  const inventoryData = await fetchNaverInventory(credentials);
  const now = new Date();

  for (const item of inventoryData) {
    await prisma.externalInventory.upsert({
      where: {
        companyId_platform_externalSku: {
          companyId,
          platform: "NAVER",
          externalSku: item.sku,
        },
      },
      update: {
        externalName: item.productName,
        quantity: item.quantity,
        lastSyncAt: now,
      },
      create: {
        companyId,
        platform: "NAVER",
        externalSku: item.sku,
        externalName: item.productName,
        quantity: item.quantity,
        lastSyncAt: now,
      },
    });
  }
}

export const naverConnector: Connector & {
  syncInventory: (credentials: NaverCredentials, companyId: string) => Promise<void>;
} = {
  platform: "NAVER",

  async fetchOrders(
    credentials: NaverCredentials,
    since: Date | null,
  ): Promise<ExternalOrderData[]> {
    return fetchNaverOrders(credentials, since);
  },

  // fetchInventory is NOT implemented — Naver inventory goes to ExternalInventory only,
  // not to the Inventory table. Use syncInventory() separately.

  syncInventory: syncNaverInventory,
};
```

- [ ] **Step 2: Delete old connector**

```bash
rm src/lib/integrations/connectors/naver.ts
```

- [ ] **Step 3: Update sync/[platform]/route.ts import**

In `src/app/api/sync/[platform]/route.ts`, change line 8:

```typescript
// Before:
import { naverConnector } from "@/lib/integrations/connectors/naver";
// After:
import { naverConnector } from "@/lib/integrations/naver";
```

- [ ] **Step 4: Add inventory sync call after order sync in route**

In `src/app/api/sync/[platform]/route.ts`, after `const result = await runSync(connector, companyId);` and before the HOK inventory recalculation, add Naver inventory sync:

```typescript
  const result = await runSync(connector, companyId);

  // Naver: sync ExternalInventory separately (not via Connector.fetchInventory)
  if (platform === "NAVER") {
    try {
      const config = await prisma.integrationConfig.findUnique({
        where: { companyId_platform: { companyId, platform: "NAVER" } },
      });
      if (config) {
        const { decrypt } = await import("@/lib/integrations/encryption");
        const credentials = JSON.parse(decrypt(config.credentials));
        await naverConnector.syncInventory(credentials, companyId);
      }
    } catch (err) {
      // Non-fatal: inventory sync failure doesn't block order sync result
      console.error("Naver inventory sync failed:", (err as Error).message);
    }
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/naver/index.ts src/app/api/sync/[platform]/route.ts
git rm src/lib/integrations/connectors/naver.ts
git commit -m "feat: Naver connector module — orders via Connector, inventory via direct upsert"
```

---

### Task 8: Cron endpoint + vercel.json

**Files:**
- Create: `src/app/api/cron/naver-sync/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create cron route**

```typescript
// src/app/api/cron/naver-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { recalculateHokInventory } from "@/lib/integrations/inventory-calculator";
import { naverConnector } from "@/lib/integrations/naver";
import { decrypt } from "@/lib/integrations/encryption";
import { validateCronSecret } from "../cgetc-sync/route";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "NAVER", isActive: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active NAVER integration found" },
      { status: 404 },
    );
  }

  const result = await runSync(naverConnector, config.companyId);

  // Sync ExternalInventory (Naver-specific, not via Connector.fetchInventory)
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    await naverConnector.syncInventory(credentials, config.companyId);
  } catch (err) {
    console.error("Naver inventory sync failed:", (err as Error).message);
  }

  // Recalculate HOK inventory
  await recalculateHokInventory(config.companyId);

  if (result.errorMessage) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Update vercel.json**

Replace the entire `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/cgetc-sync",
      "schedule": "0 17 * * *"
    },
    {
      "path": "/api/cron/naver-sync",
      "schedule": "0 18 * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/naver-sync/route.ts vercel.json
git commit -m "feat: add Naver cron sync (daily 03:00 KST) + vercel.json schedule"
```

---

### Task 9: Unit tests

**Files:**
- Create: `src/lib/integrations/naver/__tests__/auth.test.ts`
- Create: `src/lib/integrations/naver/__tests__/orders.test.ts`

- [ ] **Step 1: Create auth tests**

```typescript
// src/lib/integrations/naver/__tests__/auth.test.ts
import { describe, it, expect } from "vitest";
import { generateClientSecretSign } from "../auth";

describe("generateClientSecretSign", () => {
  it("generates a base64-encoded bcrypt hash", () => {
    // Use a known bcrypt salt for testing
    const clientId = "test-client-id";
    const clientSecret = "$2a$04$YourTestSaltHere22char";
    const timestamp = 1711670400000;

    const sign = generateClientSecretSign(clientId, clientSecret, timestamp);

    // Should be base64 encoded
    expect(sign).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // Should decode to a bcrypt hash starting with $2a$
    const decoded = Buffer.from(sign, "base64").toString();
    expect(decoded).toMatch(/^\$2a\$/);
  });

  it("produces different signs for different timestamps", () => {
    const clientId = "test-client-id";
    const clientSecret = "$2a$04$YourTestSaltHere22char";

    const sign1 = generateClientSecretSign(clientId, clientSecret, 1000);
    const sign2 = generateClientSecretSign(clientId, clientSecret, 2000);

    expect(sign1).not.toBe(sign2);
  });
});
```

- [ ] **Step 2: Create orders tests**

```typescript
// src/lib/integrations/naver/__tests__/orders.test.ts
import { describe, it, expect } from "vitest";
import { mapNaverStatus } from "../orders";

describe("mapNaverStatus", () => {
  it("maps PAYMENT_WAITING to UNFULFILLED/PENDING", () => {
    const result = mapNaverStatus("PAYMENT_WAITING");
    expect(result).toEqual({ fulfillment: "UNFULFILLED", financial: "PENDING" });
  });

  it("maps PAYED to UNFULFILLED/PAID", () => {
    const result = mapNaverStatus("PAYED");
    expect(result).toEqual({ fulfillment: "UNFULFILLED", financial: "PAID" });
  });

  it("maps DELIVERING to PARTIALLY_FULFILLED/PAID", () => {
    const result = mapNaverStatus("DELIVERING");
    expect(result).toEqual({ fulfillment: "PARTIALLY_FULFILLED", financial: "PAID" });
  });

  it("maps DELIVERED to FULFILLED/PAID", () => {
    const result = mapNaverStatus("DELIVERED");
    expect(result).toEqual({ fulfillment: "FULFILLED", financial: "PAID" });
  });

  it("maps PURCHASE_DECIDED to DELIVERED/PAID", () => {
    const result = mapNaverStatus("PURCHASE_DECIDED");
    expect(result).toEqual({ fulfillment: "DELIVERED", financial: "PAID" });
  });

  it("maps EXCHANGED to FULFILLED/PARTIALLY_REFUNDED", () => {
    const result = mapNaverStatus("EXCHANGED");
    expect(result).toEqual({ fulfillment: "FULFILLED", financial: "PARTIALLY_REFUNDED" });
  });

  it("maps CANCELED to CANCELLED/VOIDED", () => {
    const result = mapNaverStatus("CANCELED");
    expect(result).toEqual({ fulfillment: "CANCELLED", financial: "VOIDED" });
  });

  it("maps RETURNED to CANCELLED/REFUNDED", () => {
    const result = mapNaverStatus("RETURNED");
    expect(result).toEqual({ fulfillment: "CANCELLED", financial: "REFUNDED" });
  });

  it("returns defaults for unknown status", () => {
    const result = mapNaverStatus("SOME_UNKNOWN");
    expect(result).toEqual({ fulfillment: "UNFULFILLED", financial: "PENDING" });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/lib/integrations/naver/__tests__/ --reporter verbose
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/integrations/naver/__tests__/
git commit -m "test: add unit tests for Naver auth signing and status mapping"
```

---

### Task 10: Build verification and final check

- [ ] **Step 1: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Verify Prisma client is up to date**

```bash
npx prisma generate
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run --reporter verbose
```

Expected: All tests pass including new Naver tests.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git status
# Only commit if there are changes from fixing build/test issues
```
