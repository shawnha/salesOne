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
  companyName: string;
}

export function CustomersTable({ customers, companyId, companyName }: { customers: Customer[]; companyId?: string; companyName?: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);

  const allSelected = customers.length > 0 && selected.size === customers.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customers.map((c) => c.id)));
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

      <Card>
        {customers.length === 0 ? (
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
                  <th className="text-left py-3 px-4">Name</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-left py-3 px-4">Contact</th>
                  <th className="text-left py-3 px-4">Company</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[var(--border)] last:border-b-0 transition-colors ${
                      selected.has(row.id)
                        ? "bg-accent/[0.04]"
                        : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
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
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={row.type} />
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {row.email || row.phone || "\u2014"}
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
