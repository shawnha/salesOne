# Reconciliation Baseline-Forward Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PO-based expected inventory calculation with baseline-forward tracking — snapshot CGETC actual stock as baseline, track channel-by-channel sales since that snapshot, compare expected vs actual.

**Architecture:** New `InventoryBaseline` table stores per-SKU snapshots. Shared `buildBaselineRows()` function computes expected stock = baseline qty - sales since baseline - adjustments since baseline. Sales are broken down by channel using `Order.externalSource`. Both page and API use `fetchCgetcInventory` for actual stock (consistent source). Existing PO-based logic preserved as legacy API fallback.

**Tech Stack:** Next.js 14 (App Router, RSC), Prisma, PostgreSQL, TypeScript, Vitest

---

### Task 1: Add InventoryBaseline Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma:578` (before ReconciliationAdjustment)
- Create: migration via `npx prisma migrate dev`

- [ ] **Step 1: Add InventoryBaseline model to schema**

Add this model in `prisma/schema.prisma` right before the `ReconciliationAdjustment` model (line 578):

```prisma
model InventoryBaseline {
  id          String   @id @default(uuid())
  companyId   String   @map("company_id")
  company     Company  @relation(fields: [companyId], references: [id])
  sku         String
  productName String   @map("product_name")
  quantity    Int
  setAt       DateTime @map("set_at")
  setBy       String   @map("set_by")
  setByUser   User     @relation(fields: [setBy], references: [id])
  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([companyId, sku])
  @@map("inventory_baselines")
  @@schema("salesone")
}
```

Also add the reverse relations to the `Company` and `User` models:
- In `Company`: `inventoryBaselines InventoryBaseline[]`
- In `User`: `inventoryBaselines InventoryBaseline[]`

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-inventory-baseline
```

Expected: Migration succeeds, `inventory_baselines` table created in `salesone` schema.

- [ ] **Step 3: Verify Prisma client generation**

```bash
npx prisma generate
```

Expected: No errors. `prisma.inventoryBaseline` is available.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add InventoryBaseline model for baseline-forward reconciliation"
```

---

### Task 2: Shared types + baseline calculation logic + tests (TDD)

**Files:**
- Modify: `src/lib/reconciliation.ts`
- Modify: `__tests__/lib/reconciliation.test.ts`

- [ ] **Step 1: Write failing tests for baseline calculation and buildBaselineRows**

