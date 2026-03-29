"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companyId: string;
  isReset?: boolean;
  baselineCount?: number;
  adjustmentCount?: number;
};

export function SetBaselineButton({ companyId, isReset, baselineCount, adjustmentCount }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleSet = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reconciliation/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set baseline");
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (isReset) {
    if (confirming) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Reset {baselineCount} SKU baselines
            {adjustmentCount ? ` and clear ${adjustmentCount} adjustment(s) from tracking` : ""}?
            <span className="text-[var(--text-quaternary)]"> (history kept)</span>
          </span>
          <button
            onClick={handleSet}
            disabled={loading}
            className="text-[11px] font-semibold text-rose-500 hover:underline disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[11px] font-semibold text-[var(--text-tertiary)] hover:underline"
          >
            Cancel
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:underline"
      >
        Reset Baseline
      </button>
    );
  }

  return (
    <button
      onClick={handleSet}
      disabled={loading}
      className="px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "Setting baseline..." : "Set Baseline from CGETC"}
    </button>
  );
}
