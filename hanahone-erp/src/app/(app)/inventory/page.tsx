import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchCgetcInventory, type CgetcProduct } from "@/lib/integrations/connectors/cgetc";
import { decrypt } from "@/lib/integrations/encryption";
import { HokInventoryClient, type BomEntry, type GongguInventoryRow, type InventoryRow as HokInventoryRow } from "@/components/inventory/HokInventoryClient";
import { InventoryBreakdownGrid, type InventoryBreakdownItem, type ChannelSales } from "@/components/inventory/InventoryBreakdown";
import { ChannelBreakdownCard, type ChannelBreakdownRow } from "@/components/inventory/ChannelBreakdownCard";

type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  warehouse: string;
  company: string;
  quantity: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  source: "internal" | "cgetc";
  baseline: number | null;
  baselineDate: string | null;
  burnRate: number | null;
  daysLeft: number | null;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const where = searchParams.company ? { companyId: searchParams.company } : {};

  const [inventories, cgetcConfig, baselines] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: {
        product: { select: { name: true, sku: true } },
        company: { select: { name: true } },
      },
      orderBy: { quantity: "asc" },
    }),
    prisma.integrationConfig.findFirst({
      where: { platform: "CGETC", isActive: true },
    }),
    prisma.inventoryBaseline.findMany(),
  ]);

  // Fetch CGETC inventory only when viewing HOI or Group (all)
  const showCgetc = !searchParams.company || searchParams.company === cgetcConfig?.companyId;
  let cgetcProducts: CgetcProduct[] = [];
  let cgetcError: string | null = null;
  if (cgetcConfig && showCgetc) {
    try {
      const credentials = JSON.parse(decrypt(cgetcConfig.credentials));
      cgetcProducts = await fetchCgetcInventory(credentials);

      // Auto-register CGETC products in Products table
      for (const cp of cgetcProducts) {
        if (!cp.sku) continue;
        await prisma.product.upsert({
          where: { sku_companyId: { sku: cp.sku, companyId: cgetcConfig.companyId } },
          update: { name: cp.name },
          create: {
            name: cp.name,
            sku: cp.sku,
            category: "CGETC",
            basePrice: 0,
            costPrice: 0,
            companyId: cgetcConfig.companyId,
          },
        });
      }
    } catch (_err: any) {
      cgetcError = _err.message || "Failed to fetch CGETC inventory";
    }
  }

  // Calculate 30-day burn rate per product
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSales = await prisma.orderItem.findMany({
    where: {
      order: {
        ...(searchParams.company ? { companyId: searchParams.company } : {}),
        orderDate: { gte: thirtyDaysAgo },
      },
    },
    include: {
      product: { select: { sku: true, name: true } },
      order: { select: { externalSource: true, notes: true, type: true, companyId: true } },
    },
  });
  const salesByProduct = new Map<string, number>();
  const salesBySku = new Map<string, number>();
  // Channel breakdown per SKU per company, last 30 days.
  const channelBreakdown = new Map<string, ChannelSales>(); // key: companyId::sku
  // Variant breakdown per SKU per company (Shopify line_item title etc.)
  const variantBreakdown = new Map<string, Record<string, number>>(); // key: companyId::sku
  // Per-channel variant rows per company (for channel cards)
  // key: companyId::channel::variantName::variantSku::masterSku
  type ChannelRowKey = string;
  const channelRowAgg = new Map<
    ChannelRowKey,
    {
      companyId: string;
      channel: string;
      variantName: string;
      variantSku: string | null;
      masterSku: string;
      masterName: string;
      qty: number;
    }
  >();
  for (const item of recentSales) {
    const orderType = item.order.type;
    // Count towards burn rate only for revenue-bearing orders.
    const isRevenue = orderType === "SALE" || orderType === "BROKERAGE" || orderType === "REVIEW";
    if (isRevenue) {
      if (item.productId) {
        salesByProduct.set(item.productId, (salesByProduct.get(item.productId) || 0) + item.quantity);
      }
      if (item.product?.sku) {
        salesBySku.set(item.product.sku, (salesBySku.get(item.product.sku) || 0) + item.quantity);
      }
    }

    if (!item.product?.sku) continue;
    let channel: string = item.order.externalSource || "MANUAL";
    if (orderType === "SEEDING") channel = "SEEDING";
    else if (orderType === "GIFT") channel = "GIFT";
    else if (orderType === "REVIEW") channel = "REVIEW";
    else if (channel === "NAVER" && item.order.notes === "공구") channel = "GONGGU";
    else if (channel === "CGETC" && item.order.notes?.toLowerCase().startsWith("free gifting")) channel = "SEEDING";

    const key = `${item.order.companyId}::${item.product.sku}`;
    const breakdown = channelBreakdown.get(key) || {};
    (breakdown as any)[channel] = ((breakdown as any)[channel] || 0) + item.quantity;
    channelBreakdown.set(key, breakdown);

    const variant = item.externalVariantName?.trim();
    if (variant) {
      const vb = variantBreakdown.get(key) || {};
      vb[variant] = (vb[variant] || 0) + item.quantity;
      variantBreakdown.set(key, vb);
    }

    // Per-channel variant row aggregation (for channel cards below 전체 재고).
    // Skip non-channel sources (internal/manual) and aux order types (SEEDING/GIFT/TRANSFER)
    // since those surface elsewhere.
    const src = item.order.externalSource;
    if (src && orderType !== "SEEDING" && orderType !== "GIFT" && orderType !== "REVIEW" && orderType !== "INTER_COMPANY") {
      const variantName = (item.externalVariantName || item.product?.name || "").trim();
      if (variantName) {
        const variantSku = item.externalVariantSku?.trim() || null;
        const masterSku = item.product!.sku;
        const masterName = item.product!.name;
        const aggKey = `${item.order.companyId}::${src}::${variantName}::${variantSku ?? ""}::${masterSku}`;
        const row = channelRowAgg.get(aggKey);
        if (row) {
          row.qty += item.quantity;
        } else {
          channelRowAgg.set(aggKey, {
            companyId: item.order.companyId,
            channel: src,
            variantName,
            variantSku,
            masterSku,
            masterName,
            qty: item.quantity,
          });
        }
      }
    }
  }

  // Group channelRowAgg into Map<companyId, Map<channel, rows>>.
  const channelRowsByCompany = new Map<string, Map<string, ChannelBreakdownRow[]>>();
  for (const r of Array.from(channelRowAgg.values())) {
    const perCompany = channelRowsByCompany.get(r.companyId) || new Map<string, ChannelBreakdownRow[]>();
    const list = perCompany.get(r.channel) || [];
    list.push({
      variantName: r.variantName,
      variantSku: r.variantSku,
      masterSku: r.masterSku,
      masterName: r.masterName,
      qty30d: r.qty,
    });
    perCompany.set(r.channel, list);
    channelRowsByCompany.set(r.companyId, perCompany);
  }

  // Map company name → id for breakdown lookup (rows only carry company name).
  const companiesAll = await prisma.company.findMany({ select: { id: true, name: true } });
  const companyIdByName = new Map(companiesAll.map((c) => [c.name, c.id]));

  // Merge into unified rows — exclude internal records that overlap with CGETC live data
  const cgetcSkus = new Set(cgetcProducts.map((p) => p.sku));
  const filteredInventories = inventories.filter(
    (inv) => !(inv.warehouseLocation === "CGETC" && inv.product.sku && cgetcSkus.has(inv.product.sku))
  );

  // Build baseline lookup for CGETC products (quantity + date)
  const baselineBySku = new Map<string, { quantity: number; setAt: Date }>();
  for (const bl of baselines) {
    if (!baselineBySku.has(bl.sku)) {
      baselineBySku.set(bl.sku, { quantity: bl.quantity, setAt: bl.setAt });
    }
  }

  const rows: InventoryRow[] = [
    ...filteredInventories.map((inv) => {
      const sold30d = salesByProduct.get(inv.productId) || 0;
      const burnRate = sold30d > 0 ? sold30d / 30 : null;
      const daysLeft = burnRate ? Math.round(inv.quantity / burnRate) : null;
      return {
        id: inv.id,
        sku: inv.product.sku || "",
        name: inv.product.name,
        warehouse: inv.warehouseLocation,
        company: inv.company.name,
        quantity: inv.quantity,
        reserved: 0,
        available: inv.quantity,
        reorderLevel: inv.reorderLevel,
        source: "internal" as const,
        baseline: null,
        baselineDate: null,
        burnRate,
        daysLeft,
      };
    }),
    ...cgetcProducts.map((p) => {
      const bl = baselineBySku.get(p.sku);
      // Use SKU-based sales lookup for CGETC products
      const sold30d = salesBySku.get(p.sku) || 0;
      const burnRate = sold30d > 0 ? sold30d / 30 : null;
      const daysLeft = burnRate ? Math.round(p.quantity / burnRate) : null;
      return {
        id: `cgetc-${p.sku}`,
        sku: p.sku,
        name: p.name,
        warehouse: "CGETC",
        company: "HOI",
        quantity: p.quantity,
        reserved: p.reserved,
        available: p.available,
        reorderLevel: 0,
        source: "cgetc" as const,
        baseline: bl?.quantity ?? null,
        baselineDate: bl?.setAt.toISOString() ?? null,
        burnRate,
        daysLeft,
      };
    }),
  ];

  const columns = [
    {
      key: "name",
      header: "Product",
      render: (row: InventoryRow) => (
        <span className={`font-semibold ${row.source === "internal" && row.quantity <= row.reorderLevel ? "text-rose-500" : ""}`}>
          {row.name}
        </span>
      ),
    },
    {
      key: "warehouse",
      header: "Warehouse",
      render: (row: InventoryRow) => (
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)]">{row.warehouse}</span>
          {row.source === "cgetc" && (
            <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-600/[0.08] text-blue-600">3PL</span>
          )}
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row: InventoryRow) => (
        <span className="text-[var(--text-secondary)]">{row.company}</span>
      ),
    },
    {
      key: "baseline",
      header: "Baseline",
      align: "right" as const,
      render: (row: InventoryRow) => {
        if (row.baseline === null) return <span className="text-[var(--text-quaternary)]">—</span>;
        return (
          <div className="text-right">
            <span className="font-semibold">{row.baseline.toLocaleString()}</span>
            {row.baselineDate && (
              <div className="text-[10px] text-[var(--text-tertiary)]">
                {new Date(row.baselineDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "quantity",
      header: "On Hand",
      align: "right" as const,
      render: (row: InventoryRow) => {
        const diff = row.baseline !== null ? row.quantity - row.baseline : null;
        return (
          <div className="text-right">
            <span className={`font-semibold ${row.source === "internal" && row.quantity <= row.reorderLevel ? "text-rose-500" : ""}`}>
              {row.quantity.toLocaleString()}
            </span>
            {diff !== null && diff !== 0 && (
              <div className={`text-[10px] font-medium ${diff < 0 ? "text-rose-500" : "text-amber-500"}`}>
                {diff > 0 ? `+${diff}` : diff}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "reserved",
      header: "Reserved",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className={`${row.reserved > 0 ? "text-orange-600 font-semibold" : "text-[var(--text-tertiary)]"}`}>
          {row.reserved}
        </span>
      ),
    },
    {
      key: "available",
      header: "Available",
      align: "right" as const,
      render: (row: InventoryRow) => (
        <span className="font-semibold text-teal-600">
          {row.available}
        </span>
      ),
    },
    {
      key: "daysLeft",
      header: "Days Left",
      align: "right" as const,
      render: (row: InventoryRow) => {
        if (row.daysLeft === null) return <span className="text-[var(--text-quaternary)]">—</span>;
        const color = row.daysLeft <= 7 ? "text-rose-500" : row.daysLeft <= 30 ? "text-amber-500" : "text-teal-600";
        return (
          <div className="text-right">
            <span className={`font-semibold ${color}`}>{row.daysLeft}d</span>
            {row.burnRate !== null && (
              <div className="text-[10px] text-[var(--text-tertiary)]">{row.burnRate.toFixed(1)}/day</div>
            )}
          </div>
        );
      },
    },
  ];

  const lowStockCount = inventories.filter((inv) => inv.quantity <= inv.reorderLevel).length;

  // Master on-hand lookup for enriching channel rows with 현 재고.
  // Keyed by companyId::masterSku — sums across warehouses for the same SKU.
  const masterOnHandByKey = new Map<string, number>();
  for (const r of rows) {
    if (!r.sku) continue;
    const companyId = companyIdByName.get(r.company);
    if (!companyId) continue;
    const k = `${companyId}::${r.sku}`;
    masterOnHandByKey.set(k, (masterOnHandByKey.get(k) || 0) + r.quantity);
  }
  for (const [companyId, perChannel] of Array.from(channelRowsByCompany.entries())) {
    for (const [, list] of Array.from(perChannel.entries())) {
      for (const r of list) {
        r.masterOnHand = masterOnHandByKey.get(`${companyId}::${r.masterSku}`);
      }
    }
  }

  // HOK-specific: check if viewing HOK company
  const hokCompany = await prisma.company.findFirst({ where: { name: { contains: "HOK" } }, select: { id: true } });
  const isHokView = searchParams.company === hokCompany?.id;

  // HOK baselines for 전체 카드
  const hokBaselines = isHokView
    ? await prisma.inventoryBaseline.findMany({
        where: { companyId: hokCompany!.id },
        orderBy: { setAt: "desc" },
      })
    : [];
  // Deduplicate baselines by SKU (latest per SKU)
  const hokBaselineMap = new Map<string, { sku: string; productName: string; quantity: number }>();
  for (const b of hokBaselines) {
    if (!hokBaselineMap.has(b.sku)) {
      hokBaselineMap.set(b.sku, { sku: b.sku, productName: b.productName, quantity: b.quantity });
    }
  }
  const hokBaselineItems = Array.from(hokBaselineMap.values());

  // HOK: calculate reserved from unfulfilled orders
  if (isHokView) {
    const unfulfilledItems = await prisma.orderItem.findMany({
      where: {
        order: {
          companyId: hokCompany!.id,
          fulfillmentStatus: { in: ["UNFULFILLED", "PARTIALLY_FULFILLED"] },
        },
        productId: { not: undefined },
      },
      select: { productId: true, quantity: true },
    });
    const reservedByProduct = new Map<string, number>();
    for (const item of unfulfilledItems) {
      if (item.productId) {
        reservedByProduct.set(item.productId, (reservedByProduct.get(item.productId) || 0) + item.quantity);
      }
    }
    // Patch rows with reserved/available for HOK
    for (const row of rows) {
      // Match by inventory id → find the productId from the original inventory record
      const inv = inventories.find((i) => i.id === row.id);
      if (inv) {
        const reserved = reservedByProduct.get(inv.productId) || 0;
        row.reserved = reserved;
        row.available = row.quantity - reserved;
      }
    }
  }

  // HOK: split rows into regular vs 공구
  const hokRegularRows = isHokView ? rows.filter((r) => !r.name.includes("공구")) : [];
  const hokGongguRows = isHokView ? rows.filter((r) => r.name.includes("공구")) : [];

  // HOK: fetch BOM for gonggu → component deduction calculation
  const hokBomEntries: BomEntry[] = [];
  const naverProductNoByProductId = new Map<string, string>();
  if (isHokView) {
    const bom = await prisma.billOfMaterials.findMany({
      where: { companyId: hokCompany!.id },
      include: {
        finishedProduct: { select: { sku: true } },
        rawMaterial: { select: { sku: true } },
      },
    });
    for (const b of bom) {
      if (b.finishedProduct.sku && b.rawMaterial.sku) {
        hokBomEntries.push({
          finishedSku: b.finishedProduct.sku,
          rawSku: b.rawMaterial.sku,
          quantityRequired: Number(b.quantityRequired),
        });
      }
    }

    // Fetch Naver product number mappings (원상품 + 공구)
    const naverMappings = await prisma.skuMapping.findMany({
      where: {
        companyId: hokCompany!.id,
        platform: "NAVER",
        productId: { not: null },
        OR: [
          { displayName: { contains: "원상품" } },
          { isGonggu: true },
        ],
      },
      select: { externalSku: true, productId: true },
    });
    for (const m of naverMappings) {
      if (m.productId) naverProductNoByProductId.set(m.productId, m.externalSku);
    }
    // Attach naverProductNo to rows
    for (const row of rows) {
      const inv = inventories.find((i) => i.id === row.id);
      if (inv) {
        const naverNo = naverProductNoByProductId.get(inv.productId);
        if (naverNo) (row as any).naverProductNo = naverNo;
      }
    }
  }

  // HOK: rocket growth (쿠팡 풀필먼트) inventory — Coupang's own warehouse
  // holds units we sent in. Distinct from the seller's master inventory.
  // Mapped rows show with their master sku for reconciliation; orphans get
  // a "매핑 안 됨" badge.
  type RocketGrowthInventoryItem = {
    vendorItemId: string;
    displayName: string;
    quantity: number;
    masterSku: string | null;
    masterName: string | null;
  };
  const hokRocketGrowthInventory: RocketGrowthInventoryItem[] = [];
  if (isHokView) {
    const rgRows = await prisma.externalInventory.findMany({
      where: { companyId: hokCompany!.id, platform: "COUPANG" },
      select: { externalSku: true, externalName: true, quantity: true },
      orderBy: { quantity: "desc" },
    });
    if (rgRows.length > 0) {
      const coupangMappings = await prisma.skuMapping.findMany({
        where: {
          companyId: hokCompany!.id,
          platform: "COUPANG",
          externalSku: { in: rgRows.map((r) => r.externalSku) },
        },
        select: { externalSku: true, displayName: true, product: { select: { sku: true, name: true } } },
      });
      const mapByExternalSku = new Map(coupangMappings.map((m) => [m.externalSku, m]));
      for (const r of rgRows) {
        const m = mapByExternalSku.get(r.externalSku);
        hokRocketGrowthInventory.push({
          vendorItemId: r.externalSku,
          displayName: m?.displayName ?? r.externalName ?? `로켓그로스 ${r.externalSku}`,
          quantity: r.quantity,
          masterSku: m?.product?.sku ?? null,
          masterName: m?.product?.name ?? null,
        });
      }
    }
  }

  // HOK: orphan ExternalInventory rows — Naver products synced but not yet
  // mapped to any internal Product. Surface them so a newly-registered
  // smartstore product (e.g. a fresh 공구) shows up immediately and the user
  // can register it without re-typing the product number.
  //
  // For each orphan we pre-compute a master suggestion based on productName
  // keywords (공구/N개입), so the UI can offer one-click "이 마스터로 매핑"
  // without forcing the user to think.
  type OrphanItem = {
    externalSku: string;
    externalName: string;
    quantity: number;
    suggestedMasterId: string | null;
    suggestedMasterSku: string | null;
    suggestedMasterName: string | null;
    suggestedIsGonggu: boolean;
  };
  function isGongguName(name: string): boolean {
    // "공구" 명시 또는 "X일분" 옵션 표기 (예: "5일분 1개(5개입)"). 공구 통합상품의
    // 옵션은 BOM이 다 다르므로 자동 매핑하면 매출 잘못 잡힘.
    return /공구|gonggu/i.test(name) || /\d+\s?일분/.test(name);
  }

  function suggestMaster(
    externalName: string,
    masters: { id: string; sku: string; name: string }[],
  ): { id: string; sku: string; name: string } | null {
    const name = externalName ?? "";
    if (isGongguName(name)) return null;
    // Pick the LAST "N개입" mention. Channel productNames sometimes list
    // a category prefix ("5개입, 30개입 ...") then specify the actual variant
    // at the end ("...정제 1.2g 5개입") — the last one wins.
    const matches = Array.from(name.matchAll(/(\d+)\s?개입/g));
    if (matches.length === 0) return null;
    const last = matches[matches.length - 1][1];
    const m30 = masters.find((p) => p.sku === "ODD-M01-30");
    const m5 = masters.find((p) => p.sku === "ODD-M01-5");
    if (last === "30" && m30) return m30;
    if (last === "5" && m5) return m5;
    return null;
  }

  const hokOrphanNaverItems: OrphanItem[] = [];
  const hokOrphanCoupangItems: OrphanItem[] = [];
  if (isHokView) {
    const masters = await prisma.product.findMany({
      where: { companyId: hokCompany!.id },
      select: { id: true, sku: true, name: true },
    });

    for (const platform of ["NAVER", "COUPANG"] as const) {
      const platformMappings = await prisma.skuMapping.findMany({
        where: { companyId: hokCompany!.id, platform },
        select: { externalSku: true },
      });
      const mappedSet = new Set(platformMappings.map((m) => m.externalSku));
      const externalRows = await prisma.externalInventory.findMany({
        where: { companyId: hokCompany!.id, platform },
        select: { externalSku: true, externalName: true, quantity: true },
        orderBy: { quantity: "desc" },
      });
      const target = platform === "NAVER" ? hokOrphanNaverItems : hokOrphanCoupangItems;
      for (const e of externalRows) {
        if (mappedSet.has(e.externalSku)) continue;
        const name = e.externalName ?? "";
        const isGonggu = isGongguName(name);
        const suggestion = suggestMaster(name, masters);
        target.push({
          externalSku: e.externalSku,
          externalName: name,
          quantity: e.quantity,
          suggestedMasterId: suggestion?.id ?? null,
          suggestedMasterSku: suggestion?.sku ?? null,
          suggestedMasterName: suggestion?.name ?? null,
          suggestedIsGonggu: isGonggu,
        });
      }
    }
  }

  // Group view: separate sections per company
  const isGroupView = !searchParams.company;
  const companyGroups = isGroupView
    ? Array.from(
        rows.reduce((map, r) => {
          const group = map.get(r.company) || { rows: [] as InventoryRow[] };
          group.rows.push(r);
          map.set(r.company, group);
          return map;
        }, new Map<string, { rows: InventoryRow[] }>())
      ).sort(([a], [b]) => a.localeCompare(b))
    : null;

  // Channel-allocation products: internal records for HOI subscription-style
  // SKUs (e.g. Monthly Subscription) that duplicate a CGETC master product.
  // They surface under a separate "구독 채널" section, not 전체 재고.
  function isChannelAllocationRow(r: InventoryRow): boolean {
    if (r.source !== "internal") return false;
    if (!/subscription|subscribe|구독|monthly/i.test(r.name)) return false;
    return true;
  }

  // Hide zero-quantity phantom channel rows (e.g. Monthly Subscription after
  // its SkuMapping was pointed at the real Refill product).
  function isVisibleChannelRow(r: InventoryRow): boolean {
    return r.quantity > 0;
  }

  // Build breakdown items (for HOI, HOR, and Group views — HOK uses its
  // own editable client component). Skip SKUs without a sku.
  function rowsToBreakdown(rs: InventoryRow[]): InventoryBreakdownItem[] {
    return rs
      .filter((r) => r.sku)
      .map((r) => {
        const companyId = companyIdByName.get(r.company);
        const key = companyId ? `${companyId}::${r.sku}` : "";
        const channels = (channelBreakdown.get(key) || {}) as ChannelSales;
        const variants = variantBreakdown.get(key);
        return {
          sku: r.sku,
          name: r.name,
          warehouse: r.warehouse,
          onHand: r.quantity,
          baseline: r.baseline !== null && r.baselineDate
            ? { quantity: r.baseline, setAt: r.baselineDate }
            : null,
          reorderLevel: r.reorderLevel,
          reserved: r.reserved,
          channelSales: channels,
          variantSales: variants,
        };
      })
      .sort((a, b) => b.onHand - a.onHand);
  }

  // Split rows into primary (전체 재고) vs channel allocation (구독 등).
  function splitPrimaryAndChannel(rs: InventoryRow[]): {
    primary: InventoryRow[];
    channel: InventoryRow[];
  } {
    const primary: InventoryRow[] = [];
    const channel: InventoryRow[] = [];
    for (const r of rs) {
      if (isChannelAllocationRow(r)) {
        if (isVisibleChannelRow(r)) channel.push(r);
      } else {
        primary.push(r);
      }
    }
    return { primary, channel };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Inventory</h1>
        <div className="flex items-center gap-3">
          {cgetcProducts.length > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              CGETC live
            </span>
          )}
          {lowStockCount > 0 && (
            <span className="text-xs font-semibold text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full">
              {lowStockCount} item{lowStockCount > 1 ? "s" : ""} below reorder level
            </span>
          )}
        </div>
      </div>
      {cgetcError && (
        <div className="px-3 py-2 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-600">
          CGETC sync error: {cgetcError}
        </div>
      )}

      {/* HOK: 전체 + 일반/공구 섹션 (client component for inline editing) */}
      {isHokView ? (
        <>
          <HokInventoryClient
            baselines={hokBaselineItems}
            gongguRows={hokGongguRows.map((r): GongguInventoryRow => {
              const inv = inventories.find((i) => i.id === r.id);
              const naverNo = inv ? naverProductNoByProductId.get(inv.productId) : undefined;
              return {
                id: r.id,
                productId: inv?.productId || "",
                sku: r.sku,
                name: r.name,
                quantity: r.quantity,
                reserved: r.reserved,
                available: r.available,
                naverProductNo: naverNo,
              };
            })}
            regularRows={hokRegularRows as HokInventoryRow[]}
            bomEntries={hokBomEntries}
            companyId={hokCompany!.id}
            channelSalesBySku={Object.fromEntries(
              hokRegularRows
                .filter((r) => r.sku)
                .map((r) => {
                  const key = `${hokCompany!.id}::${r.sku}`;
                  return [r.sku, (channelBreakdown.get(key) || {}) as ChannelSales];
                }),
            )}
            variantSalesBySku={Object.fromEntries(
              hokRegularRows
                .filter((r) => r.sku)
                .map((r) => {
                  const key = `${hokCompany!.id}::${r.sku}`;
                  return [r.sku, variantBreakdown.get(key) || {}];
                }),
            )}
            orphanNaverItems={hokOrphanNaverItems}
            orphanCoupangItems={hokOrphanCoupangItems}
            rocketGrowthInventory={hokRocketGrowthInventory}
          />
          {(() => {
            const hokChannels = channelRowsByCompany.get(hokCompany!.id);
            if (!hokChannels) return null;
            // For HOK, 스마트스토어(NAVER regular) and 공구(GONGGU) already
            // surface above with full interactive tables. Only render the
            // supplementary channel cards for channels that don't have a
            // dedicated section — starting with 쿠팡.
            const SKIP = new Set(["NAVER", "GONGGU"]);
            return sortedChannels(Array.from(hokChannels.keys()))
              .filter((ch) => !SKIP.has(ch))
              .map((ch) => (
                <ChannelBreakdownCard
                  key={ch}
                  channel={ch}
                  rows={hokChannels.get(ch) || []}
                />
              ));
          })()}
        </>
      ) : companyGroups ? (
        companyGroups.map(([companyName, group]) => {
          const { primary, channel } = splitPrimaryAndChannel(group.rows);
          const primaryItems = rowsToBreakdown(primary);
          const channelItems = rowsToBreakdown(channel);
          const companyId = companyIdByName.get(companyName);
          const channelsForCompany = companyId ? channelRowsByCompany.get(companyId) : null;
          return (
            <div key={companyName} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                {companyName} <span className="text-[var(--text-quaternary)]">({group.rows.length})</span>
              </h2>
              {primaryItems.length === 0 && channelItems.length === 0 ? (
                <Card>
                  <EmptyState title="No inventory" description="No inventory records found." />
                </Card>
              ) : (
                <>
                  {primaryItems.length > 0 && (
                    <InventoryBreakdownGrid items={primaryItems} title={`${companyName} 전체 재고`} />
                  )}
                  {channelItems.length > 0 && (
                    <InventoryBreakdownGrid items={channelItems} title={`${companyName} 구독 채널`} />
                  )}
                  {channelsForCompany &&
                    sortedChannels(Array.from(channelsForCompany.keys())).map((ch) => (
                      <ChannelBreakdownCard
                        key={`${companyName}-${ch}`}
                        channel={ch}
                        rows={channelsForCompany.get(ch) || []}
                        companyLabel={companyName}
                      />
                    ))}
                </>
              )}
            </div>
          );
        })
      ) : (
        (() => {
          const { primary, channel } = splitPrimaryAndChannel(rows);
          const primaryItems = rowsToBreakdown(primary);
          const channelItems = rowsToBreakdown(channel);
          const singleCompanyId = searchParams.company;
          const channelsForCompany = singleCompanyId
            ? channelRowsByCompany.get(singleCompanyId)
            : null;
          if (primaryItems.length === 0 && channelItems.length === 0) {
            return (
              <Card>
                <EmptyState title="No inventory" description="No inventory records found." />
              </Card>
            );
          }
          return (
            <>
              {primaryItems.length > 0 && (
                <InventoryBreakdownGrid items={primaryItems} />
              )}
              {channelItems.length > 0 && (
                <InventoryBreakdownGrid items={channelItems} title="구독 채널" />
              )}
              {channelsForCompany &&
                sortedChannels(Array.from(channelsForCompany.keys())).map((ch) => (
                  <ChannelBreakdownCard
                    key={ch}
                    channel={ch}
                    rows={channelsForCompany.get(ch) || []}
                  />
                ))}
            </>
          );
        })()
      )}
    </div>
  );
}

/**
 * Channel display order: mirror the company-channel map so Shopify/Amazon/TikTok
 * come first for HOI, 네이버/쿠팡/약국 for HOK, etc. Unknown channels go last.
 */
function sortedChannels(channels: string[]): string[] {
  const order = ["SHOPIFY", "AMAZON", "TIKTOK", "NAVER", "COUPANG", "PHARMACY", "CGETC"];
  return channels.slice().sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
