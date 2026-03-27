import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const platform = req.nextUrl.searchParams.get("platform") || "CGETC";
  const search = req.nextUrl.searchParams.get("search");
  const mapped = req.nextUrl.searchParams.get("mapped");

  const where: any = { platform };
  if (companyId) where.companyId = companyId;
  if (search) {
    where.OR = [
      { externalSku: { contains: search, mode: "insensitive" } },
      { externalName: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.externalInventory.findMany({
    where,
    orderBy: { quantity: "desc" },
    take: 200,
  });

  const skuKeys = items.map((i) => i.externalSku);
  const mappings = await prisma.skuMapping.findMany({
    where: {
      companyId: companyId || undefined,
      platform: platform as any,
      externalSku: { in: skuKeys },
    },
    include: { product: { select: { id: true, name: true, sku: true } } },
  });
  const mappingMap = new Map(mappings.map((m) => [m.externalSku, m]));

  let result = items.map((item) => {
    const mapping = mappingMap.get(item.externalSku);
    return {
      ...item,
      mapping: mapping
        ? {
            id: mapping.id,
            displayName: mapping.displayName,
            productId: mapping.productId,
            productName: mapping.product?.name ?? null,
            productSku: mapping.product?.sku ?? null,
          }
        : null,
    };
  });

  if (mapped === "true") result = result.filter((r) => r.mapping?.productId);
  if (mapped === "false") result = result.filter((r) => !r.mapping?.productId);

  return NextResponse.json(result);
}
