/**
 * Create or update a SkuMapping row, mapping an externalSku (Naver/Coupang
 * product number, etc.) to an internal master Product.
 *
 * Used by /inventory's "원상품으로 매핑" button to register a freshly-listed
 * channel product without going through the full 공구 modal — the master
 * already exists, we just need to wire it up.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { Platform } from "@prisma/client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { companyId, platform, externalSku, productId, displayName, isGonggu } = body || {};

  if (!companyId || !platform || !externalSku || !productId) {
    return NextResponse.json(
      { error: "companyId, platform, externalSku, productId 필수" },
      { status: 400 },
    );
  }

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true, sku: true, name: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const mapping = await prisma.skuMapping.upsert({
    where: {
      companyId_platform_externalSku: {
        companyId,
        platform: platform as Platform,
        externalSku: String(externalSku),
      },
    },
    update: {
      productId: product.id,
      displayName: displayName ?? null,
      isGonggu: Boolean(isGonggu),
    },
    create: {
      companyId,
      platform: platform as Platform,
      externalSku: String(externalSku),
      productId: product.id,
      displayName: displayName ?? null,
      isGonggu: Boolean(isGonggu),
    },
  });

  return NextResponse.json({
    id: mapping.id,
    externalSku: mapping.externalSku,
    productId: mapping.productId,
    productSku: product.sku,
    productName: product.name,
  });
}
