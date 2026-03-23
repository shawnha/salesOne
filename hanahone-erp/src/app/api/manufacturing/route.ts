import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const where: any = companyId ? { companyId } : {};
  const orders = await prisma.productionOrder.findMany({
    where,
    include: { product: { select: { name: true, sku: true } }, company: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const order = await prisma.productionOrder.create({ data: body });
  return NextResponse.json(order, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id, ...data } = await req.json();
  const updated = await prisma.productionOrder.update({ where: { id }, data });
  return NextResponse.json(updated);
}
