/**
 * Backfill Coupang orders that are stuck at PARTIALLY_FULFILLED.
 *
 * The connector previously mapped Coupang DEPARTURE / DELIVERING /
 * NONE_TRACKING ordersheet statuses to fulfillmentStatus=PARTIALLY_FULFILLED.
 * That kept already-shipped orders in the /shipping pending list (which
 * filters UNFULFILLED + PARTIALLY_FULFILLED) and misrepresented them as
 * "Partial Ship" in the orders table.
 *
 * The mapping is now FULFILLED — this script flips existing rows so live
 * data matches without waiting for the next sync. Re-syncs will agree.
 *
 * Looks at the Coupang ordersheet status carried in ExternalOrder.rawData;
 * only flips orders where the channel actually has them in a shipped state
 * (DEPARTURE / DELIVERING / NONE_TRACKING). Others stay put.
 *
 * Dry run by default. Pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const SHIPPED_STATUSES = new Set(["DEPARTURE", "DELIVERING", "NONE_TRACKING"]);

async function main() {
  const candidates = await prisma.order.findMany({
    where: {
      externalSource: "COUPANG",
      fulfillmentStatus: "PARTIALLY_FULFILLED",
    },
    select: {
      id: true,
      orderNumber: true,
      externalOrderNumber: true,
      externalOrders: {
        select: { rawData: true },
        take: 1,
      },
    },
  });

  console.log(`[coupang-fulfillment] candidates: ${candidates.length}`);

  let toFix = 0;
  let skippedNoStatus = 0;
  let skippedOtherStatus = 0;

  for (const o of candidates) {
    const status = String(
      (o.externalOrders[0]?.rawData as { status?: string } | null)?.status ?? "",
    ).toUpperCase();
    if (!status) {
      skippedNoStatus++;
      continue;
    }
    if (!SHIPPED_STATUSES.has(status)) {
      skippedOtherStatus++;
      if (!APPLY) {
        console.log(`  [dry·skip] ${o.orderNumber} (status=${status}) — leaving alone`);
      }
      continue;
    }
    toFix++;
    if (APPLY) {
      await prisma.order.update({
        where: { id: o.id },
        data: { fulfillmentStatus: "FULFILLED" },
      });
    } else {
      console.log(`  [dry] ${o.orderNumber} (Coupang ${o.externalOrderNumber}, status=${status}) → FULFILLED`);
    }
  }

  console.log("\n── summary ──");
  console.log("Flipped to FULFILLED:    ", toFix);
  console.log("Skipped (no rawData):    ", skippedNoStatus);
  console.log("Skipped (other status):  ", skippedOtherStatus);
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
