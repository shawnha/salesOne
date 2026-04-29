import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { MonthlyRevenueChart, HorizontalBarChart } from "@/components/reports/ReportCharts";
import { MonthlyExportButton } from "@/components/reports/MonthlyExportButton";

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

const reportTypes = [
  { key: "sales-by-period", label: "기간별 매출", scope: "all" },
  { key: "top-products", label: "베스트 상품", scope: "all" },
  { key: "order-fulfillment", label: "주문 출고", scope: "all" },
  { key: "inventory-levels", label: "재고 현황", scope: "all" },
  { key: "customer-breakdown", label: "고객 분석", scope: "all" },
  { key: "production-efficiency", label: "생산 효율", scope: "HOK" },
  { key: "consulting-revenue", label: "컨설팅 매출", scope: "HOR" },
  { key: "brokerage-margins", label: "중개 마진", scope: "HOR" },
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">매출 분석</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {companyName ? `${companyName} — ` : "그룹 — "}최근 12개월
          </p>
        </div>
        <MonthlyExportButton companyId={companyId} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "총 매출", value: fmtCurrency(totalRevenue) },
          { label: "총 주문", value: totalOrders.toLocaleString() },
          { label: "평균 주문가", value: fmtCurrency(avgOrderValue) },
          { label: "출고율", value: `${fulfillmentRate}%`, color: Number(fulfillmentRate) >= 90 ? "text-teal-600" : "text-amber-500" },
          { label: "환불율", value: `${refundRate}%`, color: Number(refundRate) <= 5 ? "text-teal-600" : "text-rose-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-2xl font-bold tracking-tight mt-1 ${kpi.color || ""}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Monthly Revenue Chart */}
      <Card>
        <h3 className="text-sm font-bold tracking-tight mb-4">월별 매출</h3>
        <MonthlyRevenueChart data={monthlyRevenue} currencyPrefix={isKRW ? "₩" : "$"} />
      </Card>

      {/* Top Products + Top Customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-bold tracking-tight mb-4">매출 TOP 상품</h3>
          {topProducts.length > 0 ? (
            <HorizontalBarChart data={topProducts} color="#0d9488" valuePrefix={isKRW ? "₩" : "$"} />
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">상품 데이터 없음</p>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-bold tracking-tight mb-4">판매량 TOP 상품</h3>
          {topByVolume.length > 0 ? (
            <HorizontalBarChart data={topByVolume} color="#6366f1" valuePrefix="" />
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">상품 데이터 없음</p>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-bold tracking-tight mb-4">매출 TOP 고객</h3>
        {topCustomers.length > 0 ? (
          <HorizontalBarChart data={topCustomers} color="#d97706" valuePrefix={isKRW ? "₩" : "$"} />
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">고객 데이터 없음</p>
        )}
      </Card>

      {/* CSV Export Section */}
      <div>
        <h2 className="text-sm font-bold tracking-tight mb-3 text-[var(--text-secondary)]">보고서 내보내기</h2>
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
