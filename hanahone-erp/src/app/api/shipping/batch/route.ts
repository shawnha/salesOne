import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { z } from "zod";
import {
  generatePurchaseOrderExcel,
  PurchaseOrderInput,
} from "@/lib/shipping/excel-generator";

const CreateBatchSchema = z.object({
  companyId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()).min(1),
  carrier: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const raw = await req.json();
  const parsed = CreateBatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { companyId, orderIds, carrier } = parsed.data;

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds }, companyId, externalSource: "NAVER" },
    include: {
      items: { include: { product: true } },
      externalOrders: { where: { platform: "NAVER" }, take: 1 },
    },
  });

  if (orders.length === 0) {
    return NextResponse.json({ error: "No matching orders found" }, { status: 404 });
  }

  const batch = await prisma.shippingBatch.create({
    data: {
      companyId,
      platform: "NAVER",
      carrier: carrier || "CJ대한통운",
      totalOrders: orders.length,
      items: {
        create: orders.map((order, index) => {
          const extOrder = order.externalOrders[0];
          return {
            rowNumber: index + 1,
            orderId: order.id,
            productOrderId: extOrder?.externalOrderId || "",
          };
        }),
      },
    },
    include: { items: true },
  });

  const inputs: PurchaseOrderInput[] = orders.map((order, index) => {
    const extOrder = order.externalOrders[0];
    const rawData = extOrder?.rawData as
      | {
          order?: { ordererName?: string; ordererTel?: string };
          productOrder?: { productName?: string };
        }
      | null
      | undefined;

    const firstItem = order.items[0];
    const product = firstItem?.product;

    const productName =
      rawData?.productOrder?.productName ||
      product?.name ||
      "";

    const recipientName =
      order.recipientName ||
      rawData?.order?.ordererName ||
      "";

    const ordererTel = rawData?.order?.ordererTel;
    const ordererPhone =
      ordererTel && ordererTel !== order.recipientPhone ? ordererTel : undefined;

    const batchItem = batch.items[index];

    return {
      recipientName,
      productName,
      quantity: firstItem?.quantity ?? 1,
      recipientPhone: order.recipientPhone || "",
      ordererPhone,
      shippingAddress: order.shippingAddress || "",
      deliveryMessage: undefined,
      tplCode: product?.tplCode ?? undefined,
      productOrderId: extOrder?.externalOrderId || "",
      batchId: batchItem?.batchId || batch.id,
    };
  });

  const buffer = generatePurchaseOrderExcel(inputs);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="batch-${batch.id}.xlsx"`,
      "X-Batch-Id": batch.id,
    },
  });
}

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const status = req.nextUrl.searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (companyId) where.companyId = companyId;
  if (status) where.status = status;

  const batches = await prisma.shippingBatch.findMany({
    where,
    include: {
      items: {
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              recipientName: true,
              recipientPhone: true,
              shippingAddress: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(batches);
}
