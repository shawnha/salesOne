"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 환급 완료 토글 — only renders for orders classified as REVIEW.
 *
 * REVIEW orders are real revenue (channel processed payment, we shipped),
 * but the seller separately refunds the friend out of band (bank transfer
 * etc.). This button records when that out-of-band refund went out so the
 * order can be marked "환급 완료" without touching financialStatus or
 * netAmount — accounting still treats it as live revenue.
 *
 * Click toggles between marking refunded (sets to now()) and clearing
 * (back to pending).
 */
export function ReviewRefundToggle({
  orderId,
  type,
  reviewRefundedAt,
}: {
  orderId: string;
  type: string;
  reviewRefundedAt: string | Date | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (type !== "REVIEW") return null;

  const isRefunded = !!reviewRefundedAt;
  const refundedDate = reviewRefundedAt ? new Date(reviewRefundedAt) : null;

  async function toggle() {
    if (pending) return;
    if (
      isRefunded &&
      !confirm("환급 완료 표시를 취소하시겠습니까? (재 환급 대기로 돌아갑니다)")
    )
      return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewRefunded: !isRefunded }),
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
    <div className="flex items-center gap-2 flex-wrap">
      {isRefunded ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-teal-500/[0.10] text-teal-600">
          ✓ 환급 완료
          {refundedDate && (
            <span className="opacity-70 font-normal">
              · {refundedDate.toLocaleDateString("ko-KR")}
            </span>
          )}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-500/[0.10] text-amber-600">
          환급 대기
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "..." : isRefunded ? "취소" : "환급 완료 표시"}
      </button>
      {error && <span className="text-[11px] text-rose-500">{error}</span>}
    </div>
  );
}
