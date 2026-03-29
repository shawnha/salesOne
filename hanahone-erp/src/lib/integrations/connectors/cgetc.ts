interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

export interface CgetcProduct {
  sku: string;
  name: string;
  barcode: string;
  quantity: number;
  reserved: number;
  available: number;
}

export interface CgetcLineItem {
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface CgetcSaleOrder {
  id: number;
  soNumber: string;
  date: string;
  customerName: string;
  customerId: number;
  shippingName: string;
  shippingId: number;
  reference: string;
  channel: string;
  amount: number;
  status: string;
  deliveryCount: number;
  warehouseId: number;
  warehouseName: string;
  lineItems: CgetcLineItem[];
}

export interface CgetcOrderDetail {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

// ─── Auth ───────────────────────────────────────────────────

async function authenticate(url: string, db: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${url}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db, login: email, password },
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`CGETC auth failed: HTTP ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(`CGETC auth error: ${data.error.data?.message || data.error.message}`);
  if (!data.result?.uid) throw new Error("CGETC auth failed: no uid");

  let sessionId: string | null = null;

  const cookies = res.headers.getSetCookie?.() || [];
  if (cookies.length > 0) {
    const joined = cookies.join("; ");
    const m = joined.match(/session_id=([^;]+)/);
    if (m) sessionId = m[1];
  }

  if (!sessionId) {
    const raw = res.headers.get("set-cookie") || "";
    const m = raw.match(/session_id=([^;]+)/);
    if (m) sessionId = m[1];
  }

  if (!sessionId) {
    const all: string[] = [];
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === "set-cookie") all.push(v);
    });
    for (const c of all) {
      const m = c.match(/session_id=([^;]+)/);
      if (m) { sessionId = m[1]; break; }
    }
  }

  if (!sessionId) throw new Error("CGETC auth failed: no session cookie");

  return sessionId;
}

// ─── JSON-RPC helper ────────────────────────────────────────

async function odooRpc(
  url: string,
  sessionId: string,
  model: string,
  method: string,
  args: any[] = [],
  kwargs: Record<string, any> = {},
) {
  const res = await fetch(`${url}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
    }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`CGETC RPC ${model}.${method} failed: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`CGETC RPC error: ${data.error.data?.message || data.error.message}`);
  return data.result;
}

// ─── Sale Orders (JSON-RPC — fast, structured) ─────────────

export async function fetchCgetcSaleOrders(
  credentials: CgetcCredentials,
  since?: Date | null,
): Promise<CgetcSaleOrder[]> {
  if (!credentials.url || !credentials.db || !credentials.email || !credentials.password) {
    throw new Error("CGETC credentials incomplete");
  }

  const sessionId = await authenticate(
    credentials.url,
    credentials.db,
    credentials.email,
    credentials.password,
  );

  // Use portal scraping to get the list of order IDs (portal auto-filters to Hanah only)
  const portalOrderIds = await fetchPortalSaleOrderIds(credentials.url, sessionId);

  if (portalOrderIds.length === 0) return [];

  // Read structured data via JSON-RPC for those IDs
  const BATCH_SIZE = 100;
  const allOrders: CgetcSaleOrder[] = [];

  for (let i = 0; i < portalOrderIds.length; i += BATCH_SIZE) {
    const batch = portalOrderIds.slice(i, i + BATCH_SIZE);
    const records = await odooRpc(credentials.url, sessionId, "sale.order", "read", [batch], {
      fields: [
        "name", "partner_id", "partner_shipping_id", "origin",
        "date_order", "amount_total", "state", "warehouse_id", "delivery_count", "order_line",
        "write_date",
      ],
    });

    if (!Array.isArray(records)) continue;

    // Collect all line IDs for batch fetch
    const batchLineIds: number[] = [];
    const batchRecords: typeof records = [];

    for (const r of records) {
      if (since) {
        const orderTime = new Date(r.date_order || 0).getTime();
        const writeTime = new Date(r.write_date || 0).getTime();
        const sinceTime = since.getTime();
        // Include if created OR modified after lastSyncAt
        if (orderTime < sinceTime && writeTime < sinceTime) continue;
      }
      batchRecords.push(r);
      if (r.order_line?.length > 0) batchLineIds.push(...r.order_line);
    }

    // Fetch line items for this batch
    const lineDataMap = new Map<number, any>();
    if (batchLineIds.length > 0) {
      const lineRecords = await odooRpc(credentials.url, sessionId, "sale.order.line", "read", [batchLineIds], {
        fields: ["product_id", "name", "product_uom_qty", "price_unit", "price_subtotal"],
      });
      if (Array.isArray(lineRecords)) {
        for (const line of lineRecords) lineDataMap.set(line.id, line);
      }
    }

    for (const r of batchRecords) {
      const orderDate = r.date_order ? r.date_order.split(" ")[0] : "";
      let channel = "";
      const origin = (r.origin || "") as string;
      if (origin.toLowerCase().includes("shopify")) channel = "shopify";
      else if (origin.toLowerCase().includes("tts")) channel = "tiktok_shop";
      else if (origin.toLowerCase().includes("amazon")) channel = "amazon";

      // Build line items
      const lineItems: CgetcLineItem[] = [];
      for (const lineId of (r.order_line || [])) {
        const line = lineDataMap.get(lineId);
        if (!line) continue;
        const productName = line.product_id?.[1] || line.name || "";
        if (productName.toLowerCase().includes("delivery product")) continue;
        if (line.price_unit === 0 && line.price_subtotal === 0) continue;
        const skuMatch = productName.match(/\[([^\]]+)\]/);
        lineItems.push({
          productName: productName.replace(/\[[^\]]+\]\s*/, "").trim(),
          sku: skuMatch ? skuMatch[1] : null,
          quantity: Math.round(line.product_uom_qty || 1),
          unitPrice: line.price_unit || 0,
          subtotal: line.price_subtotal || 0,
        });
      }

      allOrders.push({
        id: r.id,
        soNumber: r.name || "",
        date: orderDate,
        customerName: r.partner_id?.[1] || "",
        customerId: r.partner_id?.[0] || 0,
        shippingName: r.partner_shipping_id?.[1] || "",
        shippingId: r.partner_shipping_id?.[0] || 0,
        reference: origin,
        channel,
        amount: r.amount_total || 0,
        status: r.state || "",
        deliveryCount: r.delivery_count || 0,
        warehouseId: r.warehouse_id?.[0] || 0,
        warehouseName: r.warehouse_id?.[1] || "",
        lineItems,
      });
    }
  }

  return allOrders;
}

// Get order IDs from portal (auto-filtered to Hanah)
async function fetchPortalSaleOrderIds(url: string, sessionId: string): Promise<number[]> {
  const ids: number[] = [];
  let page = 1;

  while (true) {
    const path = page === 1 ? "/portal/sale" : `/portal/sale/page/${page}`;
    const res = await fetch(`${url}${path}`, {
      headers: { Cookie: `session_id=${sessionId}` },
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    if (!res.ok) break;

    const html = await res.text();
    const matches = [...html.matchAll(/href="\/portal\/sale\/(\d+)"/g)];

    // Filter out non-numeric links (like /portal/sale/create, /portal/sale/page/N)
    const pageIds = matches.map((m) => parseInt(m[1])).filter((n) => !isNaN(n));
    if (pageIds.length === 0) break;

    ids.push(...pageIds);
    page++;
    if (page > 200) break;
  }

  return ids;
}

// ─── Order Detail — contact info (Portal scraping) ─────────

export async function fetchCgetcOrderDetail(
  credentials: CgetcCredentials,
  orderId: string | number,
): Promise<CgetcOrderDetail> {
  if (!credentials.url || !credentials.db || !credentials.email || !credentials.password) {
    throw new Error("CGETC credentials incomplete");
  }

  const sessionId = await authenticate(
    credentials.url,
    credentials.db,
    credentials.email,
    credentials.password,
  );

  return fetchOrderDetailWithSession(credentials.url, sessionId, String(orderId));
}

async function fetchOrderDetailWithSession(
  url: string,
  sessionId: string,
  orderId: string,
): Promise<CgetcOrderDetail> {
  const res = await fetch(`${url}/portal/sale/${orderId}`, {
    headers: { Cookie: `session_id=${sessionId}` },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CGETC order detail error: HTTP ${res.status}`);

  const html = await res.text();
  return parseOrderDetailHtml(html);
}

