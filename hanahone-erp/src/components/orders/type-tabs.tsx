"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface TypeTabsProps {
  orderCount: number;
  seedingCount: number;
  giftCount: number;
}

export function TypeTabs({ orderCount, seedingCount, giftCount }: TypeTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentType = searchParams.get("type") || "";

  function handleClick(type: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (type) {
      params.set("type", type);
    } else {
      params.delete("type");
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const tabs = [
    { type: "", label: "Orders", count: orderCount, activeClass: "bg-[var(--accent)] text-white" },
    { type: "SEEDING", label: "Seeding", count: seedingCount, activeClass: "bg-violet-500 text-white" },
    { type: "GIFT", label: "Gifted", count: giftCount, activeClass: "bg-rose-400 text-white" },
  ];

  return (
    <div className="flex gap-0.5 p-0.5 bg-[var(--hover-bg)] rounded-full border border-[var(--border)] w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.type}
          onClick={() => handleClick(tab.type)}
          className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all ${
            currentType === tab.type
              ? tab.activeClass
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className="ml-1.5 text-[11px] opacity-70">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
