/**
 * Backfill Customer.contactInfo for existing Coupang orders.
 *
 * The Coupang connector now extracts postCode (zip) and email from
 * orderer/receiver, but rows synced before that fix lack zip in
 * Customer.contactInfo. This walks every COUPANG order, reads the raw
 * orderer/receiver from rawData, and merges missing fields (zip, email)
 * into Customer.contactInfo without overwriting existing values.
 *
 * Run: npx tsx scripts/backfill-coupang-customers.ts          (DRY by default)
 *      npx tsx scripts/backfill-coupang-customers.ts --apply  (writes)
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[${new Date().toISOString()}] Mode: ${apply ? "APPLY" : "DRY"}`);

  const externalOrders = await prisma.externalOrder.findMany({
    where: {
      platform: "COUPANG",
      mappedOrderId: { not: null },
      mappedOrder: { customerId: { not: null } },
    },
    select: {
      id: true,
      rawData: true,
      mappedOrder: { select: { id: true, customerId: true } },
    },
  });
  console.log(`Found ${externalOrders.length} Coupang external orders mapped to customers`);

  type Patch = { zip?: string; email?: string };
  const customerPatches = new Map<string, Patch>();
  for (const order of externalOrders) {
    const customerId = order.mappedOrder?.customerId;
    if (!customerId) continue;
    const raw = order.rawData as
      | { orderer?: { email?: string }; receiver?: { postCode?: string } }
      | null;
    const zip = raw?.receiver?.postCode || undefined;
    const email = raw?.orderer?.email || undefined;
    if (!zip && !email) continue;
    const existing = customerPatches.get(customerId) || {};
    if (zip && !existing.zip) existing.zip = zip;
    if (email && !existing.email) existing.email = email;
    customerPatches.set(customerId, existing);
  }
  console.log(`Customer patches built: ${customerPatches.size}`);

  let updated = 0;
  let skipped = 0;
  for (const [customerId, patch] of Array.from(customerPatches.entries())) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true, contactInfo: true },
    });
    if (!customer) continue;

    const existingInfo = (customer.contactInfo as Record<string, string> | null) || {};
    const merged = { ...existingInfo };
    let didUpdate = false;
    if (patch.zip && !existingInfo.zip) {
      merged.zip = patch.zip;
      didUpdate = true;
    }
    const emailUpdate = patch.email && !customer.email ? patch.email : null;

    if (!didUpdate && !emailUpdate) {
      skipped++;
      continue;
    }

    if (apply) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(emailUpdate ? { email: emailUpdate } : {}),
          ...(didUpdate ? { contactInfo: merged } : {}),
        },
      });
    }
    console.log(
      `  ${apply ? "✓" : "·"} ${customer.name}: ${didUpdate ? `zip=${patch.zip}` : ""}${didUpdate && emailUpdate ? " " : ""}${emailUpdate ? `email=${emailUpdate}` : ""}`,
    );
    updated++;
  }

  console.log(`\nUpdated=${updated} Skipped(no-change)=${skipped}`);
  if (!apply) console.log("DRY mode — re-run with --apply to write.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
