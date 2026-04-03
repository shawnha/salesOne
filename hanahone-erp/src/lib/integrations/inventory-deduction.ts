import { prisma } from "@/lib/prisma";

const SYSTEM_USER_EMAIL = "system@hanahone.internal";

async function getSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: SYSTEM_USER_EMAIL } });
  return user?.id || "system";
}

/**
 * Check if inventory was already adjusted for this order item.
 */
async function wasAlreadyAdjusted(referenceId: string): Promise<boolean> {
  const existing = await prisma.inventoryAdjustment.findFirst({
    where: { referenceId },
  });
  return !!existing;
}

/**
 * Adjust inventory for a single order after sync.
 * Called for new orders and status changes.
 *
 * - PAID orders → deduct inventory
 * - CANCELLED/VOIDED/REFUNDED → restore if previously deducted
 */
export async function adjustInventoryForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true } },
        },
      },
    },
  });

  if (!order || order.items.length === 0) return;

  const companyId = order.companyId;
  const shouldDeduct = order.financialStatus === "PAID" || order.financialStatus === "PARTIALLY_PAID";
  const shouldRestore = order.financialStatus === "VOIDED" || order.financialStatus === "REFUNDED";

  if (!shouldDeduct && !shouldRestore) return;

  const systemUserId = await getSystemUserId();

  // Get BOM data for gonggu products
  const bom = await prisma.billOfMaterials.findMany({
    where: { companyId },
    include: {
      finishedProduct: { select: { id: true, sku: true } },
      rawMaterial: { select: { id: true, sku: true } },
    },
  });

  // Get gonggu product IDs
  const gongguMappings = await prisma.skuMapping.findMany({
    where: { companyId, platform: "NAVER", isGonggu: true },
    select: { productId: true },
  });
  const gongguProductIds = new Set(gongguMappings.map((m) => m.productId).filter(Boolean));

  for (const item of order.items) {
    if (!item.productId || !item.product) continue;

    const isGonggu = gongguProductIds.has(item.productId);
    const refKey = `order:${orderId}:item:${item.id}`;

    if (shouldDeduct) {
      if (await wasAlreadyAdjusted(refKey)) continue;

      if (isGonggu) {
        // Gonggu order: deduct gonggu on-hand + baseline via BOM
        await deductGongguOrder(companyId, item.productId, item.product.name, item.quantity, bom, refKey, systemUserId);
      } else {
        // Regular order: deduct from baseline
        await deductBaselineForProduct(companyId, item.product.sku || "", item.product.name, item.quantity, refKey, systemUserId);
      }
    } else if (shouldRestore) {
      const restoreKey = `restore:${orderId}:item:${item.id}`;
      if (await wasAlreadyAdjusted(restoreKey)) continue;

      // Find original deduction adjustments
      const originalAdjs = await prisma.inventoryAdjustment.findMany({
        where: { referenceId: refKey },
      });

      if (originalAdjs.length === 0) continue;

      // Reverse each adjustment
      for (const adj of originalAdjs) {
        const inv = await prisma.inventory.findUnique({ where: { id: adj.inventoryId } });
        if (!inv) continue;

        const restoreQty = -adj.quantityChange; // reverse
        await prisma.inventory.update({
          where: { id: inv.id },
          data: { quantity: inv.quantity + restoreQty },
        });
        await prisma.inventoryAdjustment.create({
          data: {
            inventoryId: inv.id,
            companyId,
            adjustmentType: "SALE",
            quantityChange: restoreQty,
            previousQuantity: inv.quantity,
            newQuantity: inv.quantity + restoreQty,
            referenceId: restoreKey,
            reason: `주문 취소 복원: ${order.orderNumber}`,
            createdBy: systemUserId,
          },
        });
      }

      // Restore baseline too
      await restoreBaseline(companyId, originalAdjs, refKey, order.orderNumber);
    }
  }
}

async function deductGongguOrder(
  companyId: string,
  productId: string,
  productName: string,
  quantity: number,
  bom: any[],
  referenceId: string,
  createdBy: string,
) {
  // 1. Deduct gonggu on-hand
  const gongguInv = await prisma.inventory.findFirst({
    where: { companyId, productId },
  });
  if (gongguInv) {
    const newQty = Math.max(0, gongguInv.quantity - quantity);
    await prisma.inventory.update({
      where: { id: gongguInv.id },
      data: { quantity: newQty },
    });
    await prisma.inventoryAdjustment.create({
      data: {
        inventoryId: gongguInv.id,
        companyId,
        adjustmentType: "SALE",
        quantityChange: -quantity,
        previousQuantity: gongguInv.quantity,
        newQuantity: newQty,
        referenceId,
        reason: `공구 판매: ${productName} x${quantity}`,
        createdBy,
      },
    });
  }

  // 2. Deduct from baseline via BOM
  const productBom = bom.filter((b) => b.finishedProductId === productId);
  for (const entry of productBom) {
    const rawSku = entry.rawMaterial.sku;
    const bomQty = Number(entry.quantityRequired) * quantity;

    const baseline = await prisma.inventoryBaseline.findUnique({
      where: { companyId_sku: { companyId, sku: rawSku } },
    });
    if (baseline) {
      await prisma.inventoryBaseline.update({
        where: { companyId_sku: { companyId, sku: rawSku } },
        data: { quantity: Math.max(0, baseline.quantity - bomQty) },
      });
    }
  }
}

async function deductBaselineForProduct(
  companyId: string,
  sku: string,
  productName: string,
  quantity: number,
  referenceId: string,
  createdBy: string,
) {
  if (!sku) return;

  const baseline = await prisma.inventoryBaseline.findUnique({
    where: { companyId_sku: { companyId, sku } },
  });
  if (!baseline) return;

  await prisma.inventoryBaseline.update({
    where: { companyId_sku: { companyId, sku } },
    data: { quantity: Math.max(0, baseline.quantity - quantity) },
  });

  // Also record adjustment for tracking (use any inventory record for this product)
  const inv = await prisma.inventory.findFirst({
    where: { companyId, product: { sku } },
  });
  if (inv) {
    await prisma.inventoryAdjustment.create({
      data: {
        inventoryId: inv.id,
        companyId,
        adjustmentType: "SALE",
        quantityChange: -quantity,
        previousQuantity: baseline.quantity,
        newQuantity: Math.max(0, baseline.quantity - quantity),
        referenceId,
        reason: `판매 차감: ${productName} x${quantity}`,
        createdBy,
      },
    });
  }
}

async function restoreBaseline(
  companyId: string,
  originalAdjs: any[],
  _referenceId: string,
  _orderNumber: string,
) {
  // Group adjustments by inventory and reverse baseline changes
  for (const adj of originalAdjs) {
    const inv = await prisma.inventory.findUnique({
      where: { id: adj.inventoryId },
      include: { product: { select: { sku: true } } },
    });
    if (!inv?.product?.sku) continue;

    const baseline = await prisma.inventoryBaseline.findUnique({
      where: { companyId_sku: { companyId, sku: inv.product.sku } },
    });
    if (baseline) {
      await prisma.inventoryBaseline.update({
        where: { companyId_sku: { companyId, sku: inv.product.sku } },
        data: { quantity: baseline.quantity + Math.abs(adj.quantityChange) },
      });
    }
  }
}
