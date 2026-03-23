import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const where: any = companyId ? { companyId } : {};
  const engagements = await prisma.consultingEngagement.findMany({
    where,
    include: { customer: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(engagements);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const engagement = await prisma.consultingEngagement.create({ data: body });
  return NextResponse.json(engagement, { status: 201 });
}
