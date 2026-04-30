/**
 * Backfill Customer.contactInfo (phone, address, recipientName, zip,
 * naverId, email) using each customer's order history.
 *
 * Strategy:
 *   1. Order.recipientPhone / shippingAddress / recipientName cover the
 *      common case across every connector — channel-agnostic and cheap.
 *   2. Zip + naverId aren't promoted to Order columns, so for missing
 *      values we peek at the most recent ExternalOrder.rawData per
 *      platform. The shape differs by channel so we keep small extractors.
 *   3. Customer.email comes from Order.customer email join when set.
 *
 * Idempotent: only fills fields that are currently null/empty on
 * contactInfo. Re-runs are safe.
 *
 * Dry run by default. Pass --apply to commit. Pass --report to print a
 * per-channel coverage breakdown without doing any writes.
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const REPORT_ONLY = process.argv.includes("--report");

type Patch = {
  phone?: string;
  address?: string;
  recipientName?: string;
  zip?: string;
  naverId?: string;
};

function pickStr(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "" && !v.includes("****")) {
      return v.trim();
    }
  }
  return null;
}

/** Pull zip + naverId from per-platform raw payloads. */
function extractRawContact(
  platform: string,
  raw: any,
): { zip?: string; naverId?: string } {
  if (!raw) return {};
  if (platform === "NAVER") {
    return {
      zip: pickStr(raw.productOrder?.shippingAddress?.zipCode) ?? undefined,
      naverId: pickStr(raw.order?.ordererId) ?? undefined,
    };
  }
  if (platform === "COUPANG") {
    return {
      zip: pickStr(raw.receiver?.postCode) ?? undefined,
    };
  }
  if (platform === "SHOPIFY") {
    return {
      zip: pickStr(
        raw.shipping_address?.zip,
        raw.billing_address?.zip,
        raw.customer?.default_address?.zip,
      ) ?? undefined,
    };
  }
  if (platform === "CGETC") {
    return {
      zip: pickStr(raw.zipCode, raw.shippingAddress?.zipCode) ?? undefined,
    };
  }
  return {};
}

async function main() {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      email: true,
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
          id: true,
          recipientName: true,
          recipientPhone: true,
          shippingAddress: true,
          orderDate: true,
          externalSource: true,
        },
        orderBy: { orderDate: "desc" },
      },
    },
  });

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let nothingToFill = 0;
  // coverage: per-channel "still missing" tally after backfill
  const missing = {
    phone: 0,
    address: 0,
    zip: 0,
    naverId: 0,
  };
  const byChannelMissing = new Map<string, { phone: number; address: number; zip: number }>();

  for (const c of customers) {
    scanned++;
    const ci: any = c.contactInfo ?? {};
    const patch: Patch = {};

    // 1) Order-column fields (phone/address/recipientName)
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
      if (hit) patch[target as keyof Patch] = String((hit as any)[field]).trim();
    }

    // 2) zip + naverId — only fall through to rawData if still missing
    const needZip = !ci.zip;
    const needNaverId = !ci.naverId;
    if (needZip || needNaverId) {
      // Most recent order(s) for this customer with rawData. Use the joined
      // ExternalOrder so we don't re-fetch all of rawData for non-candidates.
      const orderIds = c.orders.slice(0, 5).map((o) => o.id);
      if (orderIds.length > 0) {
        const exts = await prisma.externalOrder.findMany({
          where: { mappedOrderId: { in: orderIds } },
          select: { platform: true, rawData: true, mappedOrderId: true },
        });
        // Walk in order-recency (orders is already desc by orderDate)
        for (const o of c.orders) {
          if (!needZip && !needNaverId) break;
          const eo = exts.find((e) => e.mappedOrderId === o.id);
          if (!eo) continue;
          const extracted = extractRawContact(eo.platform, eo.rawData);
          if (needZip && extracted.zip && !patch.zip) patch.zip = extracted.zip;
          if (needNaverId && extracted.naverId && !patch.naverId) patch.naverId = extracted.naverId;
        }
      }
    }

    // tally per-channel "still missing" after patch (for the report)
    const finalCi = { ...ci, ...patch };
    const primaryChannel = c.orders[0]?.externalSource ?? "—";
    const tallies = byChannelMissing.get(primaryChannel) ?? { phone: 0, address: 0, zip: 0 };
    if (!finalCi.phone) {
      tallies.phone++;
      missing.phone++;
    }
    if (!finalCi.address) {
      tallies.address++;
      missing.address++;
    }
    if (!finalCi.zip) {
      tallies.zip++;
      missing.zip++;
    }
    if (!finalCi.naverId && primaryChannel === "NAVER") missing.naverId++;
    byChannelMissing.set(primaryChannel, tallies);

    if (Object.keys(patch).length === 0) {
      if (c.orders.length === 0) nothingToFill++;
      else unchanged++;
      continue;
    }

    if (REPORT_ONLY) {
      updated++;
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

  console.log("\n── coverage gap (after backfill) ──");
  console.log("Still missing phone:      ", missing.phone);
  console.log("Still missing address:    ", missing.address);
  console.log("Still missing zip:        ", missing.zip);
  console.log("Still missing naverId(NAVER): ", missing.naverId);
  console.log("\nPer primary channel:");
  for (const [ch, t] of Array.from(byChannelMissing.entries()).sort()) {
    console.log(
      `  ${ch.padEnd(10)} phone=${t.phone}  address=${t.address}  zip=${t.zip}`,
    );
  }

  console.log(
    REPORT_ONLY
      ? "\nReport mode (no writes)."
      : APPLY
        ? "\nAPPLIED."
        : "\nDry run. Pass --apply to commit.",
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
