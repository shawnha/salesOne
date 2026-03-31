import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OrdersTable } from "@/components/orders/orders-table";
import { MonthPicker } from "@/components/ui/month-picker";
import { OrdersChart } from "@/components/orders/OrdersChart";
import { TopCustomersCard } from "@/components/orders/TopCustomersCard";
import { ChannelFilter } from "@/components/orders/channel-filter";
import { getDailyOrderData } from "@/lib/orders-chart-data";
import { applyChannelFilter } from "@/lib/sales-chart-data";
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { CurrencyDisplay, getPrimaryCurrency } from "@/components/ui/currency-display";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";

const KRW_PLATFORMS = new Set(["NAVER", "PHARMACY"]);

function toUSD(amount: number, platform: string | null, exchangeRate: number) {
  return KRW_PLATFORMS.has(platform || "") ? amount / exchangeRate : amount;
}

function getMonthRange(monthParam?: string) {
  const now = new Date();
  const [y, m] = monthParam
    ? [parseInt(monthParam.split("-")[0]), parseInt(monthParam.split("-")[1]) - 1]
    : [now.getFullYear(), now.getMonth()];
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  return { gte: start, lt: end };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { company?: string; type?: string; month?: string; channel?: string; q?: string; page?: string };
}) {
  const dateRange = getMonthRange(searchParams.month);

  const where: any = { orderDate: dateRange };
  if (searchParams.company) where.companyId = searchParams.company;
  if (searchParams.type) where.type = searchParams.type;
  applyChannelFilter(where, searchParams.channel);
  if (searchParams.q) {
    const q = searchParams.q;
    where.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { externalOrderNumber: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(searchParams.page || "1"));

  const [orders, totalOrderCount, chartData, exchangeRate, companies] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        company: { select: { name: true } },
        transfer: true,
        items: { select: { quantity: true, product: { select: { name: true } } } },
      },
      orderBy: { orderDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
    getDailyOrderData(searchParams.company, searchParams.month, searchParams.channel),
    getUsdKrwRate(dateRange.lt > new Date() ? undefined : new Date(dateRange.lt.getTime() - 1)),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const primaryCurrency = getPrimaryCurrency(searchParams.company, companies);
  const totalPages = Math.ceil(totalOrderCount / PAGE_SIZE);

  // KPI stats from all matching orders (not paginated)
  const [allSalesOrders, paidCount, refundedCount, fulfilledCount] = await Promise.all([
    prisma.order.findMany({
      where,
      select: { totalAmount: true, externalSource: true },
    }),
    prisma.order.count({ where: { ...where, financialStatus: { in: ["PAID", "PARTIALLY_PAID"] } } }),
    prisma.order.count({ where: { ...where, financialStatus: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } } }),
    prisma.order.count({ where: { ...where, fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] } } }),
  ]);
  const totalAmount = allSalesOrders.reduce((sum, o) => sum + toUSD(Number(o.totalAmount), o.externalSource, exchangeRate.rate), 0);

  // Top 3 customers by order count (from all matching orders)
  const allOrdersForCustomers = await prisma.order.findMany({
    where,
    select: { customer: { select: { name: true } }, netAmount: true, totalAmount: true },
  });
  const customerCounts = new Map<string, { name: string; count: number; amount: number }>();
  for (const order of allOrdersForCustomers) {
    const name = order.customer?.name ?? "Unknown";
    const existing = customerCounts.get(name);
    if (existing) {
      existing.count++;
      existing.amount += Number(order.netAmount ?? order.totalAmount);
    } else {
      customerCounts.set(name, { name, count: 1, amount: Number(order.netAmount ?? order.totalAmount) });
    }
  }
  const topCustomers = Array.from(customerCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const orderRows = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    externalOrderNumber: o.externalOrderNumber,
    customerName: o.customer?.name ?? null,
    customerId: o.customer?.id ?? null,
    externalSource: o.externalSource,
    fulfillmentStatus: o.fulfillmentStatus,
    financialStatus: o.financialStatus,
    totalAmount: Number(o.totalAmount),
    refundAmount: o.refundAmount ? Number(o.refundAmount) : null,
    netAmount: o.netAmount ? Number(o.netAmount) : null,
    orderDate: o.orderDate.toISOString(),
    notes: o.notes,
    items: o.items.map((item) => ({
      productName: item.product?.name || null,
      quantity: item.quantity,
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Orders</h1>
          <MonthPicker />
          <ChannelFilter companyName={companies.find((c) => c.id === searchParams.company)?.name} />
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Total</p>
            <p className="text-lg font-semibold">{totalOrderCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Fulfilled</p>
            <p className="text-lg font-semibold text-blue-600">{fulfilledCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Paid</p>
            <p className="text-lg font-semibold text-teal-600">{paidCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Refunded</p>
            <p className="text-lg font-semibold text-red-500">{refundedCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Amount</p>
            <CurrencyDisplay
              amount={totalAmount}
              exchangeRate={exchangeRate.rate}
              primaryCurrency={primaryCurrency}
            />
          </div>
        </div>
      </div>
      {/* Orders Line Chart + Top Customers */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <div />
            <p className="text-[10px] text-[var(--text-tertiary)]">
              ₩{exchangeRate.rate.toLocaleString()}/$ ({exchangeRate.date})
            </p>
          </div>
          <OrdersChart data={chartData} />
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--text-secondary)] mb-3">Top Customers</p>
          <TopCustomersCard customers={topCustomers} />
        </Card>
      </div>
      <div className="flex items-center gap-3">
        <SearchInput placeholder="Search order # or customer..." />
        {searchParams.q && (
          <span className="text-xs text-[var(--text-tertiary)]">
            Showing results for &quot;{searchParams.q}&quot;
          </span>
        )}
      </div>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No orders" description="No orders found for this month." />
        ) : (
          <>
            <OrdersTable orders={orderRows} />
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalOrderCount} pageSize={PAGE_SIZE} />
          </>
        )}
      </Card>
    </div>
  );
}
