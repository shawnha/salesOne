import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const UpdateBomSchema = z.object({
  companyId: z.string().uuid(),
  productId: z.string().uuid(),
  starterQty: z.number().int().min(0),
  refillQty: z.number().int().min(0),
});

export async function PATCH(req: NextRequest) {
  const raw = await req.json();
  const parsed = UpdateBomSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, productId, starterQty, refillQty } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  try {
    // Get raw material product IDs
    const starter = await prisma.product.findFirst({ where: { companyId, sku: "ODD-M01-5" } });
    const refill = await prisma.product.findFirst({ where: { companyId, sku: "ODD-M01-30" } });
    if (!starter || !refill) {
      return NextResponse.json({ error: "Base products not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Delete existing BOM entries for this product
      await tx.billOfMaterials.deleteMany({
        where: { companyId, finishedProductId: productId },
      });

      // Create new BOM entries
      const entries = [];
      if (starterQty > 0) {
        entries.push({
          companyId,
          finishedProductId: productId,
          rawMaterialId: starter.id,
          quantityRequired: starterQty,
        });
      }
      if (refillQty > 0) {
        entries.push({
          companyId,
          finishedProductId: productId,
          rawMaterialId: refill.id,
          quantityRequired: refillQty,
        });
      }
      if (entries.length > 0) {
        await tx.billOfMaterials.createMany({ data: entries });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
