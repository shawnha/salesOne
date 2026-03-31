import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchCgetcInventory } from "@/lib/integrations/connectors/cgetc";
import { z } from "zod";

const SetBaselineSchema = z.object({
  companyId: z.string().uuid(),
});

// GET: Fetch current baselines for a company
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const baselines = await prisma.inventoryBaseline.findMany({
    where: { companyId },
    orderBy: { sku: "asc" },
  });

  return NextResponse.json(baselines);
}

// POST: Set baselines from current inventory
// Body: { companyId } — snapshots inventory as baselines
// For CGETC-connected companies: uses live CGETC data
// For others: uses DB inventory table
// On reset: deletes all existing baselines first, then inserts fresh
export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = SetBaselineSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId } = parsed.data;

  const { error, session } = await requireCompanyAccess(companyId);
  if (error) return error;

  // Try CGETC first
  const config = await prisma.integrationConfig.findFirst({
    where: { companyId, platform: "CGETC", isActive: true },
  });

  let snapshotProducts: { sku: string; name: string; quantity: number }[] = [];

  if (config) {
    const credentials = JSON.parse(decrypt(config.credentials));
    const cgetcProducts = await fetchCgetcInventory(credentials);
    snapshotProducts = cgetcProducts
      .filter((p) => p.sku)
      .map((p) => ({ sku: p.sku, name: p.name, quantity: p.quantity }));
  } else {
    // Fallback: use DB inventory for non-CGETC companies
    const dbInventory = await prisma.inventory.findMany({
      where: { companyId, quantity: { gt: 0 } },
      include: { product: { select: { name: true, sku: true } } },
    });
    snapshotProducts = dbInventory
      .filter((inv) => inv.product.sku)
      .map((inv) => ({ sku: inv.product.sku!, name: inv.product.name, quantity: inv.quantity }));
  }

  if (snapshotProducts.length === 0) {
    return NextResponse.json({ error: "No products with inventory found" }, { status: 400 });
  }

  const now = new Date();
  const userId = (session as any).user?.id || "system";

  // Delete all existing baselines, then insert fresh (handles stale SKUs)
  const results = await prisma.$transaction([
    prisma.inventoryBaseline.deleteMany({ where: { companyId } }),
    ...snapshotProducts.map((p) =>
      prisma.inventoryBaseline.create({
        data: {
          companyId,
          sku: p.sku,
          productName: p.name,
          quantity: p.quantity,
          setAt: now,
          setBy: userId,
        },
      })
    ),
  ]);

  const createdCount = results.length - 1;

  return NextResponse.json({ count: createdCount, setAt: now.toISOString() }, { status: 201 });
}
