import { KpiCard } from "@/components/ui/kpi-card";

interface KpiData {
  totalSalesKRW: number;
  totalSalesUSD: number;
  totalOrders: number;
  fulfilledOrders: number;
  pendingOrders: number;
  seedingCount: number;
  giftCount: number;
  inventoryValue: number;
  productionRuns: number;
  salesChange: number;
  lowStockCount: number;
  newProductionRuns: number;
}

const fmtKRW = (n: number) => {
  if (n >= 1_000_000_000) return `₩${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
  return `₩${Math.round(n).toLocaleString()}`;
};

const fmtUSD = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
};

export function KpiRow({ data, primaryCurrency = "USD" }: { data: KpiData; primaryCurrency?: "USD" | "KRW" }) {
  const isUSD = primaryCurrency === "USD";
  return (
    <div className="grid grid-cols-4 gap-4">
      <KpiCard
        label="Total sales"
        value={isUSD ? fmtUSD(data.totalSalesUSD) : fmtKRW(data.totalSalesKRW)}
        subValue={isUSD ? fmtKRW(data.totalSalesKRW) : fmtUSD(data.totalSalesUSD)}
        change={{ value: `${data.salesChange >= 0 ? "+" : ""}${data.salesChange}%`, direction: data.salesChange >= 0 ? "up" : "down" }}
        subtitle="vs previous period"
      />
      <KpiCard
        label="Orders"
        value={data.totalOrders.toString()}
        subtitle="for this period"
      >
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="inline-flex items-center text-[12px] font-semibold px-2 py-0.5 rounded-full text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]">
            {data.fulfilledOrders} fulfilled
          </span>
          <span className="inline-flex items-center text-[12px] font-semibold px-2 py-0.5 rounded-full text-amber-400 bg-amber-500/10">
            {data.pendingOrders} pending
          </span>
          {data.seedingCount > 0 && (
            <span className="inline-flex items-center text-[12px] font-semibold px-2 py-0.5 rounded-full text-violet-400 bg-violet-500/10">
              {data.seedingCount} seeding
            </span>
          )}
          {data.giftCount > 0 && (
            <span className="inline-flex items-center text-[12px] font-semibold px-2 py-0.5 rounded-full text-rose-400 bg-rose-400/10">
              {data.giftCount} gifted
            </span>
          )}
        </div>
      </KpiCard>
      <KpiCard label="Inventory value" value={isUSD ? fmtUSD(data.inventoryValue) : fmtKRW(data.inventoryValue)} change={{ value: `${data.lowStockCount} below reorder`, direction: data.lowStockCount > 0 ? "down" : "neutral" }} subtitle="combined warehouse stock" />
      <KpiCard label="Production runs" value={data.productionRuns.toString()} change={{ value: `${data.newProductionRuns} active`, direction: "up" }} subtitle="HOK manufacturing" />
    </div>
  );
}
