/**
 * Backfill Customer.contactInfo (phone, address, recipientName) from the
 * customer's most recent Order with non-empty recipient fields.
 *
 * Channel-agnostic: relies on Order.recipientPhone / shippingAddress, which
 * every connector populates from its own raw payload at sync time. No need
 * to teach this script about per-platform JSON shapes.
 *
 * Idempotent: only fills fields that are currently null/empty on contactInfo.
 *
 * Dry run by default. Pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

type Patch = { phone?: string; address?: string; recipientName?: string };

async function main() {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      contactInfo: true,
      orders: {
        where: {
          OR: [
            { recipientPhone: { not: null } },
            { shippingAddress: { not: null } },
            { recipientName: { not: null } },
          ],
        },
        select: {
          recipientName: true,
          recipientPhone: true,
          shippingAddress: true,
          orderDate: true,
        },
        orderBy: { orderDate: "desc" },
      },
    },
  });

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let nothingToFill = 0;

  for (const c of customers) {
    scanned++;
    const ci: any = c.contactInfo ?? {};
    const patch: Patch = {};

    // Pick the freshest non-empty value for each missing field
    for (const field of ["recipientPhone", "shippingAddress", "recipientName"] as const) {
      const target =
        field === "recipientPhone" ? "phone"
        : field === "shippingAddress" ? "address"
        : "recipientName";
      if (ci[target] && String(ci[target]).trim() !== "") continue;
      const hit = c.orders.find((o) => {
        const v = (o as any)[field];
        return v && String(v).trim() !== "";
      });
      if (hit) patch[target] = String((hit as any)[field]).trim();
    }

    if (Object.keys(patch).length === 0) {
      if (c.orders.length === 0) nothingToFill++;
      else unchanged++;
      continue;
    }

    const merged = { ...ci, ...patch };
    if (APPLY) {
      await prisma.customer.update({
        where: { id: c.id },
        data: { contactInfo: merged },
      });
    } else {
      console.log(`  [dry] ${c.name}: +${Object.keys(patch).join(",")}`);
    }
    updated++;
  }

  console.log("\n── summary ──");
  console.log("Scanned:                  ", scanned);
  console.log("Updated:                  ", updated);
  console.log("Already complete:         ", unchanged);
  console.log("No order recipient data:  ", nothingToFill);
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
