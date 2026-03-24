import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { calculateAdjustment } from "@/lib/inventory-adjuster";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const transfers = await prisma.interCompanyTransfer.findMany({
    include: {
      fromCompany: { select: { name: true } },
      toCompany: { select: { name: true } },
      order: { include: { items: { include: { product: { select: { name: true } } } } } },
    },
    orderBy: { transferDate: "desc" },
  });
  return NextResponse.json(transfers);
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;
  const currentUserId = (session!.user as any).id;
  const { transferId, status } = await req.json();

  if (status === "SHIPPED") {
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.interCompanyTransfer.findUniqueOrThrow({
        where: { id: transferId },
        include: { order: { include: { items: true } } },
      });
      const updated = await tx.interCompanyTransfer.update({
        where: { id: transferId },
        data: { status: "SHIPPED" },
      });
      for (const item of transfer.order.items) {
        const inventory = await tx.inventory.findFirst({
          where: { productId: item.productId, companyId: transfer.fromCompanyId },
        });
        if (inventory) {
          const adj = calculateAdjustment(inventory.quantity, -item.quantity, "TRANSFER_OUT");
          await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: adj.newQuantity } });
          await tx.inventoryAdjustment.create({
            data: {
              inventoryId: inventory.id, companyId: transfer.fromCompanyId,
              adjustmentType: "TRANSFER_OUT", quantityChange: -item.quantity,
              previousQuantity: adj.previousQuantity, newQuantity: adj.newQuantity,
              referenceId: transfer.id, createdBy: currentUserId,
            },
          });
        }
      }
      return updated;
    });
    return NextResponse.json(result);
  }

  if (status === "RECEIVED") {
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.interCompanyTransfer.findUniqueOrThrow({
        where: { id: transferId },
        include: { order: { include: { items: true } } },
      });
      const updated = await tx.interCompanyTransfer.update({
        where: { id: transferId },
        data: { status: "RECEIVED", receivedDate: new Date() },
      });
      for (const item of transfer.order.items) {
        const inventory = await tx.inventory.findFirst({
          where: { productId: item.productId, companyId: transfer.toCompanyId },
        });
        if (inventory) {
          const adj = calculateAdjustment(inventory.quantity, item.quantity, "TRANSFER_IN");
          await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: adj.newQuantity } });
          await tx.inventoryAdjustment.create({
            data: {
              inventoryId: inventory.id, companyId: transfer.toCompanyId,
              adjustmentType: "TRANSFER_IN", quantityChange: item.quantity,
              previousQuantity: adj.previousQuantity, newQuantity: adj.newQuantity,
              referenceId: transfer.id, createdBy: currentUserId,
            },
          });
        }
      }
      return updated;
    });
    return NextResponse.json(result);
  }

  const updated = await prisma.interCompanyTransfer.update({
    where: { id: transferId },
    data: { status },
  });
  return NextResponse.json(updated);
}
