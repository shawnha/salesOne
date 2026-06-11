/**
 * Backfill taxAmount and shippingAmount for existing HOI Shopify orders.
 *
 * Pulls tax / shipping from each ExternalOrder.rawData and writes onto the
 * mapped Order. Idempotent — only updates Orders where the field is currently
 * NULL (so re-running won't clobber later edits).
 *
 * Usage:  npx tsx scripts/backfill-shopify-tax-shipping.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const HOI = "69b44456-1369-4892-8a41-6760a8b13412";

  const exts = await prisma.externalOrder.findMany({
    where: {
      companyId: HOI,
      platform: "SHOPIFY",
      mappedOrderId: { not: null },
    },
    select: {
      rawData: true,
      mappedOrderId: true,
      mappedOrder: {
        select: {
          id: true,
          orderNumber: true,
          taxAmount: true,
          shippingAmount: true,
        },
      },
    },
  });

  console.log(`Found ${exts.length} mapped HOI Shopify orders to inspect`);

  let updated = 0;
  let skipped = 0;
  let totalTax = 0;
  let totalShipping = 0;

  for (const e of exts) {
    if (!e.mappedOrder) continue;
    const raw = e.rawData as any;
    if (!raw) {
      skipped++;
      continue;
    }
    const tax = parseFloat(raw.total_tax || "0");
    const shipping = parseFloat(
      raw.total_shipping_price_set?.shop_money?.amount || "0"
    );

    const taxValue = tax > 0 ? tax : null;
    const shippingValue = shipping > 0 ? shipping : null;

    // Skip if already populated (idempotent)
    const taxAlready = e.mappedOrder.taxAmount !== null;
    const shippingAlready = e.mappedOrder.shippingAmount !== null;
    if (taxAlready && shippingAlready) {
      skipped++;
      continue;
    }

    await prisma.order.update({
      where: { id: e.mappedOrder.id },
      data: {
        ...(taxAlready ? {} : { taxAmount: taxValue }),
        ...(shippingAlready ? {} : { shippingAmount: shippingValue }),
      },
    });

    if (!taxAlready && taxValue) totalTax += taxValue;
    if (!shippingAlready && shippingValue) totalShipping += shippingValue;
    updated++;
  }

  console.log(`✅ Updated:   ${updated}`);
  console.log(`⏭️  Skipped:  ${skipped} (already populated or missing rawData)`);
  console.log(`💰 Backfilled tax total:      $${totalTax.toFixed(2)}`);
  console.log(`📦 Backfilled shipping total: $${totalShipping.toFixed(2)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
