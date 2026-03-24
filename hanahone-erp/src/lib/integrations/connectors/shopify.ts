import type { Connector, ExternalOrderData } from "../types";

export const shopifyConnector: Connector = {
  platform: "SHOPIFY",

  async fetchOrders(credentials: { apiKey: string; storeUrl: string }, since: Date | null) {
    const baseUrl = `https://${credentials.storeUrl}/admin/api/2024-01`;
    const headers = { "X-Shopify-Access-Token": credentials.apiKey, "Content-Type": "application/json" };

    let url = `${baseUrl}/orders.json?status=any&limit=250`;
    if (since) url += `&created_at_min=${since.toISOString()}`;

    const orders: ExternalOrderData[] = [];
    let hasNext = true;

    while (hasNext) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
      const data = await res.json();

      for (const order of data.orders || []) {
        orders.push({
          externalOrderId: String(order.id),
          rawData: order,
          orderDate: new Date(order.created_at),
          status: order.fulfillment_status || "unfulfilled",
          totalAmount: parseFloat(order.total_price),
          customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : undefined,
          customerEmail: order.customer?.email,
          items: (order.line_items || []).map((item: any) => ({
            externalItemId: String(item.id),
            productName: item.title,
            sku: item.sku || "",
            quantity: item.quantity,
            unitPrice: parseFloat(item.price),
          })),
        });
      }

      // Pagination via Link header
      const linkHeader = res.headers.get("Link");
      const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      } else {
        hasNext = false;
      }
    }

    return orders;
  },
};
