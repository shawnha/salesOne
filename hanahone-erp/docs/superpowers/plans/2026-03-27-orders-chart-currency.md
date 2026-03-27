# Orders Line Chart + Currency Display Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add daily order trend line chart to Orders page and implement dual currency display (USD/KRW) with Korea Eximbank exchange rate API.

**Architecture:** Orders chart follows the same pattern as Sales chart (server-side aggregation + client Recharts component). Exchange rate uses server-side fetch with in-memory cache (1hr TTL). Currency display is a shared component used across Sales and Orders pages.

**Tech Stack:** Recharts (already installed), Korea Eximbank Open API, Next.js 14, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/exchange-rate.ts` | Exchange rate API call + 1hr memory cache |
| Create | `src/components/ui/currency-display.tsx` | Dual currency display component (main + sub) |
| Create | `src/lib/orders-chart-data.ts` | Server-side daily order count aggregation |
| Create | `src/components/orders/OrdersChart.tsx` | Client component: 3-line chart (Total/Delivered/Refunded) |
| Modify | `src/app/orders/page.tsx` | Add chart + currency display |
| Modify | `src/app/sales/page.tsx` | Add currency display to KPI |

---

### Task 1: Create exchange rate service

**Files:**
- Create: `src/lib/exchange-rate.ts`

- [ ] **Step 1: Create the exchange rate service with caching**

Create `src/lib/exchange-rate.ts`:

```typescript
interface ExchangeRateCache {
  rate: number;
  date: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: ExchangeRateCache | null = null;

export interface ExchangeRate {
  rate: number; // KRW per 1 USD
  date: string; // "2026-03-27"
}

export async function getUsdKrwRate(): Promise<ExchangeRate> {
  // Return cache if valid
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { rate: cache.rate, date: cache.date };
  }

  const apiKey = process.env.KOREAEXIM_API_KEY;
  if (!apiKey) {
    // Fallback if no API key configured
    return cache
      ? { rate: cache.rate, date: cache.date }
      : { rate: 1450, date: "N/A" };
  }

  // Try today first, then previous days (weekends/holidays return null)
  for (let daysBack = 0; daysBack < 5; daysBack++) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    const searchDate = d.toISOString().slice(0, 10).replace(/-/g, "");

    try {
      const res = await fetch(
        `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${apiKey}&searchdate=${searchDate}&data=AP01`,
        { next: { revalidate: 3600 } }
      );

      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const usd = data.find((item: any) => item.cur_unit === "USD");
      if (!usd || usd.result !== 1) continue;

      // deal_bas_r has commas: "1,506.2" → 1506.2
      const rate = parseFloat(usd.deal_bas_r.replace(/,/g, ""));
      if (isNaN(rate)) continue;

      const dateStr = `${searchDate.slice(0, 4)}-${searchDate.slice(4, 6)}-${searchDate.slice(6, 8)}`;

      cache = { rate, date: dateStr, fetchedAt: Date.now() };
      return { rate, date: dateStr };
    } catch {
      continue;
    }
  }

  // All attempts failed — return cache or fallback
  return cache
    ? { rate: cache.rate, date: cache.date }
    : { rate: 1450, date: "N/A" };
}

