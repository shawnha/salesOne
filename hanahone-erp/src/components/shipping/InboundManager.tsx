"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Recommendation {
  vendorItemId: string;
  externalName: string;
  productId: string | null;
  productSku: string | null;
  productName: string | null;
  currentStock: number;
  sales30d: number;
  dailyBurn: number;
  daysLeft: number | null;
  recommended: number;
  critical: boolean;
}

interface InboundItem {
  id: string;
  productSku: string;
  productName: string;
  vendorItemId: string | null;
  quantity: number;
  receivedQuantity: number | null;
}

interface Inbound {
  id: string;
  status: string;
  coupangInboundNo: string | null;
  notes: string | null;
  requestedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  items: InboundItem[];
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "계획",
  REQUESTED: "신청 완료",
  SHIPPED: "발송 완료",
  RECEIVED: "입고 확인",
  CANCELLED: "취소",
};
const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-[var(--badge-amber-bg)] text-[var(--badge-amber)]",
  REQUESTED: "bg-[var(--badge-blue-bg)] text-[var(--badge-blue)]",
  SHIPPED: "bg-[var(--badge-indigo-bg)] text-[var(--badge-indigo)]",
  RECEIVED: "bg-[var(--badge-teal-bg)] text-[var(--badge-teal)]",
  CANCELLED: "bg-[var(--badge-slate-bg)] text-[var(--badge-slate)]",
};
const NEXT_STATUS: Record<string, { label: string; status: string } | null> = {
  PLANNED: { label: "쿠팡 신청 완료 표시", status: "REQUESTED" },
  REQUESTED: { label: "발송 완료 표시", status: "SHIPPED" },
  SHIPPED: { label: "입고 확인 표시", status: "RECEIVED" },
  RECEIVED: null,
  CANCELLED: null,
};

