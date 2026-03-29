import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { fetchCgetcInventory, type CgetcProduct } from "@/lib/integrations/connectors/cgetc";
import { decrypt } from "@/lib/integrations/encryption";
import { calculateExpectedStock } from "@/lib/reconciliation";

type ReconciliationRow = {
  sku: string;
  productName: string;
  purchased: number;
  sold: number;
  adjusted: number;
  expected: number;
  actual: number;
  diff: number;
  reconciled: boolean;
};

type AdjustmentRow = {
  id: string;
  date: string;
  sku: string;
  quantity: number;
  reason: string;
  memo: string | null;
};

export default async function ReconciliationPage() {
  // Fetch all data in parallel
  const [poLines, orderItems, adjustments, cgetcConfig] = await Promise.all([
    prisma.purchaseOrderLine.findMany({
      where: { sku: { not: null } },
      select: { sku: true, productName: true, quantity: true },
    }),
    prisma.orderItem.findMany({
      include: {
        product: { select: { sku: true } },
      },
    }),
    prisma.reconciliationAdjustment.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.integrationConfig.findFirst({
      where: { platform: "CGETC", isActive: true },
    }),
  ]);

  // Fetch CGETC actual stock
  let cgetcProducts: CgetcProduct[] = [];
  let cgetcError: string | null = null;
  if (cgetcConfig) {
    try {
      const credentials = JSON.parse(decrypt(cgetcConfig.credentials));
      cgetcProducts = await fetchCgetcInventory(credentials);
    } catch (err: any) {
      cgetcError = err.message || "Failed to fetch CGETC inventory";
    }
  }

  // Build purchased qty by SKU
  const purchasedBySku = new Map<string, { qty: number; name: string }>();
  for (const line of poLines) {
    if (!line.sku) continue;
    const existing = purchasedBySku.get(line.sku);
    if (existing) {
      existing.qty += Number(line.quantity);
    } else {
      purchasedBySku.set(line.sku, { qty: Number(line.quantity), name: line.productName });
    }
  }

  // Build sold qty by SKU
  const soldBySku = new Map<string, number>();
  for (const item of orderItems) {
    const sku = item.product?.sku;
    if (!sku) continue;
    soldBySku.set(sku, (soldBySku.get(sku) || 0) + item.quantity);
  }

  // Build adjusted qty by SKU
  const adjustedBySku = new Map<string, number>();
  for (const adj of adjustments) {
    adjustedBySku.set(adj.sku, (adjustedBySku.get(adj.sku) || 0) + adj.quantity);
  }

  // Build actual stock by SKU from CGETC
  const actualBySku = new Map<string, number>();
  for (const p of cgetcProducts) {
    if (p.sku) actualBySku.set(p.sku, p.quantity);
  }

  // Collect all tracked SKUs (those that appear in PO lines)
  const trackedSkus = Array.from(purchasedBySku.keys());

  // Build reconciliation rows
  const rows: ReconciliationRow[] = trackedSkus.map((sku) => {
    const purchased = purchasedBySku.get(sku)?.qty || 0;
    const productName = purchasedBySku.get(sku)?.name || sku;
    const sold = soldBySku.get(sku) || 0;
    const adjusted = adjustedBySku.get(sku) || 0;
    const expected = calculateExpectedStock({ purchased, sold, adjusted });
    const actual = actualBySku.get(sku) ?? 0;
    const diff = actual - expected;

    return {
      sku,
      productName,
      purchased,
      sold,
      adjusted,
      expected,
      actual,
      diff,
      reconciled: diff === 0,
    };
  });

  // Sort: unreconciled first, then by absolute diff descending
  rows.sort((a, b) => {
    if (a.reconciled !== b.reconciled) return a.reconciled ? 1 : -1;
    return Math.abs(b.diff) - Math.abs(a.diff);
  });

  const totalDiff = rows.reduce((sum, r) => sum + r.diff, 0);
  const unreconciledCount = rows.filter((r) => !r.reconciled).length;

  // Adjustment history rows
  const adjustmentRows: AdjustmentRow[] = adjustments.map((adj) => ({
    id: adj.id,
    date: adj.createdAt.toISOString(),
    sku: adj.sku,
    quantity: adj.quantity,
    reason: adj.reason,
    memo: adj.memo,
  }));

  const reconColumns = [
    {
      key: "sku",
      header: "SKU",
      render: (row: ReconciliationRow) => (
        <span className="font-semibold">{row.sku}</span>
      ),
    },
    {
      key: "productName",
      header: "Product",
      render: (row: ReconciliationRow) => (
        <span className="text-[var(--text-secondary)]">{row.productName}</span>
      ),
    },
    {
      key: "purchased",
      header: "Purchased",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span className="font-semibold">{row.purchased}</span>
      ),
    },
    {
      key: "sold",
      header: "Sold",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span className="font-semibold">{row.sold}</span>
      ),
    },
    {
      key: "adjusted",
      header: "Adjusted",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span className={`font-semibold ${row.adjusted !== 0 ? "text-amber-500" : "text-[var(--text-tertiary)]"}`}>
          {row.adjusted}
        </span>
      ),
    },
    {
      key: "expected",
      header: "Expected",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span className="font-semibold">{row.expected}</span>
      ),
    },
    {
      key: "actual",
      header: "Actual",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span className="font-semibold">{row.actual}</span>
      ),
    },
    {
      key: "diff",
      header: "Diff",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
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
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: ReconciliationRow) =>
        row.reconciled ? (
          <span className="text-teal-600 text-[11px] font-semibold">Reconciled</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-rose-500 text-[11px] font-semibold">Unreconciled</span>
            <span className="text-[11px] text-accent cursor-pointer hover:underline">
              Adjust
            </span>
          </div>
        ),
    },
  ];

  const adjColumns = [
    {
      key: "date",
      header: "Date",
      render: (row: AdjustmentRow) => (
        <span className="text-[var(--text-secondary)]">
          {new Date(row.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      render: (row: AdjustmentRow) => (
        <span className="font-semibold">{row.sku}</span>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right" as const,
      render: (row: AdjustmentRow) => (
        <span
          className={`font-semibold ${
            row.quantity > 0 ? "text-teal-600" : row.quantity < 0 ? "text-rose-500" : ""
          }`}
        >
          {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row: AdjustmentRow) => (
        <span className="text-[var(--text-secondary)]">{row.reason}</span>
      ),
    },
    {
      key: "memo",
      header: "Memo",
      render: (row: AdjustmentRow) => (
        <span className="text-[var(--text-tertiary)]">{row.memo ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Reconciliation</h1>
          {cgetcProducts.length > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              CGETC live
            </span>
          )}
        </div>
        {unreconciledCount > 0 && (
          <span className="text-xs font-semibold text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full">
            {unreconciledCount} unreconciled item{unreconciledCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {cgetcError && (
        <div className="px-3 py-2 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-600">
          CGETC sync error: {cgetcError}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          label="Total Difference"
          value={totalDiff > 0 ? `+${totalDiff}` : String(totalDiff)}
          change={
            totalDiff === 0
              ? { value: "All matched", direction: "up" as const }
              : totalDiff < 0
              ? { value: `${Math.abs(totalDiff)} units short`, direction: "down" as const }
              : { value: `${totalDiff} units over`, direction: "neutral" as const }
          }
        />
        <KpiCard
          label="Unreconciled Items"
          value={String(unreconciledCount)}
          subtitle={`of ${rows.length} tracked products`}
        />
      </div>

      {/* Reconciliation Table */}
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No tracked products"
            description="No tracked products. Sync purchase orders first."
          />
        ) : (
          <DataTable columns={reconColumns} data={rows} />
        )}
      </Card>

      {/* Adjustment History */}
      {adjustmentRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Adjustment History <span className="text-[var(--text-quaternary)]">({adjustmentRows.length})</span>
          </h2>
          <Card>
            <DataTable columns={adjColumns} data={adjustmentRows} />
          </Card>
        </div>
      )}
    </div>
  );
}
