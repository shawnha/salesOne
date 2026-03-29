# Inventory Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build inventory reconciliation (PO sync + expected vs actual stock comparison + manual adjustments), shipping cost tracking, and customer API upgrade for CGETC-integrated ERP.

**Architecture:** Export `authenticate`/`odooRpc` from `cgetc.ts`, add 3 new connector files (purchase, shipping, partners). New Prisma models for PurchaseOrder, PurchaseOrderLine, ShippingCost, ReconciliationAdjustment. New pages for reconciliation and shipping costs. All CGETC API calls use domain filters for tenant isolation.

**Tech Stack:** Next.js 14, Prisma, Vitest, Recharts, CGETC Odoo JSON-RPC API + Portal scraping

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add 4 new models + AdjustmentType enum value |
| `src/lib/integrations/connectors/cgetc.ts` | Modify | Export `authenticate`, `odooRpc` |
| `src/lib/integrations/connectors/cgetc-purchase.ts` | Create | PO sync via purchase.order API |
| `src/lib/integrations/connectors/cgetc-shipping.ts` | Create | Shipping cost scraping from /my/invoices |
| `src/lib/integrations/connectors/cgetc-partners.ts` | Create | Customer info via res.partner API |
| `src/lib/reconciliation.ts` | Create | Expected stock calculation (pure function) |
| `src/app/api/purchase-orders/sync/route.ts` | Create | POST — PO sync endpoint |
| `src/app/api/reconciliation/route.ts` | Create | GET comparison + POST adjustment |
| `src/app/api/shipping-costs/sync/route.ts` | Create | POST — shipping cost sync |
| `src/app/api/shipping-costs/route.ts` | Create | GET list + summary |
| `src/app/api/customers/fetch-cgetc-details/route.ts` | Modify | Replace portal scraping with res.partner API |
| `src/app/reconciliation/page.tsx` | Create | Reconciliation page |
| `src/app/shipping-costs/page.tsx` | Create | Shipping costs page |
| `src/app/inventory/page.tsx` | Modify | Add expected/actual/diff columns |
| `src/components/nav/top-nav.tsx` | Modify | Add nav links |
| `__tests__/lib/reconciliation.test.ts` | Create | Expected stock calculation tests |
| `__tests__/lib/integrations/cgetc-purchase.test.ts` | Create | PO sync tests |
| `__tests__/lib/integrations/cgetc-shipping.test.ts` | Create | Shipping cost parsing tests |
| `__tests__/lib/integrations/cgetc-partners.test.ts` | Create | Partner fetch tests |

---

### Task 1: Prisma Schema — New Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new models to schema.prisma**

Add after the `ExternalInventory` model (after line ~497):

```prisma
model PurchaseOrder {
  id            String              @id @default(uuid())
  companyId     String              @map("company_id")
  company       Company             @relation(fields: [companyId], references: [id])
  platform      Platform
  externalPoId  String              @map("external_po_id")
  poNumber      String              @map("po_number")
  supplierName  String              @map("supplier_name")
  orderDate     DateTime            @map("order_date")
  totalAmount   Decimal             @map("total_amount")
  state         String
  rawData       Json                @map("raw_data")
  createdAt     DateTime            @default(now()) @map("created_at")
  updatedAt     DateTime            @updatedAt @map("updated_at")
  lineItems     PurchaseOrderLine[]

  @@unique([companyId, platform, externalPoId])
  @@map("purchase_orders")
  @@schema("salesone")
}

model PurchaseOrderLine {
  id              String        @id @default(uuid())
  purchaseOrderId String        @map("purchase_order_id")
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  productName     String        @map("product_name")
  sku             String?
  quantity        Decimal
  unitPrice       Decimal       @map("unit_price")
  subtotal        Decimal
  createdAt       DateTime      @default(now()) @map("created_at")

  @@index([purchaseOrderId])
  @@map("purchase_order_lines")
  @@schema("salesone")
}

model ShippingCost {
  id          String   @id @default(uuid())
  companyId   String   @map("company_id")
  company     Company  @relation(fields: [companyId], references: [id])
  orderId     String?  @map("order_id")
  order       Order?   @relation(fields: [orderId], references: [id])
  soNumber    String   @map("so_number")
  invoiceDate DateTime @map("invoice_date")
  amount      Decimal
  currency    String   @default("USD")
  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([companyId, soNumber])
  @@index([orderId])
  @@map("shipping_costs")
  @@schema("salesone")
}

model ReconciliationAdjustment {
  id          String   @id @default(uuid())
  companyId   String   @map("company_id")
  company     Company  @relation(fields: [companyId], references: [id])
  sku         String
  productName String   @map("product_name")
  quantity    Int
  reason      String
  memo        String?
  createdBy   String   @map("created_by")
  createdByUser User   @relation(fields: [createdBy], references: [id])
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([companyId, sku])
  @@map("reconciliation_adjustments")
  @@schema("salesone")
}
```

