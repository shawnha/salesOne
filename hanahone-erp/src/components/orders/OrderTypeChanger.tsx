"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TOGGLE_LABEL: Record<string, string> = {
  REVIEW: "지인 리뷰",
  SEEDING: "Seeding",
  GIFT: "Gifted",
  SALE: "정상 주문",
};

const TOGGLE_TONE: Record<string, string> = {
  REVIEW: "bg-cyan-600 text-white",
  SEEDING: "bg-violet-500 text-white",
  GIFT: "bg-rose-400 text-white",
  SALE: "bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]",
};

/**
 * Compact action that lets the operator reclassify an order between
 * SALE / SEEDING / GIFT / REVIEW. The current type is the active pill;
 * clicking another pill posts to PATCH /api/orders/{id}. INTER_COMPANY,
 * PURCHASE, and BROKERAGE aren't shown — those are set by sync logic
 * and shouldn't be hand-toggled.
 */
export function OrderTypeChanger({
  orderId,
  currentType,
}: {
  orderId: string;
  currentType: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If the order was set to a sync-managed type (PURCHASE / BROKERAGE /
  // INTER_COMPANY), don't render the toggle at all.
  const sysManaged = ["PURCHASE", "BROKERAGE", "INTER_COMPANY"].includes(currentType);
  if (sysManaged) return null;

  const options = ["SALE", "SEEDING", "GIFT", "REVIEW"];

  async function setType(next: string) {
    if (next === currentType || pending) return;
    setPending(next);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `${res.status} 오류`);
        return;
      }
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "오류");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map((opt) => {
        const isActive = opt === currentType;
        const isPending = pending === opt;
        return (
          <button
            key={opt}
            type="button"
            disabled={!!pending}
            onClick={() => setType(opt)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition ${
              isActive
                ? TOGGLE_TONE[opt] ?? "bg-accent text-white"
                : "bg-[var(--bg)] border border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]"
            } ${isPending ? "opacity-60" : ""} disabled:cursor-not-allowed`}
            title={isActive ? "현재 상태" : `${TOGGLE_LABEL[opt]} 으로 변경`}
          >
            {isPending ? "..." : TOGGLE_LABEL[opt] ?? opt}
          </button>
        );
      })}
      {error && <span className="text-[11px] text-rose-500 ml-2">{error}</span>}
    </div>
  );
}
