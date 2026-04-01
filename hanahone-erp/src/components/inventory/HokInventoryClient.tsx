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
  sku: string;
  name: string;
  quantity: number;      // on-hand
  reserved: number;
  available: number;
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
}: {
  baselines: BaselineItem[];
  gongguRows: GongguInventoryRow[];
  regularRows: InventoryRow[];
  bomEntries: BomEntry[];
  companyId: string;
}) {
  const router = useRouter();
  const [gongguRows, setGongguRows] = useState(initialGongguRows);
  const [regRows, setRegRows] = useState(regularRows);

  // Calculate deductions
  const deductions = calculateDeductions(gongguRows, bomEntries);

  // Build available inventory: baseline - deductions
  const availableItems = baselines.map((b) => ({
    ...b,
    allocated: deductions.get(b.sku) || 0,
    available: b.quantity - (deductions.get(b.sku) || 0),
  }));

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

  const handleSaveRegular = async (inventoryId: string, newQuantity: number) => {
    setError(null);
    const res = await fetch("/api/inventory/gonggu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryId, quantity: newQuantity }),
    });
    if (!res.ok) {
      const body = await res.text();
      setError(`API error ${res.status}: ${body}`);
      throw new Error(body);
    }
    setRegRows((prev) =>
      prev.map((r) => (r.id === inventoryId ? { ...r, quantity: newQuantity, available: newQuantity - r.reserved } : r))
    );
    router.refresh();
  };

  // Naver sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleNaverSync = async () => {
    const syncItems = regRows
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

  // Gonggu table columns
  const gongguColumns = [
    {
      key: "name",
      header: "상품",
      render: (row: GongguInventoryRow) => (
        <span className="font-semibold">{row.name}</span>
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
      header: "구성품 할당",
      align: "right" as const,
      render: (row: GongguInventoryRow) => {
        const boms = bomEntries.filter((b) => b.finishedSku === row.sku);
        if (boms.length === 0) return <span className="text-[var(--text-quaternary)]">—</span>;
        return (
          <div className="space-y-0.5">
            {boms.map((b) => {
              const total = row.quantity * b.quantityRequired;
              const label = b.rawSku === "ODD-M01-5" ? "스타터키트" : "리필팩";
              return (
                <div key={b.rawSku} className="text-[11px] text-[var(--text-secondary)]">
                  {label}: <span className="font-semibold text-amber-600">{total.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        );
      },
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
          onSave={(val) => handleSaveRegular(row.id, val)}
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
      {baselines.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-4">전체 재고</h2>
          <div className="grid grid-cols-2 gap-6">
            {availableItems.map((item) => (
              <div key={item.sku} className="text-center">
                <p className="text-2xl font-bold">{item.quantity.toLocaleString()}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{item.productName}</p>
                {item.allocated > 0 && (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-[11px] text-amber-600 font-medium">
                      공구 할당: {item.allocated.toLocaleString()}
                    </p>
                    <p className={`text-lg font-bold ${item.available < 0 ? "text-rose-500" : "text-teal-600"}`}>
                      {item.available.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">스마트스토어 가용</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 스마트스토어 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            스마트스토어 <span className="text-[var(--text-quaternary)]">({regRows.length})</span>
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
          {regRows.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-tertiary)] text-sm">일반 재고가 없습니다.</div>
          ) : (
            <DataTableInline columns={regularColumns} data={regRows} />
          )}
        </Card>
      </div>

      {/* 구분선 */}
      <div className="border-t border-[var(--border)]" />

      {/* 공구 */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          공구 <span className="text-[var(--text-quaternary)]">({gongguRows.length})</span>
        </h2>
        <Card>
          {gongguRows.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-tertiary)] text-sm">공구 재고가 없습니다.</div>
          ) : (
            <DataTableInline columns={gongguColumns} data={gongguRows} />
          )}
        </Card>
      </div>
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
