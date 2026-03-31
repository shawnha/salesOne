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

const KRW_PLATFORMS = new Set(["NAVER", "PHARMACY"]);

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
  NAVER: { label: "Naver", color: "text-emerald-600 bg-emerald-600/[0.08]" },
  PHARMACY: { label: "Pharmacy", color: "text-blue-600 bg-blue-600/[0.08]" },
  CGETC: { label: "CGETC", color: "text-indigo-600 bg-indigo-600/[0.08]" },
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

  const [orders, totalSalesCount, exchangeRate, companies] = await Promise.all([
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
    getUsdKrwRate(dateRange.lt > new Date() ? undefined : new Date(dateRange.lt.getTime() - 1)),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const primaryCurrency = getPrimaryCurrency(searchParams.company, companies);
  const chartData = await getChannelSalesData(searchParams.company, searchParams.month, searchParams.channel, {
    exchangeRate: exchangeRate.rate,
    primaryCurrency,
  });

  const totalPages = Math.ceil(totalSalesCount / PAGE_SIZE);
  const allSalesForKpi = await prisma.order.findMany({
    where,
    select: { netAmount: true, totalAmount: true, externalSource: true },
  });
  const totalRevenue = allSalesForKpi.reduce((sum, o) => {
    const amount = Number(o.netAmount ?? o.totalAmount);
    return sum + toUSD(amount, o.externalSource, exchangeRate.rate);
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
        const isSeeding = row.externalSource === "CGETC" && row.notes?.toLowerCase().startsWith("free gifting");
        if (isSeeding) {
          return (
            <span className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full text-violet-600 bg-violet-600/[0.08]">
              Seeding
            </span>
          );
        }
        const p = row.externalSource ? platformBadge[row.externalSource] : null;
        return p ? (
          <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${p.color}`}>
            {p.label}
          </span>
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
      render: (row: (typeof orders)[0]) => (
        <span className="font-semibold">{formatOrderAmount(Number(row.netAmount ?? row.totalAmount), row.externalSource)}</span>
      ),
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
