"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Channel = { value: string; label: string; color?: string };

const ALL_CHANNELS: Channel[] = [
  { value: "", label: "All" },
  { value: "SHOPIFY", label: "Shopify", color: "text-green-600" },
  { value: "TIKTOK", label: "TikTok", color: "text-pink-600" },
  { value: "AMAZON", label: "Amazon", color: "text-orange-600" },
  { value: "NAVER", label: "Naver", color: "text-emerald-600" },
  { value: "PHARMACY", label: "Pharmacy", color: "text-blue-600" },
];

// Company-specific channel keys (excluding "All" which is always shown)
const COMPANY_CHANNELS: Record<string, string[]> = {
  HOI: ["SHOPIFY", "TIKTOK", "AMAZON"],
  HOK: ["NAVER", "PHARMACY"],
  HOR: ["PHARMACY"],
};

export function ChannelFilter({ companyName }: { companyName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("channel") || "";

  // Filter channels based on selected company
  const allowedKeys = companyName ? COMPANY_CHANNELS[companyName] : null;
  const channels = allowedKeys
    ? ALL_CHANNELS.filter((ch) => ch.value === "" || allowedKeys.includes(ch.value))
    : ALL_CHANNELS;

  function handleClick(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("channel", value);
    } else {
      params.delete("channel");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
      {channels.map((ch) => (
        <button
          key={ch.value}
          onClick={() => handleClick(ch.value)}
          className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            current === ch.value
              ? "bg-accent text-white"
              : "text-[var(--text-secondary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
          }`}
        >
          {ch.label}
        </button>
      ))}
    </div>
  );
}
