import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";
import { calculateAdjustment } from "@/lib/inventory-adjuster";
import { z } from "zod";

const PatchInventorySchema = z.object({
  inventoryId: z.string().uuid(),
  change: z.number(),
  type: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const { error } = await requireCompanyAccess(companyId);
    if (error) return error;
  } else {
    const { error } = await requireAuth();
    if (error) return error;
  }

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
  const raw = await req.json();
  const parsed = PatchInventorySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { inventoryId, change, type, reason } = parsed.data;

  // Look up the inventory to get companyId for access check
  const inventoryRecord = await prisma.inventory.findUnique({ where: { id: inventoryId } });
  if (!inventoryRecord) {
    return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  }

  const { error, session } = await requireCompanyAccess(inventoryRecord.companyId);
  if (error) return error;
  const currentUserId = (session!.user as any).id;

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
        adjustmentType: type as any,
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