function parseOrderDetailHtml(html: string): CgetcOrderDetail {
  const detail: CgetcOrderDetail = {};

  // Look for the customer address in the address-like block
  // Try multiple patterns: div#customer, address tags, or the customer area
  const customerBlock =
    html.match(/id="customer"[^>]*>([\s\S]*?)<\/div>/) ||
    html.match(/<address[^>]*>([\s\S]*?)<\/address>/);

  if (customerBlock) {
    const lines = customerBlock[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (line.match(/^(Customers|Select|Search|\*)/)) continue;

      const phoneMatch =
        line.match(/(?:phone|tel|t)[:.]?\s*([\d\s()+-]+)/i) ||
        line.match(/^([\d()+-][\d\s()+-]{6,})$/);
      if (phoneMatch) {
        detail.phone = phoneMatch[1].trim();
        continue;
      }

      const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        detail.email = emailMatch[0];
        continue;
      }

      // US address: City, ST 12345
      const cityStateZip = line.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (cityStateZip) {
        detail.city = cityStateZip[1].trim();
        detail.state = cityStateZip[2];
        detail.zip = cityStateZip[3];
        continue;
      }

      // "City , State ZIP" with spaces around comma
      const cityStateZip2 = line.match(/^(.+?)\s*,\s*(\w[\w\s]*?)\s+(\d{5}(?:-\d{4})?)$/);
      if (cityStateZip2 && !detail.city) {
        detail.city = cityStateZip2[1].trim();
        detail.state = cityStateZip2[2].trim();
        detail.zip = cityStateZip2[3];
        continue;
      }

      if (!detail.address && !line.match(/^(phone|tel|email|fax)/i)) {
        detail.address = line;
      }
    }
  }

  return detail;
}

