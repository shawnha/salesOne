import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const UpsertSkuMappingSchema = z.object({
  companyId: z.string().uuid(),
  platform: z.string().min(1),
  externalSku: z.string().min(1),
  displayName: z.string().min(1),
  productId: z.string().uuid().optional().nullable(),
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

  const platform = req.nextUrl.searchParams.get("platform");

  const where: any = {};
  if (companyId) where.companyId = companyId;
  if (platform) where.platform = platform;

  const mappings = await prisma.skuMapping.findMany({
    where,
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { externalSku: "asc" },
  });

  return NextResponse.json(mappings);
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = UpsertSkuMappingSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, platform, externalSku, displayName, productId } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const mapping = await prisma.skuMapping.upsert({
    where: {
      companyId_platform_externalSku: { companyId, platform: platform as any, externalSku },
    },
    update: {
      displayName,
      productId: productId || null,
    },
    create: {
      companyId,
      platform: platform as any,
      externalSku,
      displayName,
      productId: productId || null,
    },
    include: { product: { select: { name: true, sku: true } } },
  });

  return NextResponse.json(mapping);
}
