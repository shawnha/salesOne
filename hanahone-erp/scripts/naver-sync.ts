/**
 * Local Naver sync script.
 * Runs from home IP to bypass Naver API IP whitelist.
 * Usage: npx tsx scripts/naver-sync.ts
 */
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { recalculateHokInventory } from "@/lib/integrations/inventory-calculator";
import { naverConnector } from "@/lib/integrations/naver";
import { decrypt } from "@/lib/integrations/encryption";
import * as notify from "@/lib/notifications";

async function main() {
  console.log(`[${new Date().toISOString()}] Naver sync started`);

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "NAVER", isActive: true },
  });

  if (!config) {
    console.error("No active NAVER integration found");
    process.exit(1);
  }

  const result = await runSync(naverConnector, config.companyId);
  console.log(`Sync result: ${result.recordsProcessed} processed, ${result.recordsFailed} failed`);

  // Notifications
  if (result.errorMessage || result.recordsFailed > 0) {
    await notify.send({
      type: "SYNC_FAILED",
      priority: "URGENT",
      title: "Naver Sync Failed",
      message: result.errorMessage || `${result.recordsFailed} records failed`,
      data: { platform: "NAVER", recordsFailed: result.recordsFailed, recordsProcessed: result.recordsProcessed },
      companyId: config.companyId,
    });
    console.error("Sync failed:", result.errorMessage);
  } else if (result.recordsProcessed > 0) {
    await notify.send({
      type: "NEW_ORDERS",
      priority: "NORMAL",
      title: `${result.recordsProcessed} New Orders (Naver)`,
      message: "Synced successfully",
      data: { platform: "NAVER", count: result.recordsProcessed },
      companyId: config.companyId,
    });
  }

  // Low stock check
  try {
    const lowStock = await prisma.$queryRaw<{ productName: string; quantity: number; companyId: string }[]>`
      SELECT p.name as "productName", i.quantity, i.company_id as "companyId"
      FROM salesone.inventories i JOIN salesone.products p ON i.product_id = p.id
      WHERE i.quantity <= i.reorder_level AND i.reorder_level > 0
      AND i.company_id = ${config.companyId}
    `;
    for (const item of lowStock) {
      await notify.send({
        type: "LOW_STOCK",
        priority: "URGENT",
        title: `Low Stock: ${item.productName}`,
        message: `${item.quantity} remaining`,
        companyId: item.companyId,
      });
    }
    if (lowStock.length > 0) console.log(`Low stock alerts: ${lowStock.length}`);
  } catch (err) {
    console.error("Low stock check failed:", (err as Error).message);
  }

  // Naver inventory sync
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    await naverConnector.syncInventory(credentials, config.companyId);
    console.log("Naver inventory synced");
  } catch (err) {
    console.error("Naver inventory sync failed:", (err as Error).message);
  }

  // Recalculate HOK inventory
  await recalculateHokInventory(config.companyId);
  console.log("HOK inventory recalculated");

  console.log(`[${new Date().toISOString()}] Naver sync completed`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