// Batch fetch contact details for multiple orders (reuses single session)
export async function fetchCgetcOrderDetails(
  credentials: CgetcCredentials,
  orderIds: (string | number)[],
): Promise<Map<string, CgetcOrderDetail>> {
  if (!credentials.url || !credentials.db || !credentials.email || !credentials.password) {
    throw new Error("CGETC credentials incomplete");
  }

  const sessionId = await authenticate(
    credentials.url,
    credentials.db,
    credentials.email,
    credentials.password,
  );

  const results = new Map<string, CgetcOrderDetail>();

  for (const orderId of orderIds) {
    try {
      const detail = await fetchOrderDetailWithSession(credentials.url, sessionId, String(orderId));
      results.set(String(orderId), detail);
    } catch {
      // Skip failed fetches
    }
  }

  return results;
}

// ─── Inventory (Portal scraping) ────────────────────────────

function parsePortalProducts(html: string): CgetcProduct[] {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];

  const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  const products: CgetcProduct[] = [];

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [])
      .map((c) => c.replace(/<[^>]+>/g, "").replace(/[\n\t]/g, "").trim());

    if (cells.length < 12) continue;

    products.push({
      sku: cells[1] || "",
      name: cells[3] || "",
      barcode: cells[4] || "",
      quantity: parseFloat(cells[8]) || 0,
      reserved: parseFloat(cells[10]) || 0,
      available: parseFloat(cells[11]) || 0,
    });
  }

  return products;
}

