import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const where = companyId ? { companyId } : {};

  const products = await prisma.product.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { name, sku, description, category, basePrice, costPrice, companyId } = body;

  if (!name || !sku || !category || !companyId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: { name, sku, description, category, basePrice: basePrice || 0, costPrice: costPrice || 0, companyId },
  });

  return NextResponse.json(product, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { id, ...data } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const product = await prisma.product.update({
    where: { id },
    data,
  });

  return NextResponse.json(product);
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    // Delete related records that are safe to cascade
    await prisma.$transaction([
      prisma.skuMapping.deleteMany({ where: { productId: id } }),
      prisma.inventory.deleteMany({ where: { productId: id } }),
      prisma.inventorySnapshot.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete: product has orders or production records" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
