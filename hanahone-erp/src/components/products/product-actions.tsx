"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
}

interface ProductActionsProps {
  product: Product;
}

export function ProductEditButton({ product }: ProductActionsProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku);
  const [category, setCategory] = useState(product.category);
  const [basePrice, setBasePrice] = useState(String(product.basePrice));
  const [salePrice, setSalePrice] = useState(product.salePrice != null ? String(product.salePrice) : "");
  const [costPrice, setCostPrice] = useState(String(product.costPrice));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          name,
          sku,
          category,
          basePrice: parseFloat(basePrice) || 0,
          salePrice: salePrice ? parseFloat(salePrice) : null,
          costPrice: parseFloat(costPrice) || 0,
        }),
      });
      if (res.ok) {
        setOpen(false);
        window.location.reload();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
        title="Edit"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-1.5 w-full max-w-lg mx-4 shadow-2xl">
        <div className="bg-[var(--surface)] rounded-[calc(1.5rem-6px)] p-7 shadow-[var(--shadow-inset)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold tracking-tight">Edit Product</h2>
            <button onClick={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-lg">&times;</button>
          </div>
          <div className="space-y-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
            <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Base Price" type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
              <Input label="Cost Price" type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <Input label="Sale Price" type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            <div className="flex items-center gap-3 pt-2">
              <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductDeleteButton({ product }: ProductActionsProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${product.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products?id=${product.id}`, { method: "DELETE" });
      if (res.ok) {
        window.location.reload();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.needsMerge) {
        const mergeId = prompt(
          `"${product.name}" has linked records:\n${data.deps.map((d: string) => `  - ${d}`).join("\n")}\n\nTo delete, these records will be moved to another product.\nPaste the target product ID to merge into (find it via Edit on the target product):`
        );
        if (mergeId?.trim()) {
          const mergeRes = await fetch(`/api/products?id=${product.id}&mergeInto=${mergeId.trim()}`, { method: "DELETE" });
          if (mergeRes.ok) {
            window.location.reload();
            return;
          }
          const mergeData = await mergeRes.json().catch(() => ({}));
          alert(mergeData.error || "Merge failed");
        }
      } else {
        alert(data.error || "Failed to delete product");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/[0.06] transition-colors disabled:opacity-40"
      title="Delete"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
    </button>
  );
}