export async function fetchCgetcInventory(credentials: CgetcCredentials): Promise<CgetcProduct[]> {
  if (!credentials.url || !credentials.db || !credentials.email || !credentials.password) {
    throw new Error("CGETC credentials incomplete");
  }
  const sessionId = await authenticate(
    credentials.url,
    credentials.db,
    credentials.email,
    credentials.password,
  );

  const res = await fetch(`${credentials.url}/portal/product`, {
    headers: { Cookie: `session_id=${sessionId}` },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CGETC portal error: HTTP ${res.status}`);

  const html = await res.text();
  return parsePortalProducts(html);
}

// ─── Connector for sync-runner ──────────────────────────────

import type { Connector, ExternalInventoryData, ExternalOrderData } from "../types";
import { Platform } from "@prisma/client";

function mapCgetcStatus(status: string, deliveryCount: number): { fulfillment: string; financial: string } {
  const s = status.toLowerCase().trim();
  if (s.includes("cancel")) return { fulfillment: "CANCELLED", financial: "REFUNDED" };
  if (s === "done") return { fulfillment: "DELIVERED", financial: "PAID" };
  if (s === "sale" && deliveryCount > 0) return { fulfillment: "FULFILLED", financial: "PAID" };
  if (s === "sale") return { fulfillment: "UNFULFILLED", financial: "PAID" };
  if (s === "draft") return { fulfillment: "UNFULFILLED", financial: "PENDING" };
  return { fulfillment: "UNFULFILLED", financial: "PAID" };
}

function mapCgetcChannel(origin: string): { overridePlatform?: Platform; channelNote?: string; skip: boolean } {
  const o = (origin || "").toLowerCase().trim();
  // Shopify — already synced from Shopify API
  if (o.includes("shopify")) return { skip: true };
  // TikTok — "TTS #...", "TTO #...", or bare 18-digit TTS order IDs
  if (o.includes("tts") || o.includes("tto") || o.includes("tiktok")) return { overridePlatform: "TIKTOK" as Platform, skip: false };
  if (/^\d{15,20}$/.test(o)) return { overridePlatform: "TIKTOK" as Platform, skip: false }; // bare TTS ID
  if (/^\d{15,20}\/\d{15,20}/.test(o)) return { overridePlatform: "TIKTOK" as Platform, skip: false }; // double TTS ID
  // Amazon
  if (o.includes("amazon")) return { overridePlatform: "AMAZON" as Platform, skip: false };
  // Promotion / seeding / gifting / sample — internal CGETC operations
  if (o.includes("gift") || o.includes("seeding") || o.includes("시딩") || o.includes("sample") || o.includes("sponsored") || o.includes("influencer") || o.includes("인플루언서") || o.includes("giveaway") || o.includes("event")) {
    return { channelNote: origin.trim(), skip: false };
  }
  // PO# — wholesale/retail orders
  if (o.includes("po#")) return { channelNote: origin.trim(), skip: false };
  // Everything else
  if (o) return { channelNote: "기타", skip: false };
  return { channelNote: "기타", skip: false };
}

export const cgetcConnector: Connector = {
  platform: "CGETC" as Platform,
  async fetchOrders(credentials: CgetcCredentials, since: Date | null): Promise<ExternalOrderData[]> {
    const saleOrders = await fetchCgetcSaleOrders(credentials, since);

    const results: ExternalOrderData[] = [];
    for (const so of saleOrders) {
      const channel = mapCgetcChannel(so.reference);
      if (channel.skip) continue; // Skip Shopify orders (already from Shopify API)

      const statuses = mapCgetcStatus(so.status, so.deliveryCount);
      results.push({
        externalOrderId: String(so.id),
        externalOrderNumber: so.soNumber,
        rawData: so,
        orderDate: new Date(so.date || Date.now()),
        fulfillmentStatus: statuses.fulfillment,
        financialStatus: statuses.financial,
        totalAmount: so.amount,
        customerName: so.customerName || undefined,
        items: so.lineItems.map((li) => ({
          externalItemId: `${so.id}-${li.sku || li.productName}`,
          productName: li.productName,
          sku: li.sku || "",
          quantity: li.quantity,
          unitPrice: li.unitPrice,
        })),
        overridePlatform: channel.overridePlatform,
        channelNote: channel.channelNote,
      });
    }
    return results;
  },
  async fetchInventory(credentials: CgetcCredentials): Promise<ExternalInventoryData[]> {
    const products = await fetchCgetcInventory(credentials);
    return products.map((p) => ({
      sku: p.sku,
      productName: p.name,
      quantity: p.quantity,
    }));
  },
};
