import crypto from "crypto";
import type { Connector, ExternalOrderData, ExternalOrderItemData } from "../types";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CoupangCredentials {
  accessKey: string;
  secretKey: string;
  vendorId: string;
}

const BASE_URL = "https://api-gateway.coupang.com";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Coupang signed-date format: yyMMdd'T'HHmmss'Z' (UTC).
 */
function signedDate(d: Date = new Date()): string {
  return (
    d.getUTCFullYear().toString().slice(2) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Build the CEA-style Authorization header Coupang expects.
 * message = signedDate + HTTP_METHOD + path + query (without leading '?')
 * HMAC-SHA256 in hex using secret key.
 */
export function buildAuthHeader(
  method: string,
  path: string,
  query: string,
  creds: CoupangCredentials,
): string {
  const datetime = signedDate();
  const message = datetime + method.toUpperCase() + path + (query || "");
  const signature = crypto.createHmac("sha256", creds.secretKey).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${creds.accessKey}, signed-date=${datetime}, signature=${signature}`;
}

async function coupangFetch<T>(
  creds: CoupangCredentials,
  method: "GET" | "POST" | "PUT",
  path: string,
  query: string = "",
  body?: any,
): Promise<T> {
  const url = BASE_URL + path + (query ? `?${query}` : "");
  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(method, path, query, creds),
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Coupang ${method} ${path} failed: HTTP ${res.status} — ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Coupang ${method} ${path}: invalid JSON response (${text.slice(0, 200)})`);
  }
}

/**
 * Map Coupang ordersheet status → (fulfillment, financial).
 * Coupang lifecycle: ACCEPT → INSTRUCT → DEPARTURE → DELIVERING → FINAL_DELIVERY
 */
function mapCoupangStatus(status: string): { fulfillment: string; financial: string } {
  switch ((status || "").toUpperCase()) {
    case "ACCEPT":
    case "INSTRUCT":
      return { fulfillment: "UNFULFILLED", financial: "PAID" };
    case "DEPARTURE":
    case "DELIVERING":
    case "NONE_TRACKING":
      return { fulfillment: "PARTIALLY_FULFILLED", financial: "PAID" };
    case "FINAL_DELIVERY":
      return { fulfillment: "DELIVERED", financial: "PAID" };
    case "CANCEL":
    case "RETURNS":
      return { fulfillment: "CANCELLED", financial: "REFUNDED" };
    default:
      return { fulfillment: "UNFULFILLED", financial: "PENDING" };
  }
}

/**
 * Format a Date as Coupang's ordersheet query parameter expects: YYYY-MM-DD.
 */
function formatOrderDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

type OrdersheetResponse = {
  code: number;
  message: string;
  data: CoupangOrdersheet[];
  nextToken?: string;
};

type CoupangOrdersheet = {
  shipmentBoxId: number;
  orderId: number;
  orderedAt: string;
  paidAt: string | null;
  status: string;
  orderer: { name: string; email?: string; safeNumber?: string; ordererNumber?: string };
  receiver: {
    name: string;
    safeNumber?: string;
    receiverNumber?: string;
    postCode?: string;
    addr1?: string;
    addr2?: string;
  };
  orderItems: Array<{
    vendorItemId: number | string;
    vendorItemName: string;
    externalVendorSku?: string | null;
    sellerProductItemName?: string;
    vendorItemPackageName?: string;
    shippingCount: number;
    salesPrice: number;
    orderPrice: number;
    discountPrice?: number;
    instantCouponDiscount?: number;
    downloadableCouponDiscount?: number;
    coupangDiscount?: number;
    sellerDiscount?: number;
    cancelCount?: number;
  }>;
};

// Coupang's v4 ordersheets endpoint filters on the order's CURRENT status,
// not an "any status" query. We sweep every lifecycle status per window and
// dedup downstream.
const ORDER_STATUSES = [
  "ACCEPT",
  "INSTRUCT",
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
] as const;

/**
 * Format date as yyyyMMdd (no separators) — required by Rocket Growth API.
 */