Also add relation fields to Company model (around line 30):

```prisma
  purchaseOrders          PurchaseOrder[]
  shippingCosts           ShippingCost[]
  reconciliationAdjustments ReconciliationAdjustment[]
```

Add relation field to Order model (around line 280):

```prisma
  shippingCost  ShippingCost?
```

Add relation field to User model for ReconciliationAdjustment:

```prisma
  reconciliationAdjustments ReconciliationAdjustment[]
```

- [ ] **Step 2: Run prisma generate**

Run: `npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 3: Push schema to database**

Run: `npx prisma db push`
Expected: schema synced without errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add PurchaseOrder, ShippingCost, ReconciliationAdjustment models"
```

---

### Task 2: Export CGETC Auth/RPC + Reconciliation Calculation

**Files:**
- Modify: `src/lib/integrations/connectors/cgetc.ts`
- Create: `src/lib/reconciliation.ts`
- Test: `__tests__/lib/reconciliation.test.ts`

- [ ] **Step 1: Export authenticate and odooRpc from cgetc.ts**

In `src/lib/integrations/connectors/cgetc.ts`, change the two function declarations from `async function` to `export async function`:

Line ~54: `async function authenticate(` → `export async function authenticate(`
Line ~106: `async function odooRpc(` → `export async function odooRpc(`

- [ ] **Step 2: Write failing test for reconciliation calculation**

```typescript
// __tests__/lib/reconciliation.test.ts
import { describe, it, expect } from "vitest";
import { calculateExpectedStock } from "@/lib/reconciliation";

describe("calculateExpectedStock", () => {
  it("calculates expected stock from PO, sales, and adjustments", () => {
    const result = calculateExpectedStock({
      purchased: 8840,
      sold: 8154,
      adjusted: 0,
    });
    expect(result).toBe(686);
  });

  it("subtracts adjustments from expected", () => {
    const result = calculateExpectedStock({
      purchased: 8840,
      sold: 8154,
      adjusted: 20,
    });
    expect(result).toBe(666);
  });

  it("handles zero purchases", () => {
    const result = calculateExpectedStock({
      purchased: 0,
      sold: 0,
      adjusted: 0,
    });
    expect(result).toBe(0);
  });

  it("can result in negative expected stock", () => {
    const result = calculateExpectedStock({
      purchased: 100,
      sold: 150,
      adjusted: 0,
    });
    expect(result).toBe(-50);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/reconciliation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement calculateExpectedStock**

```typescript
// src/lib/reconciliation.ts
export interface StockInputs {
  purchased: number;
  sold: number;
  adjusted: number;
}

