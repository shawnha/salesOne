"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 환불 번복 — sets financialStatus back to PAID, clears refundAmount,
 * and reverses any inventory restore that was issued when the refund
 * landed. Use when a refund was recorded by accident or the channel
 * later reversed it (rare but happens).
 *
 * Only renders when the order is currently REFUNDED.
 */
export function RefundRevertButton({
  orderId,
  financialStatus,
}: {
  orderId: string;
  financialStatus: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (financialStatus !== "REFUNDED") return null;

  async function revert() {
    if (
      !confirm(
        "환불을 번복하시겠습니까?\n환불 금액이 0으로 초기화되고 결제 상태가 PAID 로 돌아갑니다.\n환불 시 복원된 재고도 다시 차감됩니다.",
      )
    )
      return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialAction: "REVERT_REFUND" }),
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
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={revert}
        disabled={pending}
        className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "처리 중..." : "환불 번복"}
      </button>
      {error && <span className="text-[11px] text-rose-500">{error}</span>}
    </div>
  );
}
