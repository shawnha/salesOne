"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkuMappingModal } from "./sku-mapping-modal";

interface ExternalItem {
  id: string;
  externalSku: string;
  externalName: string;
  quantity: number;
  warehouseLocation: string | null;
  lastSyncAt: string;
  mapping: {
    id: string;
    displayName: string;
    productId: string | null;
    productName: string | null;
    productSku: string | null;
  } | null;
}

interface CgetcInventoryTableProps {
  companyId: string;
}

export function CgetcInventoryTable({ companyId }: CgetcInventoryTableProps) {
  const [items, setItems] = useState<ExternalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [editItem, setEditItem] = useState<ExternalItem | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ companyId, platform: "CGETC" });
    if (search) params.set("search", search);
    if (filter === "mapped") params.set("mapped", "true");
    if (filter === "unmapped") params.set("mapped", "false");

    fetch(`/api/external-inventory?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
      })
      .finally(() => setLoading(false));
  }, [companyId, search, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalItems = items.length;
  const mappedCount = items.filter((i) => i.mapping?.productId).length;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-[260px]">
            <Input
              placeholder="Search SKU or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
            {(["all", "mapped", "unmapped"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[11px] font-semibold capitalize ${
                  filter === f
                    ? "bg-accent text-white"
                    : "text-[var(--text-secondary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">SKUs</p>
            <p className="text-lg font-semibold">{totalItems}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Mapped</p>
            <p className="text-lg font-semibold text-teal-600">{mappedCount}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Total Qty</p>
            <p className="text-lg font-semibold">{totalQty.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
            No items found. Run CGETC sync first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="text-left py-3 px-4">CGETC SKU</th>
                  <th className="text-left py-3 px-4">Name</th>
                  <th className="text-right py-3 px-4">Qty</th>
                  <th className="text-left py-3 px-4">Linked Product</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  >
                    <td className="py-3 px-4 font-semibold font-mono text-xs">
                      {item.externalSku}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] max-w-[300px] truncate">
                      {item.mapping?.displayName || item.externalName}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {item.quantity.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      {item.mapping?.productId ? (
                        <span className="text-accent text-xs">
                          {item.mapping.productName} ({item.mapping.productSku})
                        </span>
                      ) : (
                        <span className="text-[var(--text-tertiary)] text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {item.mapping?.productId ? (
                        <span className="inline-flex px-2.5 py-0.5 text-[11px] font-semibold rounded-full text-teal-600 bg-teal-600/[0.08]">
                          Mapped
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-0.5 text-[11px] font-semibold rounded-full text-slate-500 bg-slate-500/[0.08]">
                          Unmapped
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditItem(item)}
                      >
                        {item.mapping ? "Edit" : "Map"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editItem && (
        <SkuMappingModal
          externalSku={editItem.externalSku}
          externalName={editItem.externalName}
          companyId={companyId}
          platform="CGETC"
          currentMapping={editItem.mapping}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            fetchData();
          }}
        />
      )}
    </>
  );
}
