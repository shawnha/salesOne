/**
 * Pending shipment orders for the multi-channel shipping flow.
 *
 * Returns UNFULFILLED + PAID orders grouped by channel. Excludes:
 *   - ROCKET_GROWTH (Coupang fulfillment — no manual dispatch needed)
 *   - Already-batched orders (currently in a PENDING/SHIPPED ShippingBatch)
 *
 * Optional date filters on orderDate:
 *   ?from=YYYY-MM-DD   inclusive lower bound (00:00 KST)
 *   ?to=YYYY-MM-DD     inclusive upper bound (23:59:59.999 KST)
 *
 * Both omitted => no date filter (everything pending).
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";

const KST_OFFSET_MIN = 9 * 60;

function parseKstDate(input: string | null, endOfDay: boolean): Date | null {
  if (!input) return null;
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  // Date.UTC then shift by -9h so the resulting instant equals 00:00 (or 23:59:59.999) KST.
  const ms = endOfDay
    ? Date.UTC(y, mo, d, 23, 59, 59, 999)
    : Date.UTC(y, mo, d, 0, 0, 0, 0);
  return new Date(ms - KST_OFFSET_MIN * 60_000);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const from = parseKstDate(sp.get("from"), false);
  const to = parseKstDate(sp.get("to"), true);

  const activeBatchItems = await prisma.shippingBatchItem.findMany({
    where: {
      batch: { companyId, status: { in: ["PENDING", "SHIPPED"] } },
    },
    select: { orderId: true },
  });
  const inFlightOrderIds = new Set(activeBatchItems.map((i) => i.orderId));

  const dateWhere =
    from || to
      ? {
          orderDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

  const baseWhere: Prisma.OrderWhereInput = {
    companyId,
    fulfillmentStatus: { in: ["UNFULFILLED", "PARTIALLY_FULFILLED"] },
    financialStatus: "PAID",
    externalSource: { in: ["NAVER", "COUPANG"] },
    ...dateWhere,
  };

  const orders = await prisma.order.findMany({
    where: {
      ...baseWhere,
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

  // Same window, but only the RG slice — for the informational badge.
  const excludedRocketGrowth = await prisma.order.count({
    where: { ...baseWhere, shipmentType: "ROCKET_GROWTH" },
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

  const byChannel = {
    NAVER: filtered.filter((o) => o.externalSource === "NAVER"),
    COUPANG: filtered.filter((o) => o.externalSource === "COUPANG"),
  };

  return NextResponse.json({
    total: filtered.length,
    byChannel,
    excludedRocketGrowth,
    inFlightCount: inFlightOrderIds.size,
    range: { from: sp.get("from"), to: sp.get("to") },
  });
}
