import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { parseTikTokCsv } from "@/lib/integrations/connectors/tiktok-csv";
import { mapExternalOrder } from "@/lib/integrations/mappers/order-mapper";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const companyId = formData.get("companyId") as string;

  if (!file || !companyId) {
    return NextResponse.json({ error: "file and companyId required" }, { status: 400 });
  }

  const csvContent = await file.text();
  const externalOrders = parseTikTokCsv(csvContent);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const extOrder of externalOrders) {
    try {
      const existing = await prisma.externalOrder.findUnique({
        where: { platform_externalOrderId: { platform: "TIKTOK", externalOrderId: extOrder.externalOrderId } },
      });

      if (existing) { skipped++; continue; }

      const mappedOrder = await mapExternalOrder(extOrder, companyId, "TIKTOK");

      await prisma.externalOrder.create({
        data: {
          companyId,
          platform: "TIKTOK",
          externalOrderId: extOrder.externalOrderId,
          rawData: extOrder.rawData,
          mappedOrderId: mappedOrder.id,
          status: "MAPPED",
        },
      });

      processed++;
    } catch (err) {
      failed++;
    }
  }

  return NextResponse.json({ processed, skipped, failed, total: externalOrders.length });
}
