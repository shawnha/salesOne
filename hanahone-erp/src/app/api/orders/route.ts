import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";
import { generateOrderNumber } from "@/lib/order-number";
import { z } from "zod";

const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number(),
  subtotal: z.number(),
});

const CreateOrderSchema = z.object({
  companyId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  onBehalfOfCustomerId: z.string().uuid().optional().nullable(),
  type: z.string().min(1),
  orderDate: z.string().min(1),
  totalAmount: z.number(),
  costAmount: z.number().optional().nullable(),
  marginAmount: z.number().optional().nullable(),
  fulfillmentStatus: z.string().optional(),
  financialStatus: z.string().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(OrderItemSchema).optional(),
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
  const raw = await req.json();
  const parsed = CreateOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const { error } = await requireCompanyAccess(body.companyId);
  if (error) return error;

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(body.companyId, tx);
    return tx.order.create({
      data: {
        ...(body as any),
        orderNumber,
        items: body.items ? { create: body.items } : undefined,
      },
      include: { items: true },
    });
  });

  return NextResponse.json(order, { status: 201 });
}
