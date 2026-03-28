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

export function CustomersTable({ customers }: { customers: Customer[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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

  return (
    <>
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
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
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
