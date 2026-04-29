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
    where: {
      id: { in: orderIds },
      companyId,
      externalSource: { in: ["NAVER", "COUPANG"] },
      // ROCKET_GROWTH는 쿠팡 풀필먼트라 발주서 흐름 자체 X.
      NOT: { shipmentType: "ROCKET_GROWTH" },
    },
    include: {
      items: { include: { product: true } },
      externalOrders: { take: 1 },
    },
  });

  if (orders.length === 0) {
    return NextResponse.json({ error: "No matching orders found" }, { status: 404 });
  }

  // 라운드의 platform: 단일 채널이면 그 채널, 다채널이면 NAVER 기본값 (items[].platform로 추적)
  const channelSet = new Set(orders.map((o) => o.externalSource));
  const batchPlatform = channelSet.size === 1 ? (orders[0].externalSource ?? "NAVER") : "NAVER";
  const channelDispatch: Record<string, string> = {};
  for (const ch of Array.from(channelSet)) {
    if (ch) channelDispatch[ch] = "PENDING";
  }

  const batch = await prisma.shippingBatch.create({
    data: {
      companyId,
      platform: batchPlatform,
      carrier: carrier || "CJ대한통운",
      totalOrders: orders.length,
      channelDispatch,
      items: {
        create: orders.map((order, index) => {
          const extOrder = order.externalOrders[0];
          return {
            rowNumber: index + 1,
            orderId: order.id,
            productOrderId: extOrder?.externalOrderId || "",
            platform: order.externalSource,
          };
        }),
      },
    },
    include: { items: true },
  });

  const inputs: PurchaseOrderInput[] = orders.map((order, index) => {
    const extOrder = order.externalOrders[0];
    // NAVER + COUPANG raw shape이 다름 — 양쪽 다 시도해서 가장 풍부한 값 추출.
    const rawData = extOrder?.rawData as
      | {
          // NAVER shape
          order?: { ordererName?: string; ordererTel?: string };
          productOrder?: { productName?: string };
          // COUPANG shape
          orderer?: { name?: string; safeNumber?: string; ordererNumber?: string };
          orderItems?: Array<{ vendorItemName?: string }>;
        }
      | null
      | undefined;

    const firstItem = order.items[0];
    const product = firstItem?.product;

    const productName =
      rawData?.productOrder?.productName ||
      rawData?.orderItems?.[0]?.vendorItemName ||
      product?.name ||
      "";

    const recipientName =
      order.recipientName ||
      rawData?.order?.ordererName ||
      rawData?.orderer?.name ||
      "";

    const ordererTel =
      rawData?.order?.ordererTel ||
      rawData?.orderer?.ordererNumber ||
      rawData?.orderer?.safeNumber;
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
