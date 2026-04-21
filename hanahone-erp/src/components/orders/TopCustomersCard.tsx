"use client";

import { useCallback, useEffect, useRef } from "react";

interface TopCustomer {
  name: string;
  count: number;
  amount: number;
}

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const formatKRW = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function TopCustomersCard({ customers, currency = "USD" }: { customers: TopCustomer[]; currency?: "USD" | "KRW" }) {
  const fmt = currency === "KRW" ? formatKRW : formatUSD;
  const styleInjected = useRef(false);

  useEffect(() => {
    if (styleInjected.current) return;
    styleInjected.current = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes orderHighlightFlash {
        0%, 100% { background-color: transparent; }
        25% { background-color: rgba(59, 130, 246, 0.15); }
        50% { background-color: transparent; }
        75% { background-color: rgba(59, 130, 246, 0.15); }
      }
      .order-highlight {
        animation: orderHighlightFlash 2s ease-in-out !important;
        border-radius: 6px;
      }
    `;
    document.head.appendChild(style);
  }, []);

  const handleClick = useCallback((customerName: string) => {
    // DataTable now uses row wrappers with class "data-table-row"
    const rows = Array.from(document.querySelectorAll(".data-table-row"));
    const matches = rows.filter((row) => {
      const customerCell = row.children[1];
      return customerCell?.textContent?.trim() === customerName;
    });

    for (const row of matches) {
      row.classList.remove("order-highlight");
      void (row as HTMLElement).offsetWidth;
      row.classList.add("order-highlight");
      setTimeout(() => row.classList.remove("order-highlight"), 2000);
    }

    if (matches[0]) {
      matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  if (customers.length === 0) {
    return <p className="text-xs text-[var(--text-tertiary)]">No data</p>;
  }

  return (
    <div className="space-y-3">
      {customers.map((c, i) => (
        <div key={c.name} className="flex items-start gap-2">
          <span className={`text-xs font-bold mt-0.5 ${
            i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : "text-amber-700"
          }`}>
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => handleClick(c.name)}
              className="text-sm font-semibold truncate block max-w-full text-left hover:text-accent transition-colors cursor-pointer"
              title={c.name}
            >
              {shortName(c.name)}
            </button>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {c.count} orders · {fmt(c.amount)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
