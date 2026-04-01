"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const now = new Date();
  const paramMonth = searchParams.get("month");
  const [year, month] = paramMonth
    ? [parseInt(paramMonth.split("-")[0]), parseInt(paramMonth.split("-")[1]) - 1]
    : [now.getFullYear(), now.getMonth()];

  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);

  function navigate(y: number, m: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", `${y}-${String(m + 1).padStart(2, "0")}`);
    router.push(`${pathname}?${params.toString()}`);
    setShowPicker(false);
  }

  function prev() {
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    navigate(y, m);
  }

  function next() {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    navigate(y, m);
  }

  return (
    <div className="relative flex items-center gap-1">
      <button
        onClick={prev}
        className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
      >
        ◀
      </button>

      <button
        onClick={() => { setPickerYear(year); setShowPicker(!showPicker); }}
        className="px-4 py-1.5 text-sm font-bold rounded-full bg-accent text-white min-w-[100px]"
      >
        {MONTH_NAMES[month]} {year}
      </button>

      <button
        onClick={next}
        className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
      >
        ▶
      </button>

      {showPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-xl w-[260px]">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setPickerYear(pickerYear - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] text-xs"
              >
                ◀
              </button>
              <span className="text-sm font-bold">{pickerYear}</span>
              <button
                onClick={() => setPickerYear(pickerYear + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] text-xs"
              >
                ▶
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_NAMES.map((name, i) => {
                const isSelected = pickerYear === year && i === month;
                const isFuture = pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && i > now.getMonth());
                return (
                  <button
                    key={i}
                    disabled={isFuture}
                    onClick={() => navigate(pickerYear, i)}
                    className={`py-2 text-xs font-semibold rounded-xl transition-all ${
                      isSelected
                        ? "bg-accent text-white"
                        : isFuture
                        ? "text-[var(--text-tertiary)] opacity-40 cursor-not-allowed"
                        : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
