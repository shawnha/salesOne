import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthPicker } from "@/components/ui/month-picker";
import { SalesChart } from "@/components/sales/SalesChart";
import { getChannelSalesData } from "@/lib/sales-chart-data";
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { CurrencyDisplay, getPrimaryCurrency } from "@/components/ui/currency-display";
import Link from "next/link";
import { ChannelFilter } from "@/components/orders/channel-filter";
import { Pagination } from "@/components/ui/pagination";
import { getMonthRange } from "@/lib/date-utils";

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const formatKRW = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

const KRW_PLATFORMS = new Set(["NAVER", "COUPANG", "PHARMACY", "GONGGU"]);

function formatOrderAmount(amount: number, platform: string | null) {
  return KRW_PLATFORMS.has(platform || "") ? formatKRW(amount) : formatUSD(amount);
}

function toUSD(amount: number, platform: string | null, exchangeRate: number) {
  return KRW_PLATFORMS.has(platform || "") ? amount / exchangeRate : amount;
}

const platformBadge: Record<string, { label: string; color: string }> = {
  SHOPIFY: { label: "Shopify", color: "text-green-600 bg-green-600/[0.08]" },
  AMAZON: { label: "Amazon", color: "text-orange-600 bg-orange-600/[0.08]" },
  TIKTOK: { label: "TikTok", color: "text-pink-600 bg-pink-600/[0.08]" },
  NAVER: { label: "네이버", color: "text-emerald-600 bg-emerald-600/[0.08]" },
  PHARMACY: { label: "약국", color: "text-blue-600 bg-blue-600/[0.08]" },
  CGETC: { label: "CGETC", color: "text-indigo-600 bg-indigo-600/[0.08]" },
  COUPANG: { label: "쿠팡", color: "text-red-600 bg-red-600/[0.08]" },
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { company?: string; month?: string; channel?: string; page?: string };
}) {
  const dateRange = getMonthRange(searchParams.month);

  const where: any = {
    type: "SALE" as const,
    fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
    financialStatus: { in: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"] },
    orderDate: dateRange,
  };
  if (searchParams.company) where.companyId = searchParams.company;
  if (searchParams.channel === "SEEDING") {
    where.externalSource = "CGETC";
    where.notes = { startsWith: "free gifting", mode: "insensitive" };
  } else if (searchParams.channel === "CGETC") {
    where.externalSource = "CGETC";
    where.OR = [
      { notes: null },
      { NOT: { notes: { startsWith: "free gifting", mode: "insensitive" } } },
    ];
  } else if (searchParams.channel) {
    where.externalSource = searchParams.channel;
  }

  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(searchParams.page || "1"));

  // Seeding & gift counts for this period
  const baseWhere: any = { orderDate: dateRange };
  if (searchParams.company) baseWhere.companyId = searchParams.company;

  const [orders, totalSalesCount, seedingOrders, giftOrders, exchangeRate, companies] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        company: { select: { name: true } },
      },
      orderBy: { orderDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
    prisma.order.findMany({
      where: { ...baseWhere, type: "SEEDING" },
      include: { items: { select: { quantity: true } } },
    }),
    prisma.order.findMany({
      where: { ...baseWhere, type: "GIFT" },
      include: { items: { select: { quantity: true } } },
    }),
    getUsdKrwRate(dateRange.lt > new Date() ? undefined : new Date(dateRange.lt.getTime() - 1)),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const seedingCount = seedingOrders.length;
  // Set count: max quantity across items per order (starter x6 + refill x6 = 6 sets)
  const calcSets = (orders: typeof seedingOrders) =>
    orders.reduce((sum, o) => sum + (o.items.length > 0 ? Math.max(...o.items.map((i) => i.quantity)) : 0), 0);
  const seedingSets = calcSets(seedingOrders);
  const giftCount = giftOrders.length;
  const giftSets = calcSets(giftOrders);

  const primaryCurrency = getPrimaryCurrency(searchParams.company, companies);
  const chartData = await getChannelSalesData(searchParams.company, searchParams.month, searchParams.channel, {
    exchangeRate: exchangeRate.rate,
    primaryCurrency,
  });

  const totalPages = Math.ceil(totalSalesCount / PAGE_SIZE);
  const allSalesForKpi = await prisma.order.findMany({
    where,
    select: { netAmount: true, totalAmount: true, externalSource: true, commissionAmount: true, settlementAmount: true },
  });
  const totalRevenue = allSalesForKpi.reduce((sum, o) => {
    const amount = Number(o.netAmount ?? o.totalAmount);
    return sum + toUSD(amount, o.externalSource, exchangeRate.rate);
  }, 0);
  const totalCommission = allSalesForKpi.reduce((sum, o) => {
    if (!o.commissionAmount) return sum;
    return sum + toUSD(Number(o.commissionAmount), o.externalSource, exchangeRate.rate);
  }, 0);
  const orderCount = totalSalesCount;

  const columns = [
    {
      key: "orderNumber",
      header: "Order #",
      render: (row: (typeof orders)[0]) => (
        <Link href={`/orders/${row.id}`} className="font-semibold text-accent hover:underline">
          {row.externalOrderNumber || row.orderNumber}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.customer?.name ?? "—"}</span>
      ),
    },
    {
      key: "platform",
      header: "Channel",
      render: (row: (typeof orders)[0]) => {
        const isSeeding = row.type === "SEEDING" || (row.externalSource === "CGETC" && row.notes?.toLowerCase().startsWith("free gifting"));
        const channelKey = isSeeding ? "SEEDING" : (row.externalSource || "");
        const params = new URLSearchParams();
        if (searchParams.company) params.set("company", searchParams.company);
        if (searchParams.month) params.set("month", searchParams.month);
        params.set("channel", channelKey);
        const href = `/sales?${params.toString()}`;

        if (isSeeding) {
          return (
            <Link href={href} className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full text-violet-600 bg-violet-600/[0.08] hover:ring-1 hover:ring-violet-400 transition-all">
              Seeding
            </Link>
          );
        }
        const p = row.externalSource ? platformBadge[row.externalSource] : null;
        return p ? (
          <Link href={href} className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${p.color} hover:ring-1 hover:ring-current transition-all`}>
            {p.label}
          </Link>
        ) : <span className="text-[var(--text-tertiary)]">Manual</span>;
      },
    },
    {
      key: "company",
      header: "Company",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.company.name}</span>
      ),
    },
    {
      key: "netAmount",
      header: "Net Amount",
      align: "right" as const,
      render: (row: (typeof orders)[0]) => {
        const amount = Number(row.netAmount ?? row.totalAmount);
        const isKrw = KRW_PLATFORMS.has(row.externalSource || "");
        const primary = isKrw ? formatKRW(amount) : formatUSD(amount);
        const secondary = isKrw
          ? formatUSD(amount / exchangeRate.rate)
          : formatKRW(amount * exchangeRate.rate);
        return (
          <div className="text-right">
            <div className="font-semibold">{primary}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">{secondary}</div>
          </div>
        );
      },
    },
    {
      key: "orderDate",
      header: "Date",
      render: (row: (typeof orders)[0]) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Sales</h1>
          <MonthPicker />
          <ChannelFilter companyName={companies.find((c) => c.id === searchParams.company)?.name} />
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Orders</p>
            <p className="text-lg font-semibold">{orderCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Net Revenue</p>
            <CurrencyDisplay
              amount={totalRevenue}
              exchangeRate={exchangeRate.rate}
              primaryCurrency={primaryCurrency}
            />
          </div>
          {totalCommission > 0 && (
            <div className="text-right">
              <p className="text-xs text-red-400">Fees</p>
              <CurrencyDisplay
                amount={totalCommission}
                exchangeRate={exchangeRate.rate}
                primaryCurrency={primaryCurrency}
              />
            </div>
          )}
          {(seedingCount > 0 || giftCount > 0 || totalCommission > 0) && (
            <div className="w-px h-8 bg-[var(--border-strong)]" />
          )}
          {seedingCount > 0 && (
            <div className="text-right">
              <p className="text-xs text-violet-400">Seeding</p>
              <p className="text-lg font-semibold text-violet-500">{seedingCount}<span className="text-sm font-normal text-[var(--text-tertiary)]"> ({seedingSets} sets)</span></p>
            </div>
          )}
          {giftCount > 0 && (
            <div className="text-right">
              <p className="text-xs text-rose-400">Gifted</p>
              <p className="text-lg font-semibold text-rose-400">{giftCount}<span className="text-sm font-normal text-[var(--text-tertiary)]"> ({giftSets} sets)</span></p>
            </div>
          )}
        </div>
      </div>
      {/* Channel Sales Charts */}
      <Card className="p-5">
        <div className="flex items-center justify-end mb-1">
          <p className="text-[10px] text-[var(--text-tertiary)]">
            ₩{exchangeRate.rate.toLocaleString()}/$ ({exchangeRate.date})
          </p>
        </div>
        <SalesChart donut={chartData.donut} monthly={chartData.monthly} currentMonth={searchParams.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`} primaryCurrency={primaryCurrency} />
      </Card>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No sales" description="No delivered & paid orders for this month." />
        ) : (
          <>
            <DataTable columns={columns} data={orders} />
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalSalesCount} pageSize={PAGE_SIZE} />
          </>
        )}
      </Card>
    </div>
  );
}
