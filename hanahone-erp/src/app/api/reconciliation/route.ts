// src/app/api/reconciliation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { authenticate, odooRpc } from "@/lib/integrations/connectors/cgetc";
import { calculateExpectedStock } from "@/lib/reconciliation";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  // 1. Get PO line items (purchased quantities by SKU)
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

  // 2. Get sold quantities by SKU (from order items)
  const orderItems = await prisma.orderItem.findMany({
    where: { order: { companyId } },
    include: { product: { select: { sku: true } } },
  });

  const soldBySku: Record<string, number> = {};
  for (const item of orderItems) {
    const sku = item.product.sku;
    soldBySku[sku] = (soldBySku[sku] || 0) + item.quantity;
  }

  // 3. Get reconciliation adjustments by SKU
  const adjustments = await prisma.reconciliationAdjustment.findMany({
    where: { companyId },
  });

  const adjustedBySku: Record<string, number> = {};
  for (const adj of adjustments) {
    adjustedBySku[adj.sku] = (adjustedBySku[adj.sku] || 0) + adj.quantity;
  }

  // 4. Get CGETC actual stock via stock.quant API
  const actualBySku: Record<string, number> = {};
  try {
    const config = await prisma.integrationConfig.findFirst({
      where: { companyId, platform: "CGETC", isActive: true },
    });
    if (config) {
      const creds = JSON.parse(decrypt(config.credentials));
      const sessionId = await authenticate(creds.url, creds.db, creds.email, creds.password);
      const quants = await odooRpc(creds.url, sessionId, "stock.quant", "search_read",
        [[["quantity", ">", 0], ["location_id.usage", "=", "internal"]]],
        { fields: ["product_id", "quantity"] },
      );
      if (Array.isArray(quants)) {
        for (const q of quants) {
          const name = q.product_id?.[1] || "";
          const sku = name.match(/^\[([^\]]+)\]/)?.[1];
          if (sku) {
            actualBySku[sku] = (actualBySku[sku] || 0) + (q.quantity || 0);
          }
        }
      }
    }
  } catch {
    // stock.quant fetch failed — actualBySku stays empty
  }

  // 5. Build comparison for tracked SKUs (those with PO data)
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

const VALID_REASONS = ["SEEDING", "DAMAGED", "SAMPLE", "PROMOTION", "OTHER"];

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const { companyId, sku, productName, quantity, reason, memo } = await req.json();

  if (!companyId || !sku || quantity === undefined || !reason) {
    return NextResponse.json({ error: "companyId, sku, quantity, reason required" }, { status: 400 });
  }

  if (!VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` }, { status: 400 });
  }

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
