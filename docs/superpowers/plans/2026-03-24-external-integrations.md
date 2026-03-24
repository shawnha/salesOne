# External Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the HanahOne ERP to 6 external platforms (Shopify, Amazon, TikTok CSV, CGETC ERP, Naver Smartstore, Pharmacy ERP) for automated sales/inventory syncing with encrypted credentials and HOK auto-inventory calculation.

**Architecture:** Each connector is an isolated module following a shared sync runner pattern. A generic orchestrator handles job tracking, credential decryption, and error handling. Connectors implement a common interface to fetch and map external data to our Order/Inventory models. Credentials are AES-256-GCM encrypted at rest.

**Tech Stack:** Next.js API routes, Prisma, Node.js crypto (AES-256-GCM), Shopify Admin API, Amazon SP-API, Naver Commerce API

**Spec:** `docs/superpowers/specs/2026-03-23-external-integrations-design.md`

---

## File Structure

```
hanahone-erp/
├── prisma/
│   └── schema.prisma                        # Add 4 new models + Order.externalSource
├── prisma/seed.ts                            # Add SYSTEM user
├── src/
│   ├── lib/
│   │   └── integrations/
│   │       ├── types.ts                      # Platform enum, ConnectorInterface, SyncResult
│   │       ├── encryption.ts                 # AES-256-GCM encrypt/decrypt
│   │       ├── sync-runner.ts                # Generic orchestrator: create job → run → update
│   │       ├── inventory-calculator.ts       # HOK auto-inventory recalculation
│   │       ├── connectors/
│   │       │   ├── shopify.ts                # Shopify Admin API client + mapper
│   │       │   ├── amazon.ts                 # Amazon SP-API client + mapper
│   │       │   ├── tiktok-csv.ts             # CSV parser + mapper
│   │       │   ├── cgetc.ts                  # CGETC ERP client + inventory mapper
│   │       │   ├── naver.ts                  # Naver Commerce API client + mapper
│   │       │   └── pharmacy.ts               # Pharmacy ERP client + mapper
│   │       └── mappers/
│   │           └── order-mapper.ts           # External order → our Order model
│   ├── app/
│   │   ├── api/
│   │   │   ├── sync/
│   │   │   │   └── [platform]/
│   │   │   │       └── route.ts              # POST: trigger sync for platform
│   │   │   ├── integrations/
│   │   │   │   └── route.ts                  # GET: list configs, POST: create/update config
│   │   │   └── upload/
│   │   │       └── tiktok/
│   │   │           └── route.ts              # POST: TikTok CSV upload
│   │   └── settings/
│   │       └── integrations/
│   │           └── page.tsx                  # Integration settings page
│   └── components/
│       └── integrations/
│           ├── integration-card.tsx           # Per-connector status card
│           ├── credentials-modal.tsx          # Edit credentials modal
│           ├── sync-history.tsx               # Sync job history table
│           └── csv-upload.tsx                 # TikTok CSV upload component
├── __tests__/
│   └── lib/
│       └── integrations/
│           ├── encryption.test.ts
│           ├── inventory-calculator.test.ts
│           ├── order-mapper.test.ts
│           └── tiktok-csv.test.ts
└── .env.local                                # Add ENCRYPTION_KEY
```

---

## Task 1: Schema Updates + System User

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Modify: `.env.local`

- [ ] **Step 1: Add new enums and models to Prisma schema**

Add to `prisma/schema.prisma`:

```prisma
enum Platform {
  SHOPIFY
  AMAZON
  TIKTOK
  CGETC
  NAVER
  PHARMACY
  ORDERDESK
}

enum SyncStatus {
  RUNNING
  SUCCESS
  FAILED
}

enum ExternalOrderStatus {
  PENDING
  MAPPED
  FAILED
}

model IntegrationConfig {
  id                  String    @id @default(uuid())
  companyId           String    @map("company_id")
  company             Company   @relation(fields: [companyId], references: [id])
  platform            Platform
  credentials         String    // AES-256-GCM encrypted JSON
  isActive            Boolean   @default(false) @map("is_active")
  syncIntervalMinutes Int       @default(15) @map("sync_interval_minutes")
  lastSyncAt          DateTime? @map("last_sync_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  @@unique([companyId, platform])
  @@map("integration_configs")
}

model SyncJob {
  id               String     @id @default(uuid())
  companyId        String     @map("company_id")
  company          Company    @relation(fields: [companyId], references: [id])
  platform         Platform
  status           SyncStatus @default(RUNNING)
  startedAt        DateTime   @default(now()) @map("started_at")
  completedAt      DateTime?  @map("completed_at")
  recordsProcessed Int        @default(0) @map("records_processed")
  recordsFailed    Int        @default(0) @map("records_failed")
  errorMessage     String?    @map("error_message")
  createdAt        DateTime   @default(now()) @map("created_at")

  @@index([companyId, platform])
  @@index([createdAt])
  @@map("sync_jobs")
}

model ExternalOrder {
  id              String              @id @default(uuid())
  companyId       String              @map("company_id")
  company         Company             @relation(fields: [companyId], references: [id])
  platform        Platform
  externalOrderId String              @map("external_order_id")
  rawData         Json                @map("raw_data")
  mappedOrderId   String?             @map("mapped_order_id")
  mappedOrder     Order?              @relation(fields: [mappedOrderId], references: [id])
  status          ExternalOrderStatus @default(PENDING)
  createdAt       DateTime            @default(now()) @map("created_at")

  @@unique([platform, externalOrderId])
  @@index([companyId, platform])
  @@map("external_orders")
}

model InventorySnapshot {
  id                 String   @id @default(uuid())
  companyId          String   @map("company_id")
  company            Company  @relation(fields: [companyId], references: [id])
  productId          String   @map("product_id")
  product            Product  @relation(fields: [productId], references: [id])
  initialQuantity    Int      @map("initial_quantity")
  calculatedQuantity Int      @map("calculated_quantity")
  lastCalculatedAt   DateTime @map("last_calculated_at")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@unique([companyId, productId])
  @@map("inventory_snapshots")
}
```