Replace `__tests__/lib/reconciliation.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import { calculateExpectedStock, calculateBaselineExpected, buildBaselineRows } from "@/lib/reconciliation";

// Keep existing tests for legacy function
describe("calculateExpectedStock (legacy PO-based)", () => {
  it("calculates expected stock from PO, sales, and adjustments", () => {
    const result = calculateExpectedStock({ purchased: 8840, sold: 8154, adjusted: 0 });
    expect(result).toBe(686);
  });

  it("subtracts adjustments from expected", () => {
    const result = calculateExpectedStock({ purchased: 8840, sold: 8154, adjusted: 20 });
    expect(result).toBe(666);
  });

  it("handles zero purchases", () => {
    const result = calculateExpectedStock({ purchased: 0, sold: 0, adjusted: 0 });
    expect(result).toBe(0);
  });

  it("can result in negative expected stock", () => {
    const result = calculateExpectedStock({ purchased: 100, sold: 150, adjusted: 0 });
    expect(result).toBe(-50);
  });
});

describe("calculateBaselineExpected", () => {
  it("returns baseline when no sales or adjustments", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: {},
      adjusted: 0,
    });
    expect(result).toBe(660);
  });

  it("subtracts total sales across channels from baseline", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: { SHOPIFY: 45, TIKTOK: 12, AMAZON: 3 },
      adjusted: 0,
    });
    expect(result).toBe(600);
  });

  it("subtracts adjustments from expected", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: { SHOPIFY: 45 },
      adjusted: 2,
    });
    expect(result).toBe(613);
  });

  it("handles negative adjustments (items returned)", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: { SHOPIFY: 45 },
      adjusted: -5,
    });
    expect(result).toBe(620);
  });

  it("can result in negative expected stock", () => {
    const result = calculateBaselineExpected({
      baseline: 10,
      salesByChannel: { SHOPIFY: 50 },
      adjusted: 0,
    });
    expect(result).toBe(-40);
  });
});

describe("buildBaselineRows", () => {
  const baselineDate = new Date("2026-03-29T00:00:00Z");

  const baselines = [
    { sku: "SKU1", productName: "Product 1", quantity: 100, setAt: baselineDate },
    { sku: "SKU2", productName: "Product 2", quantity: 50, setAt: baselineDate },
  ];

  it("builds rows with no sales or adjustments", () => {
    const rows = buildBaselineRows(baselines, [], [], {});
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sku: "SKU1",
      baseline: 100,
      totalSales: 0,
      adjusted: 0,
      expected: 100,
      actual: 0,
      diff: -100,
      reconciled: false,
    });
  });

  it("filters sales by date — only counts sales AFTER baseline", () => {
    const orderItems = [
      { sku: "SKU1", quantity: 10, orderDate: new Date("2026-03-28T23:59:59Z"), channel: "SHOPIFY" }, // before
      { sku: "SKU1", quantity: 5, orderDate: new Date("2026-03-29T00:00:01Z"), channel: "SHOPIFY" },  // after
      { sku: "SKU1", quantity: 3, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "AMAZON" },   // after
    ];
    const rows = buildBaselineRows(baselines, orderItems, [], { SKU1: 92 });
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.salesByChannel).toEqual({ SHOPIFY: 5, AMAZON: 3 });
    expect(row1.totalSales).toBe(8);
    expect(row1.expected).toBe(92); // 100 - 8
    expect(row1.actual).toBe(92);
    expect(row1.diff).toBe(0);
    expect(row1.reconciled).toBe(true);
  });

  it("excludes sales exactly at baseline time (boundary)", () => {
    const orderItems = [
      { sku: "SKU1", quantity: 10, orderDate: baselineDate, channel: "SHOPIFY" }, // exactly at baseline
    ];
    const rows = buildBaselineRows(baselines, orderItems, [], {});
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.totalSales).toBe(0); // should NOT count
  });

  it("filters adjustments by date — only counts adjustments AFTER baseline", () => {
    const adjustments = [
      { sku: "SKU1", quantity: -5, createdAt: new Date("2026-03-28T00:00:00Z") }, // before
      { sku: "SKU1", quantity: -3, createdAt: new Date("2026-03-30T00:00:00Z") }, // after
    ];
    const rows = buildBaselineRows(baselines, [], adjustments, { SKU1: 97 });
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.adjusted).toBe(-3);
    expect(row1.expected).toBe(103); // 100 - 0 - (-3) = 103
  });

  it("groups sales by channel correctly", () => {
    const orderItems = [
      { sku: "SKU1", quantity: 10, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "SHOPIFY" },
      { sku: "SKU1", quantity: 5, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "SHOPIFY" },
      { sku: "SKU1", quantity: 3, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "TIKTOK" },
    ];
    const rows = buildBaselineRows(baselines, orderItems, [], {});
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.salesByChannel).toEqual({ SHOPIFY: 15, TIKTOK: 3 });
  });

  it("sorts unreconciled first, then by absolute diff descending", () => {
    const rows = buildBaselineRows(baselines, [], [], { SKU1: 100, SKU2: 40 });
    // SKU1: diff=0 (reconciled), SKU2: diff=-10 (unreconciled)
    expect(rows[0].sku).toBe("SKU2"); // unreconciled first
    expect(rows[1].sku).toBe("SKU1"); // reconciled second
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/lib/reconciliation.test.ts
```

Expected: FAIL — `calculateBaselineExpected` and `buildBaselineRows` are not exported.

- [ ] **Step 3: Implement types, calculateBaselineExpected, and buildBaselineRows**

Update `src/lib/reconciliation.ts`:

```typescript
export interface StockInputs {
  purchased: number;
  sold: number;
  adjusted: number;
}

export function calculateExpectedStock(inputs: StockInputs): number {
  return inputs.purchased - inputs.sold - inputs.adjusted;
}

// --- Baseline-forward types and logic ---

export type ChannelSales = Record<string, number>;

export type ReconciliationRow = {
  sku: string;
  productName: string;
  baseline: number;
  baselineSetAt: string;
  salesByChannel: ChannelSales;
  totalSales: number;
  adjusted: number;
  expected: number;
  actual: number;
  diff: number;
  reconciled: boolean;
};

export interface BaselineInputs {
  baseline: number;
  salesByChannel: ChannelSales;
  adjusted: number;
}

export function calculateBaselineExpected(inputs: BaselineInputs): number {
  const totalSales = Object.values(inputs.salesByChannel).reduce((sum, qty) => sum + qty, 0);
  return inputs.baseline - totalSales - inputs.adjusted;
}

// Shared data assembly — used by both page.tsx (RSC) and API route
export type BaselineData = {
  sku: string;
  productName: string;
  quantity: number;
  setAt: Date;
};

export type OrderItemData = {
  sku: string;
  quantity: number;
  orderDate: Date;
  channel: string;
};

export type AdjustmentData = {
  sku: string;
  quantity: number;
  createdAt: Date;
};

export function buildBaselineRows(
  baselines: BaselineData[],
  orderItems: OrderItemData[],
  adjustments: AdjustmentData[],
  actualBySku: Record<string, number>,
): ReconciliationRow[] {
  // Pre-group orderItems by SKU for O(baselines + orderItems) instead of O(baselines * orderItems)
  const orderItemsBySku = new Map<string, OrderItemData[]>();
  for (const item of orderItems) {
    const list = orderItemsBySku.get(item.sku) || [];
    list.push(item);
    orderItemsBySku.set(item.sku, list);
  }

  // Pre-group adjustments by SKU
  const adjustmentsBySku = new Map<string, AdjustmentData[]>();
  for (const adj of adjustments) {
    const list = adjustmentsBySku.get(adj.sku) || [];
    list.push(adj);
    adjustmentsBySku.set(adj.sku, list);
  }

  const rows: ReconciliationRow[] = baselines.map((bl) => {
    // Sales since baseline by channel
    const salesByChannel: ChannelSales = {};
    const skuItems = orderItemsBySku.get(bl.sku) || [];
    for (const item of skuItems) {
      if (item.orderDate <= bl.setAt) continue;
      salesByChannel[item.channel] = (salesByChannel[item.channel] || 0) + item.quantity;
    }

    // Adjustments since baseline
    let adjusted = 0;
    const skuAdj = adjustmentsBySku.get(bl.sku) || [];
    for (const adj of skuAdj) {
      if (adj.createdAt <= bl.setAt) continue;
      adjusted += adj.quantity;
    }

    const totalSales = Object.values(salesByChannel).reduce((sum, qty) => sum + qty, 0);
    const expected = calculateBaselineExpected({ baseline: bl.quantity, salesByChannel, adjusted });
    const actual = actualBySku[bl.sku] ?? 0;
    const diff = actual - expected;

    return {
      sku: bl.sku,
      productName: bl.productName,
      baseline: bl.quantity,
      baselineSetAt: bl.setAt.toISOString(),
      salesByChannel,
      totalSales,
      adjusted,
      expected,
      actual,
      diff,
      reconciled: diff === 0,
    };
  });

  // Sort: unreconciled first, then by absolute diff descending
  rows.sort((a, b) => {
    if (a.reconciled !== b.reconciled) return a.reconciled ? 1 : -1;
    return Math.abs(b.diff) - Math.abs(a.diff);
  });

  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/lib/reconciliation.test.ts
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reconciliation.ts __tests__/lib/reconciliation.test.ts
git commit -m "feat: add baseline types, calculateBaselineExpected, and buildBaselineRows with tests"
```

---

### Task 3: Baseline API — set and get baselines

