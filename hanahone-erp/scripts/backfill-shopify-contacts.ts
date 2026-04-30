/**
 * SUPERSEDED by scripts/backfill-customer-contacts.ts (channel-agnostic,
 * also covers zip / address / Naver naverId). This file is kept for
 * archival reference and is no longer invoked.
 *
 * Original purpose: populate Customer.contactInfo.phone from Shopify
 * order rawData (customer / billing_address / shipping_address).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const shopifyOrders = await prisma.externalOrder.findMany({
    where: { platform: "SHOPIFY" },
    select: {
      rawData: true,
      mappedOrder: {
        select: {
          customerId: true,
        },
      },
    },
  });

  console.log(`Found ${shopifyOrders.length} Shopify external orders`);

  const customerData = new Map<string, { phone?: string }>();

  for (const eo of shopifyOrders) {
    const customerId = eo.mappedOrder?.customerId;
    if (!customerId) continue;

    const raw = eo.rawData as any;
    const phone =
      raw?.customer?.phone ||
      raw?.billing_address?.phone ||
      raw?.shipping_address?.phone;

    if (phone && !customerData.has(customerId)) {
      customerData.set(customerId, { phone });
    }
  }

  console.log(`Unique customers with phone data: ${customerData.size}`);

  let updated = 0;
  let skipped = 0;

  for (const [customerId, newData] of Array.from(customerData.entries())) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { contactInfo: true },
    });

    if (!customer) {
      skipped++;
      continue;
    }

    const existingInfo = (customer.contactInfo as Record<string, string> | null) || {};

    if (!existingInfo.phone && newData.phone) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { contactInfo: { ...existingInfo, phone: newData.phone } },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