function formatYmdCompact(d: Date): string {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

/**
 * Rocket Growth (쿠팡 풀필먼트) order. The seller never touches shipping or
 * customer info — Coupang handles both — so the response only carries paid-at,
 * order id, and per-item productName/qty/price. No customer name/phone/address.
 */
type RocketGrowthOrder = {
  vendorId: string;
  orderId: number;
  paidAt: number; // unix ms
  orderItems: Array<{
    vendorItemId: number;
    productName: string;
    salesQuantity: number;
    unitSalesPrice: string;
    currency: string;
  }>;
};

type RocketGrowthOrdersResponse = {
  message: string;
  code: number;
  data: RocketGrowthOrder[];
  nextToken: string | null;
};

async function fetchRocketGrowthOrders(
  creds: CoupangCredentials,
  paidDateFrom: Date,
  paidDateTo: Date,
): Promise<RocketGrowthOrder[]> {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${encodeURIComponent(creds.vendorId)}/rg/orders`;
  const out: RocketGrowthOrder[] = [];

  // Walk in 31-day windows (matches marketplace constraint).
  const WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
  const windows: Array<{ from: string; to: string }> = [];
  let cursor = paidDateFrom.getTime();
  const end = paidDateTo.getTime();
  while (cursor < end) {
    const nxt = Math.min(cursor + WINDOW_MS, end);
    windows.push({
      from: formatYmdCompact(new Date(cursor)),
      to: formatYmdCompact(new Date(nxt)),
    });
    cursor = nxt;
  }

  for (const w of windows) {
    let nextToken: string | undefined;
    for (let page = 0; page < 200; page++) {
      const qs = new URLSearchParams({ paidDateFrom: w.from, paidDateTo: w.to });
      if (nextToken) qs.set("nextToken", nextToken);
      const json = await coupangFetch<RocketGrowthOrdersResponse>(creds, "GET", path, qs.toString());
      if (Array.isArray(json.data)) out.push(...json.data);
      if (!json.nextToken) break;
      nextToken = json.nextToken;
    }
  }

  return out;
}

/**
 * Rocket Growth inventory item — quantity reflects what Coupang's fulfillment
 * warehouse currently has on hand (orderable). Distinct from our own master
 * inventory because the seller doesn't physically hold these units.
 */
type RocketGrowthInventoryItem = {
  vendorItemId: number;
  vendorId: string;
  salesCountMap?: Record<string, number>;
  inventoryDetails: {
    totalOrderableQuantity: number;
  };
  externalSkuId?: number;
};

type RocketGrowthInventoryResponse = {
  message: string;
  code: number;
  data: RocketGrowthInventoryItem[];
  nextToken: string | null;
};

export async function fetchRocketGrowthInventory(
  creds: CoupangCredentials,
): Promise<Array<{ vendorItemId: string; quantity: number; salesLast30d: number }>> {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${encodeURIComponent(creds.vendorId)}/rg/inventory/summaries`;
  const out: Array<{ vendorItemId: string; quantity: number; salesLast30d: number }> = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 200; page++) {
    const qs = nextToken ? `nextToken=${encodeURIComponent(nextToken)}` : "";
    const json = await coupangFetch<RocketGrowthInventoryResponse>(creds, "GET", path, qs);
    for (const item of json.data ?? []) {
      out.push({
        vendorItemId: String(item.vendorItemId),
        quantity: item.inventoryDetails?.totalOrderableQuantity ?? 0,
        salesLast30d: item.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS ?? 0,
      });
    }
    if (!json.nextToken) break;
    nextToken = json.nextToken;
  }
  return out;
}

function mapRocketGrowthOrder(o: RocketGrowthOrder): ExternalOrderData {
  const items: ExternalOrderItemData[] = (o.orderItems || []).map((it) => ({
    externalItemId: String(it.vendorItemId),
    productName: it.productName,
    sku: String(it.vendorItemId),
    quantity: Number(it.salesQuantity || 0),
    unitPrice: Number(it.unitSalesPrice || 0),
  }));

  const totalAmount = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const orderDate = new Date(o.paidAt);

  return {
    externalOrderId: `RG-${o.orderId}`,
    externalOrderNumber: String(o.orderId),
    rawData: { ...o, shipmentType: "ROCKET_GROWTH" },
    orderDate,
    // Rocket Growth is fulfilled by Coupang — once paid, treat it as paid +
    // delivered from our POV (we don't get real shipment lifecycle hooks).
    fulfillmentStatus: "DELIVERED",
    financialStatus: "PAID",
    totalAmount,
    // No customer/recipient info — Coupang policy.
    channelNote: "로켓그로스",
    shipmentType: "ROCKET_GROWTH",
    items,
  };
}

