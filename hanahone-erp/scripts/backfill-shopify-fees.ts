/**
 * Backfill for Shopify order fees.
 *
 * Two modes:
 *   default       — orders missing commissionAmount (initial backfill).
 *   --refunded    — orders WITH refundAmount > 0, regardless of whether
 *                   commissionAmount is already set. Use when refunds were
 *                   recorded before sync-runner's refund-driven re-fetch was
 *                   in place; the original commission is stale because
 *                   Shopify Payments returns part of the processing fee on
 *                   refund. Live syncs (post-fe5bb7d) handle this going
 *                   forward via refundChanged in sync-runner.
 *   --all         — every mapped Shopify order (forces full recomputation;
 *                   only use after a connector change to fee parsing).
 *
 * Calls the Shopify Admin GraphQL API and writes fee + derived
 * settlementAmount back to the Order row.
 *
 * Dry run by default. Pass --apply to commit.
 *
 * Rate limit: Shopify GraphQL Admin API permits 50 points/sec per app. Each
 * order.transactions query costs ~10 points. Sequential with a 250ms delay
 * keeps us well under the limit and is fast enough (≈4 orders/sec → 200
 * orders in under a minute).
 */
import { prisma } from "../src/lib/prisma";
import { fetchShopifyOrderFees } from "../src/lib/integrations/connectors/shopify";
import { decrypt } from "../src/lib/integrations/encryption";

const APPLY = process.argv.includes("--apply");
const MODE_REFUNDED = process.argv.includes("--refunded");
const MODE_ALL = process.argv.includes("--all");

async function main() {
  // One HOI-side Shopify integration assumed; widen if there are multiple.
  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "SHOPIFY", isActive: true },
  });
  if (!config) {
    console.error("No active Shopify IntegrationConfig.");
    process.exit(1);
  }

  const credentials = JSON.parse(decrypt(config.credentials as string));

  const mappedOrderFilter = MODE_ALL
    ? {} // every mapped order
    : MODE_REFUNDED
      ? { refundAmount: { not: null, gt: 0 } }
      : { commissionAmount: null };

  const mode = MODE_ALL ? "all" : MODE_REFUNDED ? "refunded" : "missing-commission";
  const exts = await prisma.externalOrder.findMany({
    where: {
      platform: "SHOPIFY",
      mappedOrderId: { not: null },
      mappedOrder: mappedOrderFilter,
    },
    select: {
      externalOrderId: true,
      mappedOrder: {
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          refundAmount: true,
          netAmount: true,
          commissionAmount: true,
          settlementAmount: true,
        },
      },
    },
  });

  console.log(`[shopify-fees] mode=${mode} candidates: ${exts.length}`);

  let ok = 0;
  let noFees = 0;
  let errored = 0;

  for (let i = 0; i < exts.length; i++) {
    const eo = exts[i];
    const order = eo.mappedOrder!;
    try {
      const { fee, net, hasFees } = await fetchShopifyOrderFees(
        credentials,
        eo.externalOrderId,
      );
      if (!hasFees) {
        noFees++;
        if (!APPLY) {
          console.log(
            `  [dry·no-fees] ${order.orderNumber} (Shopify ${eo.externalOrderId}) — likely PayPal/TikTok`,
          );
        }
        // Throttle even the no-fee branch to respect rate limit.
        await sleep(250);
        continue;
      }

      const totalAmount = Number(order.totalAmount);
      const refundAmount = Number(order.refundAmount ?? 0);
      // If GraphQL returns a derived net, use it; otherwise compute.
      const settlement = net ?? totalAmount - refundAmount - fee;
      const oldCommission = order.commissionAmount === null ? null : Number(order.commissionAmount);
      const oldSettlement = order.settlementAmount === null ? null : Number(order.settlementAmount);
      const unchanged =
        oldCommission !== null &&
        oldSettlement !== null &&
        Math.abs(oldCommission - fee) < 0.005 &&
        Math.abs(oldSettlement - settlement) < 0.005;

      if (unchanged) {
        if (!APPLY) {
          console.log(
            `  [dry·noop] ${order.orderNumber} fee=${fee} settlement=${settlement.toFixed(2)} (matches DB)`,
          );
        }
        await sleep(250);
        continue;
      }

      if (APPLY) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            commissionAmount: fee,
            settlementAmount: settlement,
          },
        });
      } else {
        const delta =
          oldCommission !== null
            ? ` (was fee=${oldCommission.toFixed(2)} settlement=${(oldSettlement ?? 0).toFixed(2)})`
            : "";
        console.log(
          `  [dry] ${order.orderNumber} total=${totalAmount} refund=${refundAmount} fee=${fee} → settlement=${settlement.toFixed(2)}${delta}`,
        );
      }
      ok++;
    } catch (e) {
      errored++;
      console.error(
        `  [err] ${order.orderNumber} (Shopify ${eo.externalOrderId}): ${(e as Error).message}`,
      );
    }
    await sleep(250);
    if ((i + 1) % 50 === 0) {
      console.log(`  … progress: ${i + 1}/${exts.length}`);
    }
  }

  console.log("\n── summary ──");
  console.log("Updated:  ", ok);
  console.log("No fees:  ", noFees);
  console.log("Errored:  ", errored);
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
