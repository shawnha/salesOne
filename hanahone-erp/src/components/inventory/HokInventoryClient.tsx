"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type BaselineItem = { sku: string; productName: string; quantity: number };

export type GongguInventoryRow = {
  id: string;           // Inventory record id
  productId: string;    // Product record id (for BOM editing)
  sku: string;
  name: string;
  quantity: number;      // on-hand
  reserved: number;
  available: number;
  naverProductNo?: string;
};

export type BomEntry = {
  finishedSku: string;   // gonggu product SKU
  rawSku: string;        // component SKU (ODD-M01-5 or ODD-M01-30)
  quantityRequired: number;
};

export type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  warehouse: string;
  company: string;
  quantity: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  source: "internal" | "cgetc";
  burnRate: number | null;
  daysLeft: number | null;
  naverProductNo?: string;
};

/* ------------------------------------------------------------------ */
/*  Deduction calculator                                               */
/* ------------------------------------------------------------------ */

function calculateDeductions(
  gongguRows: GongguInventoryRow[],
  bomEntries: BomEntry[],
): Map<string, number> {
  // rawSku → total units consumed by all gonggu products
  const deductions = new Map<string, number>();
  for (const g of gongguRows) {
    const boms = bomEntries.filter((b) => b.finishedSku === g.sku);
    for (const b of boms) {
      const current = deductions.get(b.rawSku) || 0;
      deductions.set(b.rawSku, current + g.quantity * b.quantityRequired);
    }
  }
  return deductions;
}

/* ------------------------------------------------------------------ */
/*  Inline editable cell                                               */
/* ------------------------------------------------------------------ */

