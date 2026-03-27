import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const inventories = await prisma.inventory.findMany({
    where,
    include: {
      product: { select: { name: true, sku: true } },
      company: { select: { name: true } },
    },
    orderBy: { quantity: "asc" },
  });

  const columns = [
    {
      key: "product",
      header: "Product",
      render: (row: (typeof inventories)[0]) => (
        <span className={`font-semibold ${row.quantity <= row.reorderLevel ? "text-rose-500" : ""}`}>
          {row.product.name}
        </span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: (typeof inventories)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.product.sku}</span>
      ),
    },
    {
      key: "warehouse",
      header: "Warehouse",
      render: (row: (typeof inventories)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.warehouseLocation}</span>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right" as const,
      render: (row: (typeof inventories)[0]) => (
        <span className={`font-semibold ${row.quantity <= row.reorderLevel ? "text-rose-500" : ""}`}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: "reorderLevel",
      header: "Reorder Level",
      align: "right" as const,
      render: (row: (typeof inventories)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.reorderLevel}</span>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row: (typeof inventories)[0]) => (
        <span className="text-[var(--text-secondary)]">{row.company.name}</span>
      ),
    },
  ];

  const lowStockCount = inventories.filter((inv) => inv.quantity <= inv.reorderLevel).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Inventory</h1>
        {lowStockCount > 0 && (
          <span className="text-xs font-semibold text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full">
            {lowStockCount} item{lowStockCount > 1 ? "s" : ""} below reorder level
          </span>
        )}
      </div>
      <Card>
        {inventories.length === 0 ? (
          <EmptyState title="No inventory" description="No inventory records found for the selected company." />
        ) : (
          <DataTable columns={columns} data={inventories} />
        )}
      </Card>
      <a href="/inventory/cgetc" className="block group">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
                <span className="text-accent text-sm font-bold">C</span>
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight">CGETC 3PL Inventory</h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  View and map external SKUs from CGETC warehouse
                </p>
              </div>
            </div>
            <span className="text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors text-sm">
              &rarr;
            </span>
          </div>
        </Card>
      </a>
    </div>
  );
}
