"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";

export function SearchInput({ placeholder = "Search..." }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") || "");

  const handleSearch = useCallback(
    (term: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) {
        params.set("q", term);
      } else {
        params.delete("q");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSearch(value);
      }}
      onBlur={() => handleSearch(value)}
      placeholder={placeholder}
      className="px-3 py-1.5 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-accent w-48"
    />
  );
}
