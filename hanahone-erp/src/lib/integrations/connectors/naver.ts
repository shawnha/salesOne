import type { Connector, ExternalOrderData } from "../types";

function mapFulfillmentStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "shipped":
    case "fulfilled":
    case "completed":
      return "FULFILLED";
    case "delivered":
      return "DELIVERED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return "UNFULFILLED";
  }
}

export const naverConnector: Connector = {
  platform: "NAVER",

  async fetchOrders(credentials: { clientId: string; clientSecret: string }, since: Date | null) {
    const baseUrl = "https://api.commerce.naver.com/external";
    const token = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
    const headers = { Authorization: `Basic ${token}`, "Content-Type": "application/json" };

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const res = await fetch(`${baseUrl}/v1/pay-order/seller/orders?from=${sinceDate.toISOString()}&to=${new Date().toISOString()}`, {
      headers,
    });

    if (!res.ok) throw new Error(`Naver API error: ${res.status} ${res.statusText}`);
    const data = await res.json();

    return (data.data || []).map((order: any) => {
      const rawStatus = order.productOrderStatus || "pending";
      const isCancelled = rawStatus.toLowerCase() === "cancelled" || rawStatus.toLowerCase() === "canceled";

      return {
      externalOrderId: String(order.orderId || order.productOrderId),
      externalOrderNumber: String(order.orderId || order.productOrderId),
      rawData: order,
      orderDate: new Date(order.orderDate || order.paymentDate),
      fulfillmentStatus: mapFulfillmentStatus(rawStatus),
      financialStatus: isCancelled ? "VOIDED" : "PAID",
      totalAmount: order.totalPaymentAmount || 0,
      customerName: order.ordererName,
      items: (order.productOrderItems || [order]).map((item: any) => ({
        externalItemId: String(item.productOrderId || item.orderId),
        productName: item.productName || "",
        sku: item.sellerProductCode || "",
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.totalPaymentAmount || 0,
      })),
    };
    });
  },
};
