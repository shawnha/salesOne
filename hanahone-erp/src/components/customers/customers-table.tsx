"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

interface Customer {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  recipientName: string | null;
  companyName: string;
  channels: string[];
}

const CHANNEL_META: Record<string, { label: string; color: string }> = {
  SHOPIFY: { label: "Shopify", color: "text-green-600 bg-green-600/[0.08]" },
  AMAZON: { label: "Amazon", color: "text-orange-600 bg-orange-600/[0.08]" },
  TIKTOK: { label: "TikTok", color: "text-pink-600 bg-pink-600/[0.08]" },
  NAVER: { label: "네이버", color: "text-emerald-600 bg-emerald-600/[0.08]" },
  COUPANG: { label: "쿠팡", color: "text-red-600 bg-red-600/[0.08]" },
  PHARMACY: { label: "약국", color: "text-blue-600 bg-blue-600/[0.08]" },
  CGETC: { label: "CGETC", color: "text-indigo-600 bg-indigo-600/[0.08]" },
  GONGGU: { label: "공구", color: "text-rose-600 bg-rose-600/[0.08]" },
};

const DIRECT_KEY = "DIRECT";
const DIRECT_META = { label: "직접", color: "text-slate-500 bg-slate-500/[0.08]" };

export function CustomersTable({ customers, companyId, companyName }: { customers: Customer[]; companyId?: string; companyName?: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("ALL");

  // Build available channel tabs from this customer set so HOK doesn't show
  // empty Shopify/Amazon tabs and HOI doesn't show 네이버/쿠팡.
  const channelCounts = new Map<string, number>();
  let directCount = 0;
  for (const c of customers) {
    if (c.channels.length === 0) {
      directCount++;
      continue;
    }
    for (const ch of c.channels) {
      channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
    }
  }
  const availableTabs: { key: string; label: string; count: number; color?: string }[] = [
    { key: "ALL", label: "전체", count: customers.length },
    ...Array.from(channelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ch, n]) => ({
        key: ch,
        label: CHANNEL_META[ch]?.label ?? ch,
        count: n,
        color: CHANNEL_META[ch]?.color,
      })),
  ];
  if (directCount > 0) {
    availableTabs.push({ key: DIRECT_KEY, label: DIRECT_META.label, count: directCount, color: DIRECT_META.color });
  }

  const filtered = customers.filter((c) => {
    if (channelFilter === "ALL") return true;
    if (channelFilter === DIRECT_KEY) return c.channels.length === 0;
    return c.channels.includes(channelFilter);
  });

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const c of filtered) next.delete(c.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const c of filtered) next.add(c.id);
        return next;
      });
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} customer${selected.size > 1 ? "s" : ""}?`)) return;

    setDeleting(true);
    const errors: string[] = [];

    for (const id of Array.from(selected)) {
      const res = await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const customer = customers.find((c) => c.id === id);
        errors.push(`${customer?.name || id}: ${data.error || "failed"}`);
      }
    }

    if (errors.length > 0) {
      alert(`${selected.size - errors.length} deleted, ${errors.length} failed:\n\n${errors.join("\n")}`);
    }

    window.location.reload();
  }

  const platform = companyName === "HOK" ? "NAVER" : companyName === "HOI" ? "CGETC" : null;
  const fetchLabel = platform === "NAVER" ? "Fetch Naver Details" : "Fetch CGETC Details";

  async function handleFetchDetails() {
    if (!companyId || !platform) return;
    setFetchingDetails(true);
    setFetchResult(null);
    try {
      const res = await fetch("/api/customers/fetch-cgetc-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchResult(`Error: ${data.error}`);
      } else if (data.updated === 0) {
        setFetchResult(data.message || "No customers to update");
      } else {
        setFetchResult(`Updated ${data.updated}/${data.total} customers`);
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setFetchResult("Failed to fetch details");
    } finally {
      setFetchingDetails(false);
    }
  }

  return (
    <>
      {companyId && platform && (
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleFetchDetails}
            disabled={fetchingDetails}
          >
            {fetchingDetails ? "Fetching..." : fetchLabel}
          </Button>
          {fetchResult && (
            <span className="text-xs text-[var(--text-secondary)]">{fetchResult}</span>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-accent/[0.06] border border-accent/[0.15]">
          <span className="text-xs font-semibold text-accent">
            {selected.size} selected
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={handleBulkDelete}
            disabled={deleting}
            className="!bg-red-500 hover:!bg-red-600"
          >
            {deleting ? "Deleting..." : `Delete ${selected.size}`}
          </Button>
        </div>
      )}

      {availableTabs.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {availableTabs.map((tab) => {
            const active = channelFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setChannelFilter(tab.key)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full border transition-all ${
                  active
                    ? "bg-accent/10 border-accent/30 text-accent"
                    : "bg-transparent border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 ${active ? "text-accent/70" : "text-[var(--text-tertiary)]"}`}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No customers" description="No customers found." />
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-[var(--border)] accent-accent"
                    />
                  </th>
                  <th className="text-left py-3 px-4">이름</th>
                  <th className="text-left py-3 px-4">유형</th>
                  <th className="text-left py-3 px-4">채널</th>
                  <th className="text-left py-3 px-4">연락처</th>
                  <th className="text-left py-3 px-4">회사</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[var(--border)] last:border-b-0 transition-colors ${
                      selected.has(row.id)
                        ? "bg-accent/[0.04]"
                        : "hover:bg-[var(--hover-bg-subtle)]"
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="rounded border-[var(--border)] accent-accent"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/customers/${row.id}`} className="font-semibold text-accent hover:underline">
                        {row.name}
                      </Link>
                      {row.recipientName && (
                        <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">→ {row.recipientName}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={row.type} />
                    </td>
                    <td className="py-3 px-4">
                      {row.channels.length === 0 ? (
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded ${DIRECT_META.color}`}>
                          {DIRECT_META.label}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          {row.channels.map((ch) => {
                            const meta = CHANNEL_META[ch] || { label: ch, color: "text-slate-500 bg-slate-500/[0.08]" };
                            return (
                              <span
                                key={ch}
                                className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded ${meta.color}`}
                              >
                                {meta.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {row.email || row.phone ? (
                        <div className="space-y-0.5">
                          {row.email && <div>{row.email}</div>}
                          {row.phone && <div className="font-mono text-xs">{row.phone}</div>}
                        </div>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{row.companyName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
