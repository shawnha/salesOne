import type { NaverCredentials, NaverProductOrder } from "./types";
import type { ExternalOrderData } from "../types";
import { naverFetch } from "./auth";

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
  const res = await naverFetch(
    credentials,
    "/v1/pay-order/seller/orders/last-changed-statuses",
    {
      method: "POST",
      body: JSON.stringify({
        lastChangedFrom: from,
        lastChangedTo: to,
      }),
    },
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
): Promise<NaverProductOrder[]> {
  const results: NaverProductOrder[] = [];
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
    const orders: NaverProductOrder[] = json?.data || [];
    results.push(...orders);
  }

  return results;
}

export async function fetchNaverOrders(
  credentials: NaverCredentials,
  since: Date | null,
): Promise<ExternalOrderData[]> {
  const now = new Date();
  const from = since || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windows = splitInto24HourWindows(from, now);

  // Collect all changed product order IDs across windows
  const allIds = new Set<string>();
  for (const window of windows) {
    const ids = await fetchChangedOrderIds(credentials, window.start, window.end);
    for (const id of ids) {
      allIds.add(id);
    }
  }

  if (allIds.size === 0) {
    return [];
  }

  // Fetch full details
  const orders = await fetchOrderDetails(credentials, Array.from(allIds));

  // Map to ExternalOrderData
  return orders.map((order) => {
    const { fulfillment, financial } = mapNaverStatus(order.productOrderStatus);
    const addr = order.shippingAddress;

    return {
      externalOrderId: order.productOrderId,
      externalOrderNumber: order.orderId,
      rawData: order,
      orderDate: new Date(order.orderDate || order.paymentDate),
      fulfillmentStatus: fulfillment,
      financialStatus: financial,
      totalAmount: order.totalPaymentAmount,
      refundAmount: order.claimPrice && order.claimPrice > 0 ? order.claimPrice : undefined,
      customerName: order.ordererName,
      shippingAddress: addr
        ? [addr.baseAddress, addr.detailAddress].filter(Boolean).join(" ")
        : undefined,
      recipientName: addr?.name,
      recipientPhone: addr?.tel1,
      items: [
        {
          externalItemId: order.productOrderId,
          productName: order.productName,
          sku: order.sellerProductCode,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
        },
      ],
    };
  });
}
