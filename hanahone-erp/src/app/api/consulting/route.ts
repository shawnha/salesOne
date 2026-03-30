import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const CreateEngagementSchema = z.object({
  companyId: z.string().uuid(),
  customerId: z.string().uuid(),
  type: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  billingAmount: z.number().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
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

  const where: any = companyId ? { companyId } : {};
  const engagements = await prisma.consultingEngagement.findMany({
    where,
    include: { customer: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(engagements);
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = CreateEngagementSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const { error } = await requireCompanyAccess(body.companyId);
  if (error) return error;

  const engagement = await prisma.consultingEngagement.create({ data: body as any });
  return NextResponse.json(engagement, { status: 201 });
}
