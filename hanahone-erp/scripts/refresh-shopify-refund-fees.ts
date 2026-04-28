/**
 * One-shot: re-fetch Shopify Payments fees for orders with refundAmount > 0.
 *
 * Shopify typically refunds the percentage portion of the processing fee on
 * refund, so commissionAmount captured at sale time goes stale. The sync-
 * runner now does this automatically when refundAmount changes; this script
 * cleans up rows that were already refunded before that change shipped.
 *
 * Dry run by default. Pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";
import { fetchShopifyOrderFees } from "../src/lib/integrations/connectors/shopify";
import { decrypt } from "../src/lib/integrations/encryption";

const APPLY = process.argv.includes("--apply");

async function main() {
  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "SHOPIFY", isActive: true },
  });
  if (!config) throw new Error("No active SHOPIFY integration found");
  const credentials = JSON.parse(decrypt(config.credentials));

  const refunded = await prisma.externalOrder.findMany({
    where: {
      platform: "SHOPIFY",
      mappedOrderId: { not: null },
      mappedOrder: { refundAmount: { gt: 0 } },
    },
    select: {
      externalOrderId: true,
      mappedOrder: {
        select: { id: true, totalAmount: true, refundAmount: true, commissionAmount: true, settlementAmount: true },
      },
    },
  });

  console.log(`Refunded Shopify orders to inspect: ${refunded.length}`);

  let updated = 0;
  let unchanged = 0;
  let noFees = 0;

  for (const eo of refunded) {
    const order = eo.mappedOrder!;
    try {
      const { fee, net, hasFees } = await fetchShopifyOrderFees(credentials, eo.externalOrderId);
      if (!hasFees) {
        noFees++;
        continue;
      }
      const total = Number(order.totalAmount);
      const refund = Number(order.refundAmount ?? 0);
      const settlement = net ?? total - refund - fee;

      const oldFee = Number(order.commissionAmount ?? NaN);
      const oldSettle = Number(order.settlementAmount ?? NaN);
      const drift =
        Math.abs(fee - (Number.isFinite(oldFee) ? oldFee : -1e9)) > 0.01 ||
        Math.abs(settlement - (Number.isFinite(oldSettle) ? oldSettle : -1e9)) > 0.01;

      if (!drift) {
        unchanged++;
      } else {
        if (APPLY) {
          await prisma.order.update({
            where: { id: order.id },
            data: { commissionAmount: fee, settlementAmount: settlement },
          });
        } else {
          console.log(
            `  [dry] ${eo.externalOrderId}: fee ${oldFee}→${fee}, settle ${oldSettle}→${settlement.toFixed(2)}`,
          );
        }
        updated++;
      }
    } catch (e) {
      console.error(`  ERR ${eo.externalOrderId}:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("\n── summary ──");
  console.log("Updated:    ", updated);
  console.log("Unchanged:  ", unchanged);
  console.log("No fees:    ", noFees);
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
