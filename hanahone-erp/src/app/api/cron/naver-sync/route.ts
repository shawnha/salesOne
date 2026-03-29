import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { recalculateHokInventory } from "@/lib/integrations/inventory-calculator";
import { naverConnector } from "@/lib/integrations/naver";
import { decrypt } from "@/lib/integrations/encryption";
import { validateCronSecret } from "../cgetc-sync/route";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "NAVER", isActive: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active NAVER integration found" },
      { status: 404 },
    );
  }

  const result = await runSync(naverConnector, config.companyId);

  // Sync ExternalInventory (Naver-specific)
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    await naverConnector.syncInventory(credentials, config.companyId);
  } catch (err) {
    console.error("Naver inventory sync failed:", (err as Error).message);
  }

  // Recalculate HOK inventory
  await recalculateHokInventory(config.companyId);

  if (result.errorMessage) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
