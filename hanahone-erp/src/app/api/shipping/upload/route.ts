import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { parseTrackingExcel } from "@/lib/shipping/excel-parser";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { batchId, rows } = parseTrackingExcel(buffer);

  if (!batchId) {
    return NextResponse.json(
      { error: "Could not determine batchId from file" },
      { status: 400 }
    );
  }

  const batch = await prisma.shippingBatch.findUnique({
    where: { id: batchId },
    include: { items: true },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  if (batch.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Batch is already completed" },
      { status: 400 }
    );
  }

  const errors: { productOrderId: string; rowNumber: number; reason: string }[] = [];
  let updatedCount = 0;

  for (const row of rows) {
    const item = batch.items.find(
      (i) => i.productOrderId === row.productOrderId
    );

    if (!item) {
      errors.push({
        productOrderId: row.productOrderId,
        rowNumber: row.rowNumber,
        reason: "No matching item found in batch",
      });
      continue;
    }

    await prisma.shippingBatchItem.update({
      where: { id: item.id },
      data: { trackingNumber: row.trackingNumber },
    });

    updatedCount++;
  }

  await prisma.shippingBatch.update({
    where: { id: batchId },
    data: { status: "SHIPPED" },
  });

  const response: {
    batchId: string;
    updatedCount: number;
    totalItems: number;
    errors?: typeof errors;
  } = {
    batchId,
    updatedCount,
    totalItems: batch.items.length,
  };

  if (errors.length > 0) {
    response.errors = errors;
  }

  return NextResponse.json(response);
}
