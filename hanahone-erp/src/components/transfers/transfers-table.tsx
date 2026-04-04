"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface TransferItem {
  quantity: number;
  product: { name: string; sku: string };
}

interface TransferRow {
  id: string;
  orderNumber: string;
  orderId: string;
  fromCompany: string;
  toCompany: string;
  status: string;
  reason: string | null;
  costAmount: number | null;
  transferDate: string;
  receivedDate: string | null;
  items: TransferItem[];
}

export function TransfersTable({ transfers }: { transfers: TransferRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 z-10 bg-[var(--surface)]">
          <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            <th className="text-left py-3 px-4">Order #</th>
            <th className="text-left py-3 px-4">From</th>
            <th className="text-left py-3 px-4">To</th>
            <th className="text-left py-3 px-4">Status</th>
            <th className="text-left py-3 px-4">Reason</th>
            <th className="text-right py-3 px-4">Cost</th>
            <th className="text-left py-3 px-4">Date</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((row) => {
            const isExpanded = expandedId === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  className={`border-b border-[var(--border)] cursor-pointer transition-colors ${
                    isExpanded ? "bg-indigo-500/[0.04]" : "hover:bg-[var(--hover-bg-subtle)]"
                  }`}
                >
                  <td className="py-3 px-4">
                    <Link
                      href={`/transfers/${row.id}`}
                      className="font-semibold text-accent hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 px-4 font-semibold">{row.fromCompany}</td>
                  <td className="py-3 px-4 font-semibold">{row.toCompany}</td>
                  <td className="py-3 px-4"><Badge status={row.status} /></td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">{row.reason || "—"}</td>
                  <td className="py-3 px-4 text-right font-semibold">
                    {row.costAmount ? `$${row.costAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">
                    {new Date(row.transferDate).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={7} className="bg-[var(--hover-bg-subtle)] border-b border-[var(--border)]">
                      <div className="px-8 py-4 space-y-3">
                        {row.items.length > 0 ? (
                          <div className="flex items-start gap-3 text-[13px]">
                            <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1" />
                            <div className="flex-1">
                              <span className="font-semibold text-[var(--text-secondary)]">Items</span>
                              <div className="mt-1 space-y-0.5">
                                {row.items.map((item, i) => (
                                  <div key={i} className="text-xs text-[var(--text-secondary)]">
                                    {item.product.name} ({item.product.sku}) x{item.quantity}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-[var(--text-tertiary)]">No items</div>
                        )}
                        <div className="flex items-center gap-6 text-[13px]">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-teal-500" />
                            <span className="font-semibold">Transferred</span>
                            <span className="text-[var(--text-secondary)]">
                              {new Date(row.transferDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                          {row.receivedDate && (
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="font-semibold">Received</span>
                              <span className="text-[var(--text-secondary)]">
                                {new Date(row.receivedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
