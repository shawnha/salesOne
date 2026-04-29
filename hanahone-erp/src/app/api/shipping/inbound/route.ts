/**
 * Rocket Growth Inbound API.
 *
 * GET  ?companyId=X — 입고 라운드 목록 + 권장 입고량 (burn rate 기반)
 * POST            — 새 입고 라운드 생성 (items[] 포함)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const CreateInboundSchema = z.object({
  companyId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        vendorItemId: z.string().nullable().optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  // === 권장 입고량 계산 (Coupang Rocket Growth 재고 + 30일 burn rate) ===
  const externalInv = await prisma.externalInventory.findMany({
    where: { companyId, platform: "COUPANG" },
    select: { externalSku: true, externalName: true, quantity: true },
  });
  const skuMappings = await prisma.skuMapping.findMany({
    where: {
      companyId,
      platform: "COUPANG",
      externalSku: { in: externalInv.map((e) => e.externalSku) },
    },
    select: {
      externalSku: true,
      displayName: true,
      product: { select: { id: true, sku: true, name: true } },
    },
  });
  const mappingByExtSku = new Map(skuMappings.map((m) => [m.externalSku, m]));

  // 30-day Coupang sales (rocket growth + marketplace 둘 다 카운트, master sku 기준)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentItems = await prisma.orderItem.findMany({
    where: {
      order: {
        companyId,
        externalSource: "COUPANG",
        orderDate: { gte: thirtyDaysAgo },
      },
    },
    select: { quantity: true, product: { select: { sku: true, id: true } } },
  });
  const sales30dByProductId = new Map<string, number>();
  for (const it of recentItems) {
    if (!it.product?.id) continue;
    sales30dByProductId.set(it.product.id, (sales30dByProductId.get(it.product.id) ?? 0) + it.quantity);
  }

  const recommendations = externalInv
    .map((e) => {
      const mapping = mappingByExtSku.get(e.externalSku);
      const productId = mapping?.product?.id ?? null;
      const sales30 = productId ? sales30dByProductId.get(productId) ?? 0 : 0;
      const dailyBurn = sales30 / 30;
      const daysLeft = dailyBurn > 0 ? Math.round(e.quantity / dailyBurn) : null;
      // 안전재고 60일 분량 권장 — 30일 미만이면 모자란만큼 추천
      const safetyDays = 60;
      const recommended = dailyBurn > 0 && daysLeft !== null && daysLeft < safetyDays
        ? Math.ceil(dailyBurn * safetyDays - e.quantity)
        : 0;
      return {
        vendorItemId: e.externalSku,
        externalName: mapping?.displayName ?? e.externalName ?? `로켓그로스 ${e.externalSku}`,
        productId,
        productSku: mapping?.product?.sku ?? null,
        productName: mapping?.product?.name ?? null,
        currentStock: e.quantity,
        sales30d: sales30,
        dailyBurn: Math.round(dailyBurn * 100) / 100,
        daysLeft,
        recommended,
        critical: daysLeft !== null && daysLeft < 30,
      };
    })
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));

  // === 입고 라운드 이력 ===
  const inbounds = await prisma.rocketGrowthInbound.findMany({
    where: { companyId },
    include: {
      items: {
        include: { product: { select: { sku: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    recommendations,
    inbounds: inbounds.map((b) => ({
      id: b.id,
      status: b.status,
      coupangInboundNo: b.coupangInboundNo,
      notes: b.notes,
      requestedAt: b.requestedAt?.toISOString() ?? null,
      shippedAt: b.shippedAt?.toISOString() ?? null,
      receivedAt: b.receivedAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      items: b.items.map((it) => ({
        id: it.id,
        productSku: it.product.sku,
        productName: it.product.name,
        vendorItemId: it.vendorItemId,
        quantity: it.quantity,
        receivedQuantity: it.receivedQuantity,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = CreateInboundSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, items, notes } = parsed.data;
  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const created = await prisma.rocketGrowthInbound.create({
    data: {
      companyId,
      status: "PLANNED",
      notes: notes ?? null,
      items: {
        create: items.map((it) => ({
          productId: it.productId,
          vendorItemId: it.vendorItemId ?? null,
          quantity: it.quantity,
        })),
      },
    },
    include: { items: true },
  });

  return NextResponse.json({ id: created.id, totalItems: created.items.length });
}
