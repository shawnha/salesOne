import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const CreateGongguSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1),
  sku: z.string().min(1),
  starterQty: z.number().int().min(0),
  refillQty: z.number().int().min(0),
  naverProductNo: z.string().optional(),
  initialOnHand: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = CreateGongguSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, name, sku, starterQty, refillQty, naverProductNo, initialOnHand } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  try {
    const starter = await prisma.product.findFirst({ where: { companyId, sku: "ODD-M01-5" } });
    const refill = await prisma.product.findFirst({ where: { companyId, sku: "ODD-M01-30" } });
    if (!starter || !refill) {
      return NextResponse.json({ error: "Base products not found" }, { status: 404 });
    }

    // Check SKU uniqueness
    const existing = await prisma.product.findFirst({ where: { companyId, sku } });
    if (existing) {
      return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Product
      const product = await tx.product.create({
        data: { companyId, name, sku, category: "공구", basePrice: 0, costPrice: 0 },
      });

      // 2. Create BOM entries
      const bomEntries = [];
      if (starterQty > 0) {
        bomEntries.push({
          companyId,
          finishedProductId: product.id,
          rawMaterialId: starter.id,
          quantityRequired: starterQty,
        });
      }
      if (refillQty > 0) {
        bomEntries.push({
          companyId,
          finishedProductId: product.id,
          rawMaterialId: refill.id,
          quantityRequired: refillQty,
        });
      }
      if (bomEntries.length > 0) {
        await tx.billOfMaterials.createMany({ data: bomEntries });
      }

      // 3. Create Inventory record
      await tx.inventory.create({
        data: {
          companyId,
          productId: product.id,
          quantity: initialOnHand,
          warehouseLocation: "HOK",
          reorderLevel: 0,
        },
      });

      // 4. Create SkuMapping if Naver product linked
      if (naverProductNo) {
        await tx.skuMapping.create({
          data: {
            companyId,
            platform: "NAVER",
            externalSku: naverProductNo,
            displayName: name,
            productId: product.id,
            isGonggu: true,
          },
        });
      }

      return product;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
