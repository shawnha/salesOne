"use client";

import { useState } from "react";
import { UnifiedShippingManager } from "./UnifiedShippingManager";
import { InboundManager } from "./InboundManager";

type Tab = "outbound" | "inbound";

const TABS: { key: Tab; label: string }[] = [
  { key: "outbound", label: "고객 발송" },
  { key: "inbound", label: "로켓그로스 입고" },
];

export function ShippingTabs({
  companyId,
  initialTab = "outbound",
}: {
  companyId: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 p-1 bg-[var(--surface-2)] rounded-[10px]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[12px] font-semibold rounded-lg transition-colors ${
              tab === t.key
                ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "outbound" ? (
        <UnifiedShippingManager companyId={companyId} />
      ) : (
        <InboundManager companyId={companyId} />
      )}
    </div>
  );
}
