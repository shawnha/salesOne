import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { calculateAdjustment } from "@/lib/inventory-adjuster";
import { z } from "zod";

const PatchTransferSchema = z.object({
  transferId: z.string().uuid(),
  status: z.string().min(1),
});

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
  const raw = await req.json();
  const parsed = PatchTransferSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { transferId, status } = parsed.data;

  // Look up the transfer to verify access
  const transferRecord = await prisma.interCompanyTransfer.findUnique({ where: { id: transferId } });
  if (!transferRecord) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const { error, session } = await requireAuth();
  if (error) return error;
  const currentUserId = (session!.user as any).id;

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
    data: { status: status as any },
  });
  return NextResponse.json(updated);
}
