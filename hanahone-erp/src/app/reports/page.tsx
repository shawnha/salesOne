import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { MonthlyRevenueChart, HorizontalBarChart } from "@/components/reports/ReportCharts";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const reportTypes = [
  { key: "sales-by-period", label: "Sales by period", scope: "all" },
  { key: "top-products", label: "Top products", scope: "all" },
  { key: "order-fulfillment", label: "Order fulfillment", scope: "all" },
  { key: "inventory-levels", label: "Inventory levels", scope: "all" },
  { key: "customer-breakdown", label: "Customer breakdown", scope: "all" },
  { key: "production-efficiency", label: "Production efficiency", scope: "HOK" },
  { key: "consulting-revenue", label: "Consulting revenue", scope: "HOR" },
  { key: "brokerage-margins", label: "Brokerage margins", scope: "HOR" },
];

export default async function ReportsPage({ searchParams }: { searchParams: { company?: string } }) {
  const companyId = searchParams.company || null;
  const companyFilter = companyId ? { companyId } : {};

  let companyName: string | null = null;
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    companyName = company?.name || null;
  }

  // Fetch all analytics data in parallel
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [salesOrders, orderItems, allCustomerOrders, fulfillmentStats] = await Promise.all([
    // Monthly revenue (12 months)
    prisma.order.findMany({
      where: {
        ...companyFilter,
        type: { in: ["SALE", "BROKERAGE"] },
        orderDate: { gte: twelveMonthsAgo },
      },
      select: { orderDate: true, totalAmount: true, netAmount: true },
    }),
    // Top products (all time)
    prisma.orderItem.findMany({
      where: { order: { ...companyFilter, type: { in: ["SALE", "BROKERAGE"] } } },
      include: { product: { select: { name: true, sku: true } } },
    }),
    // Customer breakdown
    prisma.customer.findMany({
      where: companyFilter,
      select: {
        name: true,
        orders: { where: { type: "SALE" }, select: { totalAmount: true } },
      },
    }),
    // Fulfillment rates
    Promise.all([
      prisma.order.count({ where: { ...companyFilter, type: "SALE" } }),
      prisma.order.count({ where: { ...companyFilter, type: "SALE", fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] } } }),
      prisma.order.count({ where: { ...companyFilter, type: "SALE", financialStatus: "PAID" } }),
      prisma.order.count({ where: { ...companyFilter, type: "SALE", financialStatus: "REFUNDED" } }),
    ]),
  ]);

  // Monthly revenue aggregation
  const monthlyMap = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    monthlyMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  for (const order of salesOrders) {
    const d = new Date(order.orderDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(order.netAmount ?? order.totalAmount));
    }
  }
  const monthlyRevenue = Array.from(monthlyMap.entries()).map(([ym, revenue]) => ({
    month: MONTH_NAMES[parseInt(ym.split("-")[1]) - 1],
    revenue: Math.round(revenue),
  }));

  // Top products aggregation
  const productMap = new Map<string, { name: string; revenue: number; volume: number }>();
  for (const item of orderItems) {
    const key = item.productId;
    const existing = productMap.get(key) || { name: item.product.name, revenue: 0, volume: 0 };
    existing.revenue += Number(item.subtotal);
    existing.volume += item.quantity;
    productMap.set(key, existing);
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((p) => ({ name: p.name, value: Math.round(p.revenue) }));

  const topByVolume = Array.from(productMap.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10)
    .map((p) => ({ name: p.name, value: p.volume }));

  // Top customers aggregation
  const topCustomers = allCustomerOrders
    .map((c) => ({
      name: c.name,
      value: Math.round(c.orders.reduce((sum, o) => sum + Number(o.totalAmount), 0)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Fulfillment KPIs
  const [totalOrders, fulfilledOrders, , refundedOrders] = fulfillmentStats;
  const fulfillmentRate = totalOrders > 0 ? ((fulfilledOrders / totalOrders) * 100).toFixed(1) : "0";
  const refundRate = totalOrders > 0 ? ((refundedOrders / totalOrders) * 100).toFixed(1) : "0";

  // Total revenue
  const totalRevenue = salesOrders.reduce((sum, o) => sum + Number(o.netAmount ?? o.totalAmount), 0);
  const avgOrderValue = salesOrders.length > 0 ? totalRevenue / salesOrders.length : 0;

  // Currency formatting based on company
  const isKRW = companyName === "HOK" || companyName === "HOR";
  const fmtCurrency = (n: number) =>
    isKRW ? `₩${Math.round(n).toLocaleString()}` : `$${Math.round(n).toLocaleString()}`;

  const visibleReports = reportTypes.filter((r) => {
    if (r.scope === "all") return true;
    if (!companyName) return true;
    return r.scope === companyName;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Sales Analytics</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {companyName ? `${companyName} — ` : "Group — "}Last 12 months
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Revenue", value: fmtCurrency(totalRevenue) },
          { label: "Total Orders", value: totalOrders.toLocaleString() },
          { label: "Avg Order Value", value: fmtCurrency(avgOrderValue) },
          { label: "Fulfillment Rate", value: `${fulfillmentRate}%`, color: Number(fulfillmentRate) >= 90 ? "text-teal-600" : "text-amber-500" },
          { label: "Refund Rate", value: `${refundRate}%`, color: Number(refundRate) <= 5 ? "text-teal-600" : "text-rose-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-2xl font-bold tracking-tight mt-1 ${kpi.color || ""}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Monthly Revenue Chart */}
      <Card>
        <h3 className="text-sm font-bold tracking-tight mb-4">Monthly Revenue</h3>
        <MonthlyRevenueChart data={monthlyRevenue} currencyPrefix={isKRW ? "₩" : "$"} />
      </Card>

      {/* Top Products + Top Customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-bold tracking-tight mb-4">Top Products by Revenue</h3>
          {topProducts.length > 0 ? (
            <HorizontalBarChart data={topProducts} color="#0d9488" valuePrefix={isKRW ? "₩" : "$"} />
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">No product data</p>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-bold tracking-tight mb-4">Top Products by Volume</h3>
          {topByVolume.length > 0 ? (
            <HorizontalBarChart data={topByVolume} color="#6366f1" valuePrefix="" />
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">No product data</p>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-bold tracking-tight mb-4">Top Customers by Revenue</h3>
        {topCustomers.length > 0 ? (
          <HorizontalBarChart data={topCustomers} color="#d97706" valuePrefix={isKRW ? "₩" : "$"} />
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">No customer data</p>
        )}
      </Card>

      {/* CSV Export Section */}
      <div>
        <h2 className="text-sm font-bold tracking-tight mb-3 text-[var(--text-secondary)]">Export Reports</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {visibleReports.map((report) => {
            const params = new URLSearchParams();
            if (companyId) params.set("company", companyId);
            params.set("type", report.key);
            params.set("format", "csv");

            return (
              <a
                key={report.key}
                href={`/api/reports?${params.toString()}`}
                download
                className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors text-[13px]"
              >
                <span className="font-medium">{report.label}</span>
                <span className="text-[var(--text-tertiary)] text-[11px]">CSV</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
