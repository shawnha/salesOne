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
          items: (order.line_items || []).map((item: any) => {
            const listPrice = parseFloat(item.price || "0");
            const totalDiscount = parseFloat(item.total_discount || "0");
            const qty = item.quantity || 1;
            // Shopify line_item.price is the per-unit list price (정가).
            // total_discount is allocated across the whole line, so per-unit
            // paid = list - (totalDiscount/qty).
            const paidUnit = qty > 0 ? listPrice - totalDiscount / qty : listPrice;
            const sellingPlanProp = (item.properties || []).find(
              (p: any) => p.name === "_selling_plan_id",
            );
            return {
              externalItemId: String(item.id),
              productName: item.title,
              sku: item.sku || "",
              quantity: qty,
              unitPrice: +paidUnit.toFixed(2),
              originalUnitPrice: listPrice || undefined,
              discountAmount: totalDiscount > 0 ? totalDiscount : undefined,
              sellingPlanId: sellingPlanProp?.value
                ? String(sellingPlanProp.value)
                : undefined,
            };
          }),
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

/**
 * Pull payment fees for a single Shopify order via the Admin GraphQL API.
 *
 * - Shopify Payments transactions expose per-transaction fees under
 *   `transactions.fees[]`. Each entry has `amount.amount` as a decimal string.
 * - Non-Shopify-Payments gateways (e.g. PayPal, tiktok_shop) usually return
 *   empty `fees` — callers get `{ fee: 0, net: null, hasFees: false }` and
 *   should treat it as "unknown" rather than "zero fee".
 *
 * Returns fee in the store currency (USD for HOI). settlementAmount is the
 * total sale amount minus fees (net payout), when any fees were reported.
 */
export async function fetchShopifyOrderFees(
  credentials: ShopifyCredentials,
  externalOrderId: string,
): Promise<{ fee: number; net: number | null; hasFees: boolean }> {
  const shop = credentials.shop || credentials.storeUrl;
  if (!shop) throw new Error("Missing shop URL");

  const token = await getAccessToken({ ...credentials, shop });
  const url = `https://${shop}/admin/api/2024-01/graphql.json`;
  const query = `
    query OrderTransactions($id: ID!) {
      order(id: $id) {
        id
        transactions {
          id
          kind
          status
          gateway
          amountSet { shopMoney { amount currencyCode } }
          fees {
            amount { amount currencyCode }
            type
          }
        }
      }
    }
  `;
  const gid = `gid://shopify/Order/${externalOrderId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: gid } }),
  });
  if (!res.ok) {
    throw new Error(`Shopify GraphQL error: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  if (body.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  }
  const txs: Array<{
    kind: string;
    status: string;
    gateway: string | null;
    amountSet?: { shopMoney?: { amount?: string } };
    fees?: Array<{ amount?: { amount?: string } }>;
  }> = body.data?.order?.transactions || [];

  let feeTotal = 0;
  let saleTotal = 0;
  let refundTotal = 0;
  let hasFees = false;

  for (const tx of txs) {
    if (tx.status !== "SUCCESS") continue;
    const amt = parseFloat(tx.amountSet?.shopMoney?.amount || "0") || 0;
    const feeSum = (tx.fees || []).reduce(
      (s, f) => s + (parseFloat(f.amount?.amount || "0") || 0),
      0,
    );
    if (feeSum > 0) hasFees = true;
    // Refund-kind transactions carry negative-direction fees (Shopify refunds
    // part of the processing fee). Subtract both sides.
    if (tx.kind === "REFUND") {
      refundTotal += amt;
      feeTotal -= feeSum;
    } else if (tx.kind === "SALE" || tx.kind === "CAPTURE") {
      saleTotal += amt;
      feeTotal += feeSum;
    }
  }

  const net = hasFees ? saleTotal - refundTotal - feeTotal : null;
  return { fee: +feeTotal.toFixed(2), net: net !== null ? +net.toFixed(2) : null, hasFees };
}

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
    const res: Response = await fetch(url, { headers });
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
