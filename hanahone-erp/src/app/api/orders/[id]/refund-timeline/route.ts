import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      orderDate: true,
      totalAmount: true,
      refundAmount: true,
      financialStatus: true,
      externalSource: true,
      customer: { select: { name: true } },
    },
  });

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const externalOrder = await prisma.externalOrder.findFirst({
    where: { mappedOrderId: order.id },
    select: { rawData: true },
  });

  const rawRefunds = (externalOrder?.rawData as any)?.refunds || [];
  const refunds = rawRefunds.map((r: any) => ({
    date: r.created_at || null,
    note: r.note || null,
    amount: (r.transactions || []).reduce((s: number, t: any) => s + parseFloat(t.amount || "0"), 0),
    items: (r.refund_line_items || []).map((li: any) => ({
      title: li.line_item?.title || "Unknown",
      quantity: li.quantity,
      subtotal: parseFloat(li.subtotal || "0"),
    })),
  }));

  return NextResponse.json({
    orderDate: order.orderDate,
    totalAmount: Number(order.totalAmount),
    refundAmount: Number(order.refundAmount || 0),
    financialStatus: order.financialStatus,
    customerName: order.customer?.name || null,
    refunds,
  });
}