Add to `Order` model:
```prisma
  externalSource    Platform?  @map("external_source")
  externalOrders    ExternalOrder[]
```

Add to `Company` model:
```prisma
  integrationConfigs IntegrationConfig[]
  syncJobs           SyncJob[]
  externalOrders     ExternalOrder[]
  inventorySnapshots InventorySnapshot[]
```

Add to `Product` model:
```prisma
  inventorySnapshots InventorySnapshot[]
```

- [ ] **Step 2: Add SYSTEM user to seed**

Add to `prisma/seed.ts` after the other users:

```typescript
  // System user for automated processes (not bound to any single company for RBAC)
  // Uses ADMIN role so it can create adjustments for any company
  await prisma.user.create({
    data: {
      name: "System",
      email: "system@hanahone.internal",
      password: await hashPassword("system-no-login-" + Date.now()),
      role: UserRole.ADMIN,
      companyId: hoi.id, // Home company is HOI but as ADMIN it can operate on all
    },
  });
```

- [ ] **Step 3: Add ENCRYPTION_KEY to .env.local**

Append to `.env.local`:
```
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
```

- [ ] **Step 4: Generate Prisma client and push schema**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
npx prisma generate
npx prisma db push
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add integration schema (IntegrationConfig, SyncJob, ExternalOrder, InventorySnapshot)"
```

---

## Task 2: Encryption Utilities

**Files:**
- Create: `src/lib/integrations/encryption.ts`
- Test: `__tests__/lib/integrations/encryption.test.ts`

- [ ] **Step 1: Write encryption test**

```typescript
import { describe, it, expect } from "vitest";
import { encrypt, decrypt, maskCredentials } from "@/lib/integrations/encryption";

