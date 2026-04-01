import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const UpdateGongguSchema = z.object({
  inventoryId: z.string().uuid(),
  quantity: z.number().int().min(0),
});

export async function PATCH(req: NextRequest) {
  const raw = await req.json();
  const parsed = UpdateGongguSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { inventoryId, quantity } = parsed.data;

  const inventoryRecord = await prisma.inventory.findUnique({
    where: { id: inventoryId },
    include: { product: { select: { name: true } } },
  });
  if (!inventoryRecord) {
    return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  }

  const { error, session } = await requireCompanyAccess(inventoryRecord.companyId);
  if (error) return error;

  // Resolve user ID from email (token.sub may not match DB user.id)
  const sessionEmail = session!.user?.email;
  const dbUser = sessionEmail
    ? await prisma.user.findUnique({ where: { email: sessionEmail }, select: { id: true } })
    : null;
  const currentUserId = dbUser?.id || (session!.user as any).id;

  const previousQuantity = inventoryRecord.quantity;
  const change = quantity - previousQuantity;
  if (change === 0) {
    return NextResponse.json(inventoryRecord);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.inventory.update({
        where: { id: inventoryId },
        data: { quantity },
      });
      await tx.inventoryAdjustment.create({
        data: {
          inventoryId,
          companyId: inventoryRecord.companyId,
          adjustmentType: "MANUAL",
          quantityChange: change,
          previousQuantity,
          newQuantity: quantity,
          reason: `공구 on-hand 수정: ${inventoryRecord.product.name} ${previousQuantity} → ${quantity}`,
          createdBy: currentUserId,
        },
      });
      return updated;
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Gonggu update error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
