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
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-1.5 w-full max-w-lg mx-4 shadow-2xl">
        <div className="bg-[var(--surface)] rounded-[calc(1.5rem-6px)] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
      if (res.ok) window.location.reload();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="text-red-500 hover:text-red-600">
      {deleting ? "..." : "Delete"}
    </Button>
  );
}
