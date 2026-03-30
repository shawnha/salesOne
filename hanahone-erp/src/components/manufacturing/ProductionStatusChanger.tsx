"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_ACTIONS: Record<string, { label: string; value: string; variant: "primary" | "danger" }[]> = {
  PLANNED: [
    { label: "Start Production", value: "IN_PROGRESS", variant: "primary" },
    { label: "Cancel", value: "CANCELLED", variant: "danger" },
  ],
  IN_PROGRESS: [
    { label: "Complete Production", value: "COMPLETED", variant: "primary" },
    { label: "Cancel", value: "CANCELLED", variant: "danger" },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

interface Props {
  orderId: string;
  status: string;
  quantityToProduce: number;
}

export function ProductionStatusChanger({ orderId, status, quantityToProduce }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions = STATUS_ACTIONS[status] || [];
  if (actions.length === 0) return null;

  async function updateStatus(newStatus: string) {
    if (newStatus === "COMPLETED") {
      if (!confirm(`Complete production of ${quantityToProduce} units?\nThis will consume raw materials and add finished goods to inventory.`)) {
        return;
      }
    }
    setLoading(newStatus);
    setError(null);
    try {
      const res = await fetch("/api/manufacturing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: newStatus }),
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
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {actions.map((action) => (
          <button
            key={action.value}
            onClick={() => updateStatus(action.value)}
            disabled={loading !== null}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 ${
              action.variant === "danger"
                ? "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                : "bg-accent/10 text-accent hover:bg-accent/20"
            }`}
          >
            {loading === action.value ? "..." : action.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-rose-500">{error}</p>}
    </div>
  );
}
