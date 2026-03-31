import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { generateNaverUploadExcel, NaverUploadInput } from "@/lib/shipping/excel-generator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const batch = await prisma.shippingBatch.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const itemsWithTracking = batch.items.filter(
    (item) => item.trackingNumber != null && item.trackingNumber !== ""
  );

  if (itemsWithTracking.length === 0) {
    return NextResponse.json(
      { error: "No items with tracking numbers found" },
      { status: 400 }
    );
  }

  const naverInputs: NaverUploadInput[] = itemsWithTracking.map((item) => ({
    productOrderId: item.productOrderId,
    trackingNumber: item.trackingNumber!,
  }));

  const buffer = generateNaverUploadExcel(naverInputs, batch.carrier);

  await prisma.shippingBatch.update({
    where: { id },
    data: { status: "COMPLETED" },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": `attachment; filename="naver-upload-${id}.xls"`,
    },
  });
}
