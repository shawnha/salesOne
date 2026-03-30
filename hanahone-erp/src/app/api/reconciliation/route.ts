import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchCgetcInventory } from "@/lib/integrations/connectors/cgetc";
import { calculateExpectedStock, buildBaselineRows } from "@/lib/reconciliation";
import { z } from "zod";

const VALID_REASONS = ["SEEDING", "DAMAGED", "SAMPLE", "PROMOTION", "OTHER"] as const;

const CreateAdjustmentSchema = z.object({
  companyId: z.string().uuid(),
  sku: z.string().min(1),
  productName: z.string().optional(),
  quantity: z.coerce.number(),
  reason: z.enum(VALID_REASONS),
  memo: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  // Check if baselines exist
  const baselines = await prisma.inventoryBaseline.findMany({
    where: { companyId },
  });

  // Get CGETC actual stock (same source as page — fetchCgetcInventory)
  const actualBySku: Record<string, number> = {};
  try {
    const config = await prisma.integrationConfig.findFirst({
      where: { companyId, platform: "CGETC", isActive: true },
    });
    if (config) {
      const creds = JSON.parse(decrypt(config.credentials));
      const products = await fetchCgetcInventory(creds);
      for (const p of products) {
        if (p.sku) actualBySku[p.sku] = p.quantity;
      }
    }
  } catch {
    // CGETC fetch failed — actualBySku stays empty
  }

  // Baseline mode
  if (baselines.length > 0) {
    const earliestSetAt = baselines.reduce(
      (earliest, b) => (b.setAt < earliest ? b.setAt : earliest),
      baselines[0].setAt
    );

    const [orderItems, adjustments] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { companyId, orderDate: { gt: earliestSetAt } } },
        include: {
          order: { select: { externalSource: true, orderDate: true } },
          product: { select: { sku: true } },
        },
      }),
      prisma.reconciliationAdjustment.findMany({ where: { companyId } }),
    ]);

    const orderItemData = orderItems
      .filter((item) => item.product?.sku)
      .map((item) => ({
        sku: item.product.sku,
        quantity: item.quantity,
        orderDate: item.order.orderDate,
        channel: item.order.externalSource || "OTHER",
      }));

    const adjustmentData = adjustments.map((adj) => ({
      sku: adj.sku,
      quantity: adj.quantity,
      createdAt: adj.createdAt,
    }));

    const rows = buildBaselineRows(baselines, orderItemData, adjustmentData, actualBySku);

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        mode: "baseline" as const,
        status: r.reconciled ? "RECONCILED" : "UNRECONCILED",
      }))
    );
  }

  // Legacy PO-based mode (fallback)
  const poLines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrder: { companyId, platform: "CGETC" } },
    select: { sku: true, productName: true, quantity: true },
  });

  const purchasedBySku: Record<string, { qty: number; name: string }> = {};
  for (const line of poLines) {
    if (!line.sku) continue;
    if (!purchasedBySku[line.sku]) purchasedBySku[line.sku] = { qty: 0, name: line.productName };
    purchasedBySku[line.sku].qty += Number(line.quantity);
  }

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { companyId } },
    include: { product: { select: { sku: true } } },
  });

  const soldBySku: Record<string, number> = {};
  for (const item of orderItems) {
    const sku = item.product.sku;
    soldBySku[sku] = (soldBySku[sku] || 0) + item.quantity;
  }

  const adjustments = await prisma.reconciliationAdjustment.findMany({ where: { companyId } });
  const adjustedBySku: Record<string, number> = {};
  for (const adj of adjustments) {
    adjustedBySku[adj.sku] = (adjustedBySku[adj.sku] || 0) + adj.quantity;
  }

  const skus = Object.keys(purchasedBySku);
  const result = skus.map((sku) => {
    const purchased = purchasedBySku[sku]?.qty || 0;
    const sold = soldBySku[sku] || 0;
    const adjusted = adjustedBySku[sku] || 0;
    const expected = calculateExpectedStock({ purchased, sold, adjusted });
    const actual = actualBySku[sku];
    const difference = actual !== undefined ? actual - expected : null;

    return {
      sku,
      productName: purchasedBySku[sku]?.name || sku,
      mode: "legacy" as const,
      purchased,
      sold,
      adjusted,
      expectedStock: expected,
      actualStock: actual ?? null,
      difference,
      status: difference === null ? "UNKNOWN" : difference === 0 ? "RECONCILED" : "UNRECONCILED",
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = CreateAdjustmentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, sku, productName, quantity, reason, memo } = parsed.data;

  const { error, session } = await requireCompanyAccess(companyId);
  if (error) return error;

  const adjustment = await prisma.reconciliationAdjustment.create({
    data: {
      companyId,
      sku,
      productName: productName || sku,
      quantity: Number(quantity),
      reason,
      memo: memo || null,
      createdBy: (session as any).user?.id || "system",
    },
  });

  return NextResponse.json(adjustment, { status: 201 });
}
