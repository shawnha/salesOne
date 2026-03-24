import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { recalculateHokInventory } from "@/lib/integrations/inventory-calculator";
import { shopifyConnector } from "@/lib/integrations/connectors/shopify";
import { amazonConnector } from "@/lib/integrations/connectors/amazon";
import { naverConnector } from "@/lib/integrations/connectors/naver";
import { pharmacyConnector } from "@/lib/integrations/connectors/pharmacy";
import { cgetcConnector } from "@/lib/integrations/connectors/cgetc";
import type { Connector } from "@/lib/integrations/types";

const connectors: Record<string, Connector> = {
  SHOPIFY: shopifyConnector,
  AMAZON: amazonConnector,
  NAVER: naverConnector,
  PHARMACY: pharmacyConnector,
  CGETC: cgetcConnector,
};

export async function POST(req: NextRequest, { params }: { params: { platform: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const platform = params.platform.toUpperCase();
  const connector = connectors[platform];
  if (!connector) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });

  const { companyId } = await req.json();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const result = await runSync(connector, companyId);

  // Trigger HOK inventory recalculation for Naver/Pharmacy
  if (["NAVER", "PHARMACY"].includes(platform)) {
    await recalculateHokInventory(companyId);
  }

  return NextResponse.json(result);
}
