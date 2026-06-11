/**
 * Local Coupang sync — orders (marketplace + rocket growth) + rocket growth
 * inventory. Mirrors scripts/naver-sync.ts so we have a manual trigger from
 * the IP-whitelisted dev box.
 */
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { coupangConnector, fetchCoupangSettlements } from "@/lib/integrations/connectors/coupang";
import { getPayoutSince, syncChannelPayouts } from "@/lib/integrations/payout-sync";
import { decrypt } from "@/lib/integrations/encryption";

async function main() {
  console.log(`[${new Date().toISOString()}] Coupang sync started`);

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "COUPANG", isActive: true },
  });
  if (!config) {
    console.error("No active COUPANG integration found");
    process.exit(1);
  }

  const result = await runSync(coupangConnector, config.companyId);
  console.log(`Orders: ${result.recordsProcessed} processed, ${result.recordsFailed} failed`);
  if (result.errorMessage) console.warn("Sync error:", result.errorMessage);

  // Inventory (rocket growth only — marketplace inventory comes from product listings)
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    await coupangConnector.syncInventory(credentials, config.companyId);
    console.log("Coupang Rocket Growth inventory synced");
  } catch (err) {
    console.error("Coupang inventory sync failed:", (err as Error).message);
  }

  // Settlement (지급내역) — best-effort: 실패해도 주문/재고 sync에 영향 없음
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const since = await getPayoutSince("COUPANG");
    const payouts = await fetchCoupangSettlements(credentials, since);
    const { upserted, failed } = await syncChannelPayouts(config.companyId, "COUPANG", payouts);
    console.log(`Coupang payouts: ${upserted} upserted, ${failed} failed (since ${since.toISOString().slice(0, 10)})`);
  } catch (err) {
    console.error("Coupang payout sync failed:", (err as Error).message);
  }

  console.log(`[${new Date().toISOString()}] Coupang sync completed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
