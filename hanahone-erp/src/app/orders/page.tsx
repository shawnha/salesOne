import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthPicker } from "@/components/ui/month-picker";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrdersChart } from "@/components/orders/OrdersChart";
import { TopCustomersCard } from "@/components/orders/TopCustomersCard";
import { ChannelFilter } from "@/components/orders/channel-filter";
import { getDailyOrderData } from "@/lib/orders-chart-data";
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { CurrencyDisplay, getPrimaryCurrency } from "@/components/ui/currency-display";

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const platformBadge: Record<string, { label: string; color: string }> = {
  SHOPIFY: { label: "Shopify", color: "text-green-600 bg-green-600/[0.08]" },
  AMAZON: { label: "Amazon", color: "text-orange-600 bg-orange-600/[0.08]" },
  TIKTOK: { label: "TikTok", color: "text-pink-600 bg-pink-600/[0.08]" },
  NAVER: { label: "Naver", color: "text-emerald-600 bg-emerald-600/[0.08]" },
  PHARMACY: { label: "Pharmacy", color: "text-blue-600 bg-blue-600/[0.08]" },
};

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
  searchParams: { company?: string; type?: string; month?: string; channel?: string };
}) {
  const dateRange = getMonthRange(searchParams.month);

  const where: any = { orderDate: dateRange };
  if (searchParams.company) where.companyId = searchParams.company;
  if (searchParams.type) where.type = searchParams.type;
  if (searchParams.channel) where.externalSource = searchParams.channel;

  const [orders, chartData, exchangeRate, companies] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        company: { select: { name: true } },
        transfer: true,
      },
      orderBy: { orderDate: "desc" },
    }),
    getDailyOrderData(searchParams.company, searchParams.month),
    getUsdKrwRate(),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const primaryCurrency = getPrimaryCurrency(searchParams.company, companies);

  const totalOrders = orders.length;
  const totalAmount = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const paidCount = orders.filter(o => o.financialStatus === "PAID" || o.financialStatus === "PARTIALLY_PAID").length;
  const refundedCount = orders.filter(o => o.financialStatus === "REFUNDED" || o.financialStatus === "PARTIALLY_REFUNDED").length;
  const fulfilledCount = orders.filter(o => o.fulfillmentStatus === "FULFILLED" || o.fulfillmentStatus === "DELIVERED").length;

  // Top 3 customers by order count
  const customerCounts = new Map<string, { name: string; count: number; amount: number }>();
  for (const order of orders) {
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
        <span className="text-[var(--text-secondary)]">
          {row.customer?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "platform",
      header: "Channel",
      render: (row: (typeof orders)[0]) => {
        const p = row.externalSource ? platformBadge[row.externalSource] : null;
        return p ? (
          <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${p.color}`}>
            {p.label}
          </span>
        ) : <span className="text-[var(--text-tertiary)]">Manual</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row: (typeof orders)[0]) => (
        <OrderStatusBadge
          fulfillmentStatus={row.fulfillmentStatus}
          financialStatus={row.financialStatus}
        />
      ),
    },
    {
      key: "totalAmount",
      header: "Amount",
      align: "right" as const,
      render: (row: (typeof orders)[0]) => {
        const hasRefund = row.refundAmount && Number(row.refundAmount) > 0;
        return (
          <div className="text-right">
            <span className={`font-semibold ${hasRefund ? "line-through text-[var(--text-tertiary)]" : ""}`}>
              {formatUSD(Number(row.totalAmount))}
            </span>
            {hasRefund && (
              <div className="text-[11px] text-red-500">
                Net: {formatUSD(Number(row.netAmount ?? row.totalAmount))}
              </div>
            )}
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
          <h1 className="text-xl font-bold tracking-tight">Orders</h1>
          <MonthPicker />
          <ChannelFilter />
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-[var(--text-secondary)]">Total</p>
            <p className="text-lg font-semibold">{totalOrders}</p>
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
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="No orders" description="No orders found for this month." />
        ) : (
          <DataTable columns={columns} data={orders} />
        )}
      </Card>
    </div>
  );
}
