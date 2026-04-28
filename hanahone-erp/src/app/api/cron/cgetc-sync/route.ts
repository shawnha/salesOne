import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";
import { syncShippingCosts } from "@/lib/integrations/connectors/cgetc-shipping";
import { decrypt } from "@/lib/integrations/encryption";
import { validateCronSecret } from "@/lib/cron-auth";
import * as notify from "@/lib/notifications";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "CGETC", isActive: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active CGETC integration found" },
      { status: 404 },
    );
  }

  const result = await runSync(cgetcConnector, config.companyId);

  // --- Notifications ---
  if (result.errorMessage || result.recordsFailed > 0) {
    await notify.send({
      type: "SYNC_FAILED",
      priority: "URGENT",
      title: "CGETC Sync Failed",
      message: result.errorMessage || `${result.recordsFailed} records failed`,
      data: { platform: "CGETC", recordsFailed: result.recordsFailed, recordsProcessed: result.recordsProcessed },
      companyId: config.companyId,
    });
  } else if (result.recordsProcessed > 0) {
    await notify.send({
      type: "NEW_ORDERS",
      priority: "NORMAL",
      title: `${result.recordsProcessed} New Orders (CGETC)`,
      message: "Synced successfully",
      data: { platform: "CGETC", count: result.recordsProcessed },
      companyId: config.companyId,
    });
  }

  // Check low stock
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
  } catch (err) {
    console.error("Low stock check failed:", (err as Error).message);
  }

  // Also sync shipping costs from CGETC portal
  let shippingResult = { synced: 0, total: 0 };
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    shippingResult = await syncShippingCosts(credentials, config.companyId);
  } catch {
    shippingResult = { synced: 0, total: 0 };
  }

  if (result.errorMessage) {
    return NextResponse.json({ ...result, shipping: shippingResult }, { status: 500 });
  }

  return NextResponse.json({ ...result, shipping: shippingResult });
}
