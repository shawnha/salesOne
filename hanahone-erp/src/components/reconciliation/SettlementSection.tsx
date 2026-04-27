"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";

interface SettlementRow {
  /** YYYY-MM */
  period: string;
  periodStart: string; // ISO
  periodEnd: string;   // ISO (exclusive)
  expectedAmount: number;
  actualAmount: number | null;
  notes: string | null;
  orderCount: number;
}

const formatKRW = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

export function SettlementSection({
  companyId,
  platform,
  rows,
}: {
  companyId: string;
  platform: string;
  rows: SettlementRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ actual: string; notes: string }>({
    actual: "",
    notes: "",
  });

  const save = (row: SettlementRow) => {
    const actual = draft.actual.trim() === "" ? null : Number(draft.actual.replace(/[^\d.-]/g, ""));
    if (actual !== null && Number.isNaN(actual)) {
      alert("실제 입금액은 숫자여야 합니다");
      return;
    }
    start(async () => {
      const res = await fetch("/api/reconciliation/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          platform,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          expectedAmount: row.expectedAmount,
          actualAmount: actual,
          notes: draft.notes || null,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        alert(`저장 실패: ${body}`);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          {platform === "NAVER" ? "네이버 정산 대사" : `${platform} 정산 대사`}
          <span className="ml-2 text-[var(--text-quaternary)] normal-case">
            ({rows.length}개월)
          </span>
        </h2>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--bg)]">
            <tr className="text-left text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              <th className="px-4 py-2.5">월</th>
              <th className="px-4 py-2.5 text-right">주문 수</th>
              <th className="px-4 py-2.5 text-right">예상 정산</th>
              <th className="px-4 py-2.5 text-right">실제 입금</th>
              <th className="px-4 py-2.5 text-right">차이</th>
              <th className="px-4 py-2.5">비고</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editing === row.period;
              const variance =
                row.actualAmount !== null ? row.actualAmount - row.expectedAmount : null;
              const varianceColor =
                variance === null
                  ? "text-[var(--text-quaternary)]"
                  : Math.abs(variance) < 1
                    ? "text-teal-600"
                    : variance < 0
                      ? "text-rose-600"
                      : "text-amber-600";
              return (
                <tr key={row.period} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 font-semibold">{row.period}</td>
                  <td className="px-4 py-2.5 text-right">{row.orderCount}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    {formatKRW(row.expectedAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        defaultValue={row.actualAmount ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, actual: e.target.value }))}
                        placeholder="₩"
                        className="w-32 px-2 py-1 text-right rounded border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-teal-500"
                      />
                    ) : row.actualAmount !== null ? (
                      <span className="font-semibold">{formatKRW(row.actualAmount)}</span>
                    ) : (
                      <span className="text-[var(--text-quaternary)]">미입력</span>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${varianceColor}`}>
                    {variance === null
                      ? "—"
                      : `${variance >= 0 ? "+" : ""}${formatKRW(variance)}`}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                    {isEditing ? (
                      <input
                        type="text"
                        defaultValue={row.notes ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                        placeholder="메모"
                        className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-teal-500"
                      />
                    ) : (
                      <span className="text-xs">{row.notes || ""}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <button
                          disabled={pending}
                          onClick={() => save(row)}
                          className="text-[11px] font-medium px-2 py-1 rounded bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => setEditing(null)}
                          className="text-[11px] px-2 py-1 rounded text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setDraft({
                            actual: row.actualAmount?.toString() ?? "",
                            notes: row.notes ?? "",
                          });
                          setEditing(row.period);
                        }}
                        className="text-[11px] text-[var(--text-tertiary)] hover:text-teal-600"
                      >
                        편집
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                  정산 대상 주문이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
