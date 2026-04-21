"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companyId: string;
  isReset?: boolean;
  baselineCount?: number;
  adjustmentCount?: number;
};

export function SetBaselineButton({ companyId, isReset, baselineCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"upsert" | "replace">("upsert");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert("Excel 파일을 선택해주세요."); return; }
    if (!date) { alert("기준 날짜를 입력해주세요."); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("companyId", companyId);
      fd.append("baselineDate", date);
      fd.append("mode", mode);
      fd.append("file", file);

      const res = await fetch("/api/reconciliation/baseline", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const warnMsg = data.warnings?.length ? `\n\nWarnings:\n${data.warnings.join("\n")}` : "";
      alert(`Baseline ${data.count}건 적용 완료 (as of ${data.baselineDate?.slice(0, 10)})${warnMsg}`);
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const label = isReset
    ? `Update Baseline${baselineCount ? ` (${baselineCount})` : ""}`
    : "Set Baseline (Excel)";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          isReset
            ? "text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:underline"
            : "px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90"
        }
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-secondary)] text-xs">
      <div className="font-semibold text-[var(--text-primary)]">Upload baseline snapshot</div>
      <div className="text-[10px] text-[var(--text-tertiary)]">
        Excel columns: <code>Internal Reference</code> + <code>Quantity On Hand</code>
      </div>
      <label className="flex items-center gap-2">
        <span className="w-24 text-[var(--text-secondary)]">기준 날짜</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-primary)]"
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-24 text-[var(--text-secondary)]">Excel 파일</span>
        <input type="file" accept=".xlsx,.xls" ref={fileRef} className="text-[11px]" />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-24 text-[var(--text-secondary)]">Mode</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "upsert" | "replace")}
          className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-primary)]"
        >
          <option value="upsert">Upsert (기존 SKU 유지, 파일 SKU만 갱신)</option>
          <option value="replace">Replace (기존 baseline 전체 삭제 후 새로 생성)</option>
        </select>
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleUpload}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-accent text-white font-semibold disabled:opacity-50"
        >
          {loading ? "Uploading..." : "Apply"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-[var(--border)] font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
