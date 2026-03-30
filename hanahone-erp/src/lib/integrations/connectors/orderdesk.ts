import type { Connector, ExternalOrderData } from "../types";

interface OrderDeskCredentials {
  storeId: string;
  apiKey: string;
}

function mapFulfillmentStatus(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "shipped" || s === "fulfilled") return "FULFILLED";
  if (s === "delivered") return "DELIVERED";
  if (s === "partially_shipped" || s === "partial") return "PARTIALLY_FULFILLED";
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  return "UNFULFILLED";
}

function mapFinancialStatus(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "cancelled" || s === "canceled" || s === "voided") return "VOIDED";
  if (s === "refunded") return "REFUNDED";
  if (s === "partially_refunded") return "PARTIALLY_REFUNDED";
  return "PAID";
}

/**
 * Detect the original sales channel from OrderDesk order metadata.
 * OrderDesk aggregates orders from TikTok Shop, Amazon, etc.
 * Returns the override platform if detected, or null for generic ORDERDESK.
 */
function detectChannel(order: any): string | null {
  const source = (order.source_name || order.source || "").toLowerCase();
  if (source.includes("tiktok") || source.includes("tts")) return "TIKTOK";
  if (source.includes("amazon")) return "AMAZON";
  if (source.includes("shopify")) return "SHOPIFY";
  if (source.includes("ebay")) return "EBAY";
  return null;
}

export const orderdeskConnector: Connector = {
  platform: "ORDERDESK",

  async fetchOrders(credentials: OrderDeskCredentials, since: Date | null) {
    const { storeId, apiKey } = credentials;
    if (!storeId || !apiKey) throw new Error("Missing OrderDesk store ID or API key");

    const baseUrl = `https://app.orderdesk.me/api/v2/orders`;
    const headers = {
      "ORDERDESK-STORE-ID": storeId,
      "ORDERDESK-API-KEY": apiKey,
      "Content-Type": "application/json",
    };

    const orders: ExternalOrderData[] = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: "date_added",
        sort_direction: "desc",
      });
      if (since) {
        params.set("search_date_added_start", since.toISOString().split("T")[0]);
      }

      const res = await fetch(`${baseUrl}?${params.toString()}`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OrderDesk API error: ${res.status} ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      const orderList = data.orders || [];

      if (orderList.length === 0) break;

      for (const order of orderList) {
        const channel = detectChannel(order);
        const totalAmount = parseFloat(order.order_total || order.subtotal || "0");
        const shippingAddr = order.shipping || {};

        orders.push({
          externalOrderId: String(order.id),
          externalOrderNumber: order.source_id || String(order.id),
          rawData: order,
          orderDate: new Date(order.date_added || order.date_updated),
          fulfillmentStatus: mapFulfillmentStatus(order.shipping_status || order.order_status || ""),
          financialStatus: mapFinancialStatus(order.financial_status || order.payment_status || ""),
          totalAmount,
          customerName: [shippingAddr.first_name, shippingAddr.last_name].filter(Boolean).join(" ") || order.customer_name || undefined,
          customerEmail: order.email || undefined,
          customerPhone: shippingAddr.phone || undefined,
          shippingAddress: [shippingAddr.address1, shippingAddr.address2, shippingAddr.city, shippingAddr.state, shippingAddr.postal_code, shippingAddr.country].filter(Boolean).join(", ") || undefined,
          recipientName: [shippingAddr.first_name, shippingAddr.last_name].filter(Boolean).join(" ") || undefined,
          overridePlatform: (channel as any) || undefined,
          items: (order.order_items || []).map((item: any) => ({
            externalItemId: String(item.id || item.sku),
            productName: item.name || item.title || "",
            sku: item.sku || "",
            quantity: parseInt(item.quantity || "1"),
            unitPrice: parseFloat(item.price || "0"),
          })),
        });
      }

      if (orderList.length < limit) break;
      page++;
      if (page > 100) break; // safety limit
    }

    return orders;
  },
};
