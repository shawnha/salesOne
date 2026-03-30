import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { recalculateHokInventory } from "@/lib/integrations/inventory-calculator";
import { shopifyConnector } from "@/lib/integrations/connectors/shopify";
import { amazonConnector } from "@/lib/integrations/connectors/amazon";
import { naverConnector } from "@/lib/integrations/naver";
import { decrypt } from "@/lib/integrations/encryption";
import { pharmacyConnector } from "@/lib/integrations/connectors/pharmacy";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";
import { orderdeskConnector } from "@/lib/integrations/connectors/orderdesk";
import type { Connector } from "@/lib/integrations/types";
import { z } from "zod";

const connectors: Record<string, Connector> = {
  SHOPIFY: shopifyConnector,
  AMAZON: amazonConnector,
  NAVER: naverConnector,
  PHARMACY: pharmacyConnector,
  CGETC: cgetcConnector,
  ORDERDESK: orderdeskConnector,
};

const SyncSchema = z.object({
  companyId: z.string().uuid(),
});

export async function POST(req: NextRequest, { params }: { params: { platform: string } }) {
  const platform = params.platform.toUpperCase();
  const connector = connectors[platform];
  if (!connector) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });

  const raw = await req.json();
  const parsed = SyncSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const result = await runSync(connector, companyId);

  // Naver: sync ExternalInventory separately (not via Connector.fetchInventory)
  if (platform === "NAVER") {
    try {
      const config = await prisma.integrationConfig.findUnique({
        where: { companyId_platform: { companyId, platform: "NAVER" } },
      });
      if (config) {
        const credentials = JSON.parse(decrypt(config.credentials));
        await naverConnector.syncInventory(credentials, companyId);
      }
    } catch (err) {
      console.error("Naver inventory sync failed:", (err as Error).message);
    }
  }

  // Trigger HOK inventory recalculation for Naver/Pharmacy
  if (["NAVER", "PHARMACY"].includes(platform)) {
    await recalculateHokInventory(companyId);
  }

  return NextResponse.json(result);
}
