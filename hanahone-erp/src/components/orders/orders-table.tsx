"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { OrderStatusBadge } from "./order-status-badge";

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const formatKRW = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const KRW_PLATFORMS = new Set(["NAVER", "COUPANG", "PHARMACY", "GONGGU"]);
const fmt = (n: number, platform: string | null) =>
  KRW_PLATFORMS.has(platform || "") ? formatKRW(n) : formatUSD(n);

const platformBadge: Record<string, { label: string; color: string }> = {
  SHOPIFY: { label: "Shopify", color: "text-green-600 bg-green-600/[0.08]" },
  AMAZON: { label: "Amazon", color: "text-orange-600 bg-orange-600/[0.08]" },
  TIKTOK: { label: "TikTok", color: "text-pink-600 bg-pink-600/[0.08]" },
  NAVER: { label: "네이버", color: "text-emerald-600 bg-emerald-600/[0.08]" },
  PHARMACY: { label: "약국", color: "text-blue-600 bg-blue-600/[0.08]" },
  CGETC: { label: "CGETC", color: "text-indigo-600 bg-indigo-600/[0.08]" },
  COUPANG: { label: "쿠팡", color: "text-red-600 bg-red-600/[0.08]" },
};

interface OrderItemRow {
  productName: string | null;
  quantity: number;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  externalOrderNumber: string | null;
  customerName: string | null;
  customerId: string | null;
  externalSource: string | null;
  fulfillmentStatus: string;
  financialStatus: string;
  totalAmount: number;
  refundAmount: number | null;
  netAmount: number | null;
  orderDate: string;
  type?: string | null;
  notes: string | null;
  items?: OrderItemRow[];
}

interface RefundData {
  orderDate: string;
  totalAmount: number;
  refundAmount: number;
  refunds: {
    date: string | null;
    note: string | null;
    amount: number;
    items: { title: string; quantity: number; subtotal: number }[];
  }[];
}

