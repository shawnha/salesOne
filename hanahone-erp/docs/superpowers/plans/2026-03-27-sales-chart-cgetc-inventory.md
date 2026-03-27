# Sales Chart + CGETC Inventory Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add channel-breakdown sales charts to the Sales page and implement CGETC 3PL inventory sync via Odoo JSON-RPC API.

**Architecture:** Sales chart uses Recharts (client component) fed by server-side Prisma aggregation queries. CGETC connector authenticates via Odoo session login and fetches `stock.quant` data, mapping by SKU to existing products. Both features plug into existing patterns (page layout, sync-runner).

**Tech Stack:** Recharts, Next.js 14 (App Router), Prisma, Odoo JSON-RPC, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Install | `recharts` npm package | Chart library |
| Create | `src/components/sales/SalesChart.tsx` | Client component: donut + stacked bar charts |
| Create | `src/lib/sales-chart-data.ts` | Server-side chart data aggregation queries |
| Modify | `src/app/sales/page.tsx` | Add chart data loading + SalesChart component |
| Modify | `src/lib/integrations/connectors/cgetc.ts` | Implement Odoo JSON-RPC login + stock.quant fetch |
| Modify | `src/lib/integrations/types.ts` | Add `SYNC` to credentials type hint (no schema change needed) |

---

### Task 1: Install Recharts

- [ ] **Step 1: Install recharts**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
npm install recharts
```

Expected: added recharts to dependencies in package.json

- [ ] **Step 2: Verify installation**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
node -e "require('recharts'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add package.json package-lock.json
git commit -m "feat: add recharts dependency for sales charts"
```

---

### Task 2: Create chart data aggregation function

**Files:**
- Create: `src/lib/sales-chart-data.ts`

- [ ] **Step 1: Create the server-side data aggregation function**

Create `src/lib/sales-chart-data.ts`:

```typescript
import { prisma } from "@/lib/prisma";

export interface ChannelSalesData {
  channel: string;
  amount: number;
  color: string;
}

export interface MonthlyChannelData {
  month: string; // "Jan", "Feb", etc.
  SHOPIFY: number;
  AMAZON: number;
  TIKTOK: number;
  NAVER: number;
  PHARMACY: number;
  MANUAL: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  SHOPIFY: "#95BF47",
  AMAZON: "#FF9900",
  TIKTOK: "#000000",
  NAVER: "#03C75A",
  PHARMACY: "#6B7280",
  MANUAL: "#9CA3AF",
};

const CHANNEL_LABELS: Record<string, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  NAVER: "Naver",
  PHARMACY: "Pharmacy",
  MANUAL: "Manual",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { CHANNEL_COLORS, CHANNEL_LABELS };

export async function getChannelSalesData(
  companyId: string | undefined,
  month: string | undefined // "YYYY-MM" format
): Promise<{ donut: ChannelSalesData[]; monthly: MonthlyChannelData[] }> {
  const now = new Date();
  const [targetYear, targetMonth] = month
    ? [parseInt(month.split("-")[0]), parseInt(month.split("-")[1]) - 1]
    : [now.getFullYear(), now.getMonth()];

  // Donut: aggregate by channel for the selected month
  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 1);

  const where: any = {
    type: "SALE",
    fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
    financialStatus: { in: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"] },
    orderDate: { gte: monthStart, lt: monthEnd },
  };
  if (companyId) where.companyId = companyId;

  const orders = await prisma.order.findMany({
    where,
    select: { externalSource: true, netAmount: true, totalAmount: true },
  });

  const channelTotals: Record<string, number> = {};
  for (const order of orders) {
    const channel = order.externalSource || "MANUAL";
    channelTotals[channel] = (channelTotals[channel] || 0) + Number(order.netAmount ?? order.totalAmount);
  }

  const donut: ChannelSalesData[] = Object.entries(channelTotals)
    .map(([channel, amount]) => ({
      channel: CHANNEL_LABELS[channel] || channel,
      amount,
      color: CHANNEL_COLORS[channel] || "#9CA3AF",
    }))
    .sort((a, b) => b.amount - a.amount);

  // Monthly: last 6 months stacked bar data
  const sixMonthsAgo = new Date(targetYear, targetMonth - 5, 1);
  const monthlyWhere: any = {
    type: "SALE",
    fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
    financialStatus: { in: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"] },
    orderDate: { gte: sixMonthsAgo, lt: monthEnd },
  };
  if (companyId) monthlyWhere.companyId = companyId;

  const monthlyOrders = await prisma.order.findMany({
    where: monthlyWhere,
    select: { externalSource: true, netAmount: true, totalAmount: true, orderDate: true },
  });

  // Build 6-month buckets
  const monthly: MonthlyChannelData[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new Date(targetYear, targetMonth - 5 + i, 1);
    monthly.push({
      month: MONTH_NAMES[m.getMonth()],
      SHOPIFY: 0,
      AMAZON: 0,
      TIKTOK: 0,
      NAVER: 0,
      PHARMACY: 0,
      MANUAL: 0,
    });
  }

  for (const order of monthlyOrders) {
    const d = new Date(order.orderDate);
    const idx = (d.getFullYear() - sixMonthsAgo.getFullYear()) * 12 + d.getMonth() - sixMonthsAgo.getMonth();
    if (idx >= 0 && idx < 6) {
      const channel = (order.externalSource || "MANUAL") as keyof Omit<MonthlyChannelData, "month">;
      if (channel in monthly[idx]) {
        monthly[idx][channel] += Number(order.netAmount ?? order.totalAmount);
      }
    }
  }

  return { donut, monthly };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
npx tsc --noEmit src/lib/sales-chart-data.ts 2>&1 | head -20
```

