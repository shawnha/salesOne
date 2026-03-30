import type { Connector, ExternalOrderData } from "../types";

interface ShopifyCredentials {
  clientId: string;
  clientSecret: string;
  shop: string;
  accessToken?: string;
  apiKey?: string;
  storeUrl?: string;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(credentials: ShopifyCredentials): Promise<string> {
  if (credentials.accessToken || credentials.apiKey) {
    return (credentials.accessToken || credentials.apiKey)!;
  }

  const { clientId, clientSecret, shop } = credentials;
  if (!clientId || !clientSecret || !shop) {
    throw new Error("Missing clientId, clientSecret, or shop");
  }

  const cacheKey = `${shop}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Shopify token request failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const token = data.access_token;
  const expiresIn = data.expires_in || 86399;

  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return token;
}

function mapFulfillmentStatus(status: string | null): string {
  switch ((status || "").toLowerCase()) {
    case "fulfilled": return "FULFILLED";
    case "partial": return "PARTIALLY_FULFILLED";
    case "restocked": return "CANCELLED";
    default: return "UNFULFILLED";
  }
}

function mapFinancialStatus(status: string | null): string {
  switch ((status || "").toLowerCase()) {
    case "paid": return "PAID";
    case "partially_paid": return "PARTIALLY_PAID";
    case "partially_refunded": return "PARTIALLY_REFUNDED";
    case "refunded": return "REFUNDED";
    case "voided": return "VOIDED";
    case "authorized": return "PENDING";
    default: return "PENDING";
  }
}

function calculateRefundAmount(order: any): number {
  if (!order.refunds || !Array.isArray(order.refunds)) return 0;
  let total = 0;
  for (const refund of order.refunds) {
    for (const transaction of refund.transactions || []) {
      total += parseFloat(transaction.amount || "0");
    }
  }
  return total;
}

export const shopifyConnector: Connector = {
  platform: "SHOPIFY",

  async fetchOrders(credentials: ShopifyCredentials, since: Date | null) {
    const shop = credentials.shop || credentials.storeUrl;
    if (!shop) throw new Error("Missing shop URL");

    const token = await getAccessToken({ ...credentials, shop });
    const baseUrl = `https://${shop}/admin/api/2024-01`;
    const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

    let url = `${baseUrl}/orders.json?status=any&limit=250`;
    if (since) url += `&created_at_min=${since.toISOString()}`;

    const orders: ExternalOrderData[] = [];
    let hasNext = true;

    while (hasNext) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
      const data = await res.json();

      for (const order of data.orders || []) {
        const refundAmount = calculateRefundAmount(order);
        const totalAmount = parseFloat(order.total_price);

        orders.push({
          externalOrderId: String(order.id),
          externalOrderNumber: `#${order.order_number}`,
          rawData: order,
          orderDate: new Date(order.created_at),
          fulfillmentStatus: mapFulfillmentStatus(order.fulfillment_status),
          financialStatus: mapFinancialStatus(order.financial_status),
          totalAmount,
          refundAmount: refundAmount > 0 ? refundAmount : undefined,
          customerName: order.customer
            ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
            : undefined,
          customerEmail: order.customer?.email,
          customerPhone: order.customer?.phone || order.billing_address?.phone || order.shipping_address?.phone,
          items: (order.line_items || []).map((item: any) => ({
            externalItemId: String(item.id),
            productName: item.title,
            sku: item.sku || "",
            quantity: item.quantity,
            unitPrice: parseFloat(item.price),
          })),
        });
      }

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

export interface ShopifyProduct {
  id: number;
  title: string;
  status: string;
  variants: {
    id: number;
    title: string;
    sku: string;
    price: string;
    compareAtPrice: string | null;
  }[];
}

export async function fetchShopifyProducts(
  credentials: ShopifyCredentials,
): Promise<ShopifyProduct[]> {
  const shop = credentials.shop || credentials.storeUrl;
  if (!shop) throw new Error("Missing shop URL");

  const token = await getAccessToken({ ...credentials, shop });
  const baseUrl = `https://${shop}/admin/api/2024-01`;
  const headers = {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
  };

  const products: ShopifyProduct[] = [];
  let url: string | null = `${baseUrl}/products.json?limit=250`;

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Shopify Products API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();

    for (const p of data.products || []) {
      products.push({
        id: p.id,
        title: p.title,
        status: p.status,
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          sku: v.sku || "",
          price: v.price,
          compareAtPrice: v.compare_at_price,
        })),
      });
    }

    const linkHeader = res.headers.get("Link");
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return products;
}
