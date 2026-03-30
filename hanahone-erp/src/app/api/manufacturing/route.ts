import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const CreateProductionOrderSchema = z.object({
  companyId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const PatchProductionOrderSchema = z.object({
  id: z.string().uuid(),
  status: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  endDate: z.string().optional().nullable(),
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
  const orders = await prisma.productionOrder.findMany({
    where,
    include: { product: { select: { name: true, sku: true } }, company: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = CreateProductionOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const { error } = await requireCompanyAccess(body.companyId);
  if (error) return error;

  const order = await prisma.productionOrder.create({ data: body as any });
  return NextResponse.json(order, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const raw = await req.json();
  const parsed = PatchProductionOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, ...data } = parsed.data;

  // Look up the production order to get companyId for access check
  const existing = await prisma.productionOrder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Production order not found" }, { status: 404 });
  }

  const { error } = await requireCompanyAccess(existing.companyId);
  if (error) return error;

  const updated = await prisma.productionOrder.update({ where: { id }, data: data as any });
  return NextResponse.json(updated);
}
