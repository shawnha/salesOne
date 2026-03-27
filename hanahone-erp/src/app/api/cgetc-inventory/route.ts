import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchCgetcInventory } from "@/lib/integrations/connectors/cgetc";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "CGETC", isActive: true },
  });

  if (!config) {
    return NextResponse.json({ error: "CGETC not configured" }, { status: 404 });
  }

  try {
    const credentials = JSON.parse(decrypt(config.credentials));
    const products = await fetchCgetcInventory(credentials);
    return NextResponse.json(products);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch CGETC inventory" },
      { status: 500 },
    );
  }
}
