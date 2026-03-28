# CGETC Inventory + SKU Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CGETC 3PL 재고를 전체 저장하고, SKU 매핑 테이블을 통해 ERP Product와 연결하며, 프론트에서 매핑/이름변경이 가능하게 한다.

**Architecture:** CGETC sync → ExternalInventory(원본 전체 저장) → SkuMapping(CGETC SKU ↔ ERP Product, displayName 수정 가능) → 매핑된 것만 Inventory에 반영. 기존 InventorySnapshot 모델은 HOK 계산용으로 유지, 새 ExternalInventory 모델이 3PL 원본 저장 담당.

**Tech Stack:** Prisma (multiSchema), Next.js 14 SSR + Client Components, Supabase PostgreSQL

---

### Task 1: Schema — ExternalInventory + SkuMapping 모델 추가

**Files:**
- Modify: `prisma/schema.prisma:458` (끝에 추가)

- [ ] **Step 1: ExternalInventory 모델 추가**

`prisma/schema.prisma` 끝에 추가:

```prisma
model ExternalInventory {
  id                String   @id @default(uuid())
  companyId         String   @map("company_id")
  company           Company  @relation(fields: [companyId], references: [id])
  platform          Platform
  externalSku       String   @map("external_sku")
  externalName      String   @map("external_name")
  quantity          Int
  warehouseLocation String?  @map("warehouse_location")
  lastSyncAt        DateTime @map("last_sync_at")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@unique([companyId, platform, externalSku])
  @@index([companyId, platform])
  @@map("external_inventories")
  @@schema("salesone")
}

model SkuMapping {
  id            String   @id @default(uuid())
  companyId     String   @map("company_id")
  company       Company  @relation(fields: [companyId], references: [id])
  platform      Platform
  externalSku   String   @map("external_sku")
  displayName   String   @map("display_name")
  productId     String?  @map("product_id")
  product       Product? @relation(fields: [productId], references: [id])
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@unique([companyId, platform, externalSku])
  @@index([companyId, platform])
  @@index([productId])
  @@map("sku_mappings")
  @@schema("salesone")
}
```

- [ ] **Step 2: Company, Product 모델에 relation 추가**

`Company` 모델의 relation 목록에 추가:

```prisma
  externalInventories  ExternalInventory[]
  skuMappings          SkuMapping[]
```

`Product` 모델의 relation 목록에 추가:

```prisma
  skuMappings        SkuMapping[]
```

- [ ] **Step 3: prisma generate로 검증**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: DB에 테이블 생성**

Run: `npx prisma db push`
Expected: 테이블 2개 생성, 에러 없음

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add ExternalInventory and SkuMapping models for 3PL inventory"
```

---

### Task 2: sync-runner — CGETC 재고를 ExternalInventory에 전체 저장

**Files:**
- Modify: `src/lib/integrations/sync-runner.ts:114-140`

- [ ] **Step 1: sync-runner의 inventory 처리 로직 수정**

`src/lib/integrations/sync-runner.ts`의 기존 inventory 처리 블록(114-140줄)을 교체:

```typescript
    if (connector.fetchInventory) {
      const inventoryData = await connector.fetchInventory(credentials);
      const now = new Date();

      for (const item of inventoryData) {
        // 1. ExternalInventory에 원본 전체 저장 (upsert)
        await prisma.externalInventory.upsert({
          where: {
            companyId_platform_externalSku: {
              companyId,
              platform: connector.platform,
              externalSku: item.sku,
            },
          },
          update: {
            externalName: item.productName,
            quantity: item.quantity,
            warehouseLocation: item.warehouseLocation || null,
            lastSyncAt: now,
          },
          create: {
            companyId,
            platform: connector.platform,
            externalSku: item.sku,
            externalName: item.productName,
            quantity: item.quantity,
            warehouseLocation: item.warehouseLocation || null,
            lastSyncAt: now,
          },
        });

        // 2. SkuMapping이 있으면 → 매핑된 Product의 Inventory 업데이트
        const mapping = await prisma.skuMapping.findUnique({
          where: {
            companyId_platform_externalSku: {
              companyId,
              platform: connector.platform,
              externalSku: item.sku,
            },
          },
        });

        if (mapping?.productId) {
          await prisma.inventory.upsert({
            where: {
              productId_companyId_warehouseLocation: {
                productId: mapping.productId,
                companyId,
                warehouseLocation: item.warehouseLocation || "CGETC",
              },
            },
            update: { quantity: item.quantity },
            create: {
              productId: mapping.productId,
              companyId,
              quantity: item.quantity,
              warehouseLocation: item.warehouseLocation || "CGETC",
              reorderLevel: 0,
            },
          });
        }
      }
    }
