"use client";
import { useState } from "react";

const options = ["Today", "7 days", "30 days", "Quarter"];

export function DateFilter({ onChange }: { onChange?: (value: string) => void }) {
  const [selected, setSelected] = useState("30 days");
  return (
    <div className="flex gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-full p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => { setSelected(opt); onChange?.(opt); }}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
            selected === opt
              ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-tertiary)]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