function EditableQuantity({
  value,
  onSave,
}: {
  value: number;
  onSave: (newValue: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = useCallback(async () => {
    const num = parseInt(draft, 10);
    if (isNaN(num) || num < 0) {
      setDraft(String(value));
      setEditing(false);
      return;
    }
    if (num === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(num);
      setEditing(false);
    } catch {
      setDraft(String(value));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        disabled={saving}
        className="w-20 px-2 py-0.5 text-[13px] font-semibold text-right rounded border border-[var(--border-strong)] bg-[var(--surface)] outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="font-semibold cursor-pointer hover:bg-blue-500/10 px-2 py-0.5 -mx-2 rounded transition-colors"
      title="클릭하여 수정"
    >
      {saving ? "..." : value.toLocaleString()}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function HokInventoryClient({
  baselines,
  gongguRows: initialGongguRows,
  regularRows,
  bomEntries,
  companyId,
  channelSalesBySku = {},
  variantSalesBySku = {},
}: {
  baselines: BaselineItem[];
  gongguRows: GongguInventoryRow[];
  regularRows: InventoryRow[];
  bomEntries: BomEntry[];
  companyId: string;
  channelSalesBySku?: Record<string, Partial<Record<string, number>>>;
  variantSalesBySku?: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const [gongguRows, setGongguRows] = useState(initialGongguRows);
  const [regRows, setRegRows] = useState(regularRows);
  const [baselineData, setBaselineData] = useState(baselines);

  // Calculate deductions
  const deductions = calculateDeductions(gongguRows, bomEntries);

  // Build available inventory: baseline - deductions
  const availableItems = baselineData.map((b) => ({
    ...b,
    allocated: deductions.get(b.sku) || 0,
    available: b.quantity - (deductions.get(b.sku) || 0),
  }));

  // Override smartstore On Hand with baseline-derived available
  const availableBySku = new Map(availableItems.map((a) => [a.sku, a.available]));
  const adjustedRegRows = regRows.map((r) => {
    const baselineAvail = availableBySku.get(r.sku);
    if (baselineAvail !== undefined) {
      return { ...r, quantity: baselineAvail, available: baselineAvail - r.reserved };
    }
    return r;
  });

  const [error, setError] = useState<string | null>(null);

  const handleSave = async (inventoryId: string, newQuantity: number) => {
    setError(null);
    const res = await fetch("/api/inventory/gonggu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryId, quantity: newQuantity }),
    });
    if (!res.ok) {
      const body = await res.text();
      const msg = `API error ${res.status}: ${body}`;
      setError(msg);
      throw new Error(msg);
    }

    // Optimistic update
    setGongguRows((prev) =>
      prev.map((r) => (r.id === inventoryId ? { ...r, quantity: newQuantity } : r))
    );
    router.refresh();
  };

  const handleSaveRegular = async (sku: string, newSmartOnHand: number) => {
    // 스마트스토어 On Hand 변경 → baseline = newSmartOnHand + 공구 할당
    const allocated = deductions.get(sku) || 0;
    const newBaseline = newSmartOnHand + allocated;
    await handleSaveBaseline(sku, newBaseline);
  };

  const handleSaveBaseline = async (sku: string, newQuantity: number) => {
    setError(null);
    const res = await fetch("/api/inventory/baseline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, sku, quantity: newQuantity }),
    });
    if (!res.ok) {
      const body = await res.text();
      setError(`API error ${res.status}: ${body}`);
      throw new Error(body);
    }
    setBaselineData((prev) =>
      prev.map((b) => (b.sku === sku ? { ...b, quantity: newQuantity } : b))
    );
    router.refresh();
  };

  // Naver sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleNaverSync = async () => {
    const syncItems = adjustedRegRows
      .filter((r) => r.naverProductNo)
      .map((r) => ({ naverProductNo: r.naverProductNo!, quantity: r.quantity }));
    if (syncItems.length === 0) {
      setSyncResult("동기화할 상품이 없습니다 (네이버 상품번호 매핑 필요)");
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/inventory/naver-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, items: syncItems }),
      });
      const data = await res.json();
      if (!res.ok && !data.results) {
        setSyncResult(`오류: ${data.error || res.status}`);
        return;
      }
      const succeeded = data.results.filter((r: any) => r.success).length;
      const failed = data.results.filter((r: any) => !r.success);
      if (failed.length === 0) {
        setSyncResult(`${succeeded}개 상품 동기화 완료`);
      } else {
        setSyncResult(`${succeeded}개 성공, ${failed.length}개 실패: ${failed.map((f: any) => f.error).join(", ")}`);
      }
    } catch (err: any) {
      setSyncResult(`오류: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // BOM edit modal state
  const [bomEditTarget, setBomEditTarget] = useState<GongguInventoryRow | null>(null);
  const [bomStarterInput, setBomStarterInput] = useState(0);
  const [bomRefillInput, setBomRefillInput] = useState(0);
  const [bomSaving, setBomSaving] = useState(false);

  // Add gonggu modal state
  const [showAddGonggu, setShowAddGonggu] = useState(false);
  const [addStarter, setAddStarter] = useState(0);
  const [addRefill, setAddRefill] = useState(0);
  const [addNaver, setAddNaver] = useState("");
  const [addOnHand, setAddOnHand] = useState(0);
  const [addSaving, setAddSaving] = useState(false);

  // Auto-generate name and SKU from BOM
  const addTotal = addStarter * 5 + addRefill * 30;
  const autoName = addTotal > 0 ? `ODD M-01 ${addTotal}개입 (공구)` : "";
  const autoSku = addTotal > 0 ? `ODD-M01-${addTotal}G` : "";

  const openBomEdit = (row: GongguInventoryRow) => {
    const boms = bomEntries.filter((b) => b.finishedSku === row.sku);
    const starterBom = boms.find((b) => b.rawSku === "ODD-M01-5");
    const refillBom = boms.find((b) => b.rawSku === "ODD-M01-30");
    setBomStarterInput(starterBom?.quantityRequired || 0);
    setBomRefillInput(refillBom?.quantityRequired || 0);
    setBomEditTarget(row);
  };

  const saveBom = async () => {
    if (!bomEditTarget) return;
    setBomSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/bom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          productId: bomEditTarget.productId,
          starterQty: bomStarterInput,
          refillQty: bomRefillInput,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        setError(`BOM 저장 실패: ${body}`);
        return;
      }
      setBomEditTarget(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBomSaving(false);
    }
  };

  const saveAddGonggu = async () => {
    setAddSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/gonggu-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: autoName,
          sku: autoSku,
          starterQty: addStarter,
          refillQty: addRefill,
          naverProductNo: addNaver || undefined,
          initialOnHand: addOnHand,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        setError(`공구 추가 실패: ${body}`);
        return;
      }
      setShowAddGonggu(false);
      setAddStarter(0); setAddRefill(0); setAddNaver(""); setAddOnHand(0);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddSaving(false);
    }
  };

  // Gonggu table columns
  const gongguColumns = [
    {
      key: "name",
      header: "상품",
      render: (row: GongguInventoryRow) => (
        <div>
          <span className="font-semibold">{row.name}</span>
          {row.naverProductNo && (
            <div className="mt-1">
              <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#03C75A]/10 text-[#03C75A]">
                N {row.naverProductNo}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "quantity",
      header: "On Hand",
      align: "right" as const,
      render: (row: GongguInventoryRow) => (
        <EditableQuantity
          value={row.quantity}
          onSave={(val) => handleSave(row.id, val)}
        />
      ),
    },
    {
      key: "reserved",
      header: "Reserved",
      align: "right" as const,
      render: (row: GongguInventoryRow) => (
        <span className={row.reserved > 0 ? "font-semibold text-orange-600" : "text-[var(--text-tertiary)]"}>
          {row.reserved}
        </span>
      ),
    },
    {
      key: "available",
      header: "Available",
      align: "right" as const,
      render: (row: GongguInventoryRow) => (
        <span className="font-semibold text-teal-600">{row.available.toLocaleString()}</span>
      ),
    },
    {
      key: "components",
      header: "구성품",
      render: (row: GongguInventoryRow) => {
        const boms = bomEntries.filter((b) => b.finishedSku === row.sku);
        if (boms.length === 0) return <span className="text-[var(--text-quaternary)]">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {boms.map((b) => {
              const label = b.rawSku === "ODD-M01-5" ? "스타터키트" : "리필팩";
              const color = b.rawSku === "ODD-M01-5"
                ? "bg-teal-500/10 text-teal-500"
                : "bg-indigo-500/10 text-indigo-400";
              return (
                <button
                  key={b.rawSku}
                  onClick={() => openBomEdit(row)}
                  className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full ${color} hover:brightness-125 transition cursor-pointer`}
                >
                  {label} x{b.quantityRequired}
                </button>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "edit",
      header: "",
      render: (row: GongguInventoryRow) => (
        <button
          onClick={() => openBomEdit(row)}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition text-sm px-1"
          title="구성 편집"
        >
          &#9998;
        </button>
      ),
    },
  ];

  // Regular (smartstore) table columns
  const regularColumns = [
    {
      key: "name",
      header: "Product",
      render: (row: InventoryRow) => (
        <span className={`font-semibold ${row.source === "internal" && row.quantity <= row.reorderLevel ? "text-rose-500" : ""}`}>
          {row.name}
        </span>
      ),
    },
    {
      key: "warehouse",
      header: "Warehouse",
      render: (row: InventoryRow) => (
        <span className="text-[var(--text-secondary)]">{row.warehouse}</span>
      ),
    },
    {
      key: "quantity",
      header: "On Hand",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <EditableQuantity
          value={row.quantity}
          onSave={(val) => handleSaveRegular(row.sku, val)}
        />
      ),
    },
    {
      key: "reserved",
      header: "Reserved",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className={row.reserved > 0 ? "font-semibold text-orange-600" : "text-[var(--text-tertiary)]"}>
          {row.reserved}
        </span>
      ),
    },
    {
      key: "available",
      header: "Available",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className="font-semibold text-teal-600">{row.available.toLocaleString()}</span>
      ),
    },
    {
      key: "daysLeft",
      header: "Days Left",
      align: "right" as const,
      render: (row: InventoryRow) => {
        if (row.daysLeft === null) return <span className="text-[var(--text-quaternary)]">—</span>;
        const color = row.daysLeft <= 7 ? "text-rose-500" : row.daysLeft <= 30 ? "text-amber-500" : "text-teal-600";
        return (
          <div className="text-right">
            <span className={`font-semibold ${color}`}>{row.daysLeft}d</span>
            {row.burnRate !== null && (
              <div className="text-[10px] text-[var(--text-tertiary)]">{row.burnRate.toFixed(1)}/day</div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      {error && (
        <div className="px-3 py-2 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-600">
          {error}
        </div>
      )}
      {/* 전체 재고 카드 */}
      {baselineData.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-4">전체 재고</h2>
          <div className="grid grid-cols-2 gap-6">
            {availableItems.map((item) => {
              const channels = channelSalesBySku[item.sku] || {};
              const channelEntries = Object.entries(channels)
                .filter(([, v]) => (v ?? 0) > 0)
                .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
              return (
                <div key={item.sku} className="text-center">
                  <div className="text-2xl font-bold flex justify-center">
                    <EditableQuantity
                      value={item.quantity}
                      onSave={(val) => handleSaveBaseline(item.sku, val)}
                    />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{item.productName}</p>
                  {item.allocated > 0 && (
                    <div className="mt-2 space-y-0.5">
                      <p className="text-[11px] text-amber-600 font-medium">
                        공구 할당: {item.allocated.toLocaleString()}
                      </p>
                      <div className={`text-lg font-bold flex justify-center ${item.available < 0 ? "text-rose-500" : "text-teal-600"}`}>
                        <EditableQuantity
                          value={item.available}
                          onSave={(val) => handleSaveRegular(item.sku, val)}
                        />
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)]">스마트스토어 가용</p>
                    </div>
                  )}
                  {channelEntries.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)]">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1.5">
                        채널별 판매 (30일)
                      </p>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {channelEntries.map(([ch, qty]) => {
                          const label =
                            ch === "NAVER" ? "네이버" :
                            ch === "COUPANG" ? "쿠팡" :
                            ch === "GONGGU" ? "공구" :
                            ch === "PHARMACY" ? "약국" :
                            ch === "SEEDING" ? "Seeding" :
                            ch === "GIFT" ? "Gift" :
                            ch;
                          const color =
                            ch === "NAVER" ? "text-emerald-600 bg-emerald-600/[0.08]" :
                            ch === "COUPANG" ? "text-red-600 bg-red-600/[0.08]" :
                            ch === "GONGGU" ? "text-rose-600 bg-rose-600/[0.08]" :
                            ch === "PHARMACY" ? "text-blue-600 bg-blue-600/[0.08]" :
                            ch === "SEEDING" ? "text-violet-600 bg-violet-600/[0.08]" :
                            ch === "GIFT" ? "text-amber-600 bg-amber-600/[0.08]" :
                            "text-slate-500 bg-slate-500/[0.08]";
                          return (
                            <span key={ch} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full ${color}`}>
                              <span>{label}</span>
                              <span className="opacity-70">{qty!.toLocaleString()}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 스마트스토어 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            스마트스토어 <span className="text-[var(--text-quaternary)]">({adjustedRegRows.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            {syncResult && (
              <span className={`text-[11px] ${syncResult.includes("오류") || syncResult.includes("실패") ? "text-red-500" : "text-teal-600"}`}>
                {syncResult}
              </span>
            )}
            <button
              onClick={handleNaverSync}
              disabled={syncing}
              className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-[#03C75A]/10 text-[#03C75A] hover:bg-[#03C75A]/20 transition-colors disabled:opacity-50"
            >
              {syncing ? "동기화 중..." : "네이버 재고 동기화"}
            </button>
          </div>
        </div>
        <Card>
          {adjustedRegRows.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-tertiary)] text-sm">일반 재고가 없습니다.</div>
          ) : (
            <DataTableInline columns={regularColumns} data={adjustedRegRows} />
          )}
        </Card>
      </div>

      {/* 구분선 */}
      <div className="border-t border-[var(--border)]" />

      {/* 공구 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            공구 <span className="text-[var(--text-quaternary)]">({gongguRows.length})</span>
          </h2>
          <button
            onClick={() => setShowAddGonggu(true)}
            className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-teal-500/10 text-teal-500 hover:bg-teal-500/20 transition-colors"
          >
            + 공구 추가
          </button>
        </div>
        <Card>
          {gongguRows.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-tertiary)] text-sm">공구 재고가 없습니다.</div>
          ) : (
            <DataTableInline columns={gongguColumns} data={gongguRows} />
          )}
        </Card>
      </div>

      {/* BOM 편집 모달 */}
      {bomEditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBomEditTarget(null)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 w-[400px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1">구성 편집</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-5">{bomEditTarget.name}</p>

            <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-xl p-4 mb-5">
              <p className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)] mb-3">구성품 (BOM)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">5개입 (스타터키트)</label>
                  <input
                    type="number" min={0} value={bomStarterInput}
                    onChange={(e) => setBomStarterInput(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">30개입 (리필팩)</label>
                  <input
                    type="number" min={0} value={bomRefillInput}
                    onChange={(e) => setBomRefillInput(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-3 pt-3 border-t border-[var(--border)]">
                = <span className="font-semibold text-[var(--text-primary)]">
                  {[bomRefillInput > 0 && `30개입 ${bomRefillInput}개`, bomStarterInput > 0 && `5개입 ${bomStarterInput}개`].filter(Boolean).join(" + ") || "구성품 없음"}
                </span>
                {" "}= 총 <span className="font-semibold text-[var(--text-primary)]">{bomStarterInput * 5 + bomRefillInput * 30}개입</span>
              </p>
            </div>

            {bomEditTarget.naverProductNo && (
              <div className="mb-5">
                <p className="text-[11px] font-semibold text-[var(--text-tertiary)] mb-1">네이버 연결</p>
                <span className="inline-flex px-2 py-1 text-[11px] font-medium rounded bg-[#03C75A]/10 text-[#03C75A]">
                  N {bomEditTarget.naverProductNo}
                </span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setBomEditTarget(null)} className="px-4 py-2 text-[13px] rounded-lg border border-[var(--border)] text-[var(--text-secondary)]">취소</button>
              <button onClick={saveBom} disabled={bomSaving} className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">
                {bomSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공구 추가 모달 */}
      {showAddGonggu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddGonggu(false)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-5">공구 추가</h3>

            <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-xl p-4 mb-5">
              <p className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)] mb-3">구성품 (BOM)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">5개입 (스타터키트)</label>
                  <input
                    type="number" min={0} value={addStarter}
                    onChange={(e) => setAddStarter(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">30개입 (리필팩)</label>
                  <input
                    type="number" min={0} value={addRefill}
                    onChange={(e) => setAddRefill(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              {(addStarter > 0 || addRefill > 0) && (
                <p className="text-[12px] text-[var(--text-secondary)] mt-3 pt-3 border-t border-[var(--border)]">
                  = <span className="font-semibold text-[var(--text-primary)]">
                    {[addRefill > 0 && `30개입 ${addRefill}개`, addStarter > 0 && `5개입 ${addStarter}개`].filter(Boolean).join(" + ")}
                  </span>
                  {" "}= 총 <span className="font-semibold text-[var(--text-primary)]">{addStarter * 5 + addRefill * 30}개입</span>
                </p>
              )}
              {autoName && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1">
                  <p className="text-[12px] text-[var(--text-secondary)]">상품명: <span className="font-semibold text-[var(--text-primary)]">{autoName}</span></p>
                  <p className="text-[12px] text-[var(--text-secondary)]">SKU: <span className="font-mono font-semibold text-[var(--text-primary)]">{autoSku}</span></p>
                </div>
              )}
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">네이버 상품번호 (선택)</label>
                <input
                  type="text" value={addNaver} onChange={(e) => setAddNaver(e.target.value)}
                  placeholder="예: 13211473942"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">초기 On Hand</label>
                <input
                  type="number" min={0} value={addOnHand}
                  onChange={(e) => setAddOnHand(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddGonggu(false)} className="px-4 py-2 text-[13px] rounded-lg border border-[var(--border)] text-[var(--text-secondary)]">취소</button>
              <button
                onClick={saveAddGonggu}
                disabled={addSaving || addTotal === 0}
                className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {addSaving ? "추가 중..." : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline DataTable (client-side, matches existing DataTable style)   */
/* ------------------------------------------------------------------ */

function DataTableInline<T>({
  columns,
  data,
}: {
  columns: { key: string; header: string; align?: "left" | "right"; render: (row: T) => React.ReactNode }[];
  data: T[];
}) {
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div
        className="grid gap-x-4 sticky top-0 z-10 bg-[var(--surface)]"
        style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={`text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] pb-3 border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}
          >
            {col.header}
          </div>
        ))}
      </div>
      {data.map((row, i) => (
        <div
          key={i}
          className="grid gap-x-4 data-table-row rounded transition-colors"
          style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
        >
          {columns.map((col) => (
            <div
              key={`${i}-${col.key}`}
              className={`py-3 text-[13px] border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}
            >
              {col.render(row)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
