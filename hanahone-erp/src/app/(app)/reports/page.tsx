import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { MonthlyRevenueChart, HorizontalBarChart } from "@/components/reports/ReportCharts";
import { MonthlyExportButton } from "@/components/reports/MonthlyExportButton";
import { CurrencyDisplay } from "@/components/ui/currency-display";
import { getUsdKrwRate, getUsdKrwRatesForDates, dateKey, convertKrwToUsd, convertUsdToKrw } from "@/lib/exchange-rate";

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

const KRW_PLATFORMS = new Set(["NAVER", "COUPANG", "PHARMACY", "GONGGU"]);

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

function toUSD(amount: number, platform: string | null, rate: number) {
  return KRW_PLATFORMS.has(platform || "") ? convertKrwToUsd(amount, rate) : amount;
}

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

  const [salesOrders, orderItems, allCustomerOrders, fulfillmentStats, currentRate] = await Promise.all([
    // Monthly revenue (12 months) — externalSource needed to convert KRW channels to USD
    prisma.order.findMany({
      where: {
        ...companyFilter,
        type: { in: ["SALE", "BROKERAGE"] },
        orderDate: { gte: twelveMonthsAgo },
      },
      select: { orderDate: true, totalAmount: true, netAmount: true, externalSource: true },
    }),
    // Top products (all time) — pull externalSource + orderDate via order relation
    prisma.orderItem.findMany({
      where: { order: { ...companyFilter, type: { in: ["SALE", "BROKERAGE"] } } },
      include: {
        product: { select: { name: true, sku: true } },
        order: { select: { externalSource: true, orderDate: true } },
      },
    }),
    // Customer breakdown — include order externalSource for KRW conversion
    prisma.customer.findMany({
      where: companyFilter,
      select: {
        name: true,
        orders: {
          where: { type: "SALE" },
          select: { totalAmount: true, externalSource: true, orderDate: true },
        },
      },
    }),
    // Fulfillment rates
    Promise.all([
      prisma.order.count({ where: { ...companyFilter, type: "SALE" } }),
      prisma.order.count({ where: { ...companyFilter, type: "SALE", fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] } } }),
      prisma.order.count({ where: { ...companyFilter, type: "SALE", financialStatus: "PAID" } }),
      prisma.order.count({ where: { ...companyFilter, type: "SALE", financialStatus: "REFUNDED" } }),
    ]),
    // Current rate for display layer (CurrencyDisplay needs single rate)
    getUsdKrwRate(),
  ]);

  // Per-date rates so each order converts at its own orderDate rate (12 months → rates move).
  const allDates = [
    ...salesOrders.map((o) => o.orderDate),
    ...orderItems.map((it) => it.order.orderDate),
    ...allCustomerOrders.flatMap((c) => c.orders.map((o) => o.orderDate)),
  ];
  const ratesByDate = await getUsdKrwRatesForDates(allDates);
  const rateFor = (d: Date) => ratesByDate.get(dateKey(d))?.rate ?? currentRate.rate;

  // Currency display: HOI/Group → USD primary, HOK/HOR → KRW primary (per CLAUDE.md).
  const primaryCurrency: "USD" | "KRW" = companyName === "HOK" || companyName === "HOR" ? "KRW" : "USD";

  // Monthly revenue aggregation — sum in USD, convert per primary at display.
  const monthlyMap = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    monthlyMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  for (const order of salesOrders) {
    const d = new Date(order.orderDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      const usd = toUSD(Number(order.netAmount ?? order.totalAmount), order.externalSource, rateFor(d));
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + usd);
    }
  }
  const monthlyRevenue = Array.from(monthlyMap.entries()).map(([ym, usd]) => ({
    month: MONTH_NAMES[parseInt(ym.split("-")[1]) - 1],
    revenue: Math.round(primaryCurrency === "KRW" ? convertUsdToKrw(usd, currentRate.rate) : usd),
  }));

  // Top products aggregation — sum in USD per item.
  const productMap = new Map<string, { name: string; revenueUsd: number; volume: number }>();
  for (const item of orderItems) {
    const key = item.productId;
    const existing = productMap.get(key) || { name: item.product.name, revenueUsd: 0, volume: 0 };
    const usd = toUSD(Number(item.subtotal), item.order.externalSource, rateFor(item.order.orderDate));
    existing.revenueUsd += usd;
    existing.volume += item.quantity;
    productMap.set(key, existing);
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenueUsd - a.revenueUsd)
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      value: Math.round(primaryCurrency === "KRW" ? convertUsdToKrw(p.revenueUsd, currentRate.rate) : p.revenueUsd),
    }));

  const topByVolume = Array.from(productMap.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10)
    .map((p) => ({ name: p.name, value: p.volume }));

  // Top customers aggregation — sum in USD per order.
  const topCustomers = allCustomerOrders
    .map((c) => {
      const usd = c.orders.reduce(
        (sum, o) => sum + toUSD(Number(o.totalAmount), o.externalSource, rateFor(o.orderDate)),
        0,
      );
      return {
        name: c.name,
        value: Math.round(primaryCurrency === "KRW" ? convertUsdToKrw(usd, currentRate.rate) : usd),
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Fulfillment KPIs
  const [totalOrders, fulfilledOrders, , refundedOrders] = fulfillmentStats;
  const fulfillmentRate = totalOrders > 0 ? ((fulfilledOrders / totalOrders) * 100).toFixed(1) : "0";
  const refundRate = totalOrders > 0 ? ((refundedOrders / totalOrders) * 100).toFixed(1) : "0";

  // Total revenue + AOV — both in USD; CurrencyDisplay shows both currencies.
  const totalRevenueUsd = salesOrders.reduce(
    (sum, o) => sum + toUSD(Number(o.netAmount ?? o.totalAmount), o.externalSource, rateFor(o.orderDate)),
    0,
  );
  const avgOrderValueUsd = salesOrders.length > 0 ? totalRevenueUsd / salesOrders.length : 0;

  const visibleReports = reportTypes.filter((r) => {
    if (r.scope === "all") return true;
    if (!companyName) return true;
    return r.scope === companyName;
  });

  const currencyPrefix = primaryCurrency === "KRW" ? "₩" : "$";

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
        <Card>
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">총 매출</p>
          <div className="mt-1">
            <CurrencyDisplay amount={totalRevenueUsd} exchangeRate={currentRate.rate} primaryCurrency={primaryCurrency} />
          </div>
        </Card>
        <Card>
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">총 주문</p>
          <p className="text-2xl font-bold tracking-tight mt-1">{totalOrders.toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">평균 주문가</p>
          <div className="mt-1">
            <CurrencyDisplay amount={avgOrderValueUsd} exchangeRate={currentRate.rate} primaryCurrency={primaryCurrency} />
          </div>
        </Card>
        <Card>
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">출고율</p>
          <p className={`text-2xl font-bold tracking-tight mt-1 ${Number(fulfillmentRate) >= 90 ? "text-teal-600" : "text-amber-500"}`}>{fulfillmentRate}%</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide">환불율</p>
          <p className={`text-2xl font-bold tracking-tight mt-1 ${Number(refundRate) <= 5 ? "text-teal-600" : "text-rose-500"}`}>{refundRate}%</p>
        </Card>
      </div>

      {/* Monthly Revenue Chart */}
      <Card>
        <h3 className="text-sm font-bold tracking-tight mb-4">월별 매출</h3>
        <MonthlyRevenueChart data={monthlyRevenue} currencyPrefix={currencyPrefix} />
      </Card>

      {/* Top Products + Top Customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-bold tracking-tight mb-4">매출 TOP 상품</h3>
          {topProducts.length > 0 ? (
            <HorizontalBarChart data={topProducts} color="#0d9488" valuePrefix={currencyPrefix} />
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
          <HorizontalBarChart data={topCustomers} color="#d97706" valuePrefix={currencyPrefix} />
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