async function fetchOrdersheets(
  creds: CoupangCredentials,
  createdAtFrom: string,
  createdAtTo: string,
): Promise<CoupangOrdersheet[]> {
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(creds.vendorId)}/ordersheets`;
  const MAX_PER_PAGE = 50;
  const out: CoupangOrdersheet[] = [];

  for (const status of ORDER_STATUSES) {
    let nextToken: string | undefined;
    for (let page = 0; page < 200; page++) {
      const qs = new URLSearchParams({
        createdAtFrom,
        createdAtTo,
        status,
        maxPerPage: String(MAX_PER_PAGE),
      });
      if (nextToken) qs.set("nextToken", nextToken);

      const json = await coupangFetch<OrdersheetResponse>(creds, "GET", path, qs.toString());
      if (Array.isArray(json.data)) out.push(...json.data);

      if (!json.nextToken) break;
      nextToken = json.nextToken;
    }
  }

  return out;
}

function mapOrdersheet(sheet: CoupangOrdersheet): ExternalOrderData {
  const { fulfillment, financial } = mapCoupangStatus(sheet.status);
  const orderDate = new Date(sheet.paidAt || sheet.orderedAt);

  const items: ExternalOrderItemData[] = (sheet.orderItems || []).map((it) => {
    // Prefer the seller-managed SKU when set; fall back to the Coupang
    // vendorItemId so SkuMapping(platform=COUPANG, externalSku=vendorItemId)
    // can still resolve to an internal product. The API sometimes serializes
    // missing values as the literal string "undefined", so treat that as empty.
    const raw = (it.externalVendorSku || "").trim();
    const sku = raw && raw !== "undefined" ? raw : String(it.vendorItemId);
    return {
      externalItemId: String(it.vendorItemId),
      productName: it.vendorItemName || it.sellerProductItemName || "",
      sku,
      quantity: Number(it.shippingCount || 0),
      unitPrice: Number(it.salesPrice || it.orderPrice || 0),
    };
  });

  const totalAmount = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

  const addr = sheet.receiver;
  // Address as the street portion only — zip is surfaced via recipientZip so
  // the mapper stores it in customer.contactInfo.zip alongside Naver orders.
  const shippingAddress = addr
    ? [addr.addr1, addr.addr2].filter(Boolean).join(" ") || undefined
    : undefined;

  return {
    externalOrderId: String(sheet.shipmentBoxId),
    externalOrderNumber: String(sheet.orderId),
    rawData: sheet,
    orderDate,
    fulfillmentStatus: fulfillment,
    financialStatus: financial,
    totalAmount,
    customerName: sheet.orderer?.name,
    customerEmail: sheet.orderer?.email,
    // Prefer real number if Coupang exposed one (some sheets do, most are 0504/0502 virtual).
    customerPhone: sheet.orderer?.ordererNumber || sheet.orderer?.safeNumber,
    shippingAddress,
    recipientName: addr?.name,
    recipientPhone: addr?.receiverNumber || addr?.safeNumber,
    recipientZip: addr?.postCode,
    shipmentType: "THIRD_PARTY",
    items,
  };
}

export const coupangConnector: Connector & {
  syncInventory: (credentials: CoupangCredentials, companyId: string) => Promise<void>;
} = {
  platform: "COUPANG" as Platform,

  /**
   * Pull Rocket Growth (쿠팡 풀필먼트) inventory into ExternalInventory.
   * vendorItemId stays as the externalSku — the same value that SkuMapping
   * resolves against — so the existing /inventory orphan section + the
   * SkuMapping lookup both Just Work.
   *
   * Marketplace inventory is NOT fetched here: we never persisted it to
   * ExternalInventory before, the seller's master inventory already drives
   * those numbers, and pulling it would duplicate marketplace SkuMapping rows.
   */
  syncInventory: async (credentials: CoupangCredentials, companyId: string) => {
    const items = await fetchRocketGrowthInventory(credentials);
    const now = new Date();
    const liveSkus = new Set(items.map((i) => i.vendorItemId));

    // Pull display names from Coupang SkuMapping when available so the orphan
    // section shows "로켓그로스 5개입" instead of a bare numeric vendorItemId.
    const mappings = await prisma.skuMapping.findMany({
      where: { companyId, platform: "COUPANG", externalSku: { in: items.map((i) => i.vendorItemId) } },
      select: { externalSku: true, displayName: true },
    });
    const nameByExternalSku = new Map(mappings.map((m) => [m.externalSku, m.displayName ?? null]));

    for (const item of items) {
      const externalName = nameByExternalSku.get(item.vendorItemId) ?? `로켓그로스 ${item.vendorItemId}`;
      await prisma.externalInventory.upsert({
        where: {
          companyId_platform_externalSku: {
            companyId,
            platform: "COUPANG",
            externalSku: item.vendorItemId,
          },
        },
        update: { externalName, quantity: item.quantity, lastSyncAt: now },
        create: {
          companyId,
          platform: "COUPANG",
          externalSku: item.vendorItemId,
          externalName,
          quantity: item.quantity,
          lastSyncAt: now,
        },
      });
    }

    // Remove rows that disappeared (vendorItem deleted or moved out of rocket growth).
    const existing = await prisma.externalInventory.findMany({
      where: { companyId, platform: "COUPANG" },
      select: { externalSku: true },
    });
    const stale = existing.filter((e) => !liveSkus.has(e.externalSku)).map((e) => e.externalSku);
    if (stale.length > 0) {
      await prisma.externalInventory.deleteMany({
        where: { companyId, platform: "COUPANG", externalSku: { in: stale } },
      });
    }
  },

  async fetchOrders(credentials: CoupangCredentials, since: Date | null): Promise<ExternalOrderData[]> {
    if (!credentials.accessKey || !credentials.secretKey || !credentials.vendorId) {
      throw new Error("Coupang credentials incomplete (accessKey, secretKey, vendorId required)");
    }

    // Coupang ordersheet window: max 31 days. Walk in 31-day windows from `since` (or 7 days back) to now.
    const now = new Date();
    const from = since || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
    const windows: Array<{ from: string; to: string }> = [];
    let cursor = from.getTime();
    const end = now.getTime();
    while (cursor < end) {
      const nxt = Math.min(cursor + WINDOW_MS, end);
      windows.push({
        from: formatOrderDate(new Date(cursor)),
        to: formatOrderDate(new Date(nxt)),
      });
      cursor = nxt;
    }

    // Pull marketplace + rocket growth independently — a 429 on one shouldn't
    // wipe out the other. ordersheets is the noisier endpoint (one call per
    // status × window); rg/orders is one call per window.
    let marketplaceOrders: ExternalOrderData[] = [];
    try {
      const all: CoupangOrdersheet[] = [];
      for (const w of windows) {
        const sheets = await fetchOrdersheets(credentials, w.from, w.to);
        all.push(...sheets);
      }
      const seen = new Set<number>();
      const deduped = all.filter((s) => {
        if (seen.has(s.shipmentBoxId)) return false;
        seen.add(s.shipmentBoxId);
        return true;
      });
      marketplaceOrders = deduped.map(mapOrdersheet);
    } catch (err) {
      console.warn("Coupang marketplace ordersheets sync failed:", (err as Error).message);
    }

    // Pull Rocket Growth (쿠팡 풀필먼트) orders too. They use a different
    // endpoint and a thinner shape — no customer/recipient info, no shipment
    // lifecycle. We tag them with channelNote=로켓그로스 so they're easy to
    // distinguish in reporting.
    let rgOrders: ExternalOrderData[] = [];
    try {
      const raw = await fetchRocketGrowthOrders(credentials, from, now);
      const rgSeen = new Set<number>();
      const rgDeduped = raw.filter((o) => {
        if (rgSeen.has(o.orderId)) return false;
        rgSeen.add(o.orderId);
        return true;
      });
      rgOrders = rgDeduped.map(mapRocketGrowthOrder);
    } catch (err) {
      // Don't block marketplace sync if rocket growth API fails (permission
      // not enabled, transient, etc.).
      console.warn("Coupang Rocket Growth sync failed:", (err as Error).message);
    }

    return [...marketplaceOrders, ...rgOrders];
  },
};
