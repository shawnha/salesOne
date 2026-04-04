"use client";

import { useState } from "react";

interface TransferEditFieldsProps {
  transferId: string;
  initialReason: string | null;
  initialCostAmount: number | null;
}

export function TransferEditFields({ transferId, initialReason, initialCostAmount }: TransferEditFieldsProps) {
  const [reason, setReason] = useState(initialReason || "");
  const [costAmount, setCostAmount] = useState(initialCostAmount?.toString() || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const body: any = { transferId };
      if (reason !== (initialReason || "")) body.reason = reason;
      if (costAmount !== (initialCostAmount?.toString() || "")) body.costAmount = parseFloat(costAmount) || 0;
      await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  const hasChanges = reason !== (initialReason || "") || costAmount !== (initialCostAmount?.toString() || "");

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wide font-semibold">Reason</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Defective product re-import"
          className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--border)] bg-[var(--hover-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div>
        <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wide font-semibold">Cost Amount ($)</label>
        <input
          type="number"
          value={costAmount}
          onChange={(e) => setCostAmount(e.target.value)}
          placeholder="0.00"
          step="0.01"
          className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--border)] bg-[var(--hover-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-[13px] font-semibold rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
      {saved && (
        <span className="text-[12px] text-[var(--accent)] ml-2">Saved</span>
      )}
    </div>
  );
}
