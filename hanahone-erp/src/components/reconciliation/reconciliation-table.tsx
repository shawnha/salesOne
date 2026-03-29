"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/ui/table";
import { AdjustModal } from "./adjust-modal";

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

type Props = {
  rows: ReconciliationRow[];
  companyId: string;
};

export function ReconciliationTable({ rows, companyId }: Props) {
  const router = useRouter();
  const [adjusting, setAdjusting] = useState<ReconciliationRow | null>(null);

  const columns = [
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
      render: (row: ReconciliationRow) => <span className="font-semibold">{row.purchased}</span>,
    },
    {
      key: "sold",
      header: "Sold",
      align: "right" as const,
      render: (row: ReconciliationRow) => <span className="font-semibold">{row.sold}</span>,
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
        <span className={`font-semibold ${row.diff === 0 ? "text-teal-600" : row.diff < 0 ? "text-rose-500" : "text-amber-500"}`}>
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
