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

async function refreshLwaToken(credentials: { clientId: string; clientSecret: string; refreshToken: string }) {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Amazon LWA token refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

export const amazonConnector: Connector = {
  platform: "AMAZON",

  async fetchOrders(credentials: {
    clientId: string; clientSecret: string; refreshToken: string;
    sellerId: string; marketplaceId: string;
  }, since: Date | null) {
    const accessToken = await refreshLwaToken(credentials);
    const baseUrl = "https://sellingpartnerapi-na.amazon.com";
    const headers = { "x-amz-access-token": accessToken, "Content-Type": "application/json" };

    const params = new URLSearchParams({
      MarketplaceIds: credentials.marketplaceId,
      CreatedAfter: since ? since.toISOString() : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await fetch(`${baseUrl}/orders/v0/orders?${params}`, { headers });
    if (!res.ok) throw new Error(`Amazon SP-API error: ${res.status}`);
    const data = await res.json();

    const orders: ExternalOrderData[] = [];

    for (const order of data.payload?.Orders || []) {
      // Fetch order items
      const itemsRes = await fetch(`${baseUrl}/orders/v0/orders/${order.AmazonOrderId}/orderItems`, { headers });
      const itemsData = itemsRes.ok ? await itemsRes.json() : { payload: { OrderItems: [] } };

      const rawStatus = order.OrderStatus || "pending";
      const isCancelled = rawStatus.toLowerCase() === "canceled" || rawStatus.toLowerCase() === "cancelled";

      orders.push({
        externalOrderId: order.AmazonOrderId,
        externalOrderNumber: order.AmazonOrderId,
        rawData: order,
        orderDate: new Date(order.PurchaseDate),
        fulfillmentStatus: mapFulfillmentStatus(rawStatus),
        financialStatus: isCancelled ? "VOIDED" : "PAID",
        totalAmount: parseFloat(order.OrderTotal?.Amount || "0"),
        items: (itemsData.payload?.OrderItems || []).map((item: any) => ({
          externalItemId: item.OrderItemId,
          productName: item.Title,
          sku: item.SellerSKU || "",
          quantity: item.QuantityOrdered,
          unitPrice: parseFloat(item.ItemPrice?.Amount || "0") / (item.QuantityOrdered || 1),
        })),
      });
    }

    return orders;
  },
};
