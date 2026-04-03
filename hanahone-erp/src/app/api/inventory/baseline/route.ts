import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { z } from "zod";

const UpdateBaselineSchema = z.object({
  companyId: z.string().uuid(),
  sku: z.string().min(1),
  quantity: z.number().int().min(0),
});

export async function PATCH(req: NextRequest) {
  const raw = await req.json();
  const parsed = UpdateBaselineSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, sku, quantity } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  try {
    const existing = await prisma.inventoryBaseline.findUnique({
      where: { companyId_sku: { companyId, sku } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 });
    }

    const updated = await prisma.inventoryBaseline.update({
      where: { companyId_sku: { companyId, sku } },
      data: { quantity },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
