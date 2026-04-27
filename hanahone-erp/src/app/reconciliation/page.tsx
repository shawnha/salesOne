import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { fetchCgetcInventory } from "@/lib/integrations/connectors/cgetc";
import { decrypt } from "@/lib/integrations/encryption";
import { buildBaselineRows } from "@/lib/reconciliation";
import { ReconciliationTable } from "@/components/reconciliation/reconciliation-table";
import { SetBaselineButton } from "@/components/reconciliation/set-baseline-button";
import { SettlementSection } from "@/components/reconciliation/SettlementSection";

type AdjustmentRow = {
  id: string;
  date: string;
  sku: string;
  quantity: number;
  reason: string;
  memo: string | null;
};

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });

  // Determine company — use selected company or default to first with CGETC, then first company
  let companyId = searchParams.company || "";
  if (!companyId) {
    const cgetcConfig = await prisma.integrationConfig.findFirst({
      where: { platform: "CGETC", isActive: true },
      select: { companyId: true },
    });
    companyId = cgetcConfig?.companyId || companies[0]?.id || "";
  }

  const companyName = companies.find((c) => c.id === companyId)?.name || "Unknown";

  // Check if this company has CGETC integration
  const cgetcConfig = await prisma.integrationConfig.findFirst({
    where: { companyId, platform: "CGETC", isActive: true },
  });
  const hasCgetc = !!cgetcConfig;

  const [baselines, adjustments] = await Promise.all([
    prisma.inventoryBaseline.findMany({ where: { companyId } }),
    prisma.reconciliationAdjustment.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Build actual inventory: CGETC live data or DB inventory
  const actualBySku: Record<string, number> = {};
  let cgetcError: string | null = null;
  let liveSource = "DB";

  if (hasCgetc && cgetcConfig) {
    try {
      const creds = JSON.parse(decrypt(cgetcConfig.credentials));
      const cgetcProducts = await fetchCgetcInventory(creds);
      for (const p of cgetcProducts) {
        if (p.sku) actualBySku[p.sku] = p.quantity;
      }
      liveSource = "CGETC";
    } catch (e: any) {
      cgetcError = e.message || "Failed to fetch CGETC inventory";
    }
  }

  if (!hasCgetc || cgetcError) {
    // For companies with baselines (e.g. HOK), use baseline as actual (auto-deducted on sales)
    // For others, use DB inventory
    if (baselines.length > 0) {
      for (const b of baselines) {
        actualBySku[b.sku] = b.quantity;
      }
      liveSource = "Baseline";
    } else {
      const dbInventory = await prisma.inventory.findMany({
        where: { companyId },
        include: { product: { select: { sku: true } } },
      });
      for (const inv of dbInventory) {
        if (inv.product.sku) {
          actualBySku[inv.product.sku] = (actualBySku[inv.product.sku] || 0) + inv.quantity;
        }
      }
      liveSource = "DB";
    }
  }

  const hasBaselines = baselines.length > 0;

  if (!hasBaselines) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Reconciliation</h1>
          <CompanyTabs companies={companies} currentId={companyId} />
        </div>
        <Card>
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">Set Inventory Baseline</h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                Capture current {companyName} inventory as your starting point. All future sales will be
                tracked against this baseline to detect discrepancies.
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Source: {hasCgetc ? "CGETC live inventory" : "Database inventory"}
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

  const rows = buildBaselineRows(baselines, orderItemData, adjustmentData, actualBySku);

  const totalDiff = rows.reduce((sum, r) => sum + r.diff, 0);
  const unreconciledCount = rows.filter((r) => !r.reconciled).length;

  // Products in actual inventory but not in baseline
  const baselineSkus = new Set(baselines.map((b) => b.sku));
  const unbaselinedSkus = Object.entries(actualBySku)
    .filter(([sku, qty]) => !baselineSkus.has(sku) && qty > 0)
    .map(([sku, qty]) => ({ sku, quantity: qty }));

  const adjustmentRows: AdjustmentRow[] = adjustments.map((adj) => ({
    id: adj.id,
    date: adj.createdAt.toISOString(),
    sku: adj.sku,
    quantity: adj.quantity,
    reason: adj.reason,
    memo: adj.memo,
  }));

  // Settlement reconciliation rows (Naver only, for now). Builds expected
  // amount per month from Order.settlementAmount and merges any manual
  // actual-deposit entries already saved in SettlementReconciliation.
  const settlementOrders = await prisma.order.findMany({
    where: {
      companyId,
      externalSource: "NAVER",
      type: "SALE",
      settlementAmount: { not: null },
    },
    select: { orderDate: true, settlementAmount: true, financialStatus: true },
  });
  const expectedByMonth = new Map<string, { expected: number; orderCount: number }>();
  for (const o of settlementOrders) {
    if (o.financialStatus === "VOIDED") continue;
    const ym = o.orderDate.toISOString().slice(0, 7);
    const e = expectedByMonth.get(ym) ?? { expected: 0, orderCount: 0 };
    e.expected += Number(o.settlementAmount ?? 0);
    e.orderCount++;
    expectedByMonth.set(ym, e);
  }
  const savedSettlements = await prisma.settlementReconciliation.findMany({
    where: { companyId, platform: "NAVER" },
  });
  const savedByPeriod = new Map(
    savedSettlements.map((s) => [s.periodStart.toISOString().slice(0, 7), s]),
  );
  const settlementRows = Array.from(expectedByMonth.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([ym, agg]) => {
      const [year, month] = ym.split("-").map(Number);
      const periodStart = new Date(Date.UTC(year, month - 1, 1));
      const periodEnd = new Date(Date.UTC(year, month, 1));
      const saved = savedByPeriod.get(ym);
      return {
        period: ym,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        expectedAmount: Math.round(agg.expected),
        actualAmount: saved?.actualAmount ? Number(saved.actualAmount) : null,
        notes: saved?.notes ?? null,
        orderCount: agg.orderCount,
      };
    });
  const hasNaverSettlements = settlementRows.length > 0;

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
          <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${liveSource === "CGETC" ? "bg-blue-500" : "bg-emerald-500"}`} />
            {liveSource === "CGETC" ? "CGETC live" : "DB inventory"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <CompanyTabs companies={companies} currentId={companyId} />
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
          CGETC sync error: {cgetcError} — falling back to DB inventory
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

      {unbaselinedSkus.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Unbaselined Products{" "}
            <span className="text-[var(--text-quaternary)]">({unbaselinedSkus.length})</span>
          </h2>
          <Card>
            <div className="text-[11px] text-[var(--text-secondary)] px-4 py-3 border-b border-[var(--card-border)]">
              These products have inventory but are not in the current baseline. Click &quot;Reset Baseline&quot; to include them.
            </div>
            <DataTable
              columns={[
                { key: "sku", header: "SKU", render: (p: { sku: string; quantity: number }) => <span className="font-semibold">{p.sku}</span> },
                { key: "quantity", header: "Current Qty", align: "right" as const, render: (p: { sku: string; quantity: number }) => <span className="font-semibold">{p.quantity}</span> },
              ]}
              data={unbaselinedSkus}
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

      {hasNaverSettlements && (
        <SettlementSection companyId={companyId} platform="NAVER" rows={settlementRows} />
      )}
    </div>
  );
}

function CompanyTabs({ companies, currentId }: { companies: { id: string; name: string }[]; currentId: string }) {
  return (
    <div className="flex gap-1 bg-[var(--surface)] rounded-full p-0.5 border border-[var(--border)]">
      {companies.map((c) => (
        <a
          key={c.id}
          href={`/reconciliation?company=${c.id}`}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            c.id === currentId
              ? "bg-accent text-white"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {c.name}
        </a>
      ))}
    </div>
  );
}
