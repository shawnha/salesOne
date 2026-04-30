/**
 * Backfill Coupang REFUNDED orders that have null refundAmount.
 *
 * Coupang's connector previously didn't populate refundAmount when an
 * ordersheet flipped to CANCEL/RETURNS. The order would land at
 * financialStatus=REFUNDED with refundAmount=null and netAmount still
 * equal to totalAmount — so /sales, /dashboard, /reports kept counting
 * those refunded orders as live revenue.
 *
 * This walks every Coupang order with financialStatus=REFUNDED and a
 * null/zero refundAmount, sets refundAmount = totalAmount, recomputes
 * netAmount = 0, and reports the totals so we can sanity-check the
 * impact before applying.
 *
 * Dry run by default. Pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      externalSource: "COUPANG",
      financialStatus: "REFUNDED",
      OR: [{ refundAmount: null }, { refundAmount: 0 }],
    },
    select: {
      id: true,
      orderNumber: true,
      externalOrderNumber: true,
      totalAmount: true,
      refundAmount: true,
      netAmount: true,
    },
  });

  console.log(`[coupang-refunds] candidates: ${orders.length}`);
  let totalRefundKrw = 0;

  for (const o of orders) {
    const total = Number(o.totalAmount);
    totalRefundKrw += total;
    if (!APPLY) {
      console.log(
        `  [dry] ${o.orderNumber} (Coupang ${o.externalOrderNumber}) total=${total} → refund=${total} net=0`,
      );
      continue;
    }
    await prisma.order.update({
      where: { id: o.id },
      data: { refundAmount: total, netAmount: 0 },
    });
  }

  console.log("\n── summary ──");
  console.log("Orders to fix:        ", orders.length);
  console.log("Refund total (₩):     ", Math.round(totalRefundKrw).toLocaleString("ko-KR"));
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
