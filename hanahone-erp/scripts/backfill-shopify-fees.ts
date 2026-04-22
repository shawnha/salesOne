/**
 * One-time backfill for Shopify order fees.
 *
 * Calls the Shopify Admin GraphQL API for every Shopify-sourced order that
 * doesn't have commissionAmount yet, and writes the fee (plus derived
 * settlementAmount) back to the Order row so Sales > Fees KPI + Recon can
 * surface HOI Shopify margin alongside Naver.
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

  // Only backfill orders that were mapped from Shopify and lack a commission.
  const exts = await prisma.externalOrder.findMany({
    where: {
      platform: "SHOPIFY",
      mappedOrderId: { not: null },
      mappedOrder: { commissionAmount: null },
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
        },
      },
    },
  });

  console.log(`[shopify-fees] candidates: ${exts.length}`);

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

      if (APPLY) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            commissionAmount: fee,
            settlementAmount: settlement,
          },
        });
      } else {
        console.log(
          `  [dry] ${order.orderNumber} total=${totalAmount} refund=${refundAmount} fee=${fee} → settlement=${settlement.toFixed(2)}`,
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
