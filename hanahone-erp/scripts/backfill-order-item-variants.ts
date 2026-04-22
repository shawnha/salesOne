/**
 * Backfill OrderItem.externalVariantName/Sku from ExternalOrder.rawData.line_items[].
 *
 * Why: 9d19bd5 rerouted 24 Shopify OrderItems to the real Refill product, collapsing
 * all channel-level variant visibility. The original line_item.title ("Monthly Plan",
 * "5 Bottle Pack", etc.) only survives in ExternalOrder.rawData. This script surfaces
 * that string on OrderItem for channel-breakdown reporting.
 *
 * Matching strategy: walk line_items in order, resolve productId via SkuMapping →
 * Product.sku (same resolver as order-mapper.ts), then pop the first unvisited
 * OrderItem with the matching productId. This mirrors how sync originally ordered
 * the rows, and is idempotent (missing fields are the only thing we fill).
 *
 * Scoped to Shopify ExternalOrders today; extend `PLATFORMS` to run for others.
 *
 * Dry run by default. Pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";
import { Platform } from "@prisma/client";

const PLATFORMS: Platform[] = [Platform.SHOPIFY];

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
      const lineItems = (eo.rawData as any)?.line_items || [];
      if (!lineItems.length) continue;

      totalOrders++;

      // Queue of OrderItems awaiting backfill, in original DB insertion order (== id/creation)
      const queue = order.items
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
      const available = new Set(queue.map((it) => it.id));

      // Pass 1: exact productId match (reliable when SkuMapping is intact)
      const pendingLi: { title: string; sku: string }[] = [];
      for (const li of lineItems) {
        totalLineItems++;
        const title: string = String(li.title ?? "");
        const sku: string = String(li.sku ?? "");
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