export function convertUsdToKrw(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

export function convertKrwToUsd(krw: number, rate: number): number {
  return krw / rate;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
npx tsc --noEmit src/lib/exchange-rate.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/lib/exchange-rate.ts
git commit -m "feat: add Korea Eximbank exchange rate service with 1hr cache"
```

---

### Task 2: Create CurrencyDisplay component

**Files:**
- Create: `src/components/ui/currency-display.tsx`

- [ ] **Step 1: Create the dual currency display component**

Create `src/components/ui/currency-display.tsx`:

```tsx
interface CurrencyDisplayProps {
  amount: number; // always in USD
  exchangeRate: number; // KRW per 1 USD
  primaryCurrency: "USD" | "KRW";
  size?: "sm" | "lg";
}

const formatUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatKRW = (n: number) =>
  `₩${Math.round(n).toLocaleString("ko-KR")}`;

export function CurrencyDisplay({ amount, exchangeRate, primaryCurrency, size = "lg" }: CurrencyDisplayProps) {
  const krwAmount = Math.round(amount * exchangeRate);
  const primarySize = size === "lg" ? "text-lg font-semibold" : "text-sm font-semibold";
  const subSize = size === "lg" ? "text-[11px]" : "text-[10px]";

  if (primaryCurrency === "USD") {
    return (
      <div>
        <p className={primarySize}>{formatUSD(amount)}</p>
        <p className={`${subSize} text-[var(--text-tertiary)]`}>{formatKRW(krwAmount)}</p>
      </div>
    );
  }

  return (
    <div>
      <p className={primarySize}>{formatKRW(krwAmount)}</p>
      <p className={`${subSize} text-[var(--text-tertiary)]`}>{formatUSD(amount)}</p>
    </div>
  );
}

// Helper to determine primary currency by company
export function getPrimaryCurrency(companyId: string | undefined, companies?: { id: string; name: string }[]): "USD" | "KRW" {
  if (!companyId) return "USD"; // Group view → USD
  if (!companies) return "USD";

  const company = companies.find(c => c.id === companyId);
  if (!company) return "USD";

  // HOI (인터내셔널) → USD, HOK/HOR → KRW
  const name = company.name.toLowerCase();
  if (name.includes("international") || name.includes("인터내셔널") || name.includes("hoi")) {
    return "USD";
  }
  return "KRW";
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/components/ui/currency-display.tsx
git commit -m "feat: add CurrencyDisplay component for dual USD/KRW display"
```

---

### Task 3: Create orders chart data aggregation

**Files:**
- Create: `src/lib/orders-chart-data.ts`

- [ ] **Step 1: Create the daily order count aggregation function**

Create `src/lib/orders-chart-data.ts`:

```typescript
import { prisma } from "@/lib/prisma";

export interface DailyOrderData {
  day: string; // "1", "2", ... "31"
  total: number;
  delivered: number;
  refunded: number;
}

export async function getDailyOrderData(
  companyId: string | undefined,
  month: string | undefined // "YYYY-MM" format
): Promise<DailyOrderData[]> {
  const now = new Date();
  const [targetYear, targetMonth] = month
    ? [parseInt(month.split("-")[0]), parseInt(month.split("-")[1]) - 1]
    : [now.getFullYear(), now.getMonth()];

  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 1);
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  const where: any = {
    type: "SALE",
    orderDate: { gte: monthStart, lt: monthEnd },
  };
  if (companyId) where.companyId = companyId;

  const orders = await prisma.order.findMany({
    where,
    select: {
      orderDate: true,
      fulfillmentStatus: true,
      financialStatus: true,
    },
  });

  // Initialize all days
  const daily: DailyOrderData[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    daily.push({ day: String(d), total: 0, delivered: 0, refunded: 0 });
  }

  // Aggregate
  for (const order of orders) {
    const dayIndex = new Date(order.orderDate).getDate() - 1;
    if (dayIndex < 0 || dayIndex >= daysInMonth) continue;

    daily[dayIndex].total++;

    if (order.fulfillmentStatus === "DELIVERED") {
      daily[dayIndex].delivered++;
    }

    if (order.financialStatus === "REFUNDED" || order.financialStatus === "PARTIALLY_REFUNDED") {
      daily[dayIndex].refunded++;
    }
  }

  return daily;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/lib/orders-chart-data.ts
git commit -m "feat: add daily order count aggregation for orders chart"
```

---

### Task 4: Create OrdersChart client component

**Files:**
- Create: `src/components/orders/OrdersChart.tsx`

- [ ] **Step 1: Create the line chart component**

Create `src/components/orders/OrdersChart.tsx`:

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { DailyOrderData } from "@/lib/orders-chart-data";

interface OrdersChartProps {
  data: DailyOrderData[];
}

export function OrdersChart({ data }: OrdersChartProps) {
  const hasData = data.some(d => d.total > 0);
  if (!hasData) return null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <p className="text-xs text-[var(--text-secondary)]">Daily Orders</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-3 h-[2px] bg-blue-500 inline-block rounded" />
            <span className="text-[var(--text-secondary)]">Total</span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-3 h-[2px] bg-emerald-500 inline-block rounded" />
            <span className="text-[var(--text-secondary)]">Delivered</span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-3 h-[2px] bg-red-500 inline-block rounded" style={{ borderTop: "2px dashed" }} />
            <span className="text-[var(--text-secondary)]">Refunded</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="delivered"
            name="Delivered"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="refunded"
            name="Refunded"
            stroke="#EF4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/components/orders/OrdersChart.tsx
git commit -m "feat: add OrdersChart line chart component"
```

---

### Task 5: Integrate chart + currency into Orders page

**Files:**
- Modify: `src/app/orders/page.tsx`

- [ ] **Step 1: Update Orders page**

Read `src/app/orders/page.tsx` then apply these changes:

1. Add imports at top:
```typescript
import { OrdersChart } from "@/components/orders/OrdersChart";
import { getDailyOrderData } from "@/lib/orders-chart-data";
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { CurrencyDisplay, getPrimaryCurrency } from "@/components/ui/currency-display";
```

2. Replace the single `prisma.order.findMany` with `Promise.all` that also fetches chart data, exchange rate, and companies:
```typescript
  const [orders, chartData, exchangeRate, companies] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        company: { select: { name: true } },
        transfer: true,
      },
      orderBy: { orderDate: "desc" },
    }),
    getDailyOrderData(searchParams.company, searchParams.month),
    getUsdKrwRate(),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const primaryCurrency = getPrimaryCurrency(searchParams.company, companies);
```

3. Replace the Amount KPI display (the last `<div className="text-right">` with Amount) with CurrencyDisplay:
```tsx
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Amount</p>
            <CurrencyDisplay
              amount={totalAmount}
              exchangeRate={exchangeRate.rate}
              primaryCurrency={primaryCurrency}
            />
          </div>
```

4. Add exchange rate indicator and OrdersChart between the KPI header and the table Card:
```tsx
      {/* Orders Line Chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <div />
          <p className="text-[10px] text-[var(--text-tertiary)]">
            ₩{exchangeRate.rate.toLocaleString()}/$ ({exchangeRate.date})
          </p>
        </div>
        <OrdersChart data={chartData} />
      </Card>
```

- [ ] **Step 2: Verify dev server renders correctly**

Start dev server and check http://localhost:4000/orders:
- Line chart shows daily Total/Delivered/Refunded trends
- Amount KPI shows dual currency
- Exchange rate date shown above chart
- Company filter changes primary currency

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/app/orders/page.tsx
git commit -m "feat: add orders line chart and dual currency display"
```

---

### Task 6: Add currency display to Sales page

**Files:**
- Modify: `src/app/sales/page.tsx`

- [ ] **Step 1: Update Sales page with currency display**

Read `src/app/sales/page.tsx` then apply these changes:

1. Add imports:
```typescript
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { CurrencyDisplay, getPrimaryCurrency } from "@/components/ui/currency-display";
```

2. Add `getUsdKrwRate()` and `prisma.company.findMany()` to the existing `Promise.all`:
```typescript
  const [orders, chartData, exchangeRate, companies] = await Promise.all([
    prisma.order.findMany({ ... }),
    getChannelSalesData(searchParams.company, searchParams.month),
    getUsdKrwRate(),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const primaryCurrency = getPrimaryCurrency(searchParams.company, companies);
```

3. Replace the Net Revenue KPI display with CurrencyDisplay:
```tsx
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Net Revenue</p>
            <CurrencyDisplay
              amount={totalRevenue}
              exchangeRate={exchangeRate.rate}
              primaryCurrency={primaryCurrency}
            />
          </div>
```

4. Add exchange rate indicator in the chart Card:
```tsx
      <Card className="p-5">
        <div className="flex items-center justify-end mb-1">
          <p className="text-[10px] text-[var(--text-tertiary)]">
            ₩{exchangeRate.rate.toLocaleString()}/$ ({exchangeRate.date})
          </p>
        </div>
        <SalesChart donut={chartData.donut} monthly={chartData.monthly} />
      </Card>
```

- [ ] **Step 2: Verify Sales page renders correctly**

Check http://localhost:4000/sales:
- Net Revenue shows dual currency
- Exchange rate date shown in chart area
- Company filter changes primary currency (HOI→USD, HOK/HOR→KRW)

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add src/app/sales/page.tsx
git commit -m "feat: add dual currency display to Sales page"
```

---

### Task 7: Visual verification and polish

- [ ] **Step 1: Test Orders page**

Navigate to http://localhost:4000/orders:
- Line chart: 3 lines visible (Total blue, Delivered green, Refunded red dashed)
- MonthPicker changes chart data
- Company filter works
- Amount KPI: HOI → $USD main + ₩KRW sub, HOK/HOR → ₩KRW main + $USD sub
- Group view → USD main
- Empty month → chart returns null (hidden)

- [ ] **Step 2: Test Sales page**

Navigate to http://localhost:4000/sales:
- Net Revenue KPI: dual currency display
- Exchange rate indicator in chart area
- Company filter switches primary currency

- [ ] **Step 3: Test exchange rate edge cases**

- Rate should be cached (refresh page quickly — no new API call)
- Exchange rate date should show (e.g., "2026-03-27")

- [ ] **Step 4: Fix any visual issues**

Common adjustments:
- Line chart height/spacing
- Currency display font sizes
- Exchange rate text positioning

- [ ] **Step 5: Final commit**

```bash
cd /Users/admin/Desktop/claude/claude_2/hanahone-erp
git add -A
git commit -m "feat: polish orders chart and currency display"
```

---

## Task Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Exchange rate service (API + cache) | None |
| 2 | CurrencyDisplay component | None |
| 3 | Orders chart data aggregation | None |
| 4 | OrdersChart line chart component | None |
| 5 | Integrate into Orders page | 1, 2, 3, 4 |
| 6 | Add currency to Sales page | 1, 2 |
| 7 | Visual verification + polish | 5, 6 |
