"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/ui/table";
import { AdjustModal } from "./adjust-modal";
import type { ReconciliationRow } from "@/lib/reconciliation";

type Props = {
  rows: ReconciliationRow[];
  companyId: string;
};

const CHANNEL_LABELS: Record<string, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  NAVER: "네이버",
  COUPANG: "쿠팡",
  PHARMACY: "약국",
  CGETC: "CGETC",
  ORDERDESK: "OrderDesk",
  OTHER: "Other",
};

function ChannelBreakdown({ salesByChannel }: { salesByChannel: Record<string, number> }) {
  const entries = Object.entries(salesByChannel).filter(([, qty]) => qty > 0);
  if (entries.length === 0) return <span className="text-[var(--text-quaternary)]">—</span>;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {entries.map(([channel, qty]) => (
        <span key={channel} className="text-[11px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-tertiary)]">{CHANNEL_LABELS[channel] || channel}</span>{" "}
          <span className="font-semibold">-{qty}</span>
        </span>
      ))}
    </div>
  );
}

export function ReconciliationTable({ rows, companyId }: Props) {
  const router = useRouter();
  const [adjusting, setAdjusting] = useState<ReconciliationRow | null>(null);

  const columns = [
    {
      key: "sku",
      header: "SKU",
      render: (row: ReconciliationRow) => (
        <div>
          <span className="font-semibold">{row.sku}</span>
          <div className="text-[11px] text-[var(--text-tertiary)]">{row.productName}</div>
        </div>
      ),
    },
    {
      key: "baseline",
      header: "Baseline",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span className="font-semibold">{row.baseline}</span>
      ),
    },
    {
      key: "sales",
      header: "Sales Since Baseline",
      render: (row: ReconciliationRow) => (
        <div>
          <span className="font-semibold text-rose-500">
            {row.totalSales > 0 ? `-${row.totalSales}` : "—"}
          </span>
          <ChannelBreakdown salesByChannel={row.salesByChannel} />
        </div>
      ),
    },
    {
      key: "adjusted",
      header: "Adjusted",
      align: "right" as const,
      render: (row: ReconciliationRow) => (
        <span
          className={`font-semibold ${
            row.adjusted !== 0 ? "text-amber-500" : "text-[var(--text-quaternary)]"
          }`}
        >
          {row.adjusted === 0 ? "—" : row.adjusted > 0 ? `+${row.adjusted}` : row.adjusted}
        </span>
      ),
    },
    {
      key: "expected",
      header: "Expected",
      align: "right" as const,
      render: (row: ReconciliationRow) => <span className="font-semibold">{row.expected}</span>,
    },
    {
      key: "actual",
      header: "Actual",
      align: "right" as const,
      render: (row: ReconciliationRow) => <span className="font-semibold">{row.actual}</span>,
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
            <button
              onClick={() => setAdjusting(row)}
              className="text-[11px] text-accent font-semibold hover:underline"
            >
              Adjust
            </button>
          </div>
        ),
    },
  ];

  return (
    <>
      <DataTable columns={columns} data={rows} />
      {adjusting && (
        <AdjustModal
          sku={adjusting.sku}
          productName={adjusting.productName}
          companyId={companyId}
          currentDiff={adjusting.diff}
          onClose={() => setAdjusting(null)}
          onSuccess={() => {
            setAdjusting(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
