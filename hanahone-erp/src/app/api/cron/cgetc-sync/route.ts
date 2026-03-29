import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";
import { validateCronSecret } from "@/lib/cron-auth";

export const maxDuration = 60;

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

  if (result.errorMessage) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
