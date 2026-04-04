import { prisma } from "@/lib/prisma";
import { decrypt } from "./encryption";
import { SyncStatus } from "@prisma/client";
import type { Connector, SyncResult } from "./types";
import { mapExternalOrder, mapFulfillmentStatus, mapFinancialStatus } from "./mappers/order-mapper";
import { adjustInventoryForOrder } from "./inventory-deduction";

const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function cleanupStaleJobs(companyId: string, platform: string) {
  const threshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
  await prisma.syncJob.updateMany({
    where: {
      companyId,
      platform: platform as any,
      status: "RUNNING",
      startedAt: { lt: threshold },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: "Timed out — marked stale by cleanup",
    },
  });
}

export async function runSync(connector: Connector, companyId: string): Promise<SyncResult> {
  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: connector.platform } },
  });

  if (!config || !config.isActive) {
    return { recordsProcessed: 0, recordsFailed: 0, errorMessage: "Integration not active" };
  }

  // Clean up stale RUNNING jobs (e.g. from Vercel timeout)
  await cleanupStaleJobs(companyId, connector.platform);

  // Concurrency guard
  const runningJob = await prisma.syncJob.findFirst({
    where: { companyId, platform: connector.platform, status: "RUNNING" },
  });
  if (runningJob) {
    return { recordsProcessed: 0, recordsFailed: 0, errorMessage: "Sync already in progress" };
  }

  const job = await prisma.syncJob.create({
    data: { companyId, platform: connector.platform, status: SyncStatus.RUNNING },
  });

  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const externalOrders = await connector.fetchOrders(credentials, config.lastSyncAt, companyId);

    let processed = 0;
    let failed = 0;

    for (const extOrder of externalOrders) {
      try {
        // Use overridePlatform if set (e.g. CGETC order tagged as TIKTOK/AMAZON)
        const effectivePlatform = extOrder.overridePlatform || connector.platform;

        const existing = await prisma.externalOrder.findUnique({
          where: {
            platform_externalOrderId: {
              platform: connector.platform,
              externalOrderId: extOrder.externalOrderId,
            },
          },
          include: { mappedOrder: true },
        });

        if (existing && existing.mappedOrder) {
          // Update existing order's statuses (refund sync)
          const newFulfillment = mapFulfillmentStatus(extOrder.fulfillmentStatus);
          const newFinancial = mapFinancialStatus(extOrder.financialStatus);
          const refund = extOrder.refundAmount || 0;
          const net = extOrder.totalAmount - refund;

          const needsUpdate =
            existing.mappedOrder.fulfillmentStatus !== newFulfillment ||
            existing.mappedOrder.financialStatus !== newFinancial ||
            Number(existing.mappedOrder.totalAmount) !== extOrder.totalAmount;

          if (needsUpdate) {
            await prisma.order.update({
              where: { id: existing.mappedOrder.id },
              data: {
                fulfillmentStatus: newFulfillment,
                financialStatus: newFinancial,
                totalAmount: extOrder.totalAmount,
                refundAmount: refund > 0 ? refund : null,
                netAmount: net,
                deliveredAt: newFulfillment === "DELIVERED" && !existing.mappedOrder.deliveredAt
                  ? new Date()
                  : existing.mappedOrder.deliveredAt,
              },
            });
            // Update raw data
            await prisma.externalOrder.update({
              where: { id: existing.id },
              data: { rawData: extOrder.rawData },
            });

            // Adjust inventory on status change (deduct or restore)
            try {
              await adjustInventoryForOrder(existing.mappedOrder.id);
            } catch (err) {
              console.error("Inventory adjustment failed for order", existing.mappedOrder.id, (err as Error).message);
            }
          }
          processed++;
          continue;
        }

        if (existing) { processed++; continue; }

        // New order — use effectivePlatform so CGETC orders tagged as TIKTOK/AMAZON get correct externalSource
        const mappedOrder = await mapExternalOrder(extOrder, companyId, effectivePlatform);

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

        // Auto-create InterCompanyTransfer for inter-company orders
        if (extOrder.orderType === "INTER_COMPANY") {
          try {
            // HOI → HOK for "Hanah One" customer
            const toCompany = await prisma.company.findFirst({
              where: { name: "HOK" },
            });
            if (toCompany) {
              await prisma.interCompanyTransfer.create({
                data: {
                  fromCompanyId: companyId,
                  toCompanyId: toCompany.id,
                  orderId: mappedOrder.id,
                  status: "RECEIVED",
                  transferDate: new Date(extOrder.orderDate),
                  receivedDate: new Date(extOrder.orderDate),
                  reason: "Inter-company transfer (auto-detected)",
                },
              });
            }
          } catch (err) {
            console.error("Transfer creation failed for order", mappedOrder.id, (err as Error).message);
          }
        }

        // Auto-deduct inventory for new orders
        try {
          await adjustInventoryForOrder(mappedOrder.id);
        } catch (err) {
          console.error("Inventory deduction failed for order", mappedOrder.id, (err as Error).message);
        }

        processed++;
      } catch {
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
      const now = new Date();

      for (const item of inventoryData) {
        // 1. ExternalInventory에 원본 전체 저장 (upsert)
        await prisma.externalInventory.upsert({
          where: {
            companyId_platform_externalSku: {
              companyId,
              platform: connector.platform,
              externalSku: item.sku,
            },
          },
          update: {
            externalName: item.productName,
            quantity: item.quantity,
            warehouseLocation: item.warehouseLocation || null,
            lastSyncAt: now,
          },
          create: {
            companyId,
            platform: connector.platform,
            externalSku: item.sku,
            externalName: item.productName,
            quantity: item.quantity,
            warehouseLocation: item.warehouseLocation || null,
            lastSyncAt: now,
          },
        });

        // 2. SkuMapping이 있으면 → 매핑된 Product의 Inventory 업데이트
        const mapping = await prisma.skuMapping.findUnique({
          where: {
            companyId_platform_externalSku: {
              companyId,
              platform: connector.platform,
              externalSku: item.sku,
            },
          },
        });

        if (mapping?.productId) {
          await prisma.inventory.upsert({
            where: {
              productId_companyId_warehouseLocation: {
                productId: mapping.productId,
                companyId,
                warehouseLocation: item.warehouseLocation || "CGETC",
              },
            },
            update: { quantity: item.quantity },
            create: {
              productId: mapping.productId,
              companyId,
              quantity: item.quantity,
              warehouseLocation: item.warehouseLocation || "CGETC",
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
