import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { syncShippingCosts } from "@/lib/integrations/connectors/cgetc-shipping";
import { z } from "zod";

const SyncShippingCostsSchema = z.object({
  companyId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = SyncShippingCostsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: "CGETC" } },
  });
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "CGETC integration not active" }, { status: 400 });
  }

  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const result = await syncShippingCosts(credentials, companyId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
