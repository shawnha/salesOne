"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export function Pagination({ currentPage, totalPages, totalItems, pageSize }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
      <span className="text-[11px] text-[var(--text-tertiary)]">
        {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-2 py-1 text-xs rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &larr;
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
          .reduce<(number | "...")[]>((acc, p, i, arr) => {
            if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "..." ? (
              <span key={`dot-${i}`} className="px-1 text-xs text-[var(--text-tertiary)]">...</span>
            ) : (
              <button
                key={p}
                onClick={() => goToPage(p as number)}
                className={`w-7 h-7 text-xs rounded-lg ${
                  p === currentPage
                    ? "bg-accent text-white font-semibold"
                    : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                }`}
              >
                {p}
              </button>
            )
          )}
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-2 py-1 text-xs rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &rarr;
        </button>
      </div>
    </div>
  );
}