export function InboundManager({ companyId }: { companyId: string }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Quantity user is planning per recommendation row (key = vendorItemId)
  const [planQty, setPlanQty] = useState<Record<string, number>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipping/inbound?companyId=${companyId}`);
      if (!res.ok) {
        setError("로켓그로스 입고 조회 실패");
        return;
      }
      const data = await res.json();
      setRecommendations(data.recommendations);
      setInbounds(data.inbounds);
      // Pre-fill planQty with recommended values
      const initial: Record<string, number> = {};
      for (const r of data.recommendations) initial[r.vendorItemId] = r.recommended;
      setPlanQty(initial);
    } catch (err: any) {
      setError(err.message || "오류");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleCreateInbound() {
    const items = recommendations
      .filter((r) => r.productId && (planQty[r.vendorItemId] ?? 0) > 0)
      .map((r) => ({
        productId: r.productId!,
        vendorItemId: r.vendorItemId,
        quantity: planQty[r.vendorItemId],
      }));
    if (items.length === 0) {
      setError("입고 수량을 1개 이상 입력하세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/shipping/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, items }),
      });
      if (!res.ok) {
        const body = await res.text();
        setError(`라운드 생성 실패: ${body}`);
        return;
      }
      await fetchAll();
    } catch (err: any) {
      setError(err.message || "오류");
    } finally {
      setCreating(false);
    }
  }

  async function advanceStatus(inboundId: string, nextStatus: string) {
    const inbound = inbounds.find((i) => i.id === inboundId);
    let coupangInboundNo = inbound?.coupangInboundNo;
    if (nextStatus === "REQUESTED" && !coupangInboundNo) {
      coupangInboundNo = prompt("쿠팡 입고번호 (예: CGF20260415-A1)") || null;
      if (!coupangInboundNo) return;
    }
    const res = await fetch(`/api/shipping/inbound/${inboundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, ...(coupangInboundNo ? { coupangInboundNo } : {}) }),
    });
    if (!res.ok) {
      setError("상태 변경 실패");
      return;
    }
    await fetchAll();
  }

  const totalRecommendedQty = Object.values(planQty).reduce((s, n) => s + (n || 0), 0);
  const criticalCount = recommendations.filter((r) => r.critical).length;

  return (
    <div className="space-y-6">
      {/* HERO */}
      <Card
        className={`!p-7 ${criticalCount > 0 ? "!bg-[var(--badge-amber-bg)] !border-[var(--badge-amber)]/30" : ""}`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          쿠팡 풀필먼트 창고 보충 입고
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight mt-1.5">
          {loading ? (
            <span className="text-[var(--text-tertiary)]">불러오는 중...</span>
          ) : criticalCount > 0 ? (
            <>
              <span className="text-[var(--badge-amber)]">{criticalCount}건</span> 입고 권장
            </>
          ) : (
            <>모든 SKU 재고 충분</>
          )}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          쿠팡이 풀필먼트 직접 처리. 셀러센터에서 입고 신청 → 우리 창고에서 쿠팡 창고로 발송 → 입고 확인 후 재고 자동 반영.
        </p>
      </Card>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.20] text-sm text-red-600">{error}</div>
      )}

      {/* Recommendation Table */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">입고 계획 — 권장 수량</h2>
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--surface-2)]">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="text-left px-4 py-2.5">마스터 SKU</th>
                <th className="text-left px-4 py-2.5">vendorItemId</th>
                <th className="text-right px-4 py-2.5">쿠팡 창고</th>
                <th className="text-right px-4 py-2.5">30일 판매</th>
                <th className="text-right px-4 py-2.5">예상 소진</th>
                <th className="text-right px-4 py-2.5">권장</th>
                <th className="text-right px-4 py-2.5">입고 수량</th>
                <th className="text-left px-4 py-2.5">상태</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    {loading ? "불러오는 중..." : "쿠팡 풀필먼트 매핑된 SKU가 없습니다."}
                  </td>
                </tr>
              ) : (
                recommendations.map((r) => (
                  <tr key={r.vendorItemId} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2.5">
                      <div className="font-bold">{r.productSku ?? "?"}</div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">{r.externalName}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-tertiary)]">{r.vendorItemId}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${r.critical ? "text-[var(--badge-amber)] font-bold" : ""}`}>
                      {r.currentStock.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.sales30d}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {r.daysLeft === null ? <span className="text-[var(--text-tertiary)]">—</span> : `${r.daysLeft}일`}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${r.recommended > 0 ? "text-[var(--badge-amber)]" : "text-[var(--text-tertiary)]"}`}>
                      {r.recommended > 0 ? r.recommended : "충분"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        value={planQty[r.vendorItemId] ?? 0}
                        onChange={(e) => setPlanQty({ ...planQty, [r.vendorItemId]: parseInt(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 text-right rounded-md border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-accent font-mono"
                        disabled={!r.productId}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {r.critical ? (
                        <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded bg-[var(--badge-amber-bg)] text-[var(--badge-amber)]">
                          입고 필요
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded bg-[var(--badge-teal-bg)] text-[var(--badge-teal)]">
                          충분
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-[var(--text-secondary)]">
            예상 소진 = 현 재고 ÷ 30일 일평균 판매. 권장 = 60일 안전재고 확보를 위한 추가 입고량.
          </p>
          <Button variant="primary" onClick={handleCreateInbound} disabled={creating || totalRecommendedQty === 0}>
            {creating ? "생성 중..." : `+ 입고 라운드 시작 (${totalRecommendedQty}개)`}
          </Button>
        </div>
      </div>

      {/* Inbound History */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">입고 라운드 이력</h2>
        {inbounds.length === 0 ? (
          <Card className="!p-12 text-center border-dashed">
            <div className="text-2xl mb-2 opacity-50">🏭</div>
            <p className="text-sm font-bold mb-1">입고 이력 없음</p>
            <p className="text-xs text-[var(--text-secondary)]">위 권장 수량 기반으로 첫 입고를 시작하세요.</p>
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            {inbounds.map((b) => {
              const next = NEXT_STATUS[b.status];
              const totalQty = b.items.reduce((s, it) => s + it.quantity, 0);
              return (
                <div key={b.id} className="border-b border-[var(--border)] last:border-b-0 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded ${STATUS_COLORS[b.status] ?? ""}`}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                      <div>
                        <p className="font-semibold text-xs">
                          {new Date(b.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}
                          <span className="text-[var(--text-quaternary)] ml-2 font-mono text-[11px]">{b.id.slice(0, 8)}</span>
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {b.items.length}종 · 총 {totalQty}개
                          {b.coupangInboundNo && (
                            <span className="ml-2 font-mono">· 입고번호 {b.coupangInboundNo}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {next && (
                      <Button variant="primary" size="sm" onClick={() => advanceStatus(b.id, next.status)}>
                        {next.label} →
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-[12px]">
                    {b.items.map((it) => (
                      <div key={it.id} className="px-2 py-1 rounded bg-[var(--surface-2)]">
                        <span className="font-mono font-semibold">{it.productSku}</span>
                        <span className="ml-2">×{it.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
