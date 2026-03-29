import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchCgetcInventory, type CgetcProduct } from "@/lib/integrations/connectors/cgetc";
import { decrypt } from "@/lib/integrations/encryption";
import { buildBaselineRows } from "@/lib/reconciliation";

type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  warehouse: string;
  company: string;
  quantity: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  source: "internal" | "cgetc";
  expected: number | null;
  actual: number | null;
  diff: number | null;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const [inventories, cgetcConfig, baselines] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: {
        product: { select: { name: true, sku: true } },
        company: { select: { name: true } },
      },
      orderBy: { quantity: "asc" },
    }),
    prisma.integrationConfig.findFirst({
      where: { platform: "CGETC", isActive: true },
    }),
    prisma.inventoryBaseline.findMany(),
  ]);

  // Fetch CGETC inventory in real-time
  let cgetcProducts: CgetcProduct[] = [];
  let cgetcError: string | null = null;
  if (cgetcConfig) {
    try {
      const credentials = JSON.parse(decrypt(cgetcConfig.credentials));
      cgetcProducts = await fetchCgetcInventory(credentials);

      // Auto-register CGETC products in Products table
      for (const cp of cgetcProducts) {
        if (!cp.sku) continue;
        await prisma.product.upsert({
          where: { sku_companyId: { sku: cp.sku, companyId: cgetcConfig.companyId } },
          update: { name: cp.name },
          create: {
            name: cp.name,
            sku: cp.sku,
            category: "CGETC",
            basePrice: 0,
            costPrice: 0,
            companyId: cgetcConfig.companyId,
          },
        });
      }
    } catch (err: any) {
      cgetcError = err.message || "Failed to fetch CGETC inventory";
    }
  }

  // Merge into unified rows — exclude internal records that overlap with CGETC live data
  const cgetcSkus = new Set(cgetcProducts.map((p) => p.sku));
  const filteredInventories = inventories.filter(
    (inv) => !(inv.warehouseLocation === "CGETC" && inv.product.sku && cgetcSkus.has(inv.product.sku))
  );

  // Build baseline-forward reconciliation data for CGETC comparison columns
  const hasBaselines = baselines.length > 0;
  let baselineExpectedBySku = new Map<string, number>();

  if (hasBaselines) {
    const companyId = cgetcConfig?.companyId || "";
    const earliestSetAt = baselines.reduce(
      (earliest, b) => (b.setAt < earliest ? b.setAt : earliest),
      baselines[0].setAt
    );

    const [orderItems, adjustments] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { companyId, orderDate: { gt: earliestSetAt } } },
        include: {
          order: { select: { externalSource: true, orderDate: true } },
          product: { select: { sku: true } },
        },
      }),
      prisma.reconciliationAdjustment.findMany({ where: { companyId } }),
    ]);

    const actualBySku: Record<string, number> = {};
    for (const p of cgetcProducts) {
      if (p.sku) actualBySku[p.sku] = p.quantity;
    }

    const baselineRows = buildBaselineRows(
      baselines,
      orderItems.filter((i) => i.product?.sku).map((i) => ({
        sku: i.product.sku,
        quantity: i.quantity,
        orderDate: i.order.orderDate,
        channel: i.order.externalSource || "OTHER",
      })),
      adjustments.map((a) => ({ sku: a.sku, quantity: a.quantity, createdAt: a.createdAt })),
      actualBySku,
    );

    for (const row of baselineRows) {
      baselineExpectedBySku.set(row.sku, row.expected);
    }
  }

  const rows: InventoryRow[] = [
    ...filteredInventories.map((inv) => ({
      id: inv.id,
      sku: inv.product.sku || "",
      name: inv.product.name,
      warehouse: inv.warehouseLocation,
      company: inv.company.name,
      quantity: inv.quantity,
      reserved: 0,
      available: inv.quantity,
      reorderLevel: inv.reorderLevel,
      source: "internal" as const,
      expected: null,
      actual: null,
      diff: null,
    })),
    ...cgetcProducts.map((p) => {
      const expected = baselineExpectedBySku.get(p.sku) ?? null;
      const actual = p.quantity;
      const diff = expected !== null ? actual - expected : null;
      return {
        id: `cgetc-${p.sku}`,
        sku: p.sku,
        name: p.name,
        warehouse: "CGETC",
        company: "HOI",
        quantity: p.quantity,
        reserved: p.reserved,
        available: p.available,
        reorderLevel: 0,
        source: "cgetc" as const,
        expected,
        actual,
        diff,
      };
    }),
  ];

  const columns = [
    {
      key: "name",
      header: "Product",
      render: (row: InventoryRow) => (
        <span className={`font-semibold ${row.source === "internal" && row.quantity <= row.reorderLevel ? "text-rose-500" : ""}`}>
          {row.name}
        </span>
      ),
    },
    {
      key: "warehouse",
      header: "Warehouse",
      render: (row: InventoryRow) => (
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)]">{row.warehouse}</span>
          {row.source === "cgetc" && (
            <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-600/[0.08] text-blue-600">3PL</span>
          )}
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row: InventoryRow) => (
        <span className="text-[var(--text-secondary)]">{row.company}</span>
      ),
    },
    {
      key: "quantity",
      header: "On Hand",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className={`font-semibold ${row.source === "internal" && row.quantity <= row.reorderLevel ? "text-rose-500" : ""}`}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: "reserved",
      header: "Reserved",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className={`${row.reserved > 0 ? "text-orange-600 font-semibold" : "text-[var(--text-tertiary)]"}`}>
          {row.reserved}
        </span>
      ),
    },
    {
      key: "available",
      header: "Available",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className="font-semibold text-teal-600">
          {row.available}
        </span>
      ),
    },
    {
      key: "expected",
      header: "Expected",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className={`font-semibold ${row.expected === null ? "text-[var(--text-quaternary)]" : ""}`}>
          {row.expected !== null ? row.expected : "—"}
        </span>
      ),
    },
    {
      key: "actual",
      header: "Actual",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className={`font-semibold ${row.actual === null ? "text-[var(--text-quaternary)]" : ""}`}>
          {row.actual !== null ? row.actual : "—"}
        </span>
      ),
    },
    {
      key: "diff",
      header: "Diff",
      align: "right" as const,
      render: (row: InventoryRow) => {
        if (row.diff === null) return <span className="text-[var(--text-quaternary)]">—</span>;
        return (
          <span
            className={`font-semibold ${
              row.diff === 0
                ? "text-teal-600"
                : row.diff < 0
                ? "text-rose-500"
                : "text-amber-500"
            }`}
          >
            {row.diff > 0 ? `+${row.diff}` : row.diff}
          </span>
        );
      },
    },
  ];

  const lowStockCount = inventories.filter((inv) => inv.quantity <= inv.reorderLevel).length;

  // Group view: separate sections per company
  const isGroupView = !searchParams.company;
  const companyGroups = isGroupView
    ? Array.from(
        rows.reduce((map, r) => {
          const group = map.get(r.company) || { rows: [] as InventoryRow[] };
          group.rows.push(r);
          map.set(r.company, group);
          return map;
        }, new Map<string, { rows: InventoryRow[] }>())
      ).sort(([a], [b]) => a.localeCompare(b))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Inventory</h1>
        <div className="flex items-center gap-3">
          {cgetcProducts.length > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              CGETC live
            </span>
          )}
          {lowStockCount > 0 && (
            <span className="text-xs font-semibold text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full">
              {lowStockCount} item{lowStockCount > 1 ? "s" : ""} below reorder level
            </span>
          )}
        </div>
      </div>
      {cgetcError && (
        <div className="px-3 py-2 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-600">
          CGETC sync error: {cgetcError}
        </div>
      )}
      {companyGroups ? (
        companyGroups.map(([companyName, group]) => (
          <div key={companyName} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              {companyName} <span className="text-[var(--text-quaternary)]">({group.rows.length})</span>
            </h2>
            <Card>
              {group.rows.length === 0 ? (
                <EmptyState title="No inventory" description="No inventory records found." />
              ) : (
                <DataTable columns={columns} data={group.rows} />
              )}
            </Card>
          </div>
        ))
      ) : (
        <Card>
          {rows.length === 0 ? (
            <EmptyState title="No inventory" description="No inventory records found." />
          ) : (
            <DataTable columns={columns} data={rows} />
          )}
        </Card>
      )}
    </div>
  );
}
