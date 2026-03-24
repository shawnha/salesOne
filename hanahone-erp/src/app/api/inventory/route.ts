import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { calculateAdjustment } from "@/lib/inventory-adjuster";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const lowStockOnly = req.nextUrl.searchParams.get("lowStock") === "true";
  const where: any = companyId ? { companyId } : {};

  const inventories = await prisma.inventory.findMany({
    where,
    include: {
      product: { select: { name: true, sku: true, category: true } },
      company: { select: { name: true } },
    },
    orderBy: { quantity: "asc" },
  });

  if (lowStockOnly) {
    return NextResponse.json(inventories.filter((inv) => inv.quantity <= inv.reorderLevel));
  }
  return NextResponse.json(inventories);
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;
  const currentUserId = (session!.user as any).id;

  const { inventoryId, change, type, reason } = await req.json();

  const result = await prisma.$transaction(async (tx) => {
    const inventory = await tx.inventory.findUniqueOrThrow({ where: { id: inventoryId } });

    const adj = calculateAdjustment(inventory.quantity, change, type);
    const updated = await tx.inventory.update({
      where: { id: inventoryId },
      data: { quantity: adj.newQuantity },
    });
    await tx.inventoryAdjustment.create({
      data: {
        inventoryId,
        companyId: inventory.companyId,
        adjustmentType: type,
        quantityChange: adj.quantityChange,
        previousQuantity: adj.previousQuantity,
        newQuantity: adj.newQuantity,
        reason,
        createdBy: currentUserId,
      },
    });
    return updated;
  });

  return NextResponse.json(result);
}
