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
import { getUsdKrwRate, getUsdKrwRatesForDates, dateKey } from "@/lib/exchange-rate";
import { CurrencyDisplay, getPrimaryCurrency } from "@/components/ui/currency-display";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { TypeTabs } from "@/components/orders/type-tabs";
import { getMonthRange } from "@/lib/date-utils";
import Link from "next/link";

const KRW_PLATFORMS = new Set(["NAVER", "COUPANG", "PHARMACY", "GONGGU"]);

function toUSD(amount: number, platform: string | null, exchangeRate: number) {
  return KRW_PLATFORMS.has(platform || "") ? amount / exchangeRate : amount;
}

function toKRW(amount: number, platform: string | null, exchangeRate: number) {
  return KRW_PLATFORMS.has(platform || "") ? amount : amount * exchangeRate;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { company?: string; type?: string; month?: string; channel?: string; q?: string; page?: string };
}) {
  const dateRange = getMonthRange(searchParams.month);

  const where: any = { orderDate: dateRange };
  if (searchParams.company) where.companyId = searchParams.company;
  if (searchParams.type) {
    where.type = searchParams.type;
  } else {
    // Exclude seeding and gifts from default view
    where.type = { notIn: ["SEEDING", "GIFT", "INTER_COMPANY"] };
  }
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
      select: { totalAmount: true, externalSource: true, orderDate: true },
    }),
    prisma.order.count({ where: { ...where, financialStatus: { in: ["PAID", "PARTIALLY_PAID"] } } }),
    prisma.order.count({ where: { ...where, financialStatus: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } } }),
    prisma.order.count({ where: { ...where, fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] } } }),
  ]);

  const allOrderDates = [...allSalesOrders.map((o) => o.orderDate), ...orders.map((o) => o.orderDate)];
  const ratesByDate = await getUsdKrwRatesForDates(allOrderDates);
  const rateFor = (d: Date) => ratesByDate.get(dateKey(d))?.rate ?? exchangeRate.rate;

  const totalAmount = allSalesOrders.reduce((sum, o) => {
    const r = rateFor(o.orderDate);
    const amt = Number(o.totalAmount);
    return sum + (primaryCurrency === "KRW" ? toKRW(amt, o.externalSource, r) : toUSD(amt, o.externalSource, r));
  }, 0);

  // Seeding & Gift counts (always needed for TypeTabs) + recent items (only in default view)
  const baseFilter: any = { orderDate: dateRange };
  if (searchParams.company) baseFilter.companyId = searchParams.company;
  const showSeedingGiftCards = !searchParams.type;

  const [seedingCount, giftCount, normalOrderCount] = await Promise.all([
    prisma.order.count({ where: { ...baseFilter, type: "SEEDING" } }),
    prisma.order.count({ where: { ...baseFilter, type: "GIFT" } }),
    prisma.order.count({ where: { ...baseFilter, type: { notIn: ["SEEDING", "GIFT", "INTER_COMPANY"] } } }),
  ]);

  const [recentSeeding, recentGifts] = showSeedingGiftCards
    ? await Promise.all([
        prisma.order.findMany({
          where: { ...baseFilter, type: "SEEDING" },
          include: { customer: { select: { name: true } }, items: { select: { quantity: true, product: { select: { name: true } } } } },
          orderBy: { orderDate: "desc" },
          take: 5,
        }),
        prisma.order.findMany({
          where: { ...baseFilter, type: "GIFT" },
          include: { customer: { select: { name: true } }, items: { select: { quantity: true, product: { select: { name: true } } } } },
          orderBy: { orderDate: "desc" },
          take: 5,
        }),
      ])
    : [[], []];

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
    type: o.type,
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
          <h1 className="text-xl font-bold tracking-tight">
            {searchParams.type === "SEEDING" ? "Seeding" : searchParams.type === "GIFT" ? "Gifted" : "Orders"}
          </h1>
          {searchParams.type && (
            <Link href={`/orders?${new URLSearchParams({ ...(searchParams.company ? { company: searchParams.company } : {}), ...(searchParams.month ? { month: searchParams.month } : {}) }).toString()}`} className="text-[11px] text-accent hover:underline">
              ← Back to Orders
            </Link>
          )}
          <MonthPicker />
          <ChannelFilter companyName={companies.find((c) => c.id === searchParams.company)?.name} />
        </div>
        <div className="flex items-center gap-6">
          {searchParams.type === "SEEDING" || searchParams.type === "GIFT" ? (
            <>
              <div className="text-right">
                <p className="text-xs text-[var(--text-secondary)]">Total</p>
                <p className={`text-lg font-semibold ${searchParams.type === "SEEDING" ? "text-violet-500" : "text-rose-400"}`}>{totalOrderCount}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--text-secondary)]">Fulfilled</p>
                <p className="text-lg font-semibold text-[var(--accent)]">{fulfilledCount}</p>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
          {showSeedingGiftCards && seedingCount > 0 && (
            <Link href={`/orders?${new URLSearchParams({ ...(searchParams.company ? { company: searchParams.company } : {}), ...(searchParams.month ? { month: searchParams.month } : {}), type: "SEEDING" }).toString()}`} className="text-right group">
              <p className="text-xs text-[var(--text-secondary)]">Seeding</p>
              <p className="text-lg font-semibold text-violet-500 group-hover:underline">{seedingCount}</p>
            </Link>
          )}
          {showSeedingGiftCards && giftCount > 0 && (
            <Link href={`/orders?${new URLSearchParams({ ...(searchParams.company ? { company: searchParams.company } : {}), ...(searchParams.month ? { month: searchParams.month } : {}), type: "GIFT" }).toString()}`} className="text-right group">
              <p className="text-xs text-[var(--text-secondary)]">Gifted</p>
              <p className="text-lg font-semibold text-rose-400 group-hover:underline">{giftCount}</p>
            </Link>
          )}
        </div>
      </div>
      <TypeTabs orderCount={normalOrderCount} seedingCount={seedingCount} giftCount={giftCount} />
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
            <OrdersTable
              orders={orderRows}
              viewMode={searchParams.type === "SEEDING" ? "seeding" : searchParams.type === "GIFT" ? "gifted" : "orders"}
              exchangeRate={exchangeRate.rate}
              ratesByDate={Object.fromEntries(Array.from(ratesByDate.entries()).map(([k, v]) => [k, v.rate]))}
            />
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalOrderCount} pageSize={PAGE_SIZE} />
          </>
        )}
      </Card>

      {/* Seeding & Gifted Cards */}
      {showSeedingGiftCards && (seedingCount > 0 || giftCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {seedingCount > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Seeding</p>
                  <span className="text-[11px] text-violet-500 font-semibold">{seedingCount}</span>
                </div>
                <Link
                  href={`/orders?${new URLSearchParams({ ...(searchParams.company ? { company: searchParams.company } : {}), ...(searchParams.month ? { month: searchParams.month } : {}), type: "SEEDING" }).toString()}`}
                  className="text-[11px] text-accent hover:underline"
                >
                  View all →
                </Link>
              </div>
              <div className="space-y-2">
                {recentSeeding.map((o) => {
                  const sets = o.items.length > 0 ? Math.max(...o.items.map((i) => i.quantity)) : 0;
                  const products = o.items.map((i) => i.product?.name || "?").filter((v, i, a) => a.indexOf(v) === i).join(", ");
                  return (
                    <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[13px] font-medium truncate">{o.customer?.name || "—"}</span>
                        <span className="text-[11px] text-[var(--text-tertiary)] truncate">{products}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full text-violet-500 bg-violet-500/10">{sets} {sets === 1 ? "set" : "sets"}</span>
                        <span className="text-[11px] text-[var(--text-tertiary)]">{new Date(o.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
          {giftCount > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Gifted</p>
                  <span className="text-[11px] text-rose-400 font-semibold">{giftCount}</span>
                </div>
                <Link
                  href={`/orders?${new URLSearchParams({ ...(searchParams.company ? { company: searchParams.company } : {}), ...(searchParams.month ? { month: searchParams.month } : {}), type: "GIFT" }).toString()}`}
                  className="text-[11px] text-accent hover:underline"
                >
                  View all →
                </Link>
              </div>
              <div className="space-y-2">
                {recentGifts.map((o) => {
                  const sets = o.items.length > 0 ? Math.max(...o.items.map((i) => i.quantity)) : 0;
                  const products = o.items.map((i) => i.product?.name || "?").filter((v, i, a) => a.indexOf(v) === i).join(", ");
                  return (
                    <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[13px] font-medium truncate">{o.customer?.name || "—"}</span>
                        <span className="text-[11px] text-[var(--text-tertiary)] truncate">{products}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full text-rose-400 bg-rose-400/10">{sets} {sets === 1 ? "set" : "sets"}</span>
                        <span className="text-[11px] text-[var(--text-tertiary)]">{new Date(o.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
