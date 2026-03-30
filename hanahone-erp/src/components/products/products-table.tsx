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
  salePrice: number | null;
  costPrice: number;
  companyId: string;
  companyName: string;
}

const formatUSD = (n: number) =>
  n === 0 ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const formatKRW = (n: number) =>
  n === 0 ? "—" : `₩${Math.round(n).toLocaleString("ko-KR")}`;

const KRW_COMPANIES = new Set(["HOK", "HOR"]);

function formatPrice(n: number, companyName: string) {
  return KRW_COMPANIES.has(companyName) ? formatKRW(n) : formatUSD(n);
}

interface ProductsTableProps {
  products: Product[];
  sourceGroups?: [string, Product[]][];
  showCompany?: boolean;
}

function ProductRow({
  row,
  selected,
  onToggle,
  showCompany,
}: {
  row: Product;
  selected: boolean;
  onToggle: () => void;
  showCompany?: boolean;
}) {
  return (
    <tr
      className={`border-b border-[var(--border)] last:border-b-0 transition-colors ${
        selected
          ? "bg-accent/[0.04]"
          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      }`}
    >
      <td className="py-3 px-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-[var(--border)] accent-accent"
        />
      </td>
      <td className="py-3 px-4 font-semibold">{row.name}</td>
      <td className="py-3 px-4 text-[var(--text-secondary)] font-mono text-xs">{row.sku}</td>
      <td className="py-3 px-4 text-right font-semibold">{formatPrice(row.basePrice, row.companyName)}</td>
      <td className="py-3 px-4 text-right">
        {row.salePrice != null ? formatPrice(row.salePrice, row.companyName) : "-"}
      </td>
      <td className="py-3 px-4 text-right text-[var(--text-secondary)]">{formatPrice(row.costPrice, row.companyName)}</td>
      {showCompany && <td className="py-3 px-4 text-[var(--text-secondary)]">{row.companyName}</td>}
      <td className="py-3 px-4 text-right">
        <div className="flex items-center gap-1 justify-end">
          <ProductEditButton product={row} />
          <ProductDeleteButton product={row} />
        </div>
      </td>
    </tr>
  );
}

export function ProductsTable({ products, sourceGroups, showCompany = false }: ProductsTableProps) {
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

    for (const id of Array.from(selected)) {
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

  const headerCols = (
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
      <th className="text-right py-3 px-4">Base Price</th>
      <th className="text-right py-3 px-4">Sale Price</th>
      <th className="text-right py-3 px-4">Cost Price</th>
      {showCompany && <th className="text-left py-3 px-4">Company</th>}
      <th className="text-right py-3 px-4"></th>
    </tr>
  );

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
                {headerCols}
              </thead>
              <tbody>
                {sourceGroups ? (
                  // Group view: show source dividers within the table
                  sourceGroups.map(([source, items]) => (
                    <>
                      <tr key={`divider-${source}`}>
                        <td colSpan={showCompany ? 8 : 7} className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{source}</span>
                            <span className="text-[10px] text-[var(--text-quaternary)]">({items.length})</span>
                            <div className="flex-1 h-px bg-[var(--border)]" />
                          </div>
                        </td>
                      </tr>
                      {items.map((row) => (
                        <ProductRow
                          key={row.id}
                          row={row}
                          selected={selected.has(row.id)}
                          onToggle={() => toggle(row.id)}
                          showCompany={showCompany}
                        />
                      ))}
                    </>
                  ))
                ) : (
                  products.map((row) => (
                    <ProductRow
                      key={row.id}
                      row={row}
                      selected={selected.has(row.id)}
                      onToggle={() => toggle(row.id)}
                      showCompany={showCompany}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
