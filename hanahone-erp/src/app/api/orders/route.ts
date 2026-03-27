import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { generateOrderNumber } from "@/lib/order-number";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const type = req.nextUrl.searchParams.get("type");
  const fulfillmentStatus = req.nextUrl.searchParams.get("fulfillmentStatus");
  const financialStatus = req.nextUrl.searchParams.get("financialStatus");

  const where: any = {};
  if (companyId) where.companyId = companyId;
  if (type) where.type = type;
  if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus;
  if (financialStatus) where.financialStatus = financialStatus;

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      onBehalfOfCustomer: { select: { name: true } },
      company: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
    orderBy: { orderDate: "desc" },
    take: 50,
  });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const body = await req.json();

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(body.companyId, tx);
    return tx.order.create({
      data: {
        ...body,
        orderNumber,
        items: body.items ? { create: body.items } : undefined,
      },
      include: { items: true },
    });
  });

  return NextResponse.json(order, { status: 201 });
}
