import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const type = req.nextUrl.searchParams.get("type");
  const where: any = {};
  if (companyId) where.companyId = companyId;
  if (type) where.type = type;

  const customers = await prisma.customer.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const customer = await prisma.customer.create({ data: body });
  return NextResponse.json(customer, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    // Check if customer has orders (either as customer or brokerage customer)
    const orderCount = await prisma.order.count({
      where: { OR: [{ customerId: id }, { onBehalfOfCustomerId: id }] },
    });
    if (orderCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete: customer has orders" },
        { status: 409 },
      );
    }

    // Delete related records that are safe to cascade, then the customer
    await prisma.$transaction([
      prisma.consultingEngagement.deleteMany({ where: { customerId: id } }),
      prisma.customer.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete: customer has orders" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
