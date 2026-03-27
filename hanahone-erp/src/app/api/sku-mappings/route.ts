import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
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
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId, platform, externalSku, displayName, productId } = await req.json();

  if (!companyId || !platform || !externalSku || !displayName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const mapping = await prisma.skuMapping.upsert({
    where: {
      companyId_platform_externalSku: { companyId, platform, externalSku },
    },
    update: {
      displayName,
      productId: productId || null,
    },
    create: {
      companyId,
      platform,
      externalSku,
      displayName,
      productId: productId || null,
    },
    include: { product: { select: { name: true, sku: true } } },
  });

  return NextResponse.json(mapping);
}