**Files:**
- Create: `src/app/api/reconciliation/baseline/route.ts`

- [ ] **Step 1: Create baseline API route**

Create `src/app/api/reconciliation/baseline/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchCgetcInventory } from "@/lib/integrations/connectors/cgetc";

// GET: Fetch current baselines for a company
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const baselines = await prisma.inventoryBaseline.findMany({
    where: { companyId },
    orderBy: { sku: "asc" },
  });

  return NextResponse.json(baselines);
}

// POST: Set baselines from current CGETC live inventory
// Body: { companyId } — snapshots ALL CGETC products as baselines
// On reset: deletes all existing baselines first, then inserts fresh
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const { companyId } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  // Fetch live CGETC inventory
  const config = await prisma.integrationConfig.findFirst({
    where: { companyId, platform: "CGETC", isActive: true },
  });
  if (!config) {
    return NextResponse.json({ error: "CGETC integration not configured" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(config.credentials));
  const products = await fetchCgetcInventory(credentials);

  if (products.length === 0) {
    return NextResponse.json({ error: "No products found from CGETC" }, { status: 400 });
  }

  const now = new Date();
  const userId = (session as any).user?.id || "system";
  const validProducts = products.filter((p) => p.sku);

  // Delete all existing baselines, then insert fresh (handles stale SKUs)
  const results = await prisma.$transaction([
    prisma.inventoryBaseline.deleteMany({ where: { companyId } }),
    ...validProducts.map((p) =>
      prisma.inventoryBaseline.create({
        data: {
          companyId,
          sku: p.sku,
          productName: p.name,
          quantity: p.quantity,
          setAt: now,
          setBy: userId,
        },
      })
    ),
  ]);

  // First result is deleteMany, rest are creates
  const createdCount = results.length - 1;

  return NextResponse.json({ count: createdCount, setAt: now.toISOString() }, { status: 201 });
}
```

- [ ] **Step 2: Verify the route compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Check for any import errors. Fix if needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reconciliation/baseline/route.ts
git commit -m "feat: add baseline API with delete-then-insert for clean resets"
```

---

### Task 4: Redesign reconciliation page — baseline-forward with channel breakdown

**Files:**
- Modify: `src/app/reconciliation/page.tsx` (full rewrite)
- Modify: `src/components/reconciliation/reconciliation-table.tsx` (full rewrite)
- Create: `src/components/reconciliation/set-baseline-button.tsx`
- Keep: `src/components/reconciliation/adjust-modal.tsx` (unchanged)

- [ ] **Step 1: Rewrite the reconciliation page**

Replace `src/app/reconciliation/page.tsx` with:

```tsx
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { fetchCgetcInventory, type CgetcProduct } from "@/lib/integrations/connectors/cgetc";
import { decrypt } from "@/lib/integrations/encryption";
import { buildBaselineRows } from "@/lib/reconciliation";
import type { ReconciliationRow } from "@/lib/reconciliation";
import { ReconciliationTable } from "@/components/reconciliation/reconciliation-table";
import { SetBaselineButton } from "@/components/reconciliation/set-baseline-button";

type AdjustmentRow = {
  id: string;
  date: string;
  sku: string;
  quantity: number;
  reason: string;
  memo: string | null;
};

