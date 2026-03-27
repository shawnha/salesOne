"use client";

import { useCallback, useEffect, useRef } from "react";

interface TopCustomer {
  name: string;
  count: number;
  amount: number;
}

const formatUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function TopCustomersCard({ customers, columnCount = 6 }: { customers: TopCustomer[]; columnCount?: number }) {
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
      }
    `;
    document.head.appendChild(style);
  }, []);

  const handleClick = useCallback((customerName: string) => {
    // DataTable uses CSS Grid with flat divs — every `columnCount` divs = 1 row
    // Find the grid container by its inline style (gridTemplateColumns)
    const allGrids = document.querySelectorAll(".grid.gap-4");
    let gridContainer: Element | null = null;
    allGrids.forEach((g) => {
      if (g.getAttribute("style")?.includes("grid-template-columns")) {
        gridContainer = g;
      }
    });
    if (!gridContainer) return;

    const cells = Array.from(gridContainer.children);
    // Skip header cells (first `columnCount` items)
    const dataCells = cells.slice(columnCount);
    let firstMatch: Element | null = null;

    for (let i = 0; i < dataCells.length; i += columnCount) {
      // Customer is the 2nd column (index 1)
      const customerCell = dataCells[i + 1];
      if (!customerCell) continue;

      const cellText = customerCell.textContent?.trim() || "";
      if (cellText === customerName) {
        // Highlight all cells in this row
        for (let j = 0; j < columnCount && (i + j) < dataCells.length; j++) {
          const cell = dataCells[i + j];
          cell.classList.remove("order-highlight");
          // Force reflow to restart animation
          void (cell as HTMLElement).offsetWidth;
          cell.classList.add("order-highlight");
          setTimeout(() => cell.classList.remove("order-highlight"), 2000);
        }
        if (!firstMatch) firstMatch = dataCells[i];
      }
    }

    if (firstMatch) {
      firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [columnCount]);

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
              {c.count} orders · {formatUSD(c.amount)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
