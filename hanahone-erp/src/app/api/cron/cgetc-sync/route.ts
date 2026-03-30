import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";
import { syncShippingCosts } from "@/lib/integrations/connectors/cgetc-shipping";
import { decrypt } from "@/lib/integrations/encryption";
import { validateCronSecret } from "@/lib/cron-auth";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "CGETC", isActive: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active CGETC integration found" },
      { status: 404 },
    );
  }

  const result = await runSync(cgetcConnector, config.companyId);

  // Also sync shipping costs from CGETC portal
  let shippingResult = { synced: 0, total: 0 };
  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    shippingResult = await syncShippingCosts(credentials, config.companyId);
  } catch (err: any) {
    shippingResult = { synced: 0, total: 0 };
  }

  if (result.errorMessage) {
    return NextResponse.json({ ...result, shipping: shippingResult }, { status: 500 });
  }

  return NextResponse.json({ ...result, shipping: shippingResult });
}
