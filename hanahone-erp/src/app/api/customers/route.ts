import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const CreateCustomerSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(["INDIVIDUAL", "DRUGSTORE", "WHOLESALE"]),
  email: z.string().email().optional().nullable(),
  contactInfo: z.record(z.string(), z.string()).optional().nullable(),
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
  const raw = await req.json();
  const parsed = CreateCustomerSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const { error } = await requireCompanyAccess(body.companyId);
  if (error) return error;

  const customer = await prisma.customer.create({ data: body as any });
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