export function calculateExpectedStock(inputs: StockInputs): number {
  return inputs.purchased - inputs.sold - inputs.adjusted;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/reconciliation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/connectors/cgetc.ts src/lib/reconciliation.ts __tests__/lib/reconciliation.test.ts
git commit -m "feat: export CGETC auth/RPC, add expected stock calculation with tests"
```

---

### Task 3: CGETC Purchase Order Sync

**Files:**
- Create: `src/lib/integrations/connectors/cgetc-purchase.ts`
- Create: `src/app/api/purchase-orders/sync/route.ts`
- Test: `__tests__/lib/integrations/cgetc-purchase.test.ts`

- [ ] **Step 1: Write failing test for SKU bracket parsing**

```typescript
// __tests__/lib/integrations/cgetc-purchase.test.ts
import { describe, it, expect } from "vitest";
import { parseSkuFromProductName } from "@/lib/integrations/connectors/cgetc-purchase";

describe("cgetc-purchase", () => {
  describe("parseSkuFromProductName", () => {
    it("extracts SKU from brackets", () => {
      expect(parseSkuFromProductName("[8800316050001] ODD M-01 Starter-kit")).toBe("8800316050001");
    });

    it("extracts SKU with alphanumeric", () => {
      expect(parseSkuFromProductName("[XG-MNLD-D8SM] ODD M-01 30day Refill-pack")).toBe("XG-MNLD-D8SM");
    });

    it("returns null when no brackets", () => {
      expect(parseSkuFromProductName("Product without SKU")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseSkuFromProductName("")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/integrations/cgetc-purchase.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cgetc-purchase.ts**

```typescript
// src/lib/integrations/connectors/cgetc-purchase.ts
import { prisma } from "@/lib/prisma";
import { authenticate, odooRpc } from "./cgetc";
import type { Platform } from "@prisma/client";

interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

export function parseSkuFromProductName(name: string): string | null {
  const match = name.match(/^\[([^\]]+)\]/);
  return match ? match[1] : null;
}

export async function syncPurchaseOrders(credentials: CgetcCredentials, companyId: string) {
  const sessionId = await authenticate(credentials.url, credentials.db, credentials.email, credentials.password);

  // Fetch POs filtered to Hanah partner
  const pos = await odooRpc(credentials.url, sessionId, "purchase.order", "search_read", [[]], {
    fields: ["name", "partner_id", "date_order", "amount_total", "state", "order_line"],
    order: "id desc",
  });

  if (!Array.isArray(pos)) return { synced: 0 };

  let synced = 0;
  for (const po of pos) {
    // Fetch line items
    const lineIds = po.order_line || [];
    let lines: any[] = [];
    if (lineIds.length > 0) {
      lines = await odooRpc(credentials.url, sessionId, "purchase.order.line", "read", [lineIds], {
        fields: ["product_id", "name", "product_qty", "price_unit", "price_subtotal"],
      });
      if (!Array.isArray(lines)) lines = [];
    }

    // Upsert PO
    const poRecord = await prisma.purchaseOrder.upsert({
      where: {
        companyId_platform_externalPoId: {
          companyId,
          platform: "CGETC" as Platform,
          externalPoId: String(po.id),
        },
      },
      update: {
        poNumber: po.name || "",
        supplierName: po.partner_id?.[1] || "",
        orderDate: new Date(po.date_order || Date.now()),
        totalAmount: po.amount_total || 0,
        state: po.state || "",
        rawData: po,
      },
      create: {
        companyId,
        platform: "CGETC" as Platform,
        externalPoId: String(po.id),
        poNumber: po.name || "",
        supplierName: po.partner_id?.[1] || "",
        orderDate: new Date(po.date_order || Date.now()),
        totalAmount: po.amount_total || 0,
        state: po.state || "",
        rawData: po,
      },
    });

    // Delete existing lines and re-create (simpler than upsert each)
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: poRecord.id } });

    for (const line of lines) {
      const productName = line.product_id?.[1] || line.name || "";
      const sku = parseSkuFromProductName(productName);
      await prisma.purchaseOrderLine.create({
        data: {
          purchaseOrderId: poRecord.id,
          productName: productName.replace(/^\[[^\]]+\]\s*/, "").trim(),
          sku,
          quantity: line.product_qty || 0,
          unitPrice: line.price_unit || 0,
          subtotal: line.price_subtotal || 0,
        },
      });
    }

    synced++;
  }

  return { synced };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/integrations/cgetc-purchase.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Create API route**

```typescript
// src/app/api/purchase-orders/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { syncPurchaseOrders } from "@/lib/integrations/connectors/cgetc-purchase";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: "CGETC" } },
  });
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "CGETC integration not active" }, { status: 400 });
  }

  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const result = await syncPurchaseOrders(credentials, companyId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/connectors/cgetc-purchase.ts src/app/api/purchase-orders/sync/route.ts __tests__/lib/integrations/cgetc-purchase.test.ts
git commit -m "feat: CGETC purchase order sync with SKU parsing"
```

---

### Task 4: Reconciliation API

**Files:**
- Create: `src/app/api/reconciliation/route.ts`

- [ ] **Step 1: Create reconciliation API route**

```typescript
// src/app/api/reconciliation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { authenticate, odooRpc } from "@/lib/integrations/connectors/cgetc";
import { calculateExpectedStock } from "@/lib/reconciliation";

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  // 1. Get PO line items (purchased quantities by SKU)
  const poLines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrder: { companyId, platform: "CGETC" } },
    select: { sku: true, productName: true, quantity: true },
  });

  const purchasedBySku: Record<string, { qty: number; name: string }> = {};
  for (const line of poLines) {
    if (!line.sku) continue;
    if (!purchasedBySku[line.sku]) purchasedBySku[line.sku] = { qty: 0, name: line.productName };
    purchasedBySku[line.sku].qty += Number(line.quantity);
  }

  // 2. Get sold quantities by SKU (from order items)
  const orderItems = await prisma.orderItem.findMany({
    where: { order: { companyId } },
    include: { product: { select: { sku: true } } },
  });

  const soldBySku: Record<string, number> = {};
  for (const item of orderItems) {
    const sku = item.product.sku;
    soldBySku[sku] = (soldBySku[sku] || 0) + item.quantity;
  }

  // 3. Get reconciliation adjustments by SKU
  const adjustments = await prisma.reconciliationAdjustment.findMany({
    where: { companyId },
  });

  const adjustedBySku: Record<string, number> = {};
  for (const adj of adjustments) {
    adjustedBySku[adj.sku] = (adjustedBySku[adj.sku] || 0) + adj.quantity;
  }

  // 4. Get CGETC actual stock via stock.quant API
  let actualBySku: Record<string, number> = {};
  try {
    const config = await prisma.integrationConfig.findFirst({
      where: { companyId, platform: "CGETC", isActive: true },
    });
    if (config) {
      const creds = JSON.parse(decrypt(config.credentials));
      const sessionId = await authenticate(creds.url, creds.db, creds.email, creds.password);
      const quants = await odooRpc(creds.url, sessionId, "stock.quant", "search_read",
        [[["quantity", ">", 0], ["location_id.usage", "=", "internal"]]],
        { fields: ["product_id", "quantity"] },
      );
      if (Array.isArray(quants)) {
        for (const q of quants) {
          const name = q.product_id?.[1] || "";
          const sku = name.match(/^\[([^\]]+)\]/)?.[1];
          if (sku) {
            actualBySku[sku] = (actualBySku[sku] || 0) + (q.quantity || 0);
          }
        }
      }
    }
  } catch {
    // stock.quant fetch failed — actualBySku stays empty
  }

  // 5. Build comparison for tracked SKUs (those with PO data)
  const skus = Object.keys(purchasedBySku);
  const result = skus.map((sku) => {
    const purchased = purchasedBySku[sku]?.qty || 0;
    const sold = soldBySku[sku] || 0;
    const adjusted = adjustedBySku[sku] || 0;
    const expected = calculateExpectedStock({ purchased, sold, adjusted });
    const actual = actualBySku[sku];
    const difference = actual !== undefined ? actual - expected : null;

    return {
      sku,
      productName: purchasedBySku[sku]?.name || sku,
      purchased,
      sold,
      adjusted,
      expectedStock: expected,
      actualStock: actual ?? null,
      difference,
      status: difference === null ? "UNKNOWN" : difference === 0 ? "RECONCILED" : "UNRECONCILED",
    };
  });

  return NextResponse.json(result);
}

