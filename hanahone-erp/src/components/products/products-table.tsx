"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductEditButton, ProductDeleteButton } from "./product-actions";

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  category: string;
  basePrice: number;
  costPrice: number;
  companyId: string;
  companyName: string;
}

const formatPrice = (n: number) =>
  n === 0 ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function ProductsTable({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const allSelected = products.length > 0 && selected.size === products.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
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
    if (!confirm(`Delete ${selected.size} product${selected.size > 1 ? "s" : ""}?`)) return;

    setDeleting(true);
    const errors: string[] = [];

    for (const id of selected) {
      const res = await fetch(`/api/products?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const product = products.find((p) => p.id === id);
        errors.push(`${product?.name || id}: ${data.error || "failed"}`);
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
        {products.length === 0 ? (
          <EmptyState title="No products" description="No products found." />
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
                  <th className="text-left py-3 px-4">SKU</th>
                  <th className="text-left py-3 px-4">Category</th>
                  <th className="text-right py-3 px-4">Base Price</th>
                  <th className="text-right py-3 px-4">Cost Price</th>
                  <th className="text-left py-3 px-4">Company</th>
                  <th className="text-right py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((row) => (
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
                    <td className="py-3 px-4 font-semibold">{row.name}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] font-mono text-xs">{row.sku}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{row.category}</td>
                    <td className="py-3 px-4 text-right font-semibold">{formatPrice(row.basePrice)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-secondary)]">{formatPrice(row.costPrice)}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{row.companyName}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <ProductEditButton product={row} />
                        <ProductDeleteButton product={row} />
                      </div>
                    </td>
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
