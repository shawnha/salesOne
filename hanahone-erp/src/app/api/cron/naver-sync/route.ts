import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { recalculateHokInventory } from "@/lib/integrations/inventory-calculator";
import { naverConnector } from "@/lib/integrations/naver";
import { decrypt } from "@/lib/integrations/encryption";
import { validateCronSecret } from "@/lib/cron-auth";
import * as notify from "@/lib/notifications";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "NAVER", isActive: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active NAVER integration found" },
      { status: 404 },
    );
  }

  const result = await runSync(naverConnector, config.companyId);

  // --- Notifications ---
  if (result.errorMessage || result.recordsFailed > 0) {
    await notify.send({
      type: "SYNC_FAILED",
      priority: "URGENT",
      title: "Naver Sync Failed",
      message: result.errorMessage || `${result.recordsFailed} records failed`,
      data: { platform: "NAVER", recordsFailed: result.recordsFailed, recordsProcessed: result.recordsProcessed },
      companyId: config.companyId,
    });
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

  // Check low stock for HOK
  try {
    const lowStock = await prisma.$queryRaw<{ productName: string; quantity: number; companyId: string }[]>`
      SELECT p.name as "productName", i.quantity, i."companyId"
      FROM public."Inventory" i JOIN public."Product" p ON i."productId" = p.id
      WHERE i.quantity <= i."reorderLevel" AND i."reorderLevel" > 0
      AND i."companyId" = ${config.companyId}
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
  } catch (err) {
    console.error("Low stock check failed:", (err as Error).message);
  }

  // Sync ExternalInventory (Naver-specific)
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    await naverConnector.syncInventory(credentials, config.companyId);
  } catch (err) {
    console.error("Naver inventory sync failed:", (err as Error).message);
  }

  // Recalculate HOK inventory
  await recalculateHokInventory(config.companyId);

  if (result.errorMessage) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
