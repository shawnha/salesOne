"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FULFILLMENT_TRANSITIONS: Record<string, { label: string; value: string }[]> = {
  UNFULFILLED: [
    { label: "Mark Partially Shipped", value: "PARTIALLY_FULFILLED" },
    { label: "Mark Shipped", value: "FULFILLED" },
    { label: "Cancel", value: "CANCELLED" },
  ],
  PARTIALLY_FULFILLED: [
    { label: "Mark Shipped", value: "FULFILLED" },
    { label: "Cancel", value: "CANCELLED" },
  ],
  FULFILLED: [
    { label: "Mark Delivered", value: "DELIVERED" },
    { label: "Cancel", value: "CANCELLED" },
  ],
  DELIVERED: [],
  CANCELLED: [],
};

const FINANCIAL_TRANSITIONS: Record<string, { label: string; value: string }[]> = {
  PENDING: [
    { label: "Mark Paid", value: "PAID" },
    { label: "Void", value: "VOIDED" },
  ],
  PAID: [
    { label: "Partial Refund", value: "PARTIALLY_REFUNDED" },
    { label: "Full Refund", value: "REFUNDED" },
  ],
  PARTIALLY_PAID: [
    { label: "Mark Paid", value: "PAID" },
    { label: "Refund", value: "REFUNDED" },
    { label: "Void", value: "VOIDED" },
  ],
  PARTIALLY_REFUNDED: [
    { label: "Full Refund", value: "REFUNDED" },
  ],
  REFUNDED: [],
  VOIDED: [],
};

interface Props {
  orderId: string;
  fulfillmentStatus: string;
  financialStatus: string;
}

export function OrderStatusChanger({ orderId, fulfillmentStatus, financialStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fulfillmentActions = FULFILLMENT_TRANSITIONS[fulfillmentStatus] || [];
  const financialActions = FINANCIAL_TRANSITIONS[financialStatus] || [];

  if (fulfillmentActions.length === 0 && financialActions.length === 0) return null;

  async function updateStatus(field: "fulfillmentStatus" | "financialStatus", value: string) {
    setLoading(value);
    setError(null);
    try {
      const res = await fetch(`/api/orders?id=${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {fulfillmentActions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">Fulfillment</p>
          <div className="flex flex-wrap gap-2">
            {fulfillmentActions.map((action) => (
              <button
                key={action.value}
                onClick={() => updateStatus("fulfillmentStatus", action.value)}
                disabled={loading !== null}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 ${
                  action.value === "CANCELLED"
                    ? "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                {loading === action.value ? "..." : action.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {financialActions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">Financial</p>
          <div className="flex flex-wrap gap-2">
            {financialActions.map((action) => (
              <button
                key={action.value}
                onClick={() => updateStatus("financialStatus", action.value)}
                disabled={loading !== null}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 ${
                  action.value === "REFUNDED" || action.value === "VOIDED"
                    ? "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                    : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                }`}
              >
                {loading === action.value ? "..." : action.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p className="text-[11px] text-rose-500">{error}</p>
      )}
    </div>
  );
}
