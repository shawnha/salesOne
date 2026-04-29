/**
 * Pending shipment orders for the multi-channel shipping flow.
 *
 * Returns UNFULFILLED + PAID orders grouped by channel for HOK. Excludes:
 * - ROCKET_GROWTH (Coupang fulfillment, no manual dispatch needed)
 * - Already-batched orders (currently in an in-flight ShippingBatch)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  // Already-batched orders (PENDING or SHIPPED batches) — exclude them.
  const activeBatchItems = await prisma.shippingBatchItem.findMany({
    where: {
      batch: { companyId, status: { in: ["PENDING", "SHIPPED"] } },
    },
    select: { orderId: true },
  });
  const inFlightOrderIds = new Set(activeBatchItems.map((i) => i.orderId));

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      fulfillmentStatus: { in: ["UNFULFILLED", "PARTIALLY_FULFILLED"] },
      financialStatus: "PAID",
      externalSource: { in: ["NAVER", "COUPANG"] },
      // ROCKET_GROWTH = Coupang-fulfilled. Seller doesn't dispatch.
      NOT: { shipmentType: "ROCKET_GROWTH" },
    },
    select: {
      id: true,
      orderNumber: true,
      externalOrderNumber: true,
      externalSource: true,
      shipmentType: true,
      totalAmount: true,
      orderDate: true,
      recipientName: true,
      recipientPhone: true,
      shippingAddress: true,
      customer: { select: { name: true } },
      items: {
        select: {
          quantity: true,
          product: { select: { name: true, sku: true } },
        },
      },
    },
    orderBy: { orderDate: "desc" },
  });

  const filtered = orders
    .filter((o) => !inFlightOrderIds.has(o.id))
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      externalOrderNumber: o.externalOrderNumber,
      externalSource: o.externalSource,
      totalAmount: Number(o.totalAmount),
      orderDate: o.orderDate.toISOString(),
      customerName: o.customer?.name ?? null,
      recipientName: o.recipientName,
      recipientPhone: o.recipientPhone,
      shippingAddress: o.shippingAddress,
      items: o.items.map((it) => ({
        productName: it.product?.name ?? null,
        productSku: it.product?.sku ?? null,
        quantity: it.quantity,
      })),
    }));

  // Group by channel for the UI.
  const byChannel = {
    NAVER: filtered.filter((o) => o.externalSource === "NAVER"),
    COUPANG: filtered.filter((o) => o.externalSource === "COUPANG"),
  };

  return NextResponse.json({
    total: filtered.length,
    byChannel,
    excludedRocketGrowth: orders.filter((o) => o.shipmentType === "ROCKET_GROWTH").length,
    inFlightCount: inFlightOrderIds.size,
  });
}
