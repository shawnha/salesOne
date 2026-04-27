/**
 * Backfill OrderItem.originalUnitPrice / discountAmount / sellingPlanId from
 * Shopify ExternalOrder.rawData.line_items[].
 *
 * Same matching strategy as backfill-order-item-variants:
 *   1) Pass 1 — exact productId match (resolve via SkuMapping → Product.sku)
 *   2) Pass 2 — positional fallback for items the resolver couldn't pin
 *      (e.g., 9d19bd5-rerouted MS orders).
 *
 * Idempotent — only fills columns that are still null.
 *
 * Dry run by default. Pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";
import { Platform } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

async function resolveProductId(
  companyId: string,
  platform: Platform,
  sku: string | null | undefined,
): Promise<string | null> {
  if (!sku) return null;
  const mapping = await prisma.skuMapping.findUnique({
    where: { companyId_platform_externalSku: { companyId, platform, externalSku: sku } },
  });
  if (mapping?.productId) return mapping.productId;
  const product = await prisma.product.findFirst({
    where: { sku, companyId },
    select: { id: true },
  });
  return product?.id || null;
}

async function main() {
  let totalLi = 0;
  let updated = 0;
  let unmatched = 0;
  let alreadyFilled = 0;

  const exts = await prisma.externalOrder.findMany({
    where: { platform: Platform.SHOPIFY, mappedOrderId: { not: null } },
    select: {
      id: true,
      companyId: true,
      rawData: true,
      mappedOrder: {
        select: {
          id: true,
          items: {
            select: {
              id: true,
              productId: true,
              originalUnitPrice: true,
              discountAmount: true,
              sellingPlanId: true,
            },
          },
        },
      },
    },
  });

  console.log(`[shopify-pricing] mapped external orders: ${exts.length}`);

  for (const eo of exts) {
    const order = eo.mappedOrder;
    if (!order) continue;
    const lineItems: any[] = (eo.rawData as any)?.line_items || [];
    if (!lineItems.length) continue;

    const queue = order.items.slice().sort((a, b) => a.id.localeCompare(b.id));
    const available = new Set(queue.map((it) => it.id));

    type Pending = {
      listPrice: number;
      discount: number;
      sellingPlanId: string | null;
      title: string;
    };
    const pending: Pending[] = [];

    for (const li of lineItems) {
      totalLi++;
      const sku = String(li.sku || "");
      const targetPid = await resolveProductId(eo.companyId, Platform.SHOPIFY, sku || null);
      const listPrice = parseFloat(li.price || "0") || 0;
      const discount = parseFloat(li.total_discount || "0") || 0;
      const spProp = (li.properties || []).find((p: any) => p.name === "_selling_plan_id");
      const sellingPlanId = spProp?.value ? String(spProp.value) : null;
      const title = String(li.title || "");

      const hit = targetPid
        ? queue.find((it) => available.has(it.id) && it.productId === targetPid)
        : null;

      if (!hit) {
        pending.push({ listPrice, discount, sellingPlanId, title });
        continue;
      }

      available.delete(hit.id);
      await applyTo(hit.id, hit, listPrice, discount, sellingPlanId, title);
    }

    const leftover = queue.filter((it) => available.has(it.id));
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      const oi = leftover[i];
      if (!oi) {
        unmatched++;
        continue;
      }
      available.delete(oi.id);
      await applyTo(oi.id, oi, p.listPrice, p.discount, p.sellingPlanId, p.title);
    }
  }

  console.log("\n── summary ──");
  console.log("Line items walked:", totalLi);
  console.log("Updated:          ", updated);
  console.log("Already filled:   ", alreadyFilled);
  console.log("Unmatched:        ", unmatched);
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();

  async function applyTo(
    id: string,
    current: { originalUnitPrice: any; discountAmount: any; sellingPlanId: string | null },
    listPrice: number,
    discount: number,
    sellingPlanId: string | null,
    title: string,
  ) {
    const allFilled =
      current.originalUnitPrice != null &&
      current.discountAmount != null &&
      (sellingPlanId === null || current.sellingPlanId !== null);
    if (allFilled) {
      alreadyFilled++;
      return;
    }
    const data: any = {};
    if (current.originalUnitPrice == null && listPrice > 0) data.originalUnitPrice = listPrice;
    if (current.discountAmount == null) data.discountAmount = discount;
    if (current.sellingPlanId == null && sellingPlanId) data.sellingPlanId = sellingPlanId;
    if (Object.keys(data).length === 0) {
      alreadyFilled++;
      return;
    }
    updated++;
    if (APPLY) {
      await prisma.orderItem.update({ where: { id }, data });
    } else {
      const bits: string[] = [];
      if (data.originalUnitPrice !== undefined) bits.push(`list=$${data.originalUnitPrice}`);
      if (data.discountAmount !== undefined && Number(data.discountAmount) > 0)
        bits.push(`discount=$${data.discountAmount}`);
      if (data.sellingPlanId) bits.push(`SP=${data.sellingPlanId}`);
      console.log(`  [dry] ${id.slice(0, 8)}… "${title}" ← ${bits.join(", ")}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
