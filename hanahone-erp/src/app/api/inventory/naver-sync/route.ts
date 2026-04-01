import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { decrypt } from "@/lib/integrations/encryption";
import { updateNaverStock } from "@/lib/integrations/naver/products";
import type { NaverCredentials } from "@/lib/integrations/naver/types";
import { z } from "zod";

const SyncSchema = z.object({
  companyId: z.string().uuid(),
  items: z.array(
    z.object({
      naverProductNo: z.string(),
      quantity: z.number().int().min(0),
    })
  ),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = SyncSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, items } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  // Get Naver credentials
  const config = await prisma.integrationConfig.findFirst({
    where: { companyId, platform: "NAVER", isActive: true },
  });
  if (!config) {
    return NextResponse.json({ error: "Naver integration not configured" }, { status: 400 });
  }

  const credentials: NaverCredentials = JSON.parse(decrypt(config.credentials));

  const results: { naverProductNo: string; success: boolean; error?: string }[] = [];
  for (const item of items) {
    try {
      await updateNaverStock(credentials, item.naverProductNo, item.quantity);
      results.push({ naverProductNo: item.naverProductNo, success: true });
    } catch (err: any) {
      results.push({ naverProductNo: item.naverProductNo, success: false, error: err.message });
    }
  }

  const allSuccess = results.every((r) => r.success);
  return NextResponse.json({ results }, { status: allSuccess ? 200 : 207 });
}