Expected: no errors (or only unrelated warnings)

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/lib/sales-chart-data.ts
git commit -m "feat: add channel sales data aggregation for charts"
```

---

### Task 3: Create SalesChart client component

**Files:**
- Create: `src/components/sales/SalesChart.tsx`

- [ ] **Step 1: Create the chart component**

Create `src/components/sales/SalesChart.tsx`:

```tsx
"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ChannelSalesData, MonthlyChannelData } from "@/lib/sales-chart-data";
import { CHANNEL_COLORS } from "@/lib/sales-chart-data";

const formatUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Channels to show in stacked bar (order matters for stacking)
const BAR_CHANNELS = [
  { key: "SHOPIFY", label: "Shopify" },
  { key: "AMAZON", label: "Amazon" },
  { key: "TIKTOK", label: "TikTok" },
  { key: "NAVER", label: "Naver" },
  { key: "PHARMACY", label: "Pharmacy" },
  { key: "MANUAL", label: "Manual" },
] as const;

interface SalesChartProps {
  donut: ChannelSalesData[];
  monthly: MonthlyChannelData[];
}

export function SalesChart({ donut, monthly }: SalesChartProps) {
  const total = donut.reduce((sum, d) => sum + d.amount, 0);

  // Filter bar channels to only those with data
  const activeChannels = BAR_CHANNELS.filter((ch) =>
    monthly.some((m) => m[ch.key as keyof MonthlyChannelData] as number > 0)
  );

  if (donut.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
      {/* Donut Chart */}
      <div className="flex flex-col items-center">
        <p className="text-xs text-[var(--text-secondary)] mb-2">Channel Breakdown</p>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={donut}
              dataKey="amount"
              nameKey="channel"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {donut.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatUSD(value)}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <p className="text-lg font-bold mt-[-40px]">{formatUSD(total)}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center">
          {donut.map((d) => (
            <div key={d.channel} className="flex items-center gap-1 text-[11px]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-[var(--text-secondary)]">{d.channel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div>
        <p className="text-xs text-[var(--text-secondary)] mb-2">Monthly Trend (6 months)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatUSD(value), name]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            {activeChannels.map((ch) => (
              <Bar
                key={ch.key}
                dataKey={ch.key}
                name={ch.label}
                stackId="sales"
                fill={CHANNEL_COLORS[ch.key]}
                radius={ch.key === activeChannels[activeChannels.length - 1].key ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/components/sales/SalesChart.tsx
git commit -m "feat: add SalesChart component with donut and stacked bar"
```

---

### Task 4: Integrate charts into Sales page

**Files:**
- Modify: `src/app/sales/page.tsx`

- [ ] **Step 1: Update Sales page to include chart data and component**

Modify `src/app/sales/page.tsx`. The changes are:

1. Add import for `getChannelSalesData` and `SalesChart`
2. Call `getChannelSalesData` in the page function
3. Add `<SalesChart>` between KPI header and the Card/table

Updated full file `src/app/sales/page.tsx`:

```typescript
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthPicker } from "@/components/ui/month-picker";
import { SalesChart } from "@/components/sales/SalesChart";
import { getChannelSalesData } from "@/lib/sales-chart-data";
import Link from "next/link";

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const platformBadge: Record<string, { label: string; color: string }> = {
  SHOPIFY: { label: "Shopify", color: "text-green-600 bg-green-600/[0.08]" },
  AMAZON: { label: "Amazon", color: "text-orange-600 bg-orange-600/[0.08]" },
  TIKTOK: { label: "TikTok", color: "text-pink-600 bg-pink-600/[0.08]" },
  NAVER: { label: "Naver", color: "text-emerald-600 bg-emerald-600/[0.08]" },
  PHARMACY: { label: "Pharmacy", color: "text-blue-600 bg-blue-600/[0.08]" },
};

function getMonthRange(monthParam?: string) {
  const now = new Date();
  const [y, m] = monthParam
    ? [parseInt(monthParam.split("-")[0]), parseInt(monthParam.split("-")[1]) - 1]
    : [now.getFullYear(), now.getMonth()];
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  return { gte: start, lt: end };
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { company?: string; month?: string };
}) {
  const dateRange = getMonthRange(searchParams.month);

  const where: any = {
    type: "SALE" as const,
    fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
    financialStatus: { in: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"] },
    orderDate: dateRange,
  };
  if (searchParams.company) where.companyId = searchParams.company;

  const [orders, chartData] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        company: { select: { name: true } },
      },
      orderBy: { orderDate: "desc" },
    }),
    getChannelSalesData(searchParams.company, searchParams.month),
  ]);

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.netAmount ?? o.totalAmount), 0);
  const orderCount = orders.length;

  const columns = [
    {
      key: "orderNumber",
      header: "Order #",
      render: (row: (typeof orders)[0]) => (
        <Link href={`/orders/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.externalOrderNumber || row.orderNumber}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.customer?.name ?? "—"}</span>
      ),
    },
    {
      key: "platform",
      header: "Channel",
      render: (row: (typeof orders)[0]) => {
        const p = row.externalSource ? platformBadge[row.externalSource] : null;
        return p ? (
          <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${p.color}`}>
            {p.label}
          </span>
        ) : <span className="text-[var(--text-tertiary)]">Manual</span>;
      },
    },
    {
      key: "company",
      header: "Company",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.company.name}</span>
      ),
    },
    {
      key: "netAmount",
      header: "Net Amount",
      align: "right" as const,
      render: (row: (typeof orders)[0]) => (
        <span className="font-semibold">{formatUSD(Number(row.netAmount ?? row.totalAmount))}</span>
      ),
    },
    {
      key: "orderDate",
      header: "Date",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Sales</h1>
          <MonthPicker />
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Orders</p>
            <p className="text-lg font-semibold">{orderCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Net Revenue</p>
            <p className="text-lg font-semibold">{formatUSD(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Channel Sales Charts */}
      <Card className="p-5">
        <SalesChart donut={chartData.donut} monthly={chartData.monthly} />
      </Card>

      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No sales" description="No delivered & paid orders for this month." />
        ) : (
          <DataTable columns={columns} data={orders} />
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Start dev server and verify Sales page renders with charts**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
npm run dev -- -p 4000
```

Open http://localhost:4000/sales — verify:
- Donut chart shows channel breakdown for current month
- Stacked bar shows 6-month trend
- Table still renders below charts
- Company filter still works

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/app/sales/page.tsx
git commit -m "feat: integrate channel sales charts into Sales page"
```

---

### Task 5: Implement CGETC Odoo JSON-RPC connector

**Files:**
- Modify: `src/lib/integrations/connectors/cgetc.ts`

- [ ] **Step 1: Implement the CGETC connector with Odoo authentication and stock.quant fetch**

Replace `src/lib/integrations/connectors/cgetc.ts` with:

```typescript
import type { Connector, ExternalInventoryData } from "../types";

interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

interface OdooJsonRpcResponse {
  jsonrpc: string;
  id: number | null;
  result?: any;
  error?: { message: string; data: { message: string } };
}

interface StockQuant {
  id: number;
  product_id: [number, string]; // [id, "[SKU] Product Name"]
  quantity: number;
  location_id: [number, string];
  product_uom_id: [number, string];
}

async function odooAuthenticate(
  url: string,
  db: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${url}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db, login: email, password },
    }),
  });

  if (!res.ok) throw new Error(`CGETC auth failed: HTTP ${res.status}`);

  const data: OdooJsonRpcResponse = await res.json();
  if (data.error) throw new Error(`CGETC auth error: ${data.error.data.message}`);
  if (!data.result?.uid) throw new Error("CGETC auth failed: no uid returned");

  // Extract session_id cookie
  const setCookie = res.headers.get("set-cookie");
  const sessionMatch = setCookie?.match(/session_id=([^;]+)/);
  if (!sessionMatch) throw new Error("CGETC auth failed: no session cookie");

  return sessionMatch[1];
}

async function odooSearchRead(
  url: string,
  sessionId: string,
  model: string,
  domain: any[],
  fields: string[],
  limit?: number
): Promise<any[]> {
  const res = await fetch(`${url}/web/dataset/call_kw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        model,
        method: "search_read",
        args: [domain],
        kwargs: { fields, ...(limit ? { limit } : {}) },
      },
    }),
  });

  if (!res.ok) throw new Error(`CGETC API error: HTTP ${res.status}`);

  const data: OdooJsonRpcResponse = await res.json();
  if (data.error) throw new Error(`CGETC API error: ${data.error.data.message}`);

  return data.result || [];
}

