import { prisma } from "@/lib/prisma";
import { decrypt } from "./encryption";
import { SyncStatus } from "@prisma/client";
import type { Connector, SyncResult } from "./types";
import { mapExternalOrder } from "./mappers/order-mapper";

export async function runSync(connector: Connector, companyId: string): Promise<SyncResult> {
  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: connector.platform } },
  });

  if (!config || !config.isActive) {
    return { recordsProcessed: 0, recordsFailed: 0, errorMessage: "Integration not active" };
  }

  const job = await prisma.syncJob.create({
    data: { companyId, platform: connector.platform, status: SyncStatus.RUNNING },
  });

  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const externalOrders = await connector.fetchOrders(credentials, config.lastSyncAt);

    let processed = 0;
    let failed = 0;

    for (const extOrder of externalOrders) {
      try {
        const existing = await prisma.externalOrder.findUnique({
          where: {
            platform_externalOrderId: {
              platform: connector.platform,
              externalOrderId: extOrder.externalOrderId,
            },
          },
        });

        if (existing) { processed++; continue; }

        const mappedOrder = await mapExternalOrder(extOrder, companyId, connector.platform);

        await prisma.externalOrder.create({
          data: {
            companyId,
            platform: connector.platform,
            externalOrderId: extOrder.externalOrderId,
            rawData: extOrder.rawData,
            mappedOrderId: mappedOrder.id,
            status: "MAPPED",
          },
        });

        processed++;
      } catch (err) {
        failed++;
        await prisma.externalOrder.create({
          data: {
            companyId,
            platform: connector.platform,
            externalOrderId: extOrder.externalOrderId,
            rawData: extOrder.rawData,
            status: "FAILED",
          },
        }).catch(() => {});
      }
    }

    if (connector.fetchInventory) {
      const inventoryData = await connector.fetchInventory(credentials);
      for (const item of inventoryData) {
        const product = await prisma.product.findFirst({
          where: { sku: item.sku, companyId },
        });
        if (product) {
          await prisma.inventory.upsert({
            where: {
              productId_companyId_warehouseLocation: {
                productId: product.id,
                companyId,
                warehouseLocation: item.warehouseLocation || "Main",
              },
            },
            update: { quantity: item.quantity },
            create: {
              productId: product.id,
              companyId,
              quantity: item.quantity,
              warehouseLocation: item.warehouseLocation || "Main",
              reorderLevel: 0,
            },
          });
        }
      }
    }

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", completedAt: new Date(), recordsProcessed: processed, recordsFailed: failed },
    });

    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { lastSyncAt: new Date() },
    });

    return { recordsProcessed: processed, recordsFailed: failed };
  } catch (err: any) {
    const safeMessage = (err.message || "Unknown error").replace(/[A-Za-z0-9_-]{20,}/g, "****");

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: safeMessage },
    });

    return { recordsProcessed: 0, recordsFailed: 0, errorMessage: safeMessage };
  }
}
