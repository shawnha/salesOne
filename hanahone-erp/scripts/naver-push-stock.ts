/**
 * Push HOK 스마트스토어 가용 재고 → Naver Commerce stock endpoint.
 *
 * Mirrors what the "네이버 재고 동기화" button on the Inventory page does:
 *   for each NAVER SkuMapping owned by HOK, take the regular-row available
 *   quantity (master on-hand minus gonggu allocations) and PUT it to Naver.
 *
 * Runs from the home IP via the existing launchd cron (com.hanahone.naver-sync)
 * because Naver's OpenAPI requires the IP whitelist registered in their seller
 * console.
 */
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { updateNaverStock } from "@/lib/integrations/naver/products";
import type { NaverCredentials } from "@/lib/integrations/naver/types";

async function main() {
  const startedAt = new Date();
  console.log(`[${startedAt.toISOString()}] Naver stock push started`);

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "NAVER", isActive: true },
  });
  if (!config) {
    console.error("No active NAVER integration found");
    process.exit(1);
  }

  const companyId = config.companyId;
  const credentials: NaverCredentials = JSON.parse(decrypt(config.credentials));

  // Naver SKU mappings: each one has externalSku == naverProductNo and a productId
  // pointing at the master Inventory row to draw the gonggu-adjusted available
  // count from. Skip rows missing productId — they can't be reconciled to stock.
  const mappingRows = await prisma.skuMapping.findMany({
    where: { companyId, platform: "NAVER", productId: { not: null } },
    select: {
      externalSku: true,
      displayName: true,
      productId: true,
      isGonggu: true,
    },
  });
  const mappings = mappingRows.filter(
    (m): m is typeof m & { productId: string } => m.productId !== null,
  );

  // Inventory rows for HOK
  const inventories = await prisma.inventory.findMany({
    where: { companyId },
    select: {
      productId: true,
      quantity: true,
      product: { select: { name: true, sku: true } },
    },
  });
  type InvRow = (typeof inventories)[0];
  const invByProduct = new Map<string, InvRow>(inventories.map((i) => [i.productId, i]));

  // Gonggu allocations by product (BOM: each gonggu inventory consumes N starter+M refill)
  const bom = await prisma.billOfMaterials.findMany({
    where: { companyId },
    include: {
      finishedProduct: { select: { id: true, sku: true } },
      rawMaterial: { select: { id: true, sku: true } },
    },
  });
  // For each finished gonggu product, count its on-hand and multiply by BOM qty
  const gongguMappings = mappings.filter((m) => m.isGonggu);
  const allocationByMasterProductId = new Map<string, number>();
  for (const gm of gongguMappings) {
    const finishedInv = invByProduct.get(gm.productId);
    const finishedQty = finishedInv?.quantity ?? 0;
    if (finishedQty <= 0) continue;
    const finishedSku: string | null = finishedInv?.product.sku ?? null;
    if (!finishedSku) continue;
    const components = bom.filter((b) => b.finishedProduct.sku === finishedSku);
    for (const c of components) {
      const masterPid = c.rawMaterial.id;
      const need = Number(c.quantityRequired) * finishedQty;
      allocationByMasterProductId.set(
        masterPid,
        (allocationByMasterProductId.get(masterPid) || 0) + need,
      );
    }
  }

  // Build push items for non-gonggu mappings (regular smartstore SKUs).
  // Skip rows where gonggu allocations exceed master stock — pushing 0 in that
  // case would silently mark the listing OUTOFSTOCK while we figure out the
  // BOM/oversell mismatch.
  const pushItems: { naverProductNo: string; quantity: number; label: string }[] = [];
  const skippedOversold: { label: string; master: number; allocated: number }[] = [];
  for (const m of mappings) {
    if (m.isGonggu) continue;
    const inv = invByProduct.get(m.productId);
    if (!inv) continue;
    const allocated = allocationByMasterProductId.get(m.productId) ?? 0;
    const available = inv.quantity - allocated;
    if (available < 0) {
      skippedOversold.push({
        label: m.displayName ?? inv.product.name ?? "(unnamed)",
        master: inv.quantity,
        allocated,
      });
      continue;
    }
    pushItems.push({
      naverProductNo: m.externalSku,
      quantity: available,
      label: m.displayName ?? inv.product.name ?? "(unnamed)",
    });
  }

  if (skippedOversold.length > 0) {
    console.log(`Skipping ${skippedOversold.length} oversold SKU(s) — fix BOM or stock first:`);
    for (const s of skippedOversold) {
      console.log(`  ⚠ ${s.label}: master=${s.master} allocated=${s.allocated} (deficit ${s.allocated - s.master})`);
    }
  }

  console.log(`Pushing ${pushItems.length} regular SKUs to Naver`);

  let ok = 0;
  let failed = 0;
  for (const item of pushItems) {
    try {
      await updateNaverStock(credentials, item.naverProductNo, item.quantity);
      console.log(`  ✓ ${item.label} [${item.naverProductNo}] → ${item.quantity}`);
      ok++;
    } catch (err) {
      console.error(
        `  ✗ ${item.label} [${item.naverProductNo}]: ${(err as Error).message}`,
      );
      failed++;
    }
  }

  console.log(`Done — ok=${ok} failed=${failed}`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
