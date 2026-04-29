/**
 * Local Coupang sync — orders (marketplace + rocket growth) + rocket growth
 * inventory. Mirrors scripts/naver-sync.ts so we have a manual trigger from
 * the IP-whitelisted dev box.
 */
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { coupangConnector } from "@/lib/integrations/connectors/coupang";
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

  console.log(`[${new Date().toISOString()}] Coupang sync completed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
