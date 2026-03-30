import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { fetchCgetcInventory, type CgetcProduct } from "@/lib/integrations/connectors/cgetc";
import { decrypt } from "@/lib/integrations/encryption";
import { buildBaselineRows } from "@/lib/reconciliation";
import { ReconciliationTable } from "@/components/reconciliation/reconciliation-table";
import { SetBaselineButton } from "@/components/reconciliation/set-baseline-button";

type AdjustmentRow = {
  id: string;
  date: string;
  sku: string;
  quantity: number;
  reason: string;
  memo: string | null;
};

export default async function ReconciliationPage() {
  const cgetcConfig = await prisma.integrationConfig.findFirst({
    where: { platform: "CGETC", isActive: true },
  });
  const companyId = cgetcConfig?.companyId || "";

  const [baselines, adjustments] = await Promise.all([
    prisma.inventoryBaseline.findMany({ where: { companyId } }),
    prisma.reconciliationAdjustment.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let cgetcProducts: CgetcProduct[] = [];
  let cgetcError: string | null = null;
  if (cgetcConfig) {
    try {
      const creds = JSON.parse(decrypt(cgetcConfig.credentials));
      cgetcProducts = await fetchCgetcInventory(creds);
    } catch (e: any) {
      cgetcError = e.message || "Failed to fetch CGETC inventory";
    }
  }

  const hasBaselines = baselines.length > 0;

  if (!hasBaselines) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Reconciliation</h1>
        </div>
        <Card>
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">Set Inventory Baseline</h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                Capture current CGETC inventory as your starting point. All future sales will be
                tracked against this baseline to detect discrepancies.
              </p>
            </div>
            <SetBaselineButton companyId={companyId} />
          </div>
        </Card>
      </div>
    );
  }

  const earliestSetAt = baselines.reduce(
    (earliest, b) => (b.setAt < earliest ? b.setAt : earliest),
    baselines[0].setAt
  );

  const allOrderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        companyId,
        orderDate: { gt: earliestSetAt },
      },
    },
    include: {
      order: { select: { externalSource: true, orderDate: true } },
      product: { select: { sku: true } },
    },
  });

  const orderItemData = allOrderItems
    .filter((item) => item.product?.sku)
    .map((item) => ({
      sku: item.product.sku,
      quantity: item.quantity,
      orderDate: item.order.orderDate,
      channel: item.order.externalSource || "OTHER",
    }));

  const adjustmentData = adjustments.map((adj) => ({
    sku: adj.sku,
    quantity: adj.quantity,
    createdAt: adj.createdAt,
  }));

  const actualBySku: Record<string, number> = {};
  for (const p of cgetcProducts) {
    if (p.sku) actualBySku[p.sku] = p.quantity;
  }

  const rows = buildBaselineRows(baselines, orderItemData, adjustmentData, actualBySku);

  const totalDiff = rows.reduce((sum, r) => sum + r.diff, 0);
  const unreconciledCount = rows.filter((r) => !r.reconciled).length;

  const baselineSkus = new Set(baselines.map((b) => b.sku));
  const unbaselinedProducts = cgetcProducts.filter(
    (p) => p.sku && !baselineSkus.has(p.sku) && p.quantity > 0
  );

  const adjustmentRows: AdjustmentRow[] = adjustments.map((adj) => ({
    id: adj.id,
    date: adj.createdAt.toISOString(),
    sku: adj.sku,
    quantity: adj.quantity,
    reason: adj.reason,
    memo: adj.memo,
  }));

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
      render: (row: AdjustmentRow) => <span className="font-semibold">{row.sku}</span>,
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
        <div className="flex items-center gap-3">
          {unreconciledCount > 0 && (
            <span className="text-xs font-semibold text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full">
              {unreconciledCount} unreconciled
            </span>
          )}
          <SetBaselineButton
            companyId={companyId}
            isReset
            baselineCount={baselines.length}
            adjustmentCount={adjustments.filter((a) => a.createdAt > earliestSetAt).length}
          />
        </div>
      </div>

      {cgetcError && (
        <div className="px-3 py-2 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-600">
          CGETC sync error: {cgetcError}
        </div>
      )}

      <div className="text-[11px] text-[var(--text-tertiary)]">
        Baseline set:{" "}
        {new Date(earliestSetAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        {" · "}Tracking {baselines.length} SKUs
      </div>

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

      <Card>
        <ReconciliationTable rows={rows} companyId={companyId} />
      </Card>

      {unbaselinedProducts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Unbaselined Products{" "}
            <span className="text-[var(--text-quaternary)]">({unbaselinedProducts.length})</span>
          </h2>
          <Card>
            <div className="text-[11px] text-[var(--text-secondary)] px-4 py-3 border-b border-[var(--card-border)]">
              These CGETC products are not in the current baseline. Click &quot;Reset Baseline&quot; to include them.
            </div>
            <DataTable
              columns={[
                { key: "sku", header: "SKU", render: (p: CgetcProduct) => <span className="font-semibold">{p.sku}</span> },
                { key: "name", header: "Product", render: (p: CgetcProduct) => <span className="text-[var(--text-secondary)]">{p.name}</span> },
                { key: "quantity", header: "CGETC Qty", align: "right" as const, render: (p: CgetcProduct) => <span className="font-semibold">{p.quantity}</span> },
              ]}
              data={unbaselinedProducts}
            />
          </Card>
        </div>
      )}

      {adjustmentRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Adjustment History{" "}
            <span className="text-[var(--text-quaternary)]">({adjustmentRows.length})</span>
          </h2>
          <Card>
            <DataTable columns={adjColumns} data={adjustmentRows} />
          </Card>
        </div>
      )}
    </div>
  );
}
