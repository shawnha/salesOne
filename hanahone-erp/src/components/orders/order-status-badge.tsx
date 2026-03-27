"use client";

interface OrderStatusBadgeProps {
  fulfillmentStatus: string;
  financialStatus: string;
}

function getUnifiedStatus(fulfillment: string, financial: string) {
  // Financial takes priority for negative states
  if (financial === "REFUNDED") return { label: "Refunded", style: "text-red-600 bg-red-600/[0.08]" };
  if (financial === "VOIDED") return { label: "Voided", style: "text-red-600 bg-red-600/[0.08]" };
  if (financial === "PARTIALLY_REFUNDED") return { label: "Partial Refund", style: "text-orange-600 bg-orange-600/[0.08]" };

  // Fulfillment for positive states
  if (fulfillment === "DELIVERED") return { label: "Delivered", style: "text-teal-600 bg-teal-600/[0.08]" };
  if (fulfillment === "FULFILLED") return { label: "Shipped", style: "text-blue-600 bg-blue-600/[0.08]" };
  if (fulfillment === "PARTIALLY_FULFILLED") return { label: "Partial Ship", style: "text-blue-500 bg-blue-500/[0.08]" };
  if (fulfillment === "CANCELLED") return { label: "Cancelled", style: "text-slate-500 bg-slate-500/[0.08]" };

  // Financial for pending states
  if (financial === "PAID") return { label: "Paid", style: "text-emerald-600 bg-emerald-600/[0.08]" };
  if (financial === "PARTIALLY_PAID") return { label: "Partial Pay", style: "text-yellow-600 bg-yellow-600/[0.08]" };

  return { label: "Pending", style: "text-slate-500 bg-slate-500/[0.08]" };
}

export function OrderStatusBadge({ fulfillmentStatus, financialStatus }: OrderStatusBadgeProps) {
  const status = getUnifiedStatus(fulfillmentStatus, financialStatus);

  return (
    <span className={`inline-flex px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${status.style}`}>
      {status.label}
    </span>
  );
}