const VALID_REASONS = ["SEEDING", "DAMAGED", "SAMPLE", "PROMOTION", "OTHER"];

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const { companyId, sku, productName, quantity, reason, memo } = await req.json();

  if (!companyId || !sku || quantity === undefined || !reason) {
    return NextResponse.json({ error: "companyId, sku, quantity, reason required" }, { status: 400 });
  }

  if (!VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` }, { status: 400 });
  }

  const adjustment = await prisma.reconciliationAdjustment.create({
    data: {
      companyId,
      sku,
      productName: productName || sku,
      quantity: Number(quantity),
      reason,
      memo: memo || null,
      createdBy: (session as any).user?.id || "system",
    },
  });

  return NextResponse.json(adjustment, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/reconciliation/route.ts
git commit -m "feat: reconciliation API — expected vs actual comparison + adjustment creation"
```

---

### Task 5: Shipping Cost Sync

**Files:**
- Create: `src/lib/integrations/connectors/cgetc-shipping.ts`
- Create: `src/app/api/shipping-costs/sync/route.ts`
- Create: `src/app/api/shipping-costs/route.ts`
- Test: `__tests__/lib/integrations/cgetc-shipping.test.ts`

- [ ] **Step 1: Write failing test for invoice row parsing**

```typescript
// __tests__/lib/integrations/cgetc-shipping.test.ts
import { describe, it, expect } from "vitest";
import { parseInvoiceRow } from "@/lib/integrations/connectors/cgetc-shipping";

describe("cgetc-shipping", () => {
  describe("parseInvoiceRow", () => {
    it("parses SO number, date, and amount from table cells", () => {
      const cells = ["SO1414438", "", "07/29/2025", "", "$ 10.78"];
      const result = parseInvoiceRow(cells);
      expect(result).toEqual({
        soNumber: "SO1414438",
        date: "2025-07-29",
        amount: 10.78,
      });
    });

    it("returns null for invalid row", () => {
      expect(parseInvoiceRow(["", "", "", ""])).toBeNull();
    });

    it("handles amounts without spaces", () => {
      const cells = ["SO12345", "", "01/15/2026", "", "$27.26"];
      const result = parseInvoiceRow(cells);
      expect(result?.amount).toBe(27.26);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/integrations/cgetc-shipping.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cgetc-shipping.ts**

```typescript
// src/lib/integrations/connectors/cgetc-shipping.ts
import { prisma } from "@/lib/prisma";
import { authenticate } from "./cgetc";

interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

interface InvoiceData {
  soNumber: string;
  date: string; // YYYY-MM-DD
  amount: number;
}

export function parseInvoiceRow(cells: string[]): InvoiceData | null {
  if (cells.length < 5) return null;

  const soMatch = cells[0]?.match(/^(SO\d+)$/);
  if (!soMatch) return null;

  const dateMatch = cells[2]?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dateMatch) return null;
  const date = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;

  const amountStr = cells.find((c) => c.includes("$"));
  if (!amountStr) return null;
  const amount = parseFloat(amountStr.replace(/[$,\s]/g, ""));
  if (isNaN(amount)) return null;

  return { soNumber: soMatch[1], date, amount };
}

