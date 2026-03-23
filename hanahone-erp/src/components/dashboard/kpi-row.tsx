import { KpiCard } from "@/components/ui/kpi-card";

interface KpiData {
  totalSales: number;
  openOrders: number;
  inventoryValue: number;
  productionRuns: number;
  salesChange: number;
  pendingShipments: number;
  lowStockCount: number;
  newProductionRuns: number;
}

export function KpiRow({ data }: { data: KpiData }) {
  const formatWon = (n: number) => {
    if (n >= 1_000_000_000) return `₩${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
    return `₩${n.toLocaleString()}`;
  };
  return (
    <div className="grid grid-cols-4 gap-4">
      <KpiCard label="Total sales" value={formatWon(data.totalSales)} change={{ value: `${data.salesChange >= 0 ? "+" : ""}${data.salesChange}%`, direction: data.salesChange >= 0 ? "up" : "down" }} subtitle="vs previous period" />
      <KpiCard label="Open orders" value={data.openOrders.toString()} change={{ value: `${data.pendingShipments} pending shipment`, direction: "neutral" }} subtitle="across all entities" />
      <KpiCard label="Inventory value" value={formatWon(data.inventoryValue)} change={{ value: `${data.lowStockCount} below reorder`, direction: data.lowStockCount > 0 ? "down" : "neutral" }} subtitle="combined warehouse stock" />
      <KpiCard label="Production runs" value={data.productionRuns.toString()} change={{ value: `${data.newProductionRuns} active`, direction: "up" }} subtitle="HOK manufacturing" />
    </div>
  );
}