function extractSku(productName: string): string {
  // product_id format: [id, "[SKU] Product Name"]
  const match = productName.match(/^\[([^\]]+)\]/);
  return match ? match[1] : productName;
}

export const cgetcConnector: Connector = {
  platform: "CGETC",

  async fetchOrders(_credentials: any, _since: Date | null) {
    // CGETC is used for inventory, not orders (future: Sale Orders for reconciliation)
    return [];
  },

  async fetchInventory(credentials: CgetcCredentials): Promise<ExternalInventoryData[]> {
    const { url, email, password, db } = credentials;

    // 1. Authenticate
    const sessionId = await odooAuthenticate(url, db, email, password);

    // 2. Fetch all internal stock quants
    const quants: StockQuant[] = await odooSearchRead(
      url,
      sessionId,
      "stock.quant",
      [
        ["quantity", ">", 0],
        ["location_id.usage", "=", "internal"],
      ],
      ["product_id", "quantity", "location_id", "product_uom_id"]
    );

    // 3. Aggregate by SKU (sum quantities across locations)
    const skuTotals = new Map<string, { productName: string; quantity: number }>();

    for (const quant of quants) {
      const sku = extractSku(quant.product_id[1]);
      const existing = skuTotals.get(sku);
      if (existing) {
        existing.quantity += quant.quantity;
      } else {
        // Remove SKU prefix from product name for display
        const fullName = quant.product_id[1];
        const productName = fullName.replace(/^\[[^\]]+\]\s*/, "");
        skuTotals.set(sku, { productName, quantity: quant.quantity });
      }
    }

    // 4. Convert to ExternalInventoryData
    const result: ExternalInventoryData[] = [];
    for (const [sku, data] of skuTotals) {
      result.push({
        sku,
        productName: data.productName,
        quantity: data.quantity,
        warehouseLocation: "CGETC",
      });
    }

    return result;
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
npx tsc --noEmit src/lib/integrations/connectors/cgetc.ts 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/lib/integrations/connectors/cgetc.ts
git commit -m "feat: implement CGETC connector with Odoo JSON-RPC inventory sync"
```

---

### Task 6: Configure CGETC integration and test sync

**Files:**
- No new files — uses existing sync infrastructure

- [ ] **Step 1: Start dev server**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
npm run dev -- -p 4000
```

- [ ] **Step 2: Add CGETC integration config via the Integrations UI**

Navigate to http://localhost:4000/settings/integrations (or wherever the integration config UI is).

For company HOI, add CGETC integration with credentials:
```json
{
  "url": "https://erp.cgetc.com",
  "email": "it@hanah1.com",
  "password": "1111",
  "db": "linkup2017-cgetc-master-4705026"
}
```

If the UI doesn't support CGETC credential fields yet, use the API directly:

```bash
curl -X POST http://localhost:4000/api/integrations \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{
    "companyId": "<HOI-company-id>",
    "platform": "CGETC",
    "credentials": {
      "url": "https://erp.cgetc.com",
      "email": "it@hanah1.com",
      "password": "1111",
      "db": "linkup2017-cgetc-master-4705026"
    }
  }'
```

- [ ] **Step 3: Trigger CGETC sync**

```bash
curl -X POST http://localhost:4000/api/sync/cgetc \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"companyId": "<HOI-company-id>"}'
```

Expected: `{"recordsProcessed": 0, "recordsFailed": 0}` (0 orders processed, but inventory should sync)

- [ ] **Step 4: Verify inventory data in the database**

Check the Inventory page at http://localhost:4000/inventory — CGETC inventory should appear for HOI company products that match by SKU.

- [ ] **Step 5: Commit (if any adjustments were needed)**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add -A
git commit -m "feat: configure and verify CGETC inventory sync"
```

---

### Task 7: Visual verification and polish

- [ ] **Step 1: Test Sales page with different company filters**

Navigate to http://localhost:4000/sales:
- No company filter (Group view) → all channels in chart
- Select HOI → Shopify, Amazon, TikTok channels only
- Select HOK → Naver channel only
- Select HOR → Pharmacy channel only
- Change months with MonthPicker → chart and table update together

- [ ] **Step 2: Test with empty data**

Select a month with no sales data:
- Charts should not render (SalesChart returns null when donut is empty)
- Table shows EmptyState

- [ ] **Step 3: Test Inventory page with CGETC data**

Navigate to http://localhost:4000/inventory:
- CGETC synced products should show with warehouse "CGETC"
- Quantities should match what we saw from the API (aggregated across locations)

- [ ] **Step 4: Fix any visual issues found during testing**

If charts look off (spacing, colors, tooltips), adjust in `SalesChart.tsx`. Common fixes:
- Donut inner/outer radius for different screen sizes
- Bar chart Y-axis label format for different currency scales
- Tooltip positioning

- [ ] **Step 5: Final commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add -A
git commit -m "feat: polish sales charts and CGETC inventory display"
```

---

## Task Summary

| Task | Description | Estimated Effort |
|------|-------------|-----------------|
| 1 | Install Recharts | 1 min |
| 2 | Chart data aggregation function | 5 min |
| 3 | SalesChart client component | 5 min |
| 4 | Integrate charts into Sales page | 3 min |
| 5 | CGETC Odoo connector implementation | 5 min |
| 6 | Configure + test CGETC sync | 5 min |
| 7 | Visual verification + polish | 5 min |

## Future TODO (post-SalesOne testing, for integrated ERP)

1. **CGETC Sale Orders** — `sale.order` + `sale.order.line` for fulfillment vs sales reconciliation
2. **CGETC Shipment** — `stock.picking` for delivery tracking
3. **CGETC BOL Orders** — inbound shipment/receiving management
4. **Scheduled sync** — cron-based automatic CGETC inventory refresh
5. **Inventory alerts** — CGETC quantity thresholds + notifications
