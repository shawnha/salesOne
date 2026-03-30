"use client";

import { useState } from "react";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
}

export function DataTable<T>({ columns, data, pageSize = 50 }: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(data.length / pageSize);
  const showPagination = data.length > pageSize;
  const pageData = showPagination ? data.slice(page * pageSize, (page + 1) * pageSize) : data;

  return (
    <div>
      <div className="max-h-[70vh] overflow-y-auto">
        <div className="grid gap-x-4 sticky top-0 z-10 bg-[var(--surface)]" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
          {columns.map((col) => (
            <div key={col.key} className={`text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] pb-3 border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}>
              {col.header}
            </div>
          ))}
        </div>
        {pageData.map((row, i) => (
          <div key={i} className="grid gap-x-4 data-table-row rounded transition-colors" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
            {columns.map((col) => (
              <div key={`${i}-${col.key}`} className={`py-3 text-[13px] border-b border-[var(--border)] ${col.align === "right" ? "text-right" : ""}`}>
                {col.render(row)}
              </div>
            ))}
          </div>
        ))}
      </div>
      {showPagination && (
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 text-[11px] font-medium rounded hover:bg-black/[0.04] dark:hover:bg-white/[0.05] disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 7 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 text-[11px] font-medium rounded transition-colors ${
                    page === pageNum
                      ? "bg-accent text-white"
                      : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-[var(--text-secondary)]"
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-[11px] font-medium rounded hover:bg-black/[0.04] dark:hover:bg-white/[0.05] disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
