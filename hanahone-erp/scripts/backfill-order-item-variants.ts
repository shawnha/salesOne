/**
 * Backfill OrderItem.externalVariantName/Sku from ExternalOrder.rawData.
 *
 * Per-platform extractors recover the original channel-level title/sku for each
 * line item, then we walk OrderItems and fill missing variant fields. Matching
 * uses productId first (via SkuMapping → Product.sku) with a positional fallback
 * — same logic as order-mapper.ts on initial sync.
 *
 * Idempotent: only fills rows where externalVariantName/Sku is currently null.
 *
 * Dry run by default. Pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";
import { Platform } from "@prisma/client";

const PLATFORMS: Platform[] = [
  Platform.SHOPIFY,
  Platform.NAVER,
  Platform.CGETC,
  Platform.COUPANG,
  Platform.AMAZON,
];
// AMAZON note: legacy syncs only persisted the order envelope in rawData. The
// connector now folds OrderItems into rawData (see amazon.ts), so syncs from
// 2026-04-30 forward are backfillable. Older orders fall through with no
// extracted lines and are reported as unmatched — re-sync those windows if
// you need their variant data.

interface RawLine {
  title: string;
  sku: string;
}

function extractLines(platform: Platform, raw: any): RawLine[] {
  if (!raw) return [];
  if (platform === Platform.SHOPIFY) {
    return (raw.line_items || []).map((li: any) => ({
      title: String(li.title ?? ""),
      sku: String(li.sku ?? ""),
    }));
  }
  if (platform === Platform.NAVER) {
    const po = raw.productOrder;
    if (!po) return [];
    const title = po.productOption
      ? `${po.productName ?? ""} - ${po.productOption}`
      : (po.productName ?? "");
    return [{
      title: String(title).trim(),
      sku: String(po.optionCode ?? po.itemNo ?? ""),
    }];
  }
  if (platform === Platform.CGETC) {
    return (raw.lineItems || []).map((li: any) => ({
      title: String(li.productName ?? ""),
      sku: String(li.sku ?? ""),
    }));
  }
  if (platform === Platform.AMAZON) {
    return (raw.OrderItems || []).map((it: any) => ({
      title: String(it.Title ?? ""),
      sku: String(it.SellerSKU ?? ""),
    }));
  }
  if (platform === Platform.COUPANG) {
    // Both marketplace ordersheets and Rocket Growth orders nest their items
    // under `orderItems`, but the field shape diverges:
    //   - marketplace:  { vendorItemName, externalVendorSku, sellerProductItemName, vendorItemPackageName, vendorItemId }
    //   - rocket growth: { productName, vendorItemId }  (no SKU at all)
    // Keep vendorItemId as the SKU for RG so dispatch lookups still resolve.
    return (raw.orderItems || []).map((it: any) => {
      const isRocketGrowth = raw.shipmentType === "ROCKET_GROWTH";
      const title = isRocketGrowth
        ? String(it.productName ?? "")
        : String(it.vendorItemName ?? it.sellerProductItemName ?? it.vendorItemPackageName ?? "");
      const sku = isRocketGrowth
        ? String(it.vendorItemId ?? "")
        : String(it.externalVendorSku ?? it.vendorItemId ?? "");
      return { title: title.trim(), sku };
    });
  }
  return [];
}

const APPLY = process.argv.includes("--apply");

async function resolveProductId(
  companyId: string,
  platform: Platform,
  sku: string | null | undefined,
): Promise<string | null> {
  if (!sku) return null;
  const mapping = await prisma.skuMapping.findUnique({
    where: {
      companyId_platform_externalSku: { companyId, platform, externalSku: sku },
    },
  });
  if (mapping?.productId) return mapping.productId;
  const product = await prisma.product.findFirst({
    where: { sku, companyId },
    select: { id: true },
  });
  return product?.id || null;
}

async function main() {
  let totalOrders = 0;
  let totalLineItems = 0;
  let matched = 0;
  let unmatched = 0;
  let alreadyFilled = 0;

  for (const platform of PLATFORMS) {
    const exts = await prisma.externalOrder.findMany({
      where: { platform, mappedOrderId: { not: null } },
      select: {
        id: true,
        companyId: true,
        rawData: true,
        mappedOrderId: true,
        mappedOrder: {
          select: {
            id: true,
            items: {
              select: {
                id: true,
                productId: true,
                externalVariantName: true,
                externalVariantSku: true,
              },
            },
          },
        },
      },
    });

    console.log(`\n[${platform}] ${exts.length} mapped external orders`);

    for (const eo of exts) {
      const order = eo.mappedOrder;
      if (!order) continue;
      const lineItems = extractLines(platform, eo.rawData);
      if (!lineItems.length) continue;

      totalOrders++;

      // Queue of OrderItems awaiting backfill, in original DB insertion order (== id/creation)
      const queue = order.items
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
      const available = new Set(queue.map((it) => it.id));

      // Pass 1: exact productId match (reliable when SkuMapping is intact)
      const pendingLi: RawLine[] = [];
      for (const li of lineItems) {
        totalLineItems++;
        const title = li.title;
        const sku = li.sku;
        const targetPid = await resolveProductId(eo.companyId, platform, sku || null);

        const hit = targetPid
          ? queue.find((it) => available.has(it.id) && it.productId === targetPid)
          : null;

        if (!hit) {
          // Defer to positional pass (e.g. 9d19bd5-rerouted MS orders where
          // line_item.sku still resolves to the phantom MS productId but the
          // OrderItem now points at the Refill productId).
          pendingLi.push({ title, sku });
          continue;
        }

        available.delete(hit.id);
        if (hit.externalVariantName && hit.externalVariantSku) {
          alreadyFilled++;
          continue;
        }
        matched++;
        if (APPLY) {
          await prisma.orderItem.update({
            where: { id: hit.id },
            data: {
              externalVariantName: title || null,
              externalVariantSku: sku || null,
            },
          });
        } else {
          console.log(
            `  [dry] OrderItem ${hit.id.slice(0, 8)}… ← "${title}" / ${sku}`,
          );
        }
      }

      // Pass 2: positional fallback for line_items that couldn't resolve to an
      // OrderItem by productId. Pair with remaining OrderItems in insertion order.
      const leftover = queue.filter((it) => available.has(it.id));
      for (let i = 0; i < pendingLi.length; i++) {
        const li = pendingLi[i];
        const oi = leftover[i];
        if (!oi) {
          unmatched++;
          continue;
        }
        available.delete(oi.id);
        if (oi.externalVariantName && oi.externalVariantSku) {
          alreadyFilled++;
          continue;
        }
        matched++;
        if (APPLY) {
          await prisma.orderItem.update({
            where: { id: oi.id },
            data: {
              externalVariantName: li.title || null,
              externalVariantSku: li.sku || null,
            },
          });
        } else {
          console.log(
            `  [dry·pos] OrderItem ${oi.id.slice(0, 8)}… ← "${li.title}" / ${li.sku}`,
          );
        }
      }
    }
  }

  console.log("\n── summary ──");
  console.log("Orders walked:     ", totalOrders);
  console.log("Line items seen:   ", totalLineItems);
  console.log("Matched & updated: ", matched);
  console.log("Already filled:    ", alreadyFilled);
  console.log("Unmatched:         ", unmatched);
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
