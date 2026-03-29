import { KpiCard } from "@/components/ui/kpi-card";

interface KpiData {
  totalSalesKRW: number;
  totalSalesUSD: number;
  openOrders: number;
  inventoryValue: number;
  productionRuns: number;
  salesChange: number;
  pendingShipments: number;
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

export function KpiRow({ data }: { data: KpiData }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <KpiCard
        label="Total sales"
        value={fmtKRW(data.totalSalesKRW)}
        subValue={fmtUSD(data.totalSalesUSD)}
        change={{ value: `${data.salesChange >= 0 ? "+" : ""}${data.salesChange}%`, direction: data.salesChange >= 0 ? "up" : "down" }}
        subtitle="vs previous period"
      />
      <KpiCard label="Open orders" value={data.openOrders.toString()} change={{ value: `${data.pendingShipments} pending shipment`, direction: "neutral" }} subtitle="across all entities" />
      <KpiCard label="Inventory value" value={fmtKRW(data.inventoryValue)} change={{ value: `${data.lowStockCount} below reorder`, direction: data.lowStockCount > 0 ? "down" : "neutral" }} subtitle="combined warehouse stock" />
      <KpiCard label="Production runs" value={data.productionRuns.toString()} change={{ value: `${data.newProductionRuns} active`, direction: "up" }} subtitle="HOK manufacturing" />
    </div>
  );
}
