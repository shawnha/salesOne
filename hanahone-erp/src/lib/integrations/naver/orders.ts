import type { NaverCredentials, NaverOrderDetail } from "./types";
import type { ExternalOrderData } from "../types";
import { naverFetch } from "./auth";
import { prisma } from "@/lib/prisma";

const STATUS_MAP: Record<string, { fulfillment: string; financial: string }> = {
  PAYMENT_WAITING: { fulfillment: "UNFULFILLED", financial: "PENDING" },
  PAYED: { fulfillment: "UNFULFILLED", financial: "PAID" },
  DELIVERING: { fulfillment: "PARTIALLY_FULFILLED", financial: "PAID" },
  DELIVERED: { fulfillment: "FULFILLED", financial: "PAID" },
  PURCHASE_DECIDED: { fulfillment: "DELIVERED", financial: "PAID" },
  EXCHANGED: { fulfillment: "FULFILLED", financial: "PARTIALLY_REFUNDED" },
  CANCELED: { fulfillment: "CANCELLED", financial: "VOIDED" },
  RETURNED: { fulfillment: "CANCELLED", financial: "REFUNDED" },
};

export function mapNaverStatus(status: string): {
  fulfillment: string;
  financial: string;
} {
  return STATUS_MAP[status] || { fulfillment: "UNFULFILLED", financial: "PENDING" };
}

function splitInto24HourWindows(
  from: Date,
  to: Date,
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  const MS_24H = 24 * 60 * 60 * 1000;
  let current = from.getTime();
  const endTime = to.getTime();

  while (current < endTime) {
    const windowEnd = Math.min(current + MS_24H, endTime);
    windows.push({
      start: new Date(current).toISOString(),
      end: new Date(windowEnd).toISOString(),
    });
    current = windowEnd;
  }

  return windows;
}

async function fetchChangedOrderIds(
  credentials: NaverCredentials,
  from: string,
  to: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    lastChangedFrom: from,
    lastChangedTo: to,
  });
  const res = await naverFetch(
    credentials,
    `/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(`Naver changed statuses fetch failed: ${res.status}`);
  }

  const json = await res.json();
  const statuses = json?.data?.lastChangeStatuses || [];
  return statuses.map(
    (s: { productOrderId: string }) => s.productOrderId,
  );
}

async function fetchOrderDetails(
  credentials: NaverCredentials,
  productOrderIds: string[],
): Promise<NaverOrderDetail[]> {
  const results: NaverOrderDetail[] = [];
  const BATCH_SIZE = 300;

  for (let i = 0; i < productOrderIds.length; i += BATCH_SIZE) {
    const batch = productOrderIds.slice(i, i + BATCH_SIZE);
    const res = await naverFetch(
      credentials,
      "/v1/pay-order/seller/product-orders/query",
      {
        method: "POST",
        body: JSON.stringify({ productOrderIds: batch }),
      },
    );

    if (!res.ok) {
      throw new Error(`Naver order details fetch failed: ${res.status}`);
    }

    const json = await res.json();
    const details: NaverOrderDetail[] = json?.data || [];
    results.push(...details);
  }

  return results;
}

// 공구 감지 로직 (export for testing)
export function isGongguOrder(
  productOrder: {
    sellerCustomCode1?: string;
    productId?: string;
    originalProductId?: string;
  },
  gongguSkus: Set<string>,
): boolean {
  // 1차: sellerCustomCode1 태그 (네이버 셀러센터에서 설정)
  const customCode = productOrder.sellerCustomCode1 || "";
  if (customCode.includes("공구") || customCode.toLowerCase().includes("gonggu")) {
    return true;
  }

  // 2차: DB SkuMapping의 isGonggu 플래그
  if (gongguSkus.size > 0) {
    if (productOrder.productId && gongguSkus.has(String(productOrder.productId))) return true;
    if (productOrder.originalProductId && gongguSkus.has(String(productOrder.originalProductId))) return true;
  }

  return false;
}

export async function fetchNaverOrders(
  credentials: NaverCredentials,
  since: Date | null,
  companyId?: string,
): Promise<ExternalOrderData[]> {
  const now = new Date();
  const from = since || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windows = splitInto24HourWindows(from, now);

  // Collect all changed product order IDs across windows
  const allIds = new Set<string>();
  for (const window of windows) {
    const ids = await fetchChangedOrderIds(credentials, window.start, window.end);
    for (const id of ids) allIds.add(id);
  }

  if (allIds.size === 0) return [];

  const details = await fetchOrderDetails(credentials, Array.from(allIds));

  // DB에서 공구 SkuMapping 조회
  let gongguSkus = new Set<string>();
  if (companyId) {
    const gongguMappings = await prisma.skuMapping.findMany({
      where: { companyId, platform: "NAVER", isGonggu: true },
      select: { externalSku: true },
    });
    gongguSkus = new Set(gongguMappings.map((m) => m.externalSku));
  }

  return details.map((detail) => {
    const { order, productOrder } = detail;
    const { fulfillment, financial } = mapNaverStatus(productOrder.productOrderStatus);
    const addr = productOrder.shippingAddress;
    const sku = productOrder.sellerProductCode || productOrder.optionCode || "";

    const isGonggu = isGongguOrder(productOrder, gongguSkus);

    return {
      externalOrderId: productOrder.productOrderId,
      externalOrderNumber: order.orderId,
      rawData: detail,
      orderDate: new Date(order.orderDate || order.paymentDate),
      fulfillmentStatus: fulfillment,
      financialStatus: financial,
      totalAmount: productOrder.totalPaymentAmount,
      refundAmount: productOrder.claimPrice && productOrder.claimPrice > 0 ? productOrder.claimPrice : undefined,
      customerName: order.ordererName,
      customerPhone: order.ordererTel && !order.ordererTel.includes("*") ? order.ordererTel : undefined,
      shippingAddress: addr
        ? [addr.baseAddress, addr.detailAddress, addr.zipCode].filter(Boolean).join(" ")
        : undefined,
      recipientName: addr?.name,
      recipientPhone: addr?.tel1,
      channelNote: isGonggu ? "공구" : undefined,
      items: [
        {
          externalItemId: productOrder.productOrderId,
          productName: productOrder.productName,
          sku,
          quantity: productOrder.quantity,
          unitPrice: productOrder.unitPrice,
        },
      ],
    };
  });
}
