import type { Connector, ExternalOrderData } from "../types";

interface OrderDeskCredentials {
  storeId: string;
  apiKey: string;
}

function mapFulfillmentStatus(fulfillmentName: string): string {
  const s = (fulfillmentName || "").toLowerCase();
  if (s === "shipped" || s === "fulfilled") return "FULFILLED";
  if (s === "delivered") return "DELIVERED";
  if (s.includes("partial")) return "PARTIALLY_FULFILLED";
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  return "UNFULFILLED";
}

function mapFinancialStatus(paymentStatus: string, refundTotal: number): string {
  const s = (paymentStatus || "").toLowerCase();
  if (s === "voided" || s === "cancelled" || s === "canceled") return "VOIDED";
  if (refundTotal > 0 && s === "refunded") return "REFUNDED";
  if (refundTotal > 0) return "PARTIALLY_REFUNDED";
  if (s === "approved" || s === "paid" || s === "captured") return "PAID";
  return "PENDING";
}

/**
 * Detect the original sales channel from OrderDesk source_name.
 * OrderDesk aggregates orders from TikTok Shop, Amazon, etc.
 */
function detectChannel(order: any): string | null {
  const source = (order.source_name || "").toLowerCase();
  if (source.includes("tiktok") || source.includes("tts")) return "TIKTOK";
  if (source.includes("amazon")) return "AMAZON";
  if (source.includes("shopify")) return "SHOPIFY";
  return null;
}

export const orderdeskConnector: Connector = {
  platform: "ORDERDESK",

  async fetchOrders(credentials: OrderDeskCredentials, since: Date | null) {
    const { storeId, apiKey } = credentials;
    if (!storeId || !apiKey) throw new Error("Missing OrderDesk store ID or API key");

    const baseUrl = "https://app.orderdesk.me/api/v2/orders";
    const headers = {
      "ORDERDESK-STORE-ID": storeId,
      "ORDERDESK-API-KEY": apiKey,
      "Content-Type": "application/json",
    };

    const orders: ExternalOrderData[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        order_by: "date_added",
        order: "DESC",
      });
      if (since) {
        params.set("search_start_date", since.toISOString());
      }

      const res = await fetch(`${baseUrl}?${params.toString()}`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("X-Retry-After") || "5");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OrderDesk API error: ${res.status} ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      const orderList = data.orders || [];

      if (orderList.length === 0) break;

      for (const order of orderList) {
        const channel = detectChannel(order);
        const totalAmount = parseFloat(order.order_total || "0");
        const refundTotal = parseFloat(order.refund_total || "0");
        const shipping = order.shipping || {};

        orders.push({
          externalOrderId: String(order.id),
          externalOrderNumber: order.source_id || String(order.id),
          rawData: order,
          orderDate: new Date(order.date_added),
          fulfillmentStatus: mapFulfillmentStatus(order.fulfillment_name || ""),
          financialStatus: mapFinancialStatus(order.payment_status || "", refundTotal),
          totalAmount,
          refundAmount: refundTotal > 0 ? refundTotal : undefined,
          customerName: [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") || undefined,
          customerEmail: order.email || undefined,
          customerPhone: shipping.phone || undefined,
          shippingAddress: [shipping.address1, shipping.address2, shipping.city, shipping.state, shipping.postal_code, shipping.country].filter(Boolean).join(", ") || undefined,
          recipientName: [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") || undefined,
          overridePlatform: (channel as any) || undefined,
          items: (order.order_items || []).map((item: any) => ({
            externalItemId: String(item.id || item.code || ""),
            productName: item.name || "",
            sku: item.code || "",
            quantity: parseInt(item.quantity || "1"),
            unitPrice: parseFloat(item.price || "0"),
          })),
        });
      }

      if (orderList.length < limit) break;
      offset += limit;
      if (offset > 50000) break; // safety limit
    }

    return orders;
  },
};
