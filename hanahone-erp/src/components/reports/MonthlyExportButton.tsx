"use client";

import { useState } from "react";

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export function MonthlyExportButton({ companyId }: { companyId?: string | null }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const years = [now.getFullYear(), now.getFullYear() - 1];

  const url = `/api/reports/monthly-export?year=${year}&month=${month}${companyId ? `&company=${companyId}` : ""}`;

  return (
    <div className="flex items-center gap-2 text-[13px]">
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[13px] outline-none focus:border-teal-500"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}년</option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        className="px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[13px] outline-none focus:border-teal-500"
      >
        {MONTHS.map((label, i) => (
          <option key={i + 1} value={i + 1}>{label}</option>
        ))}
      </select>
      <a
        href={url}
        download
        className="px-3 py-1.5 rounded bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 font-medium text-[13px]"
      >
        Excel 다운로드
      </a>
    </div>
  );
}