export default async function ReconciliationPage() {
  // Fetch CGETC config
  const cgetcConfig = await prisma.integrationConfig.findFirst({
    where: { platform: "CGETC", isActive: true },
  });
  const companyId = cgetcConfig?.companyId || "";

  // Fetch baselines + adjustments in parallel
  const [baselines, adjustments] = await Promise.all([
    prisma.inventoryBaseline.findMany({ where: { companyId } }),
    prisma.reconciliationAdjustment.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Fetch CGETC actual stock
  let cgetcProducts: CgetcProduct[] = [];
  let cgetcError: string | null = null;
  if (cgetcConfig) {
    try {
      const creds = JSON.parse(decrypt(cgetcConfig.credentials));
      cgetcProducts = await fetchCgetcInventory(creds);
    } catch (e: any) {
      cgetcError = e.message || "Failed to fetch CGETC inventory";
    }
  }

  const hasBaselines = baselines.length > 0;

  // If no baselines set, show setup state
  if (!hasBaselines) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Reconciliation</h1>
        </div>
        <Card>
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">Set Inventory Baseline</h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                Capture current CGETC inventory as your starting point. All future sales will be
                tracked against this baseline to detect discrepancies.
              </p>
            </div>
            <SetBaselineButton companyId={companyId} />
          </div>
        </Card>
      </div>
    );
  }

  // Compute earliest baseline date for DB query optimization
  const earliestSetAt = baselines.reduce(
    (earliest, b) => (b.setAt < earliest ? b.setAt : earliest),
    baselines[0].setAt
  );

  // Fetch only order items AFTER earliest baseline (DB-level filter)
  const allOrderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        companyId,
        orderDate: { gt: earliestSetAt },
      },
    },
    include: {
      order: { select: { externalSource: true, orderDate: true } },
      product: { select: { sku: true } },
    },
  });

  // Map to shared data format
  const orderItemData = allOrderItems
    .filter((item) => item.product?.sku)
    .map((item) => ({
      sku: item.product.sku,
      quantity: item.quantity,
      orderDate: item.order.orderDate,
      channel: item.order.externalSource || "OTHER",
    }));

  const adjustmentData = adjustments.map((adj) => ({
    sku: adj.sku,
    quantity: adj.quantity,
    createdAt: adj.createdAt,
  }));

  const actualBySku: Record<string, number> = {};
  for (const p of cgetcProducts) {
    if (p.sku) actualBySku[p.sku] = p.quantity;
  }

  // Build rows using shared function
  const rows = buildBaselineRows(baselines, orderItemData, adjustmentData, actualBySku);

  const totalDiff = rows.reduce((sum, r) => sum + r.diff, 0);
  const unreconciledCount = rows.filter((r) => !r.reconciled).length;

  // Detect unbaselined products (in CGETC but not in baselines)
  const baselineSkus = new Set(baselines.map((b) => b.sku));
  const unbaselinedProducts = cgetcProducts.filter(
    (p) => p.sku && !baselineSkus.has(p.sku) && p.quantity > 0
  );

  // Adjustment history
  const adjustmentRows: AdjustmentRow[] = adjustments.map((adj) => ({
    id: adj.id,
    date: adj.createdAt.toISOString(),
    sku: adj.sku,
    quantity: adj.quantity,
    reason: adj.reason,
    memo: adj.memo,
  }));

  const adjColumns = [
    {
      key: "date",
      header: "Date",
      render: (row: AdjustmentRow) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: AdjustmentRow) => <span className="font-semibold">{row.sku}</span>,
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right" as const,
      render: (row: AdjustmentRow) => (
        <span
          className={`font-semibold ${
            row.quantity > 0 ? "text-teal-600" : row.quantity < 0 ? "text-rose-500" : ""
          }`}
        >
          {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row: AdjustmentRow) => (
        <span className="text-[var(--text-secondary)]">{row.reason}</span>
      ),
    },
    {
      key: "memo",
      header: "Memo",
      render: (row: AdjustmentRow) => (
        <span className="text-[var(--text-tertiary)]">{row.memo ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Reconciliation</h1>
          {cgetcProducts.length > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              CGETC live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unreconciledCount > 0 && (
            <span className="text-xs font-semibold text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full">
              {unreconciledCount} unreconciled
            </span>
          )}
          <SetBaselineButton
            companyId={companyId}
            isReset
            baselineCount={baselines.length}
            adjustmentCount={adjustments.filter((a) => a.createdAt > earliestSetAt).length}
          />
        </div>
      </div>

      {cgetcError && (
        <div className="px-3 py-2 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-600">
          CGETC sync error: {cgetcError}
        </div>
      )}

      {/* Baseline info */}
      <div className="text-[11px] text-[var(--text-tertiary)]">
        Baseline set:{" "}
        {new Date(earliestSetAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        {" · "}Tracking {baselines.length} SKUs
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          label="Total Difference"
          value={totalDiff > 0 ? `+${totalDiff}` : String(totalDiff)}
          change={
            totalDiff === 0
              ? { value: "All matched", direction: "up" as const }
              : totalDiff < 0
              ? { value: `${Math.abs(totalDiff)} units short`, direction: "down" as const }
              : { value: `${totalDiff} units over`, direction: "neutral" as const }
          }
        />
        <KpiCard
          label="Unreconciled Items"
          value={String(unreconciledCount)}
          subtitle={`of ${rows.length} tracked products`}
        />
      </div>

      {/* Reconciliation Table */}
      <Card>
        <ReconciliationTable rows={rows} companyId={companyId} />
      </Card>

      {/* Unbaselined Products */}
      {unbaselinedProducts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Unbaselined Products{" "}
            <span className="text-[var(--text-quaternary)]">({unbaselinedProducts.length})</span>
          </h2>
          <Card>
            <div className="text-[11px] text-[var(--text-secondary)] px-4 py-3 border-b border-[var(--card-border)]">
              These CGETC products are not in the current baseline. Click "Reset Baseline" to include them.
            </div>
            <DataTable
              columns={[
                { key: "sku", header: "SKU", render: (p: CgetcProduct) => <span className="font-semibold">{p.sku}</span> },
                { key: "name", header: "Product", render: (p: CgetcProduct) => <span className="text-[var(--text-secondary)]">{p.name}</span> },
                { key: "quantity", header: "CGETC Qty", align: "right" as const, render: (p: CgetcProduct) => <span className="font-semibold">{p.quantity}</span> },
              ]}
              data={unbaselinedProducts}
            />
          </Card>
        </div>
      )}

      {/* Adjustment History */}
      {adjustmentRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Adjustment History{" "}
            <span className="text-[var(--text-quaternary)]">({adjustmentRows.length})</span>
          </h2>
          <Card>
            <DataTable columns={adjColumns} data={adjustmentRows} />
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite reconciliation table with channel breakdown**

Replace `src/components/reconciliation/reconciliation-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/ui/table";
import { AdjustModal } from "./adjust-modal";
import type { ReconciliationRow } from "@/lib/reconciliation";

type Props = {
  rows: ReconciliationRow[];
  companyId: string;
};

const CHANNEL_LABELS: Record<string, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  NAVER: "Naver",
  PHARMACY: "Pharmacy",
  CGETC: "CGETC",
  ORDERDESK: "OrderDesk",
  OTHER: "Other",
};

function ChannelBreakdown({ salesByChannel }: { salesByChannel: Record<string, number> }) {
  const entries = Object.entries(salesByChannel).filter(([, qty]) => qty > 0);
  if (entries.length === 0) return <span className="text-[var(--text-quaternary)]">—</span>;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {entries.map(([channel, qty]) => (
        <span key={channel} className="text-[11px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-tertiary)]">{CHANNEL_LABELS[channel] || channel}</span>{" "}
          <span className="font-semibold">-{qty}</span>
        </span>
      ))}
    </div>
  );
}

export function ReconciliationTable({ rows, companyId }: Props) {
  const router = useRouter();
  const [adjusting, setAdjusting] = useState<ReconciliationRow | null>(null);

  const columns = [
    {
      key: "sku",
      header: "SKU",
      render: (row: ReconciliationRow) => (
        <div>
          <span className="font-semibold">{row.sku}</span>
          <div className="text-[11px] text-[var(--text-tertiary)]">{row.productName}</div>
        </div>
      ),
    },
    {
      key: "baseline",
      header: "Baseline",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span className="font-semibold">{row.baseline}</span>
      ),
    },
    {
      key: "sales",
      header: "Sales Since Baseline",
      render: (row: ReconciliationRow) => (
        <div>
          <span className="font-semibold text-rose-500">
            {row.totalSales > 0 ? `-${row.totalSales}` : "—"}
          </span>
          <ChannelBreakdown salesByChannel={row.salesByChannel} />
        </div>
      ),
    },
    {
      key: "adjusted",
      header: "Adjusted",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span
          className={`font-semibold ${
            row.adjusted !== 0 ? "text-amber-500" : "text-[var(--text-quaternary)]"
          }`}
        >
          {row.adjusted === 0 ? "—" : row.adjusted > 0 ? `+${row.adjusted}` : row.adjusted}
        </span>
      ),
    },
    {
      key: "expected",
      header: "Expected",
      align: "right" as const,
      render: (row: ReconciliationRow) => <span className="font-semibold">{row.expected}</span>,
    },
    {
      key: "actual",
      header: "Actual",
      align: "right" as const,
      render: (row: ReconciliationRow) => <span className="font-semibold">{row.actual}</span>,
    },
    {
      key: "diff",
      header: "Diff",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span
          className={`font-semibold ${
            row.diff === 0
              ? "text-teal-600"
              : row.diff < 0
              ? "text-rose-500"
              : "text-amber-500"
          }`}
        >
          {row.diff > 0 ? `+${row.diff}` : row.diff}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: ReconciliationRow) =>
        row.reconciled ? (
          <span className="text-teal-600 text-[11px] font-semibold">Reconciled</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-rose-500 text-[11px] font-semibold">Unreconciled</span>
            <button
              onClick={() => setAdjusting(row)}
              className="text-[11px] text-accent font-semibold hover:underline"
            >
              Adjust
            </button>
          </div>
        ),
    },
  ];

  return (
    <>
      <DataTable columns={columns} data={rows} />
      {adjusting && (
        <AdjustModal
          sku={adjusting.sku}
          productName={adjusting.productName}
          companyId={companyId}
          currentDiff={adjusting.diff}
          onClose={() => setAdjusting(null)}
          onSuccess={() => {
            setAdjusting(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Create SetBaselineButton client component with reset warning**

Create `src/components/reconciliation/set-baseline-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companyId: string;
  isReset?: boolean;
  baselineCount?: number;
  adjustmentCount?: number;
};

export function SetBaselineButton({ companyId, isReset, baselineCount, adjustmentCount }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleSet = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reconciliation/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set baseline");
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (isReset) {
    if (confirming) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Reset {baselineCount} SKU baselines
            {adjustmentCount ? ` and clear ${adjustmentCount} adjustment(s) from tracking` : ""}?
            <span className="text-[var(--text-quaternary)]"> (history kept)</span>
          </span>
          <button
            onClick={handleSet}
            disabled={loading}
            className="text-[11px] font-semibold text-rose-500 hover:underline disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[11px] font-semibold text-[var(--text-tertiary)] hover:underline"
          >
            Cancel
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:underline"
      >
        Reset Baseline
      </button>
    );
  }

  return (
    <button
      onClick={handleSet}
      disabled={loading}
      className="px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "Setting baseline..." : "Set Baseline from CGETC"}
    </button>
  );
}
```

- [ ] **Step 4: Verify the page compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/reconciliation/page.tsx src/components/reconciliation/reconciliation-table.tsx src/components/reconciliation/set-baseline-button.tsx
git commit -m "feat: redesign reconciliation page with baseline-forward tracking, channel breakdown, and unbaselined products"
```

---

### Task 5: Update reconciliation API GET to support baseline mode

**Files:**
- Modify: `src/app/api/reconciliation/route.ts`

- [ ] **Step 1: Update GET handler to use baselines and shared buildBaselineRows**

Replace `src/app/api/reconciliation/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchCgetcInventory } from "@/lib/integrations/connectors/cgetc";
import { calculateExpectedStock, buildBaselineRows } from "@/lib/reconciliation";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  // Check if baselines exist
  const baselines = await prisma.inventoryBaseline.findMany({
    where: { companyId },
  });

  // Get CGETC actual stock (same source as page — fetchCgetcInventory)
  let actualBySku: Record<string, number> = {};
  try {
    const config = await prisma.integrationConfig.findFirst({
      where: { companyId, platform: "CGETC", isActive: true },
    });
    if (config) {
      const creds = JSON.parse(decrypt(config.credentials));
      const products = await fetchCgetcInventory(creds);
      for (const p of products) {
        if (p.sku) actualBySku[p.sku] = p.quantity;
      }
    }
  } catch {
    // CGETC fetch failed — actualBySku stays empty
  }

  // Baseline mode
  if (baselines.length > 0) {
    // Compute earliest baseline for query optimization
    const earliestSetAt = baselines.reduce(
      (earliest, b) => (b.setAt < earliest ? b.setAt : earliest),
      baselines[0].setAt
    );

    const [orderItems, adjustments] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { companyId, orderDate: { gt: earliestSetAt } } },
        include: {
          order: { select: { externalSource: true, orderDate: true } },
          product: { select: { sku: true } },
        },
      }),
      prisma.reconciliationAdjustment.findMany({ where: { companyId } }),
    ]);

    const orderItemData = orderItems
      .filter((item) => item.product?.sku)
      .map((item) => ({
        sku: item.product.sku,
        quantity: item.quantity,
        orderDate: item.order.orderDate,
        channel: item.order.externalSource || "OTHER",
      }));

    const adjustmentData = adjustments.map((adj) => ({
      sku: adj.sku,
      quantity: adj.quantity,
      createdAt: adj.createdAt,
    }));

    const rows = buildBaselineRows(baselines, orderItemData, adjustmentData, actualBySku);

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        mode: "baseline" as const,
        status: r.reconciled ? "RECONCILED" : "UNRECONCILED",
      }))
    );
  }

  // Legacy PO-based mode (fallback)
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

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { companyId } },
    include: { product: { select: { sku: true } } },
  });

  const soldBySku: Record<string, number> = {};
  for (const item of orderItems) {
    const sku = item.product.sku;
    soldBySku[sku] = (soldBySku[sku] || 0) + item.quantity;
  }

  const adjustments = await prisma.reconciliationAdjustment.findMany({ where: { companyId } });
  const adjustedBySku: Record<string, number> = {};
  for (const adj of adjustments) {
    adjustedBySku[adj.sku] = (adjustedBySku[adj.sku] || 0) + adj.quantity;
  }

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
      mode: "legacy" as const,
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

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reconciliation/route.ts
git commit -m "feat: update reconciliation API to use shared buildBaselineRows with consistent CGETC source"
```

---

### Task 6: Run all tests + manual verification

**Files:**
- No new files

- [ ] **Step 1: Run unit tests**

```bash
npx vitest run
```

Expected: All tests pass, including new baseline and buildBaselineRows tests.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run dev server and verify page loads**

```bash
npx next dev
```

Open `http://localhost:3000/reconciliation` — should show "Set Inventory Baseline" empty state (since no baselines exist yet).

- [ ] **Step 4: Commit any fixes if needed**

Only if Step 1-3 revealed issues that needed fixing.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps |
| Codex Review | `/codex review` | Independent 2nd opinion | 4 | issues_found | 7 findings, 2 actionable (source mismatch, stale SKUs) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 4 | CLEAR | 6 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 4/10 -> 8/10, 6 decisions |

**UNRESOLVED:** 0
**VERDICT:** CEO + ENG + DESIGN CLEARED — ready to implement

### Eng Review Accepted Changes (this run)
1. Extract `buildBaselineRows()` shared function into `reconciliation.ts` (DRY)
2. Move `ReconciliationRow`/`ChannelSales` types to `reconciliation.ts`
3. Add counts to reset baseline warning
4. Remove dead `baselineMap`, flatten IIFE in page data fetch
5. Add API/integration tests for date filtering and baseline logic (via buildBaselineRows tests)
6. Filter orderItems by `orderDate > min(baseline.setAt)` at DB level
7. API route: use `fetchCgetcInventory` instead of `stock.quant` for actual stock
8. Reset: delete all baselines first, then insert fresh (fix stale SKUs)
9. Build "Unbaselined Products" section showing CGETC products not yet in baselines