```

- [ ] **Step 2: prisma generate 후 타입 확인**

Run: `npx prisma generate`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add src/lib/integrations/sync-runner.ts
git commit -m "feat: store all external inventory in ExternalInventory, apply SkuMapping to Inventory"
```

---

### Task 3: SKU Mapping CRUD API

**Files:**
- Create: `src/app/api/sku-mappings/route.ts`

- [ ] **Step 1: GET + POST API 작성**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const platform = req.nextUrl.searchParams.get("platform");

  const where: any = {};
  if (companyId) where.companyId = companyId;
  if (platform) where.platform = platform;

  const mappings = await prisma.skuMapping.findMany({
    where,
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { externalSku: "asc" },
  });

  return NextResponse.json(mappings);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId, platform, externalSku, displayName, productId } = await req.json();

  if (!companyId || !platform || !externalSku || !displayName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const mapping = await prisma.skuMapping.upsert({
    where: {
      companyId_platform_externalSku: { companyId, platform, externalSku },
    },
    update: {
      displayName,
      productId: productId || null,
    },
    create: {
      companyId,
      platform,
      externalSku,
      displayName,
      productId: productId || null,
    },
    include: { product: { select: { name: true, sku: true } } },
  });

  return NextResponse.json(mapping);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/sku-mappings/route.ts
git commit -m "feat: add SKU mapping CRUD API"
```

---

### Task 4: External Inventory API (3PL 재고 조회)

**Files:**
- Create: `src/app/api/external-inventory/route.ts`

- [ ] **Step 1: GET API — ExternalInventory + SkuMapping join**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const platform = req.nextUrl.searchParams.get("platform") || "CGETC";
  const search = req.nextUrl.searchParams.get("search");
  const mapped = req.nextUrl.searchParams.get("mapped"); // "true" | "false" | null

  const where: any = { platform };
  if (companyId) where.companyId = companyId;
  if (search) {
    where.OR = [
      { externalSku: { contains: search, mode: "insensitive" } },
      { externalName: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.externalInventory.findMany({
    where,
    orderBy: { quantity: "desc" },
    take: 200,
  });

  // Join with SkuMapping
  const skuKeys = items.map((i) => i.externalSku);
  const mappings = await prisma.skuMapping.findMany({
    where: {
      companyId: companyId || undefined,
      platform: platform as any,
      externalSku: { in: skuKeys },
    },
    include: { product: { select: { id: true, name: true, sku: true } } },
  });
  const mappingMap = new Map(mappings.map((m) => [m.externalSku, m]));

  let result = items.map((item) => {
    const mapping = mappingMap.get(item.externalSku);
    return {
      ...item,
      mapping: mapping
        ? {
            id: mapping.id,
            displayName: mapping.displayName,
            productId: mapping.productId,
            productName: mapping.product?.name ?? null,
            productSku: mapping.product?.sku ?? null,
          }
        : null,
    };
  });

  if (mapped === "true") result = result.filter((r) => r.mapping?.productId);
  if (mapped === "false") result = result.filter((r) => !r.mapping?.productId);

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/external-inventory/route.ts
git commit -m "feat: add external inventory API with SKU mapping join"
```

---

### Task 5: CGETC Inventory 프론트 페이지

**Files:**
- Create: `src/app/inventory/cgetc/page.tsx`
- Create: `src/components/inventory/cgetc-inventory-table.tsx`
- Create: `src/components/inventory/sku-mapping-modal.tsx`

- [ ] **Step 1: SKU Mapping Modal 컴포넌트**

`src/components/inventory/sku-mapping-modal.tsx`:

```tsx
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
```

- [ ] **Step 2: CGETC Inventory Table 컴포넌트**

`src/components/inventory/cgetc-inventory-table.tsx`:

```tsx
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
```

- [ ] **Step 3: CGETC Inventory 페이지**

`src/app/inventory/cgetc/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { CgetcInventoryTable } from "@/components/inventory/cgetc-inventory-table";
import Link from "next/link";

export default async function CgetcInventoryPage() {
  const hoiCompany = await prisma.company.findFirst({
    where: { name: "HOI" },
    select: { id: true, name: true },
  });

  if (!hoiCompany) {
    return <p className="text-sm text-[var(--text-tertiary)]">HOI company not found</p>;
  }

  const lastSync = await prisma.syncJob.findFirst({
    where: { platform: "CGETC", status: "SUCCESS" },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  const totalExternal = await prisma.externalInventory.count({
    where: { companyId: hoiCompany.id, platform: "CGETC" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm"
          >
            &larr; Inventory
          </Link>
          <h1 className="text-xl font-bold tracking-tight">CGETC 3PL Inventory</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
          {lastSync?.completedAt && (
            <span>
              Last sync: {new Date(lastSync.completedAt).toLocaleString("en-US")}
            </span>
          )}
          <span>{totalExternal.toLocaleString()} SKUs synced</span>
        </div>
      </div>

      <CgetcInventoryTable companyId={hoiCompany.id} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/inventory/cgetc/page.tsx src/components/inventory/cgetc-inventory-table.tsx src/components/inventory/sku-mapping-modal.tsx
git commit -m "feat: add CGETC inventory page with SKU mapping UI"
```

---

### Task 6: Products API (sku-mapping-modal에서 사용)

**Files:**
- Create: `src/app/api/products/route.ts`

- [ ] **Step 1: Products GET API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const where = companyId ? { companyId } : {};

  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, sku: true, category: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/products/route.ts
git commit -m "feat: add products list API for SKU mapping"
```

---

### Task 7: Inventory 페이지에 CGETC 링크 추가

**Files:**
- Modify: `src/app/inventory/page.tsx`

- [ ] **Step 1: CGETC 3PL 카드 추가**

`src/app/inventory/page.tsx`의 return문에서 `</div>` 마지막 닫기 태그 전, `</Card>` 아래에 추가:

```tsx
      <a href="/inventory/cgetc" className="block group">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
                <span className="text-accent text-sm font-bold">C</span>
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight">CGETC 3PL Inventory</h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  View and map external SKUs from CGETC warehouse
                </p>
              </div>
            </div>
            <span className="text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors text-sm">
              &rarr;
            </span>
          </div>
        </Card>
      </a>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/inventory/page.tsx
git commit -m "feat: add CGETC 3PL inventory link to inventory page"
```

---

### Task 8: CGETC Sync 재실행 + 검증

- [ ] **Step 1: CGETC sync 재실행**

브라우저에서 `localhost:4000/settings/integrations` → CGETC Sync Now 클릭
또는 API로:
```bash
curl -b /tmp/erp_cookies.txt -X POST http://localhost:4000/api/sync/cgetc \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<HOI_ID>"}'
```

Expected: ExternalInventory에 4,466+ 레코드 생성

- [ ] **Step 2: CGETC Inventory 페이지 확인**

브라우저에서 `localhost:4000/inventory/cgetc` 접속
Expected: SKU 목록 표시, 검색/필터 동작, 매핑 모달 동작

- [ ] **Step 3: SKU 매핑 테스트**

하나의 CGETC SKU를 HOI Product에 매핑 후 재동기화
Expected: 매핑된 SKU의 재고가 Inventory 테이블에 반영

- [ ] **Step 4: Commit (credentials modal fix)**

```bash
git add src/components/integrations/credentials-modal.tsx
git commit -m "fix: CGETC credentials modal field names (partnerId → db)"
```
