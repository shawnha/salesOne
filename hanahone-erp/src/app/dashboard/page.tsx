import { prisma } from "@/lib/prisma";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { CompanyBreakdown } from "@/components/dashboard/company-breakdown";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { LowStockAlerts } from "@/components/dashboard/low-stock-alerts";
import { DateFilter } from "@/components/ui/date-filter";

export default async function DashboardPage({ searchParams }: { searchParams: { company?: string } }) {
  const companyId = searchParams.company || null;
  const companyFilter = companyId ? { companyId } : {};

  const [orders, allInventory, companies, productionOrders] = await Promise.all([
    prisma.order.findMany({ where: companyFilter, take: 5, orderBy: { orderDate: "desc" }, include: { customer: { select: { name: true } }, company: { select: { name: true } }, transfer: { include: { fromCompany: { select: { name: true } }, toCompany: { select: { name: true } } } } } }),
    prisma.inventory.findMany({ where: companyFilter, include: { product: { select: { name: true, costPrice: true } }, company: { select: { name: true } } }, orderBy: { quantity: "asc" } }),
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.productionOrder.count({ where: { ...companyFilter, status: { in: ["PLANNED", "IN_PROGRESS"] } } }),
  ]);

  const lowStock = allInventory.filter((inv) => inv.quantity <= inv.reorderLevel).slice(0, 5);
  const inventoryValue = allInventory.reduce((sum, inv) => sum + inv.quantity * Number(inv.product.costPrice), 0);

  const [totalSales, openOrders, pendingShipments] = await Promise.all([
    prisma.order.aggregate({ where: { ...companyFilter, type: { in: ["SALE", "BROKERAGE"] } }, _sum: { totalAmount: true } }),
    prisma.order.count({ where: { ...companyFilter, status: { in: ["PENDING", "PROCESSING", "SHIPPED"] } } }),
    prisma.order.count({ where: { ...companyFilter, status: "PROCESSING" } }),
  ]);

  const companyBreakdowns = await Promise.all(
    companies.map(async (c) => {
      const revenue = await prisma.order.aggregate({ where: { companyId: c.id, type: { in: ["SALE", "BROKERAGE"] } }, _sum: { totalAmount: true } });
      const orderCount = await prisma.order.count({ where: { companyId: c.id } });
      return { ...c, revenue: Number(revenue._sum.totalAmount || 0), orderCount };
    })
  );

  const formatWon = (n: number) => {
    if (n >= 1_000_000_000) return `₩${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
    return `₩${n.toLocaleString()}`;
  };

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
        <DateFilter />
      </div>
      <div className="space-y-4">
        <KpiRow data={{ totalSales: Number(totalSales._sum.totalAmount || 0), openOrders, inventoryValue, productionRuns: productionOrders, salesChange: 0, pendingShipments, lowStockCount: lowStock.length, newProductionRuns: 0 }} />
        {!companyId && (
          <CompanyBreakdown companies={companyBreakdowns.map((c) => ({
            name: c.name,
            color: c.name === "HOI" ? "#0d9488" : c.name === "HOK" ? "#6366f1" : "#d97706",
            stats: [{ label: "Revenue", value: formatWon(c.revenue) }, { label: "Orders", value: c.orderCount.toString() }],
          }))} />
        )}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <RecentOrders orders={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, customerName: o.customer?.name || "—", status: o.status, totalAmount: Number(o.totalAmount), isTransfer: o.type === "INTER_COMPANY", transferLabel: o.transfer ? `${o.transfer.fromCompany.name} → ${o.transfer.toCompany.name}` : undefined }))} />
          </div>
          <div className="col-span-4">
            <LowStockAlerts items={lowStock.map((inv) => ({ productName: inv.product.name, companyName: inv.company.name, reorderLevel: inv.reorderLevel, quantity: inv.quantity }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
