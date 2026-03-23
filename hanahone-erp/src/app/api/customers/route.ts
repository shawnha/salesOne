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
