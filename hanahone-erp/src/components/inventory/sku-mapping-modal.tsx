"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SkuMappingModalProps {
  externalSku: string;
  externalName: string;
  companyId: string;
  platform: string;
  currentMapping: {
    displayName: string;
    productId: string | null;
    productName: string | null;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

export function SkuMappingModal({
  externalSku,
  externalName,
  companyId,
  platform,
  currentMapping,
  onClose,
  onSaved,
}: SkuMappingModalProps) {
  const [displayName, setDisplayName] = useState(
    currentMapping?.displayName || externalName
  );
  const [selectedProductId, setSelectedProductId] = useState<string>(
    currentMapping?.productId || ""
  );
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/products?companyId=${companyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProducts(
            data.map((p: any) => ({ id: p.id, name: p.name, sku: p.sku }))
          );
        }
      })
      .catch(() => {});
  }, [companyId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sku-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          platform,
          externalSku,
          displayName,
          productId: selectedProductId || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save mapping");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-1.5 w-full max-w-lg mx-4 shadow-2xl">
        <div className="bg-[var(--surface)] rounded-[calc(1.5rem-6px)] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold tracking-tight">SKU Mapping</h2>
            <button
              onClick={onClose}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-lg"
            >
              &times;
            </button>
          </div>

          <div className="mb-4 px-3 py-2 rounded-xl bg-slate-500/[0.06] border border-slate-500/[0.12] text-[11px] text-[var(--text-secondary)]">
            <span className="font-semibold">CGETC SKU:</span> {externalSku}
          </div>

          <div className="space-y-4">
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Link to Product (optional)
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Not linked</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={saving || !displayName.trim()}
              >
                {saving ? "Saving..." : "Save Mapping"}
              </Button>
              <Button variant="ghost" size="md" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
