import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { ShippingChart } from "@/components/shipping/ShippingChart";

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default async function ShippingCostsPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const shippingCosts = await prisma.shippingCost.findMany({
    where,
    include: {
      order: { select: { orderNumber: true, externalOrderNumber: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });

  // Calculate summary
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const thisMonthCosts = shippingCosts.filter(
    (sc) => sc.invoiceDate >= thisMonthStart && sc.invoiceDate < thisMonthEnd
  );
  const thisMonthTotal = thisMonthCosts.reduce((sum, sc) => sum + Number(sc.amount), 0);
  const avgPerOrder =
    shippingCosts.length > 0
      ? shippingCosts.reduce((sum, sc) => sum + Number(sc.amount), 0) / shippingCosts.length
      : 0;

  // Monthly trend data (last 12 months)
  const monthlyMap = new Map<string, { month: string; yearMonth: string; total: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthlyMap.set(ym, { month: label, yearMonth: ym, total: 0 });
  }
  for (const sc of shippingCosts) {
    const ym = `${sc.invoiceDate.getFullYear()}-${String(sc.invoiceDate.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(ym);
    if (entry) entry.total += Number(sc.amount);
  }
  const monthlyData = Array.from(monthlyMap.values());

  // Table rows
  const rows = shippingCosts.map((sc) => ({
    id: sc.id,
    date: sc.invoiceDate.toISOString(),
    soNumber: sc.soNumber,
    orderNumber: sc.order?.externalOrderNumber || sc.order?.orderNumber || "—",
    amount: Number(sc.amount),
  }));

  type ShippingRow = (typeof rows)[0];

  const columns = [
    {
      key: "date",
      header: "Date",
      render: (row: ShippingRow) => (
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
      key: "soNumber",
      header: "SO#",
      render: (row: ShippingRow) => (
        <span className="font-semibold">{row.soNumber}</span>
      ),
    },
    {
      key: "orderNumber",
      header: "Order#",
      render: (row: ShippingRow) => (
        <span className="text-[var(--text-secondary)]">{row.orderNumber}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      render: (row: ShippingRow) => (
        <span className="font-semibold">{formatUSD(row.amount)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Shipping Costs</h1>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Total Records</p>
            <p className="text-lg font-semibold">{shippingCosts.length}</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          label="This Month Total"
          value={formatUSD(thisMonthTotal)}
          subtitle={`${thisMonthCosts.length} shipment${thisMonthCosts.length !== 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Avg per Order"
          value={formatUSD(avgPerOrder)}
          subtitle={`across ${shippingCosts.length} orders`}
        />
      </div>

      {/* Monthly Trend Chart */}
      {monthlyData.some((m) => m.total > 0) && (
        <Card className="p-5">
          <p className="text-xs text-[var(--text-secondary)] mb-2">Monthly Trend</p>
          <ShippingChart data={monthlyData} />
        </Card>
      )}

      {/* Table */}
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No shipping costs"
            description="No shipping cost records found. Sync shipping invoices from CGETC first."
          />
        ) : (
          <DataTable columns={columns} data={rows} />
        )}
      </Card>
    </div>
  );
}