describe("encryption", () => {
  // Set test encryption key
  const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("encrypts and decrypts a string", () => {
    const plaintext = JSON.stringify({ apiKey: "sk_live_test123", storeUrl: "mystore.myshopify.com" });
    const encrypted = encrypt(plaintext, testKey);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":"); // IV:authTag:ciphertext format
    const decrypted = decrypt(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "test";
    const a = encrypt(plaintext, testKey);
    const b = encrypt(plaintext, testKey);
    expect(a).not.toBe(b);
  });

  it("throws on invalid ciphertext", () => {
    expect(() => decrypt("invalid", testKey)).toThrow();
  });

  it("masks credential values", () => {
    const creds = { apiKey: "sk_live_test123456", storeUrl: "mystore.myshopify.com" };
    const masked = maskCredentials(creds);
    expect(masked.apiKey).toBe("sk_l****3456");
    expect(masked.storeUrl).toBe("myst****com");
  });

  it("masks short values", () => {
    const creds = { key: "abc" };
    const masked = maskCredentials(creds);
    expect(masked.key).toBe("****");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/integrations/encryption.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write encryption implementation**

Create `src/lib/integrations/encryption.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

export function encrypt(plaintext: string, keyHex?: string): string {
  const key = Buffer.from(keyHex || process.env.ENCRYPTION_KEY!, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(ciphertext: string, keyHex?: string): string {
  const key = Buffer.from(keyHex || process.env.ENCRYPTION_KEY!, "hex");
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encrypted) throw new Error("Invalid ciphertext format");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function maskCredentials(creds: Record<string, any>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(creds)) {
    const str = String(value);
    if (str.length <= 8) {
      masked[key] = "****";
    } else {
      masked[key] = str.slice(0, 4) + "****" + str.slice(-4);
    }
  }
  return masked;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/integrations/encryption.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add AES-256-GCM encryption utilities for credential storage"
```

---

## Task 3: Integration Types + Sync Runner

**Files:**
- Create: `src/lib/integrations/types.ts`
- Create: `src/lib/integrations/sync-runner.ts`

- [ ] **Step 1: Write shared types**

Create `src/lib/integrations/types.ts`:

```typescript
import { Platform } from "@prisma/client";

export interface ConnectorResult {
  orders: ExternalOrderData[];
  inventory?: ExternalInventoryData[];
}

export interface ExternalOrderData {
  externalOrderId: string;
  rawData: any;
  orderDate: Date;
  status: string;
  totalAmount: number;
  costAmount?: number;
  marginAmount?: number;
  customerName?: string;
  customerEmail?: string;
  items: ExternalOrderItemData[];
}

export interface ExternalOrderItemData {
  externalItemId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface ExternalInventoryData {
  sku: string;
  productName: string;
  quantity: number;
  warehouseLocation?: string;
}

export interface Connector {
  platform: Platform;
  fetchOrders(credentials: any, since: Date | null): Promise<ExternalOrderData[]>;
  fetchInventory?(credentials: any): Promise<ExternalInventoryData[]>;
}

export interface SyncResult {
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage?: string;
}
```

- [ ] **Step 2: Write sync runner**

Create `src/lib/integrations/sync-runner.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { decrypt } from "./encryption";
import { Platform, SyncStatus } from "@prisma/client";
import type { Connector, SyncResult } from "./types";
import { mapExternalOrder } from "./mappers/order-mapper";

export async function runSync(connector: Connector, companyId: string): Promise<SyncResult> {
  // 1. Get integration config
  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: connector.platform } },
  });

  if (!config || !config.isActive) {
    return { recordsProcessed: 0, recordsFailed: 0, errorMessage: "Integration not active" };
  }

  // 2. Create sync job
  const job = await prisma.syncJob.create({
    data: { companyId, platform: connector.platform, status: SyncStatus.RUNNING },
  });

  try {
    // 3. Decrypt credentials
    const credentials = JSON.parse(decrypt(config.credentials));

    // 4. Fetch orders
    const externalOrders = await connector.fetchOrders(credentials, config.lastSyncAt);

    let processed = 0;
    let failed = 0;

    // 5. Process each order
    for (const extOrder of externalOrders) {
      try {
        // Check for duplicate
        const existing = await prisma.externalOrder.findUnique({
          where: {
            platform_externalOrderId: {
              platform: connector.platform,
              externalOrderId: extOrder.externalOrderId,
            },
          },
        });

        if (existing) {
          processed++;
          continue;
        }

        // Map and create order
        const mappedOrder = await mapExternalOrder(extOrder, companyId, connector.platform);

        await prisma.externalOrder.create({
          data: {
            companyId,
            platform: connector.platform,
            externalOrderId: extOrder.externalOrderId,
            rawData: extOrder.rawData,
            mappedOrderId: mappedOrder.id,
            status: "MAPPED",
          },
        });

        processed++;
      } catch (err) {
        failed++;
        await prisma.externalOrder.create({
          data: {
            companyId,
            platform: connector.platform,
            externalOrderId: extOrder.externalOrderId,
            rawData: extOrder.rawData,
            status: "FAILED",
          },
        }).catch(() => {}); // Ignore duplicate key errors
      }
    }

    // 6. Fetch inventory if connector supports it
    if (connector.fetchInventory) {
      const inventoryData = await connector.fetchInventory(credentials);
      for (const item of inventoryData) {
        const product = await prisma.product.findFirst({
          where: { sku: item.sku, companyId },
        });
        if (product) {
          await prisma.inventory.upsert({
            where: {
              productId_companyId_warehouseLocation: {
                productId: product.id,
                companyId,
                warehouseLocation: item.warehouseLocation || "Main",
              },
            },
            update: { quantity: item.quantity },
            create: {
              productId: product.id,
              companyId,
              quantity: item.quantity,
              warehouseLocation: item.warehouseLocation || "Main",
              reorderLevel: 0,
            },
          });
        }
      }
    }

    // 7. Update job and config
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", completedAt: new Date(), recordsProcessed: processed, recordsFailed: failed },
    });

    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { lastSyncAt: new Date() },
    });

    return { recordsProcessed: processed, recordsFailed: failed };
  } catch (err: any) {
    // Sanitize error message — strip anything that looks like a credential
    const safeMessage = (err.message || "Unknown error").replace(/[A-Za-z0-9_-]{20,}/g, "****");

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: safeMessage },
    });

    return { recordsProcessed: 0, recordsFailed: 0, errorMessage: safeMessage };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add integration types and generic sync runner"
```

---

## Task 4: Order Mapper

**Files:**
- Create: `src/lib/integrations/mappers/order-mapper.ts`
- Test: `__tests__/lib/integrations/order-mapper.test.ts`

- [ ] **Step 1: Write order mapper test**

```typescript
import { describe, it, expect } from "vitest";
import { mapStatusToOrderStatus, calculateOrderTotal } from "@/lib/integrations/mappers/order-mapper";

describe("order-mapper", () => {
  it("maps common statuses to OrderStatus", () => {
    expect(mapStatusToOrderStatus("paid")).toBe("PROCESSING");
    expect(mapStatusToOrderStatus("shipped")).toBe("SHIPPED");
    expect(mapStatusToOrderStatus("delivered")).toBe("DELIVERED");
    expect(mapStatusToOrderStatus("cancelled")).toBe("CANCELLED");
    expect(mapStatusToOrderStatus("unfulfilled")).toBe("PENDING");
    expect(mapStatusToOrderStatus("unknown_status")).toBe("PENDING");
  });

  it("calculates order total from items", () => {
    const items = [
      { externalItemId: "1", productName: "A", sku: "A1", quantity: 2, unitPrice: 10000 },
      { externalItemId: "2", productName: "B", sku: "B1", quantity: 1, unitPrice: 5000 },
    ];
    expect(calculateOrderTotal(items)).toBe(25000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/integrations/order-mapper.test.ts`

- [ ] **Step 3: Write order mapper**

Create `src/lib/integrations/mappers/order-mapper.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { Platform, OrderStatus, OrderType } from "@prisma/client";
import { generateOrderNumber } from "@/lib/order-number";
import type { ExternalOrderData, ExternalOrderItemData } from "../types";

const STATUS_MAP: Record<string, OrderStatus> = {
  paid: "PROCESSING",
  processing: "PROCESSING",
  shipped: "SHIPPED",
  fulfilled: "SHIPPED",
  delivered: "DELIVERED",
  completed: "DELIVERED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  refunded: "CANCELLED",
  unfulfilled: "PENDING",
  pending: "PENDING",
};

export function mapStatusToOrderStatus(status: string): OrderStatus {
  return STATUS_MAP[status.toLowerCase()] || "PENDING";
}

export function calculateOrderTotal(items: ExternalOrderItemData[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export async function mapExternalOrder(
  extOrder: ExternalOrderData,
  companyId: string,
  platform: Platform,
) {
  const total = extOrder.totalAmount || calculateOrderTotal(extOrder.items);

  // Resolve product IDs by SKU BEFORE creating order items
  const resolvedItems = await Promise.all(
    extOrder.items.map(async (item) => {
      const product = await prisma.product.findFirst({ where: { sku: item.sku, companyId } });
      return {
        productId: product?.id || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      };
    })
  );

  // Filter out items with no matching product
  const validItems = resolvedItems.filter((item) => item.productId !== null);

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(companyId, tx);

    return tx.order.create({
      data: {
        orderNumber,
        companyId,
        type: OrderType.SALE,
        status: mapStatusToOrderStatus(extOrder.status),
        totalAmount: total,
        costAmount: extOrder.costAmount,
        marginAmount: extOrder.marginAmount,
        orderDate: new Date(extOrder.orderDate),
        externalSource: platform,
        items: {
          create: validItems.map((item) => ({
            productId: item.productId!,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        },
      },
    });
  });

  return order;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/integrations/order-mapper.test.ts`
Expected: PASS (only tests pure functions, not the async mapper)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add external order mapper with status mapping and SKU resolution"
```

---

## Task 5: HOK Inventory Calculator

**Files:**
- Create: `src/lib/integrations/inventory-calculator.ts`
- Test: `__tests__/lib/integrations/inventory-calculator.test.ts`

- [ ] **Step 1: Write inventory calculator test**

```typescript
import { describe, it, expect } from "vitest";
import { calculateInventory } from "@/lib/integrations/inventory-calculator";

describe("calculateInventory", () => {
  it("calculates inventory from initial - sales + adjustments", () => {
    const result = calculateInventory(1000, 300, 50);
    expect(result).toBe(750); // 1000 - 300 + 50
  });

  it("returns 0 if result would be negative", () => {
    const result = calculateInventory(100, 200, 0);
    expect(result).toBe(0);
  });

  it("handles zero sales", () => {
    const result = calculateInventory(500, 0, 100);
    expect(result).toBe(600);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run __tests__/lib/integrations/inventory-calculator.test.ts`

- [ ] **Step 3: Write inventory calculator**

Create `src/lib/integrations/inventory-calculator.ts`:

```typescript
import { prisma } from "@/lib/prisma";

export function calculateInventory(initial: number, totalSales: number, totalAdjustments: number): number {
  return Math.max(0, initial - totalSales + totalAdjustments);
}

export async function recalculateHokInventory(companyId: string) {
  // Get system user for audit trail
  const systemUser = await prisma.user.findFirst({ where: { email: "system@hanahone.internal" } });
  if (!systemUser) throw new Error("System user not found");

  // Get all HOK inventory snapshots
  const snapshots = await prisma.inventorySnapshot.findMany({
    where: { companyId },
    include: { product: true },
  });

  for (const snapshot of snapshots) {
    // Sum all sales quantities from synced orders
    const salesItems = await prisma.orderItem.findMany({
      where: {
        order: {
          companyId,
          externalSource: { in: ["NAVER", "PHARMACY"] },
        },
        productId: snapshot.productId,
      },
      select: { quantity: true },
    });
    const totalSales = salesItems.reduce((sum, item) => sum + item.quantity, 0);

    // Sum manual adjustments — EXCLUDE type=SALE to avoid feedback loop
    // (SALE adjustments are created BY this calculator, not external input)
    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        companyId,
        inventory: { productId: snapshot.productId },
        adjustmentType: { in: ["MANUAL", "PRODUCTION", "PURCHASE", "TRANSFER_IN", "TRANSFER_OUT"] },
      },
      select: { quantityChange: true },
    });
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + adj.quantityChange, 0);

    // Calculate
    const newQuantity = calculateInventory(snapshot.initialQuantity, totalSales, totalAdjustments);

    // Update snapshot
    await prisma.inventorySnapshot.update({
      where: { id: snapshot.id },
      data: { calculatedQuantity: newQuantity, lastCalculatedAt: new Date() },
    });

    // Update actual inventory
    const inventory = await prisma.inventory.findFirst({
      where: { productId: snapshot.productId, companyId },
    });

    if (inventory && inventory.quantity !== newQuantity) {
      const diff = newQuantity - inventory.quantity;
      await prisma.inventory.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      });

      // Audit trail
      await prisma.inventoryAdjustment.create({
        data: {
          inventoryId: inventory.id,
          companyId,
          adjustmentType: "SALE",
          quantityChange: diff,
          previousQuantity: inventory.quantity,
          newQuantity,
          reason: "Auto-calculated from synced sales",
          createdBy: systemUser.id,
        },
      });
    }
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run __tests__/lib/integrations/inventory-calculator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add HOK inventory auto-calculator from synced sales"
```

---

## Task 6: Shopify Connector

**Files:**
- Create: `src/lib/integrations/connectors/shopify.ts`

- [ ] **Step 1: Write Shopify connector**

```typescript
import type { Connector, ExternalOrderData } from "../types";

export const shopifyConnector: Connector = {
  platform: "SHOPIFY",

  async fetchOrders(credentials: { apiKey: string; storeUrl: string }, since: Date | null) {
    const baseUrl = `https://${credentials.storeUrl}/admin/api/2024-01`;
    const headers = { "X-Shopify-Access-Token": credentials.apiKey, "Content-Type": "application/json" };

    let url = `${baseUrl}/orders.json?status=any&limit=250`;
    if (since) url += `&created_at_min=${since.toISOString()}`;

    const orders: ExternalOrderData[] = [];
    let hasNext = true;

    while (hasNext) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
      const data = await res.json();

      for (const order of data.orders || []) {
        orders.push({
          externalOrderId: String(order.id),
          rawData: order,
          orderDate: new Date(order.created_at),
          status: order.fulfillment_status || "unfulfilled",
          totalAmount: parseFloat(order.total_price),
          customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : undefined,
          customerEmail: order.customer?.email,
          items: (order.line_items || []).map((item: any) => ({
            externalItemId: String(item.id),
            productName: item.title,
            sku: item.sku || "",
            quantity: item.quantity,
            unitPrice: parseFloat(item.price),
          })),
        });
      }

      // Pagination via Link header
      const linkHeader = res.headers.get("Link");
      const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      } else {
        hasNext = false;
      }
    }

    return orders;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Shopify connector with pagination"
```

---

## Task 7: Amazon SP-API Connector

**Files:**
- Create: `src/lib/integrations/connectors/amazon.ts`

- [ ] **Step 1: Write Amazon connector**

```typescript
import type { Connector, ExternalOrderData } from "../types";

async function refreshLwaToken(credentials: { clientId: string; clientSecret: string; refreshToken: string }) {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Amazon LWA token refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

export const amazonConnector: Connector = {
  platform: "AMAZON",

  async fetchOrders(credentials: {
    clientId: string; clientSecret: string; refreshToken: string;
    sellerId: string; marketplaceId: string;
  }, since: Date | null) {
    const accessToken = await refreshLwaToken(credentials);
    const baseUrl = "https://sellingpartnerapi-na.amazon.com";
    const headers = { "x-amz-access-token": accessToken, "Content-Type": "application/json" };

    const params = new URLSearchParams({
      MarketplaceIds: credentials.marketplaceId,
      CreatedAfter: since ? since.toISOString() : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await fetch(`${baseUrl}/orders/v0/orders?${params}`, { headers });
    if (!res.ok) throw new Error(`Amazon SP-API error: ${res.status}`);
    const data = await res.json();

    const orders: ExternalOrderData[] = [];

    for (const order of data.payload?.Orders || []) {
      // Fetch order items
      const itemsRes = await fetch(`${baseUrl}/orders/v0/orders/${order.AmazonOrderId}/orderItems`, { headers });
      const itemsData = itemsRes.ok ? await itemsRes.json() : { payload: { OrderItems: [] } };

      orders.push({
        externalOrderId: order.AmazonOrderId,
        rawData: order,
        orderDate: new Date(order.PurchaseDate),
        status: order.OrderStatus?.toLowerCase() || "pending",
        totalAmount: parseFloat(order.OrderTotal?.Amount || "0"),
        items: (itemsData.payload?.OrderItems || []).map((item: any) => ({
          externalItemId: item.OrderItemId,
          productName: item.Title,
          sku: item.SellerSKU || "",
          quantity: item.QuantityOrdered,
          unitPrice: parseFloat(item.ItemPrice?.Amount || "0") / (item.QuantityOrdered || 1),
        })),
      });
    }

    return orders;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Amazon SP-API connector with LWA token refresh"
```

---

## Task 8: TikTok CSV Parser

**Files:**
- Create: `src/lib/integrations/connectors/tiktok-csv.ts`
- Test: `__tests__/lib/integrations/tiktok-csv.test.ts`

- [ ] **Step 1: Write CSV parser test**

```typescript
import { describe, it, expect } from "vitest";
import { parseTikTokCsv } from "@/lib/integrations/connectors/tiktok-csv";

describe("parseTikTokCsv", () => {
  it("parses TikTok Seller Center CSV format", () => {
    const csv = `Order ID,Order Status,Product Name,SKU,Quantity,Item Price,Order Total,Created Time
TK-001,Completed,Omega-3 Fish Oil,OMEGA3-1000,2,32000,64000,2026-03-20 14:30:00
TK-002,Shipped,Vitamin D3,VITD3-5000,1,18000,18000,2026-03-21 09:15:00`;

    const result = parseTikTokCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].externalOrderId).toBe("TK-001");
    expect(result[0].totalAmount).toBe(64000);
    expect(result[0].items[0].sku).toBe("OMEGA3-1000");
    expect(result[0].items[0].quantity).toBe(2);
    expect(result[1].status).toBe("shipped");
  });

  it("handles empty CSV", () => {
    const csv = `Order ID,Order Status,Product Name,SKU,Quantity,Item Price,Order Total,Created Time`;
    const result = parseTikTokCsv(csv);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Write CSV parser**

Create `src/lib/integrations/connectors/tiktok-csv.ts`:

```typescript
import type { ExternalOrderData } from "../types";

export function parseTikTokCsv(csvContent: string): ExternalOrderData[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const orders = new Map<string, ExternalOrderData>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));

    const orderId = row["Order ID"];
    if (!orderId) continue;

    const existing = orders.get(orderId);
    const item = {
      externalItemId: `${orderId}-${i}`,
      productName: row["Product Name"] || "",
      sku: row["SKU"] || "",
      quantity: parseInt(row["Quantity"]) || 1,
      unitPrice: parseFloat(row["Item Price"]) || 0,
    };

    if (existing) {
      existing.items.push(item);
    } else {
      orders.set(orderId, {
        externalOrderId: orderId,
        rawData: row,
        orderDate: new Date(row["Created Time"]),
        status: (row["Order Status"] || "pending").toLowerCase(),
        totalAmount: parseFloat(row["Order Total"]) || 0,
        items: [item],
      });
    }
  }

  return Array.from(orders.values());
}
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add TikTok CSV parser with multi-item order grouping"
```

---

## Task 9: Naver Smartstore + Pharmacy + CGETC Connectors

**Files:**
- Create: `src/lib/integrations/connectors/naver.ts`
- Create: `src/lib/integrations/connectors/pharmacy.ts`
- Create: `src/lib/integrations/connectors/cgetc.ts`

- [ ] **Step 1: Write Naver connector**

```typescript
import type { Connector, ExternalOrderData } from "../types";

export const naverConnector: Connector = {
  platform: "NAVER",

  async fetchOrders(credentials: { clientId: string; clientSecret: string }, since: Date | null) {
    const baseUrl = "https://api.commerce.naver.com/external";
    const token = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
    const headers = { Authorization: `Basic ${token}`, "Content-Type": "application/json" };

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const res = await fetch(`${baseUrl}/v1/pay-order/seller/orders?from=${sinceDate.toISOString()}&to=${new Date().toISOString()}`, {
      headers,
    });

    if (!res.ok) throw new Error(`Naver API error: ${res.status} ${res.statusText}`);
    const data = await res.json();

    return (data.data || []).map((order: any) => ({
      externalOrderId: String(order.orderId || order.productOrderId),
      rawData: order,
      orderDate: new Date(order.orderDate || order.paymentDate),
      status: (order.productOrderStatus || "pending").toLowerCase(),
      totalAmount: order.totalPaymentAmount || 0,
      customerName: order.ordererName,
      items: (order.productOrderItems || [order]).map((item: any) => ({
        externalItemId: String(item.productOrderId || item.orderId),
        productName: item.productName || "",
        sku: item.sellerProductCode || "",
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.totalPaymentAmount || 0,
      })),
    }));
  },
};
```

- [ ] **Step 2: Write Pharmacy connector**

```typescript
import type { Connector, ExternalOrderData } from "../types";

export const pharmacyConnector: Connector = {
  platform: "PHARMACY",

  async fetchOrders(credentials: { baseUrl: string; apiKey?: string }, since: Date | null) {
    const url = credentials.baseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (credentials.apiKey) headers["Authorization"] = `Bearer ${credentials.apiKey}`;

    const params = new URLSearchParams();
    if (since) params.set("since", since.toISOString());

    const res = await fetch(`${url}/api/orders?${params}`, { headers });
    if (!res.ok) throw new Error(`Pharmacy ERP error: ${res.status} ${res.statusText}`);
    const data = await res.json();

    return (data.orders || data || []).map((order: any) => ({
      externalOrderId: String(order.id || order.orderId),
      rawData: order,
      orderDate: new Date(order.createdAt || order.orderDate),
      status: (order.status || "pending").toLowerCase(),
      totalAmount: order.totalAmount || order.total || 0,
      customerName: order.pharmacyName || order.customerName,
      items: (order.items || order.lineItems || []).map((item: any) => ({
        externalItemId: String(item.id || item.itemId),
        productName: item.productName || item.name || "",
        sku: item.sku || "",
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.price || 0,
      })),
    }));
  },
};
```

- [ ] **Step 3: Write CGETC connector (Phase 1 stub)**

```typescript
import type { Connector, ExternalOrderData, ExternalInventoryData } from "../types";

// CGETC ERP connector — Phase 1: stub with documented interface
// Phase 2: implement after reverse-engineering the CGETC web API endpoints
// See spec for connection details (credentials stored encrypted in IntegrationConfig)

export const cgetcConnector: Connector = {
  platform: "CGETC",

  async fetchOrders(_credentials: any, _since: Date | null) {
    // CGETC is primarily used for inventory, not orders
    // TikTok order data from CGETC is a future V2 feature
    return [];
  },

  async fetchInventory(credentials: { url: string; email: string; password: string; partnerId: string }): Promise<ExternalInventoryData[]> {
    // Phase 1: Stub — returns empty until CGETC API endpoints are discovered
    // Phase 2: Implement login flow + inventory fetch after network analysis
    //
    // Expected flow:
    // 1. POST login to credentials.url with email/password
    // 2. Use session cookie to fetch inventory endpoint
    // 3. Map response to ExternalInventoryData[]
    //
    // TODO: Replace this stub after CGETC API spike
    console.warn("CGETC connector: stub — implement after API discovery");
    return [];
  },
};
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Naver, Pharmacy, and CGETC (stub) connectors"
```

---

## Task 10: Sync API Routes

**Files:**
- Create: `src/app/api/sync/[platform]/route.ts`
- Create: `src/app/api/integrations/route.ts`
- Create: `src/app/api/upload/tiktok/route.ts`

- [ ] **Step 1: Write sync trigger route**

Create `src/app/api/sync/[platform]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { recalculateHokInventory } from "@/lib/integrations/inventory-calculator";
import { shopifyConnector } from "@/lib/integrations/connectors/shopify";
import { amazonConnector } from "@/lib/integrations/connectors/amazon";
import { naverConnector } from "@/lib/integrations/connectors/naver";
import { pharmacyConnector } from "@/lib/integrations/connectors/pharmacy";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";
import type { Connector } from "@/lib/integrations/types";

const connectors: Record<string, Connector> = {
  SHOPIFY: shopifyConnector,
  AMAZON: amazonConnector,
  NAVER: naverConnector,
  PHARMACY: pharmacyConnector,
  CGETC: cgetcConnector,
};

export async function POST(req: NextRequest, { params }: { params: { platform: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const platform = params.platform.toUpperCase();
  const connector = connectors[platform];
  if (!connector) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });

  const { companyId } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const result = await runSync(connector, companyId);

  // Trigger HOK inventory recalculation for Naver/Pharmacy
  if (["NAVER", "PHARMACY"].includes(platform)) {
    await recalculateHokInventory(companyId);
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Write integrations config route**

Create `src/app/api/integrations/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { encrypt, maskCredentials } from "@/lib/integrations/encryption";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const configs = await prisma.integrationConfig.findMany({
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Return with masked credentials (decrypt → mask → return)
  const { decrypt } = await import("@/lib/integrations/encryption");
  return NextResponse.json(configs.map((c) => {
    let maskedCreds = null;
    try {
      if (c.credentials) {
        const decrypted = JSON.parse(decrypt(c.credentials));
        maskedCreds = maskCredentials(decrypted);
      }
    } catch { maskedCreds = null; }
    return { ...c, credentials: maskedCreds, _hasCreds: !!c.credentials };
  }));
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId, platform, credentials, isActive, syncIntervalMinutes } = await req.json();

  const encrypted = credentials ? encrypt(JSON.stringify(credentials)) : undefined;

  const config = await prisma.integrationConfig.upsert({
    where: { companyId_platform: { companyId, platform } },
    update: {
      ...(encrypted ? { credentials: encrypted } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(syncIntervalMinutes ? { syncIntervalMinutes } : {}),
    },
    create: {
      companyId,
      platform,
      credentials: encrypted || "",
      isActive: isActive ?? false,
      syncIntervalMinutes: syncIntervalMinutes ?? 15,
    },
  });

  return NextResponse.json({ id: config.id, platform: config.platform, isActive: config.isActive });
}
```

- [ ] **Step 3: Write TikTok CSV upload route**

Create `src/app/api/upload/tiktok/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { parseTikTokCsv } from "@/lib/integrations/connectors/tiktok-csv";
import { mapExternalOrder } from "@/lib/integrations/mappers/order-mapper";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const companyId = formData.get("companyId") as string;

  if (!file || !companyId) {
    return NextResponse.json({ error: "file and companyId required" }, { status: 400 });
  }

  const csvContent = await file.text();
  const externalOrders = parseTikTokCsv(csvContent);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const extOrder of externalOrders) {
    try {
      const existing = await prisma.externalOrder.findUnique({
        where: { platform_externalOrderId: { platform: "TIKTOK", externalOrderId: extOrder.externalOrderId } },
      });

      if (existing) { skipped++; continue; }

      const mappedOrder = await mapExternalOrder(extOrder, companyId, "TIKTOK");

      await prisma.externalOrder.create({
        data: {
          companyId,
          platform: "TIKTOK",
          externalOrderId: extOrder.externalOrderId,
          rawData: extOrder.rawData,
          mappedOrderId: mappedOrder.id,
          status: "MAPPED",
        },
      });

      processed++;
    } catch (err) {
      failed++;
    }
  }

  return NextResponse.json({ processed, skipped, failed, total: externalOrders.length });
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add sync API routes, integration config API, TikTok CSV upload"
```

---

## Task 11: Integration Settings UI

**Files:**
- Create: `src/components/integrations/integration-card.tsx`
- Create: `src/components/integrations/credentials-modal.tsx`
- Create: `src/components/integrations/sync-history.tsx`
- Create: `src/components/integrations/csv-upload.tsx`
- Create: `src/app/settings/integrations/page.tsx`

- [ ] **Step 1: Write integration card component**

`src/components/integrations/integration-card.tsx` — displays platform name, status (active/not configured/failed), last sync time, Edit and Sync Now buttons. Uses Card from `@/components/ui/card`.

- [ ] **Step 2: Write credentials modal**

`src/components/integrations/credentials-modal.tsx` — client component with form fields specific to each platform (Shopify: API key + store URL; Amazon: seller ID, marketplace, refresh token, client ID, client secret; Naver: client ID + secret; Pharmacy: base URL + optional API key; CGETC: URL, email, password, partner ID). Submits to `/api/integrations` POST. Shows masked existing values.

- [ ] **Step 3: Write sync history component**

`src/components/integrations/sync-history.tsx` — table showing recent SyncJobs with platform, status badge, records processed, time ago, error message.

- [ ] **Step 4: Write CSV upload component**

`src/components/integrations/csv-upload.tsx` — client component with file input accepting `.csv`, uploads to `/api/upload/tiktok` via FormData POST. Shows results (processed/skipped/failed).

- [ ] **Step 5: Write integrations settings page**

`src/app/settings/integrations/page.tsx` — server component that fetches IntegrationConfigs and recent SyncJobs. Groups connectors by company (HOI: Shopify, Amazon, TikTok, CGETC; HOK: Naver, Pharmacy). Renders IntegrationCard for each, SyncHistory at bottom.

- [ ] **Step 6: Add link from main settings page**

Add a link to `/settings/integrations` from the existing `/settings` page.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add integration settings UI with credential management and sync history"
```

---

## Task 12: Dashboard Data Freshness

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add sync status to dashboard**

In the dashboard page, fetch the latest SyncJob per platform and display data freshness indicators near the KPI cards (e.g., "Shopify: 2 min ago", "Naver: 5 min ago").

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add data freshness indicators to dashboard"
```

---

## Task 13: Integration Tests

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix integration test issues"
```
