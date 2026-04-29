"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PendingOrderItem {
  productName: string | null;
  productSku: string | null;
  quantity: number;
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  externalOrderNumber: string | null;
  externalSource: string;
  totalAmount: number;
  orderDate: string;
  customerName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  shippingAddress: string | null;
  items: PendingOrderItem[];
}

interface PendingResponse {
  total: number;
  byChannel: { NAVER: PendingOrder[]; COUPANG: PendingOrder[] };
  excludedRocketGrowth: number;
  inFlightCount: number;
}

interface ShippingBatch {
  id: string;
  createdAt: string;
  status: string;
  carrier: string | null;
  totalOrders: number;
  channelDispatch: Record<string, string> | null;
  _count?: { items: number };
}

const CHANNEL_LABELS: Record<string, { label: string; cls: string }> = {
  NAVER: { label: "네이버", cls: "bg-[var(--badge-teal-bg)] text-[#03C75A]" },
  COUPANG: { label: "쿠팡", cls: "bg-[var(--badge-red-bg)] text-[var(--badge-red)]" },
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "작성 중",
  SHIPPED: "송장 완료",
  COMPLETED: "발송 완료",
};

export function UnifiedShippingManager({ companyId }: { companyId: string }) {
  const [pending, setPending] = useState<PendingResponse | null>(null);
  const [batches, setBatches] = useState<ShippingBatch[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<{
    batchId: string;
    naver: { ok: number; failed: Array<{ productOrderId: string; error: string }> };
    coupang: { ok: number; failed: Array<{ shipmentBoxId: string; error: string }> };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipping/pending-orders?companyId=${companyId}`);
      if (!res.ok) {
        setError("미발송 주문 조회 실패");
        return;
      }
      const data: PendingResponse = await res.json();
      setPending(data);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoadingPending(false);
    }
  }, [companyId]);

  const fetchBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch(`/api/shipping/batch?companyId=${companyId}`);
      if (res.ok) setBatches(await res.json());
    } finally {
      setLoadingBatches(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchPending();
    fetchBatches();
  }, [fetchPending, fetchBatches]);

  const allOrders = pending ? [...pending.byChannel.NAVER, ...pending.byChannel.COUPANG] : [];

  function toggleAll() {
    if (selected.size === allOrders.length && allOrders.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allOrders.map((o) => o.id)));
    }
  }
  function toggleChannel(channel: "NAVER" | "COUPANG") {
    if (!pending) return;
    const channelOrders = pending.byChannel[channel];
    const allSelected = channelOrders.every((o) => selected.has(o.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of channelOrders) {
        if (allSelected) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleUploadTracking(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);
      const res = await fetch("/api/shipping/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(`송장 업로드 실패: ${data.error || res.status}`);
        return;
      }
      const errCount = data.errors?.length ?? 0;
      setUploadResult(
        `${data.updatedCount}/${data.totalItems}건 매칭${errCount > 0 ? ` (${errCount}건 미매칭)` : ""}`,
      );
      await fetchBatches();
    } catch (err: any) {
      setError(err.message || "업로드 오류");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDispatch(batchId: string, retryIds?: string[]) {
    const isRetry = !!retryIds && retryIds.length > 0;
    const confirmMsg = isRetry
      ? `실패한 ${retryIds!.length}건만 다시 dispatch 합니다. 진행할까요?`
      : "이 라운드를 dispatch하시겠습니까?\n네이버 + 쿠팡 API에 송장번호를 자동 등록합니다.";
    if (!confirm(confirmMsg)) return;
    setDispatchingId(batchId);
    setError(null);
    try {
      const res = await fetch(`/api/shipping/batch/${batchId}/dispatch`, {
        method: "POST",
        headers: isRetry ? { "Content-Type": "application/json" } : undefined,
        body: isRetry ? JSON.stringify({ productOrderIds: retryIds }) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(`Dispatch 실패: ${data.error || res.status}`);
        return;
      }
      if (isRetry && dispatchResult && dispatchResult.batchId === batchId) {
        // 재시도 결과 머지: 성공한 채널은 failed에서 제거, 새 실패 추가
        setDispatchResult({
          batchId,
          naver: mergeRetry(dispatchResult.naver, data.naver, "productOrderId", retryIds!),
          coupang: mergeRetry(dispatchResult.coupang, data.coupang, "shipmentBoxId", retryIds!),
        });
      } else {
        setDispatchResult({ batchId, naver: data.naver, coupang: data.coupang });
      }
      await Promise.all([fetchPending(), fetchBatches()]);
    } catch (err: any) {
      setError(err.message || "dispatch 오류");
    } finally {
      setDispatchingId(null);
    }
  }

  async function handleStartRound() {
    if (selected.size === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/shipping/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, orderIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const body = await res.text();
        setError(`라운드 생성 실패: ${body}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shipping_round_${new Date().toISOString().slice(0, 10)}_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setSelected(new Set());
      await Promise.all([fetchPending(), fetchBatches()]);
    } catch (err: any) {
      setError(err.message || "오류");
    } finally {
      setDownloading(false);
    }
  }

  const naverOrders = pending?.byChannel.NAVER ?? [];
  const coupangOrders = pending?.byChannel.COUPANG ?? [];
  const totalQuantity = allOrders
    .filter((o) => selected.has(o.id))
    .reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0);
  const selectedRevenue = allOrders.filter((o) => selected.has(o.id)).reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* HERO — 1 hero rule */}
      <Card className="!p-7">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {new Date().toLocaleDateString("ko-KR")} · 발송 라운드
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight mt-1.5">
          {loadingPending ? (
            <span className="text-[var(--text-tertiary)]">불러오는 중...</span>
          ) : pending ? (
            <>
              오늘 발송 <span className="text-accent">{pending.total}건</span>
            </>
          ) : (
            "—"
          )}
        </h1>
        {pending && (
          <p className="text-sm text-[var(--text-secondary)] mt-2 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded ${CHANNEL_LABELS.NAVER.cls}`}>
              네이버 {naverOrders.length}
            </span>
            <span>·</span>
            <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded ${CHANNEL_LABELS.COUPANG.cls}`}>
              쿠팡 {coupangOrders.length}
            </span>
            {pending.excludedRocketGrowth > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-[var(--badge-red-bg)] text-[var(--badge-red)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--badge-red)]" />
                  로켓그로스 {pending.excludedRocketGrowth}건 자동 처리
                </span>
              </>
            )}
            {pending.inFlightCount > 0 && (
              <>
                <span>·</span>
                <span className="text-[var(--text-tertiary)]">진행 중인 라운드 {pending.inFlightCount}건 제외</span>
              </>
            )}
          </p>
        )}
        <div className="flex gap-3 mt-5 flex-wrap">
          <Button
            variant="primary"
            onClick={handleStartRound}
            disabled={selected.size === 0 || downloading}
          >
            {downloading ? "처리 중..." : `새 라운드 시작 (${selected.size})`}
          </Button>
          <Button variant="secondary" onClick={() => fetchPending()}>
            새로고침
          </Button>
        </div>
      </Card>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.20] text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Step Rail */}
      <div className="flex gap-1.5 p-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
        <StepBox num={1} label="주문 선택" desc={`${selected.size}건 선택됨`} state={selected.size > 0 ? "active" : "inactive"} />
        <StepBox num={2} label="3PL 발주서" desc="CJ 양식 Excel" state="inactive" />
        <StepBox num={3} label="송장 회신" desc="CJ 송장 Excel 업로드" state="inactive" />
        <StepBox num={4} label="채널 dispatch" desc="네이버 + 쿠팡" state="inactive" />
      </div>

      {/* STEP 1: ORDERS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">1. 미발송 주문 — 라운드에 추가</h2>
          {allOrders.length > 0 && (
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.size === allOrders.length ? "전체 해제" : "전체 선택"}
            </Button>
          )}
        </div>

        {loadingPending ? (
          <Card>
            <p className="text-sm text-[var(--text-secondary)]">불러오는 중...</p>
          </Card>
        ) : allOrders.length === 0 ? (
          <Card className="!p-12 text-center border-dashed">
            <div className="text-2xl mb-2 opacity-50">✓</div>
            <p className="text-sm font-bold mb-1">오늘 발송할 주문 없음</p>
            <p className="text-xs text-[var(--text-secondary)] mb-4">모든 주문이 dispatch 완료됨. 잘 했어요.</p>
            <Button variant="secondary" size="sm" onClick={() => fetchBatches()}>
              지난 라운드 보기
            </Button>
          </Card>
        ) : (
          <>
            {naverOrders.length > 0 && (
              <ChannelSection
                channel="NAVER"
                orders={naverOrders}
                selected={selected}
                onToggle={toggle}
                onToggleAll={() => toggleChannel("NAVER")}
              />
            )}
            {coupangOrders.length > 0 && (
              <ChannelSection
                channel="COUPANG"
                orders={coupangOrders}
                selected={selected}
                onToggle={toggle}
                onToggleAll={() => toggleChannel("COUPANG")}
              />
            )}
          </>
        )}
      </div>

      {/* STEP 2 — collapsed when no selection */}
      {selected.size > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-bold mb-1">2. 3PL 발주서 다운로드</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                선택한 {selected.size}건 (총 {totalQuantity}개 · ₩{Math.round(selectedRevenue).toLocaleString()}) 이 단일 Excel로 합쳐져 다운로드됩니다.
              </p>
            </div>
            <Button variant="primary" onClick={handleStartRound} disabled={downloading}>
              {downloading ? "처리 중..." : `📥 발주서 다운로드 (${selected.size})`}
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3 — 송장 회신 업로드 (PENDING 라운드 있을 때만) */}
      {batches.some((b) => b.status === "PENDING") && (
        <Card>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-bold mb-1">3. 송장 회신 업로드</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                CJ가 송장번호 채워서 회신한 Excel을 그대로 업로드. 라운드 ID로 자동 매칭.
              </p>
              {uploadResult && (
                <p className="text-xs text-teal-600 mt-2">✓ {uploadResult}</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleUploadTracking}
            />
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "업로드 중..." : "📤 송장 파일 선택"}
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 4 — Dispatch 결과 (실행 후 표시) */}
      {dispatchResult && (
        <Card>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-sm font-bold">4. Dispatch 결과 — 라운드 {dispatchResult.batchId.slice(0, 8)}</h3>
            {(dispatchResult.naver.failed.length + dispatchResult.coupang.failed.length) > 0 && (
              <Button
                variant="primary"
                size="sm"
                disabled={dispatchingId === dispatchResult.batchId}
                onClick={() =>
                  handleDispatch(dispatchResult.batchId, [
                    ...dispatchResult.naver.failed.map((f) => f.productOrderId),
                    ...dispatchResult.coupang.failed.map((f) => f.shipmentBoxId),
                  ])
                }
              >
                {dispatchingId === dispatchResult.batchId
                  ? "재시도 중..."
                  : `실패 ${dispatchResult.naver.failed.length + dispatchResult.coupang.failed.length}건만 재시도`}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ChannelResult
              label="네이버"
              ok={dispatchResult.naver.ok}
              failed={dispatchResult.naver.failed.map((f) => ({ id: f.productOrderId, error: f.error }))}
              onRetryOne={(id) => handleDispatch(dispatchResult.batchId, [id])}
              retryDisabled={dispatchingId === dispatchResult.batchId}
            />
            <ChannelResult
              label="쿠팡"
              ok={dispatchResult.coupang.ok}
              failed={dispatchResult.coupang.failed.map((f) => ({ id: f.shipmentBoxId, error: f.error }))}
              onRetryOne={(id) => handleDispatch(dispatchResult.batchId, [id])}
              retryDisabled={dispatchingId === dispatchResult.batchId}
            />
          </div>
        </Card>
      )}

      {/* ROUND HISTORY */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">라운드 이력</h2>
        {loadingBatches ? (
          <Card><p className="text-sm text-[var(--text-secondary)]">불러오는 중...</p></Card>
        ) : batches.length === 0 ? (
          <Card className="!p-12 text-center border-dashed">
            <div className="text-2xl mb-2 opacity-50">📋</div>
            <p className="text-sm font-bold mb-1">라운드 이력 없음</p>
            <p className="text-xs text-[var(--text-secondary)]">첫 라운드를 시작해보세요.</p>
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between gap-3 p-3.5 px-4 border-b border-[var(--border)] last:border-b-0 text-[13px]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Badge status={batch.status} />
                  <div className="min-w-0">
                    <p className="font-semibold text-xs">
                      {new Date(batch.createdAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                      <span className="text-[var(--text-quaternary)] ml-2 font-mono text-[11px]">{batch.id.slice(0, 8)}</span>
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {STATUS_LABELS[batch.status] ?? batch.status}
                      {" · "}
                      {batch._count?.items ?? batch.totalOrders}건
                      {batch.carrier && ` · ${batch.carrier}`}
                    </p>
                    {batch.channelDispatch && (
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 font-mono">
                        {Object.entries(batch.channelDispatch)
                          .map(([ch, st]) => `${ch}=${st}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                {batch.status === "SHIPPED" && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleDispatch(batch.id)}
                    disabled={dispatchingId === batch.id}
                  >
                    {dispatchingId === batch.id ? "..." : "Dispatch 실행"}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper components                                                  */
/* ------------------------------------------------------------------ */

function StepBox({
  num,
  label,
  desc,
  state,
}: {
  num: number;
  label: string;
  desc: string;
  state: "active" | "done" | "inactive";
}) {
  const bg = state === "active" ? "bg-[var(--accent-dim)]" : state === "done" ? "bg-[var(--badge-teal-bg)]" : "";
  return (
    <div className={`flex-1 p-3.5 px-4 rounded-xl ${bg}`}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
            state === "active"
              ? "bg-accent text-white"
              : state === "done"
              ? "bg-[var(--badge-teal)] text-white"
              : "bg-[var(--border-strong)] text-white"
          }`}
        >
          {state === "done" ? "✓" : num}
        </span>
        <span className={`text-xs font-semibold ${state === "active" ? "text-accent" : ""}`}>{label}</span>
      </div>
      <p className="text-[11px] text-[var(--text-tertiary)] mt-1 ml-6">{desc}</p>
    </div>
  );
}

function ChannelResult({
  label,
  ok,
  failed,
  onRetryOne,
  retryDisabled,
}: {
  label: string;
  ok: number;
  failed: Array<{ id: string; error: string }>;
  onRetryOne: (id: string) => void;
  retryDisabled: boolean;
}) {
  const tone =
    failed.length === 0
      ? "bg-[var(--badge-teal-bg)] border-[var(--badge-teal)]/20"
      : ok === 0
        ? "bg-[var(--badge-red-bg)] border-[var(--badge-red)]/20"
        : "bg-[var(--badge-amber-bg)] border-[var(--badge-amber)]/20";
  return (
    <div className={`p-3 rounded-lg border ${tone}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-base font-bold">
        {ok}건 성공
        {failed.length > 0 && <span className="ml-2 text-rose-600">{failed.length}건 실패</span>}
      </div>
      {failed.length > 0 && (
        <details className="mt-2" open>
          <summary className="text-[11px] cursor-pointer">실패 상세 ({failed.length})</summary>
          <ul className="text-[11px] mt-1.5 space-y-1">
            {failed.map((f, i) => (
              <li key={i} className="flex items-start justify-between gap-2 font-mono">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{f.id}</span>
                  <span className="text-[var(--text-tertiary)]">: {f.error}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--hover-bg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={retryDisabled}
                  onClick={() => onRetryOne(f.id)}
                >
                  재시도
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type DispatchSummary<TKey extends string> = {
  ok: number;
  failed: Array<Record<TKey, string> & { error: string }>;
};

function mergeRetry<TKey extends "productOrderId" | "shipmentBoxId">(
  prev: DispatchSummary<TKey>,
  next: DispatchSummary<TKey>,
  key: TKey,
  retryIds: string[],
): DispatchSummary<TKey> {
  const retried = new Set(retryIds);
  // keep prior failures that weren't retried (out of scope for this retry)
  const keptFailures = prev.failed.filter((f) => !retried.has(f[key] as string));
  // any retried IDs not in next.failed are now successful → carry their success forward
  const stillFailing = new Set(next.failed.map((f) => f[key] as string));
  const newlySucceeded = retryIds.filter((id) => !stillFailing.has(id)).length;
  return {
    ok: prev.ok + newlySucceeded,
    failed: [...keptFailures, ...next.failed],
  };
}

function ChannelSection({
  channel,
  orders,
  selected,
  onToggle,
  onToggleAll,
}: {
  channel: "NAVER" | "COUPANG";
  orders: PendingOrder[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const meta = CHANNEL_LABELS[channel];
  const allSelected = orders.every((o) => selected.has(o.id));
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded ${meta.cls}`}>● {meta.label}</span>
          <span className="text-sm font-bold">{meta.label === "쿠팡" ? "마켓플레이스" : "스마트스토어"} ({orders.length})</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggleAll}>
          {allSelected ? "해제" : "전체 선택"}
        </Button>
      </div>
      {orders.map((order) => {
        const isSelected = selected.has(order.id);
        return (
          <label
            key={order.id}
            className={`grid grid-cols-[28px_1fr_100px_70px] gap-3 px-4 py-2.5 border-b border-[var(--border)] last:border-b-0 cursor-pointer items-center text-[13px] ${
              isSelected ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--hover-bg-subtle)]"
            }`}
          >
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-accent cursor-pointer"
              checked={isSelected}
              onChange={() => onToggle(order.id)}
            />
            <div className="min-w-0">
              <div className="font-semibold font-mono text-[12px]">
                {order.externalOrderNumber || order.orderNumber}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">
                {[
                  order.recipientName ?? order.customerName,
                  order.recipientPhone,
                  order.items.map((it) => `${it.productName ?? "?"} ×${it.quantity}`).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="text-right font-mono text-[12px]">₩{Math.round(order.totalAmount).toLocaleString()}</div>
            <div className="text-right text-[11px] text-[var(--text-tertiary)]">
              {order.items.reduce((s, it) => s + it.quantity, 0)}개
            </div>
          </label>
        );
      })}
    </Card>
  );
}
