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

// POST: Set baselines from current CGETC live inventory
// Body: { companyId } — snapshots ALL CGETC products as baselines
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

  // Fetch live CGETC inventory
  const config = await prisma.integrationConfig.findFirst({
    where: { companyId, platform: "CGETC", isActive: true },
  });
  if (!config) {
    return NextResponse.json({ error: "CGETC integration not configured" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(config.credentials));
  const products = await fetchCgetcInventory(credentials);

  if (products.length === 0) {
    return NextResponse.json({ error: "No products found from CGETC" }, { status: 400 });
  }

  const now = new Date();
  const userId = (session as any).user?.id || "system";
  const validProducts = products.filter((p) => p.sku);

  // Delete all existing baselines, then insert fresh (handles stale SKUs)
  const results = await prisma.$transaction([
    prisma.inventoryBaseline.deleteMany({ where: { companyId } }),
    ...validProducts.map((p) =>
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
