/**
 * Local Shopify sync — orders + payouts (지급내역).
 * Mirrors scripts/coupang-sync.ts. Manual trigger for now (no scheduler yet);
 * Shopify auth is OAuth client-credentials, so this runs from any IP.
 * Usage: npx tsx scripts/shopify-sync.ts
 */
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { shopifyConnector, fetchShopifyPayouts } from "@/lib/integrations/connectors/shopify";
import { getPayoutSince, syncChannelPayouts } from "@/lib/integrations/payout-sync";
import { decrypt } from "@/lib/integrations/encryption";

async function main() {
  console.log(`[${new Date().toISOString()}] Shopify sync started`);

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "SHOPIFY", isActive: true },
  });
  if (!config) {
    console.error("No active SHOPIFY integration found");
    process.exit(1);
  }

  const result = await runSync(shopifyConnector, config.companyId);
  console.log(`Orders: ${result.recordsProcessed} processed, ${result.recordsFailed} failed`);
  if (result.errorMessage) console.warn("Sync error:", result.errorMessage);

  // Settlement (지급내역) — best-effort: 실패해도 주문 sync에 영향 없음
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const since = await getPayoutSince("SHOPIFY");
    const payouts = await fetchShopifyPayouts(credentials, since);
    const { upserted, failed } = await syncChannelPayouts(config.companyId, "SHOPIFY", payouts);
    console.log(`Shopify payouts: ${upserted} upserted, ${failed} failed (since ${since.toISOString().slice(0, 10)})`);
  } catch (err) {
    console.error("Shopify payout sync failed:", (err as Error).message);
  }

  console.log(`[${new Date().toISOString()}] Shopify sync completed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
