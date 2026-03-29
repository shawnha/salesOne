"use client";

import { useState } from "react";

type Props = {
  sku: string;
  productName: string;
  companyId: string;
  currentDiff: number;
  onClose: () => void;
  onSuccess: () => void;
};

const REASONS = [
  { value: "SEEDING", label: "Seeding (인플루언서 시딩)" },
  { value: "DAMAGED", label: "Damaged (파손)" },
  { value: "SAMPLE", label: "Sample (샘플)" },
  { value: "PROMOTION", label: "Promotion (프로모션)" },
  { value: "OTHER", label: "Other (기타)" },
];

export function AdjustModal({ sku, productName, companyId, currentDiff, onClose, onSuccess }: Props) {
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || !reason) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          sku,
          productName,
          quantity: Number(quantity),
          reason,
          memo: memo || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save adjustment");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--card-bg)] rounded-2xl shadow-xl border border-[var(--card-border)] p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Adjust Inventory</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xl leading-none">×</button>
        </div>

        <div className="text-sm text-[var(--text-secondary)] space-y-1">
          <div><span className="font-semibold">{productName}</span></div>
          <div>SKU: <span className="font-mono">{sku}</span></div>
          <div>Current difference: <span className={`font-semibold ${currentDiff < 0 ? "text-rose-500" : currentDiff > 0 ? "text-amber-500" : "text-teal-600"}`}>{currentDiff > 0 ? `+${currentDiff}` : currentDiff}</span></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. -20 (negative = reduce expected)"
              className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              required
            />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Negative = items left warehouse (seeding, damage). Positive = items returned.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              required
            >
              <option value="">Select reason...</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Memo (optional)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--input-bg)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !quantity || !reason}
              className="flex-1 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Submit Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
