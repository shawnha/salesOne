import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { encrypt, maskCredentials } from "@/lib/integrations/encryption";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const configs = await prisma.integrationConfig.findMany({
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Return with masked credentials (decrypt → mask → return)
  const { decrypt } = await import("@/lib/integrations/encryption");
  return NextResponse.json(configs.map((c) => {
    let maskedCreds = null;
    try {
      if (c.credentials) {
        const decrypted = JSON.parse(decrypt(c.credentials));
        maskedCreds = maskCredentials(decrypted);
      }
    } catch { maskedCreds = null; }
    return { ...c, credentials: maskedCreds, _hasCreds: !!c.credentials };
  }));
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId, platform, credentials, isActive, syncIntervalMinutes } = await req.json();

  const encrypted = credentials ? encrypt(JSON.stringify(credentials)) : undefined;

  const config = await prisma.integrationConfig.upsert({
    where: { companyId_platform: { companyId, platform } },
    update: {
      ...(encrypted ? { credentials: encrypted } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(syncIntervalMinutes ? { syncIntervalMinutes } : {}),
    },
    create: {
      companyId,
      platform,
      credentials: encrypted || "",
      isActive: isActive ?? false,
      syncIntervalMinutes: syncIntervalMinutes ?? 15,
    },
  });

  return NextResponse.json({ id: config.id, platform: config.platform, isActive: config.isActive });
}
