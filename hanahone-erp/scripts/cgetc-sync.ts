/**
 * Local CGETC sync — manual trigger mirroring scripts/shopify-sync.ts.
 * The Vercel cron (/api/cron/cgetc-sync) has maxDuration=120s; use this for
 * backlog catch-up runs that may exceed it (per-fetch 30s timeouts still apply).
 * Usage: npx tsx scripts/cgetc-sync.ts
 */
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";

async function main() {
  console.log(`[${new Date().toISOString()}] CGETC sync started`);

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "CGETC", isActive: true },
  });
  if (!config) {
    console.error("No active CGETC integration found");
    process.exit(1);
  }

  const result = await runSync(cgetcConnector, config.companyId);
  console.log(`Orders: ${result.recordsProcessed} processed, ${result.recordsFailed} failed`);
  if (result.errorMessage) console.warn("Sync error:", result.errorMessage);

  console.log(`[${new Date().toISOString()}] CGETC sync completed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
