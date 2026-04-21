import { prisma } from "@/lib/prisma";

const SYSTEM_USER_EMAIL = "system@hanahone.internal";

async function getSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: SYSTEM_USER_EMAIL } });
  return user?.id || "system";
}

async function wasAlreadyAdjusted(referenceId: string): Promise<boolean> {
  const existing = await prisma.inventoryAdjustment.findFirst({
    where: { referenceId },
  });
  return !!existing;
}

/**
 * Adjust on-hand inventory for a single order after sync.
 *
 * Baseline (InventoryBaseline) is a static opening balance — this function
 * never modifies it. Sales drawdown is represented by InventoryAdjustment
 * rows + Inventory.quantity movements. Reconciliation derives
 * expected = baseline - sum(orderItems after setAt) - reconciliationAdjustments.
 *
 * - PAID → deduct on-hand
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

  const bom = await prisma.billOfMaterials.findMany({
    where: { companyId },
    include: {
      finishedProduct: { select: { id: true, sku: true } },
      rawMaterial: { select: { id: true, sku: true } },
    },
  });

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
        await deductGongguOrder(companyId, item.productId, item.product.name, item.quantity, bom, refKey, systemUserId);
      } else {
        await deductOnHandForProduct(companyId, item.productId, item.product.sku || "", item.product.name, item.quantity, refKey, systemUserId);
      }
    } else if (shouldRestore) {
      const restoreKey = `restore:${orderId}:item:${item.id}`;
      if (await wasAlreadyAdjusted(restoreKey)) continue;

      const originalAdjs = await prisma.inventoryAdjustment.findMany({
        where: { referenceId: refKey },
      });

      if (originalAdjs.length === 0) continue;

      for (const adj of originalAdjs) {
        const inv = await prisma.inventory.findUnique({ where: { id: adj.inventoryId } });
        if (!inv) continue;

        const restoreQty = -adj.quantityChange;
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

  // Deduct BOM raw materials from their on-hand inventory (not baseline).
  const productBom = bom.filter((b) => b.finishedProductId === productId);
  for (const entry of productBom) {
    const rawProductId = entry.rawMaterial.id;
    const bomQty = Number(entry.quantityRequired) * quantity;

    const rawInv = await prisma.inventory.findFirst({
      where: { companyId, productId: rawProductId },
    });
    if (!rawInv) continue;

    const newQty = Math.max(0, rawInv.quantity - bomQty);
    await prisma.inventory.update({
      where: { id: rawInv.id },
      data: { quantity: newQty },
    });
    await prisma.inventoryAdjustment.create({
      data: {
        inventoryId: rawInv.id,
        companyId,
        adjustmentType: "SALE",
        quantityChange: -bomQty,
        previousQuantity: rawInv.quantity,
        newQuantity: newQty,
        referenceId: `${referenceId}:bom:${entry.rawMaterial.sku}`,
        reason: `공구 BOM 차감: ${productName} → ${entry.rawMaterial.sku} x${bomQty}`,
        createdBy,
      },
    });
  }
}

async function deductOnHandForProduct(
  companyId: string,
  productId: string,
  sku: string,
  productName: string,
  quantity: number,
  referenceId: string,
  createdBy: string,
) {
  // Try productId first. Fall back to SKU lookup — CGETC sync writes
  // Inventory via SkuMapping.productId, which can differ from the order
  // item's productId when two Product rows share the same external SKU
  // (ongoing cleanup per project_shopify_product_review).
  let inv = await prisma.inventory.findFirst({
    where: { companyId, productId },
  });
  if (!inv && sku) {
    inv = await prisma.inventory.findFirst({
      where: { companyId, product: { sku } },
    });
  }
  if (!inv) return;

  const newQty = Math.max(0, inv.quantity - quantity);
  await prisma.inventory.update({
    where: { id: inv.id },
    data: { quantity: newQty },
  });
  await prisma.inventoryAdjustment.create({
    data: {
      inventoryId: inv.id,
      companyId,
      adjustmentType: "SALE",
      quantityChange: -quantity,
      previousQuantity: inv.quantity,
      newQuantity: newQty,
      referenceId,
      reason: `판매 차감: ${productName} x${quantity}`,
      createdBy,
    },
  });
}