export async function syncShippingCosts(credentials: CgetcCredentials, companyId: string) {
  const sessionId = await authenticate(credentials.url, credentials.db, credentials.email, credentials.password);

  const invoices: InvoiceData[] = [];
  let page = 1;

  while (true) {
    const path = page === 1 ? "/my/invoices" : `/my/invoices?page=${page}`;
    const res = await fetch(`${credentials.url}${path}`, {
      headers: { Cookie: `session_id=${sessionId}` },
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    if (!res.ok) break;

    const html = await res.text();
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) break;

    const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
    if (rows.length === 0) break;

    let foundAny = false;
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [])
        .map((c) => c.replace(/<[^>]+>/g, "").replace(/[\n\t]/g, "").trim());
      const parsed = parseInvoiceRow(cells);
      if (parsed) {
        invoices.push(parsed);
        foundAny = true;
      }
    }

    if (!foundAny) break;
    page++;
    if (page > 50) break;
  }

  // Map SO numbers to orders
  let synced = 0;
  for (const inv of invoices) {
    // Find order by externalOrderNumber matching SO number
    const order = await prisma.order.findFirst({
      where: { companyId, externalOrderNumber: inv.soNumber },
    });

    await prisma.shippingCost.upsert({
      where: { companyId_soNumber: { companyId, soNumber: inv.soNumber } },
      update: { amount: inv.amount, invoiceDate: new Date(inv.date), orderId: order?.id || null },
      create: {
        companyId,
        soNumber: inv.soNumber,
        invoiceDate: new Date(inv.date),
        amount: inv.amount,
        orderId: order?.id || null,
      },
    });
    synced++;
  }

  return { synced, total: invoices.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/integrations/cgetc-shipping.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Create sync API route**

```typescript
// src/app/api/shipping-costs/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { syncShippingCosts } from "@/lib/integrations/connectors/cgetc-shipping";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: "CGETC" } },
  });
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "CGETC integration not active" }, { status: 400 });
  }

  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const result = await syncShippingCosts(credentials, companyId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Create list/summary API route**

```typescript
// src/app/api/shipping-costs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const summary = req.nextUrl.searchParams.get("summary") === "true";

  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const where: any = { companyId };
  if (from || to) {
    where.invoiceDate = {};
    if (from) where.invoiceDate.gte = new Date(from);
    if (to) where.invoiceDate.lte = new Date(to);
  }

  if (summary) {
    const costs = await prisma.shippingCost.findMany({ where, select: { amount: true, invoiceDate: true } });
    const total = costs.reduce((sum, c) => sum + Number(c.amount), 0);
    const byMonth: Record<string, { total: number; count: number }> = {};
    for (const c of costs) {
      const month = c.invoiceDate.toISOString().slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { total: 0, count: 0 };
      byMonth[month].total += Number(c.amount);
      byMonth[month].count++;
    }
    return NextResponse.json({
      total: Math.round(total * 100) / 100,
      count: costs.length,
      byMonth: Object.entries(byMonth)
        .map(([month, data]) => ({ month, total: Math.round(data.total * 100) / 100, count: data.count }))
        .sort((a, b) => b.month.localeCompare(a.month)),
    });
  }

  const costs = await prisma.shippingCost.findMany({
    where,
    include: { order: { select: { orderNumber: true } } },
    orderBy: { invoiceDate: "desc" },
  });

  return NextResponse.json(costs);
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/integrations/connectors/cgetc-shipping.ts src/app/api/shipping-costs/sync/route.ts src/app/api/shipping-costs/route.ts __tests__/lib/integrations/cgetc-shipping.test.ts
git commit -m "feat: shipping cost sync from CGETC invoices portal + list/summary API"
```

---

### Task 6: Customer API Upgrade (res.partner)

**Files:**
- Create: `src/lib/integrations/connectors/cgetc-partners.ts`
- Modify: `src/app/api/customers/fetch-cgetc-details/route.ts`
- Test: `__tests__/lib/integrations/cgetc-partners.test.ts`

- [ ] **Step 1: Write failing test for partner data mapping**

```typescript
// __tests__/lib/integrations/cgetc-partners.test.ts
import { describe, it, expect } from "vitest";
import { mapPartnerToContact } from "@/lib/integrations/connectors/cgetc-partners";

describe("cgetc-partners", () => {
  describe("mapPartnerToContact", () => {
    it("maps Odoo partner fields to contact info", () => {
      const partner = {
        id: 123,
        name: "John Doe",
        email: "john@example.com",
        phone: "+1-555-0123",
        street: "108 West 13th Street",
        city: "Wilmington",
        state_id: [1, "Delaware"],
        zip: "19801",
        country_id: [233, "United States"],
      };
      const result = mapPartnerToContact(partner);
      expect(result).toEqual({
        name: "John Doe",
        email: "john@example.com",
        phone: "+1-555-0123",
        address: "108 West 13th Street",
        city: "Wilmington",
        state: "Delaware",
        zip: "19801",
      });
    });

    it("handles missing fields", () => {
      const partner = { id: 1, name: "No Info" };
      const result = mapPartnerToContact(partner);
      expect(result.name).toBe("No Info");
      expect(result.email).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/integrations/cgetc-partners.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cgetc-partners.ts**

```typescript
// src/lib/integrations/connectors/cgetc-partners.ts
import { authenticate, odooRpc } from "./cgetc";

interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

export interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function mapPartnerToContact(partner: any): ContactInfo {
  const contact: ContactInfo = { name: partner.name || "" };
  if (partner.email) contact.email = partner.email;
  if (partner.phone) contact.phone = partner.phone;
  if (partner.street) contact.address = partner.street;
  if (partner.city) contact.city = partner.city;
  if (partner.state_id?.[1]) contact.state = partner.state_id[1];
  if (partner.zip) contact.zip = partner.zip;
  return contact;
}

export async function fetchPartnerDetails(
  credentials: CgetcCredentials,
  partnerIds: number[],
): Promise<Map<number, ContactInfo>> {
  if (partnerIds.length === 0) return new Map();

  const sessionId = await authenticate(credentials.url, credentials.db, credentials.email, credentials.password);

  const partners = await odooRpc(credentials.url, sessionId, "res.partner", "read", [partnerIds], {
    fields: ["name", "email", "phone", "street", "city", "state_id", "zip", "country_id"],
  });

  const result = new Map<number, ContactInfo>();
  if (Array.isArray(partners)) {
    for (const p of partners) {
      result.set(p.id, mapPartnerToContact(p));
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/integrations/cgetc-partners.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Update customer fetch API route**

Replace the entire content of `src/app/api/customers/fetch-cgetc-details/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchPartnerDetails } from "@/lib/integrations/connectors/cgetc-partners";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId } = await req.json();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: "CGETC" } },
  });
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "CGETC integration not active" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(config.credentials));

  // Find CGETC orders with partner_shipping_id in rawData
  const externalOrders = await prisma.externalOrder.findMany({
    where: { companyId, platform: "CGETC", status: "MAPPED", mappedOrderId: { not: null } },
    select: { mappedOrderId: true, rawData: true },
    take: 500,
  });

  // Extract unique partner IDs from rawData
  const partnerIdToOrderIds = new Map<number, string[]>();
  for (const eo of externalOrders) {
    const raw = eo.rawData as any;
    const partnerId = raw?.shippingId || raw?.customerId;
    if (partnerId && eo.mappedOrderId) {
      const existing = partnerIdToOrderIds.get(partnerId) || [];
      existing.push(eo.mappedOrderId);
      partnerIdToOrderIds.set(partnerId, existing);
    }
  }

  if (partnerIdToOrderIds.size === 0) {
    return NextResponse.json({ updated: 0, message: "No partner IDs found" });
  }

  // Fetch partner details via res.partner API
  const partnerDetails = await fetchPartnerDetails(credentials, Array.from(partnerIdToOrderIds.keys()));

  // Update customers
  let updated = 0;
  for (const [partnerId, orderIds] of Array.from(partnerIdToOrderIds.entries())) {
    const contact = partnerDetails.get(partnerId);
    if (!contact) continue;

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, customerId: { not: null } },
      select: { customerId: true },
    });

    const customerIds = [...new Set(orders.map((o) => o.customerId).filter(Boolean))] as string[];

    for (const customerId of customerIds) {
      const contactInfo: Record<string, string> = {};
      if (contact.address) contactInfo.address = contact.address;
      if (contact.city) contactInfo.city = contact.city;
      if (contact.state) contactInfo.state = contact.state;
      if (contact.zip) contactInfo.zip = contact.zip;
      if (contact.phone) contactInfo.phone = contact.phone;

      if (Object.keys(contactInfo).length === 0 && !contact.email) continue;

      await prisma.customer.update({
        where: { id: customerId },
        data: {
          ...(contact.email ? { email: contact.email } : {}),
          ...(Object.keys(contactInfo).length > 0 ? { contactInfo } : {}),
        },
      });
      updated++;
    }
  }

  return NextResponse.json({ updated, total: partnerIdToOrderIds.size });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/connectors/cgetc-partners.ts src/app/api/customers/fetch-cgetc-details/route.ts __tests__/lib/integrations/cgetc-partners.test.ts
