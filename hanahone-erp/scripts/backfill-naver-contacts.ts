/**
 * One-time backfill: populate Customer.contactInfo from existing Naver order rawData.
 * Extracts phone, address, zipCode, naverId from stored API responses.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const naverOrders = await prisma.externalOrder.findMany({
    where: { platform: "NAVER" },
    select: {
      rawData: true,
      mappedOrder: {
        select: {
          customerId: true,
        },
      },
    },
  });

  console.log(`Found ${naverOrders.length} Naver external orders`);

  // Group by customerId to avoid duplicate updates
  const customerData = new Map<
    string,
    { phone?: string; address?: string; zip?: string; naverId?: string }
  >();

  for (const eo of naverOrders) {
    const customerId = eo.mappedOrder?.customerId;
    if (!customerId) continue;

    const raw = eo.rawData as any;
    const order = raw?.order;
    const addr = raw?.productOrder?.shippingAddress;

    if (!order && !addr) continue;

    // Use first non-masked data we find for each customer
    const existing = customerData.get(customerId) || {};

    if (order?.ordererTel && !order.ordererTel.includes("*") && !existing.phone) {
      existing.phone = order.ordererTel;
    }
    if (addr?.baseAddress && !addr.baseAddress.includes("*") && !existing.address) {
      existing.address = [addr.baseAddress, addr.detailAddress].filter(Boolean).join(" ");
    }
    if (addr?.zipCode && !existing.zip) {
      existing.zip = addr.zipCode;
    }
    if (order?.ordererId && !existing.naverId) {
      existing.naverId = order.ordererId;
    }

    customerData.set(customerId, existing);
  }

  console.log(`Unique customers to update: ${customerData.size}`);

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
    const merged = { ...existingInfo };
    let changed = false;

    if (newData.phone && !existingInfo.phone) { merged.phone = newData.phone; changed = true; }
    if (newData.address && !existingInfo.address) { merged.address = newData.address; changed = true; }
    if (newData.zip && !existingInfo.zip) { merged.zip = newData.zip; changed = true; }
    if (newData.naverId && !existingInfo.naverId) { merged.naverId = newData.naverId; changed = true; }

    if (changed) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { contactInfo: merged },
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