export function OrdersTable({ orders, viewMode = "orders", exchangeRate, ratesByDate }: {
  orders: OrderRow[];
  viewMode?: "orders" | "seeding" | "gifted";
  exchangeRate?: number; // fallback if no per-date rate is available
  ratesByDate?: Record<string, number>; // YYYY-MM-DD → rate
}) {
  const fallbackRate = exchangeRate || 0;
  const rateFor = (orderDate: string): number => {
    const key = orderDate.slice(0, 10);
    return ratesByDate?.[key] ?? fallbackRate;
  };
  function fmtDual(amount: number, platform: string | null, orderDate: string) {
    const isKrw = KRW_PLATFORMS.has(platform || "");
    const rate = rateFor(orderDate);
    const primary = isKrw ? formatKRW(amount) : formatUSD(amount);
    const secondary = !rate
      ? null
      : isKrw
        ? formatUSD(amount / rate)
        : formatKRW(amount * rate);
    return { primary, secondary };
  }
  const isSeedingOrGift = viewMode === "seeding" || viewMode === "gifted";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refundData, setRefundData] = useState<Record<string, RefundData>>({});
  const [loading, setLoading] = useState<string | null>(null);

  function handleChannelFilter(channelKey: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("channel") === channelKey) {
      params.delete("channel");
    } else {
      params.set("channel", channelKey);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const handleRowClick = useCallback((orderId: string) => {
    setExpandedId((prev) => (prev === orderId ? null : orderId));
  }, []);

  // Fetch refund data when a row is expanded
  useEffect(() => {
    if (!expandedId || refundData[expandedId]) return;
    let cancelled = false;
    setLoading(expandedId);
    fetch(`/api/orders/${expandedId}/refund-timeline`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data) setRefundData((p) => ({ ...p, [expandedId]: data }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(null); });
    return () => { cancelled = true; };
  }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 z-10 bg-[var(--surface)]">
          <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            <th className="text-left py-3 px-4">Order #</th>
            <th className="text-left py-3 px-4">{isSeedingOrGift ? "Recipient" : "Customer"}</th>
            {isSeedingOrGift ? (
              <>
                <th className="text-left py-3 px-4">Product</th>
                <th className="text-left py-3 px-4">Sets</th>
              </>
            ) : (
              <>
                <th className="text-left py-3 px-4">Channel</th>
                <th className="text-right py-3 px-4">Amount</th>
              </>
            )}
            <th className="text-left py-3 px-4">Status</th>
            <th className="text-left py-3 px-4">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((row) => {
            const isExpanded = expandedId === row.id;
            const hasRefund = row.refundAmount && row.refundAmount > 0;
            const isSeeding = row.type === "SEEDING" || (row.externalSource === "CGETC" && row.notes?.toLowerCase().startsWith("free gifting"));
            const isGift = row.type === "GIFT";

            const rowBg = isExpanded
              ? "bg-accent/[0.04]"
              : isSeeding
                ? "bg-violet-500/[0.03] hover:bg-violet-500/[0.06]"
                : isGift
                  ? "bg-rose-400/[0.03] hover:bg-rose-400/[0.06]"
                  : "hover:bg-[var(--hover-bg-subtle)]";

            return (
              <Fragment key={row.id}>
                <tr
                  onClick={() => handleRowClick(row.id)}
                  className={`border-b border-[var(--border)] cursor-pointer transition-colors ${rowBg}`}
                >
                  <td className="py-3 px-4">
                    <Link
                      href={`/orders/${row.id}`}
                      className="font-semibold text-accent hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.externalOrderNumber || row.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">
                    {row.customerId ? (
                      <Link
                        href={`/customers/${row.customerId}`}
                        className="hover:text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.customerName ?? "—"}
                      </Link>
                    ) : (
                      row.customerName ?? "—"
                    )}
                  </td>
                  {isSeedingOrGift ? (
                    <>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {row.items?.map((i) => i.productName).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const sets = row.items && row.items.length > 0 ? Math.max(...row.items.map((i) => i.quantity)) : 0;
                          const badgeColor = viewMode === "seeding" ? "text-violet-500 bg-violet-500/10" : "text-rose-400 bg-rose-400/10";
                          return <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${badgeColor}`}>{sets} {sets === 1 ? "set" : "sets"}</span>;
                        })()}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-4">
                        {isSeeding ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleChannelFilter("SEEDING"); }}
                            className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full text-violet-600 bg-violet-600/[0.08] hover:ring-1 hover:ring-violet-400 transition-all"
                          >
                            Seeding
                          </button>
                        ) : isGift ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleChannelFilter("GIFT"); }}
                            className="inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full text-rose-400 bg-rose-400/[0.08] hover:ring-1 hover:ring-rose-300 transition-all"
                          >
                            Gifted
                          </button>
                        ) : row.externalSource ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleChannelFilter(row.externalSource!); }}
                            className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${platformBadge[row.externalSource]?.color || "text-[var(--text-tertiary)]"} hover:ring-1 hover:ring-current transition-all`}
                          >
                            {platformBadge[row.externalSource]?.label || row.externalSource}
                          </button>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">Manual</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {hasRefund ? (
                          <div>
                            <span className="font-semibold line-through text-[var(--text-tertiary)]">
                              {fmt(row.totalAmount, row.externalSource)}
                            </span>
                            <div className="text-[11px] text-red-500">
                              Net: {fmt(row.netAmount ?? row.totalAmount, row.externalSource)}
                            </div>
                            {(() => {
                              const d = fmtDual(Number(row.netAmount ?? row.totalAmount), row.externalSource, row.orderDate);
                              return d.secondary ? (
                                <div className="text-[10px] text-[var(--text-tertiary)]">{d.secondary}</div>
                              ) : null;
                            })()}
                          </div>
                        ) : (
                          (() => {
                            const d = fmtDual(Number(row.totalAmount), row.externalSource, row.orderDate);
                            return (
                              <div>
                                <div className="font-semibold">{d.primary}</div>
                                {d.secondary && (
                                  <div className="text-[10px] text-[var(--text-tertiary)]">{d.secondary}</div>
                                )}
                              </div>
                            );
                          })()
                        )}
                      </td>
                    </>
                  )}
                  <td className="py-3 px-4">
                    <OrderStatusBadge
                      fulfillmentStatus={row.fulfillmentStatus}
                      financialStatus={row.financialStatus}
                    />
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">
                    {new Date(row.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="bg-[var(--hover-bg-subtle)] border-b border-[var(--border)]">
                      <ExpandedRow orderId={row.id} data={refundData[row.id]} loading={loading === row.id} row={row} />
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

import { Fragment } from "react";

function ExpandedRow({
  orderId: _orderId,
  data,
  loading,
  row,
}: {
  orderId: string;
  data?: RefundData;
  loading: boolean;
  row: OrderRow;
}) {
  if (loading) {
    return <div className="px-8 py-4 text-xs text-[var(--text-tertiary)]">Loading...</div>;
  }

  const hasRefundDetails = data?.refunds && data.refunds.length > 0;

  return (
    <div className="px-8 py-4 space-y-3">
      {/* Products */}
      {row.items && row.items.length > 0 && (
        <div className="flex items-start gap-3 text-[13px]">
          <div className="w-2 h-2 rounded-full bg-accent mt-1" />
          <div className="flex-1">
            <span className="font-semibold text-[var(--text-secondary)]">Items</span>
            <div className="mt-1 space-y-0.5">
              {row.items.map((item, i) => (
                <div key={i} className="text-xs text-[var(--text-secondary)]">
                  {item.productName || "Unknown product"}{item.quantity > 1 ? ` x${item.quantity}` : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Order timeline */}
      <div className="flex items-center gap-3 text-[13px]">
        <div className="w-2 h-2 rounded-full bg-teal-500" />
        <div className="flex-1 flex justify-between">
          <span className="font-semibold">Order Placed</span>
          <span className="text-[var(--text-secondary)]">
            {new Date(row.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {" — "}
            {fmt(row.totalAmount, row.externalSource)}
          </span>
        </div>
      </div>

      {hasRefundDetails ? (
        data!.refunds.map((refund, i) => (
          <div key={i} className="flex items-start gap-3 text-[13px]">
            <div className="w-2 h-2 rounded-full bg-red-500 mt-1" />
            <div className="flex-1">
              <div className="flex justify-between">
                <span className="font-semibold text-red-600">Refund</span>
                <span className="text-[var(--text-secondary)]">
                  {refund.date ? new Date(refund.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  {" — "}-{fmt(refund.amount, row.externalSource)}
                </span>
              </div>
              {refund.note && (
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{refund.note}</p>
              )}
              {refund.items.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {refund.items.map((item, j) => (
                    <div key={j} className="text-xs text-[var(--text-secondary)]">
                      {item.title} x{item.quantity}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      ) : row.financialStatus === "REFUNDED" || row.financialStatus === "PARTIALLY_REFUNDED" ? (
        <div className="flex items-center gap-3 text-[13px]">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <div className="flex-1 flex justify-between">
            <span className="font-semibold text-red-600">Refunded</span>
            <span className="text-[var(--text-secondary)]">
              -{fmt(row.refundAmount || row.totalAmount, row.externalSource)}
            </span>
          </div>
        </div>
      ) : null}

      {row.fulfillmentStatus === "FULFILLED" || row.fulfillmentStatus === "DELIVERED" ? (
        <div className="flex items-center gap-3 text-[13px]">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-semibold text-blue-600">
            {row.fulfillmentStatus === "DELIVERED" ? "Delivered" : "Fulfilled"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