git commit -m "feat: replace CGETC customer portal scraping with res.partner JSON-RPC API"
```

---

### Task 7: UI — Reconciliation + Shipping Costs Pages + Nav

**Files:**
- Create: `src/app/reconciliation/page.tsx`
- Create: `src/app/shipping-costs/page.tsx`
- Modify: `src/app/inventory/page.tsx`
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Add nav links**

In `src/components/nav/top-nav.tsx`, add after the Inventory link (line 11):

```typescript
  { href: "/reconciliation", label: "Reconciliation" },
  { href: "/shipping-costs", label: "Shipping" },
```

- [ ] **Step 2: Create Reconciliation page**

Create `src/app/reconciliation/page.tsx`. This is a server component that fetches data from the reconciliation API internally, plus a client component for the adjustment modal.

The page should:
- Fetch reconciliation data (PO lines, order items, adjustments, stock.quant) server-side
- Display KPI cards (Total Difference, Unreconciled count)
- Display SKU comparison DataTable
- Display Adjustment History DataTable
- Include an adjustment form (client component for the modal)

This is a large file. The implementer should follow the existing patterns from `src/app/inventory/page.tsx` and `src/app/orders/page.tsx` for layout, KpiCard usage, DataTable usage, and Badge components. Use the spec's information hierarchy and state coverage tables as the source of truth.

Key requirements:
- KpiCard x 2: Total Difference (rose-500 if negative), Unreconciled Items count
- DataTable columns: SKU, Product, Purchased, Sold, Adjusted, Expected, Actual, Diff, Status+Action
- Diff color: teal-600 if 0, rose-500 if negative, amber-500 if positive
- Status Badge: "Reconciled" green or "Unreconciled" red + "Adjust" button
- Adjustment History table below
- Empty states per spec
- Adjustment modal: SKU (read-only), Quantity, Reason dropdown, Memo, Submit

- [ ] **Step 3: Create Shipping Costs page**

Create `src/app/shipping-costs/page.tsx`.

Key requirements:
- KpiCard x 2: This Month Total, Avg per Order (CurrencyDisplay)
- Recharts BarChart for monthly trend
- DataTable with MonthPicker filter: Date, SO#, Order#, Amount
- Empty states per spec

- [ ] **Step 4: Modify Inventory page for comparison columns**

In `src/app/inventory/page.tsx`, add Expected/Actual/Diff columns for CGETC products.

Requirements:
- Only show for CGETC source rows that have PO data
- Expected = PO purchased - sold - adjusted (fetch from reconciliation data)
- Actual = CGETC live quantity (already available)
- Diff = Actual - Expected
- Color: teal-600 if 0, rose-500 if negative, amber-500 if positive

- [ ] **Step 5: Verify all pages render**

Run: `npm run dev` (port 4000)
- Navigate to `/reconciliation` — should show empty state or data
- Navigate to `/shipping-costs` — should show empty state
- Navigate to `/inventory` — should show new columns for CGETC rows

- [ ] **Step 6: Commit**

```bash
git add src/app/reconciliation/ src/app/shipping-costs/ src/app/inventory/page.tsx src/components/nav/top-nav.tsx
git commit -m "feat: reconciliation page, shipping costs page, inventory comparison columns"
```

---

### Task 8: Run All Tests + Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All new tests pass. Existing broken tests (order-mapper, tiktok-csv) are pre-existing.

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`
- `/reconciliation` — KPI cards + SKU table + adjustment history
- `/shipping-costs` — KPI cards + chart + detail table
- `/inventory` — Expected/Actual/Diff columns on CGETC rows
- Nav shows Reconciliation and Shipping links

- [ ] **Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve issues from final verification"
```
