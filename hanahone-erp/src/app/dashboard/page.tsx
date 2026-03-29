import { prisma } from "@/lib/prisma";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { CompanyBreakdown } from "@/components/dashboard/company-breakdown";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { LowStockAlerts } from "@/components/dashboard/low-stock-alerts";
import { DateFilter } from "@/components/ui/date-filter";
import { fetchCgetcInventory, type CgetcProduct } from "@/lib/integrations/connectors/cgetc";
import { decrypt } from "@/lib/integrations/encryption";
import { getUsdKrwRate, convertUsdToKrw, convertKrwToUsd } from "@/lib/exchange-rate";

const KRW_PLATFORMS = new Set(["NAVER", "PHARMACY"]);

function timeAgo(date: Date | null): string {
  if (!date) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function getDateRange(month?: string, year?: string): { gte: Date; lt: Date } {
  const now = new Date();
  if (year) {
    const y = parseInt(year);
    return { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
  }
  if (month) {
    const [y, m] = [parseInt(month.split("-")[0]), parseInt(month.split("-")[1]) - 1];
    return { gte: new Date(y, m, 1), lt: new Date(y, m + 1, 1) };
  }
  // Default: current month
  return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lt: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

function toKRW(amount: number, platform: string | null, rate: number): number {
  return KRW_PLATFORMS.has(platform || "") ? amount : convertUsdToKrw(amount, rate);
}

function toUSD(amount: number, platform: string | null, rate: number): number {
  return KRW_PLATFORMS.has(platform || "") ? convertKrwToUsd(amount, rate) : amount;
}

const formatWon = (n: number) => {
  if (n >= 1_000_000_000) return `₩${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
  return `₩${Math.round(n).toLocaleString()}`;
};

const formatUSD = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
};

export default async function DashboardPage({ searchParams }: { searchParams: { company?: string; month?: string; year?: string } }) {
  const companyId = searchParams.company || null;
  const companyFilter = companyId ? { companyId } : {};
  const dateRange = getDateRange(searchParams.month, searchParams.year);
  const dateFilter = { orderDate: dateRange };

  const [orders, allInventory, companies, productionOrders, cgetcConfig] = await Promise.all([
    prisma.order.findMany({ where: { ...companyFilter, ...dateFilter }, take: 5, orderBy: { orderDate: "desc" }, include: { customer: { select: { name: true } }, company: { select: { name: true } }, transfer: { include: { fromCompany: { select: { name: true } }, toCompany: { select: { name: true } } } } } }),
    prisma.inventory.findMany({ where: companyFilter, include: { product: { select: { name: true, sku: true, costPrice: true } }, company: { select: { name: true } } }, orderBy: { quantity: "asc" } }),
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.productionOrder.count({ where: { ...companyFilter, status: { in: ["PLANNED", "IN_PROGRESS"] } } }),
    prisma.integrationConfig.findFirst({ where: { platform: "CGETC", isActive: true } }),
  ]);

  // Fetch CGETC live inventory for dashboard KPIs
  let cgetcProducts: CgetcProduct[] = [];
  if (cgetcConfig) {
    try {
      const credentials = JSON.parse(decrypt(cgetcConfig.credentials));
      cgetcProducts = await fetchCgetcInventory(credentials);
    } catch {}
  }

  // Exclude internal records that overlap with CGETC live data
  const cgetcSkus = new Set(cgetcProducts.map((p) => p.sku));
  const filteredInventory = allInventory.filter(
    (inv) => !(inv.warehouseLocation === "CGETC" && inv.product.sku && cgetcSkus.has(inv.product.sku))
  );

  const lowStock = filteredInventory.filter((inv) => inv.quantity <= inv.reorderLevel).slice(0, 5);
  const inventoryValue = filteredInventory.reduce((sum, inv) => sum + inv.quantity * Number(inv.product.costPrice), 0)
    + cgetcProducts.reduce((sum, p) => sum + p.quantity * 0, 0); // CGETC products have no costPrice yet

  const [salesOrders, openOrders, pendingShipments, latestSyncs, exchangeRate] = await Promise.all([
    prisma.order.findMany({
      where: { ...companyFilter, ...dateFilter, type: { in: ["SALE", "BROKERAGE"] } },
      select: { totalAmount: true, externalSource: true },
    }),
    prisma.order.count({ where: { ...companyFilter, ...dateFilter, fulfillmentStatus: { in: ["UNFULFILLED", "PARTIALLY_FULFILLED", "FULFILLED"] } } }),
    prisma.order.count({ where: { ...companyFilter, ...dateFilter, fulfillmentStatus: "UNFULFILLED", financialStatus: "PAID" } }),
    prisma.syncJob.findMany({
      where: { status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      distinct: ["platform"],
      select: { platform: true, completedAt: true },
      take: 10,
    }),
    getUsdKrwRate(dateRange.lt > new Date() ? undefined : new Date(dateRange.lt.getTime() - 1)),
  ]);

  const rate = exchangeRate.rate;

  // Dual currency totals
  const totalSalesKRW = salesOrders.reduce((sum, o) => sum + toKRW(Number(o.totalAmount), o.externalSource, rate), 0);
  const totalSalesUSD = salesOrders.reduce((sum, o) => sum + toUSD(Number(o.totalAmount), o.externalSource, rate), 0);

  const companyBreakdowns = await Promise.all(
    companies.map(async (c) => {
      const companyOrders = await prisma.order.findMany({
        where: { companyId: c.id, ...dateFilter, type: { in: ["SALE", "BROKERAGE"] } },
        select: { totalAmount: true, externalSource: true },
      });
      const orderCount = await prisma.order.count({ where: { companyId: c.id, ...dateFilter } });
      const revenueKRW = companyOrders.reduce((sum, o) => sum + toKRW(Number(o.totalAmount), o.externalSource, rate), 0);
      const revenueUSD = companyOrders.reduce((sum, o) => sum + toUSD(Number(o.totalAmount), o.externalSource, rate), 0);
      return { ...c, revenueKRW, revenueUSD, orderCount };
    })
  );

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent bg-accent/[0.08] rounded-full mb-3">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            Live overview
          </div>
          <h1 className="text-3xl font-bold tracking-tighter">{companyId ? companies.find((c) => c.id === companyId)?.name : "Group"} dashboard</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{companyId ? "" : "HanahOne Group — consolidated across all entities"}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DateFilter />
          <p className="text-[10px] text-[var(--text-tertiary)]">
            ₩{rate.toLocaleString()}/$ ({exchangeRate.date})
          </p>
        </div>
      </div>
      <div className="space-y-4">
        <KpiRow data={{ totalSalesKRW, totalSalesUSD, openOrders, inventoryValue, productionRuns: productionOrders, salesChange: 0, pendingShipments, lowStockCount: lowStock.length, newProductionRuns: 0 }} />
        {latestSyncs.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {latestSyncs.map((sync) => (
              <div key={sync.platform} className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                {sync.platform}: {timeAgo(sync.completedAt)}
              </div>
            ))}
          </div>
        )}
        {!companyId && (
          <CompanyBreakdown companies={companyBreakdowns.map((c) => ({
            name: c.name,
            color: c.name === "HOI" ? "#0d9488" : c.name === "HOK" ? "#6366f1" : "#d97706",
            stats: [
              { label: "Revenue", value: formatWon(c.revenueKRW), subValue: formatUSD(c.revenueUSD) },
              { label: "Orders", value: c.orderCount.toString() },
            ],
          }))} />
        )}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <RecentOrders orders={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, customerName: o.customer?.name || "—", status: o.fulfillmentStatus, totalAmount: Number(o.totalAmount), externalSource: o.externalSource, isTransfer: o.type === "INTER_COMPANY", transferLabel: o.transfer ? `${o.transfer.fromCompany.name} → ${o.transfer.toCompany.name}` : undefined }))} />
          </div>
          <div className="col-span-4">
            <LowStockAlerts items={lowStock.map((inv) => ({ productName: inv.product.name, companyName: inv.company.name, reorderLevel: inv.reorderLevel, quantity: inv.quantity }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
