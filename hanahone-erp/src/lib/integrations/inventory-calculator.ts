import { prisma } from "@/lib/prisma";

export function calculateInventory(initial: number, totalSales: number, totalAdjustments: number): number {
  return Math.max(0, initial - totalSales + totalAdjustments);
}

export async function recalculateHokInventory(companyId: string) {
  const systemUser = await prisma.user.findFirst({ where: { email: "system@hanahone.internal" } });
  if (!systemUser) throw new Error("System user not found");

  const snapshots = await prisma.inventorySnapshot.findMany({
    where: { companyId },
    include: { product: true },
  });

  for (const snapshot of snapshots) {
    const salesItems = await prisma.orderItem.findMany({
      where: {
        order: {
          companyId,
          externalSource: { in: ["NAVER", "PHARMACY"] },
        },
        productId: snapshot.productId,
      },
      select: { quantity: true },
    });
    const totalSales = salesItems.reduce((sum, item) => sum + item.quantity, 0);

    // Exclude SALE adjustments to prevent feedback loop
    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        companyId,
        inventory: { productId: snapshot.productId },
        adjustmentType: { in: ["MANUAL", "PRODUCTION", "PURCHASE", "TRANSFER_IN", "TRANSFER_OUT"] },
      },
      select: { quantityChange: true },
    });
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + adj.quantityChange, 0);

    const newQuantity = calculateInventory(snapshot.initialQuantity, totalSales, totalAdjustments);

    await prisma.inventorySnapshot.update({
      where: { id: snapshot.id },
      data: { calculatedQuantity: newQuantity, lastCalculatedAt: new Date() },
    });

    const inventory = await prisma.inventory.findFirst({
      where: { productId: snapshot.productId, companyId },
    });

    if (inventory && inventory.quantity !== newQuantity) {
      const diff = newQuantity - inventory.quantity;
      await prisma.inventory.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      });

      await prisma.inventoryAdjustment.create({
        data: {
          inventoryId: inventory.id,
          companyId,
          adjustmentType: "SALE",
          quantityChange: diff,
          previousQuantity: inventory.quantity,
          newQuantity,
          reason: "Auto-calculated from synced sales",
          createdBy: systemUser.id,
        },
      });
    }
  }
}
