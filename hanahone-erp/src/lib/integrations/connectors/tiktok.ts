/**
 * TikTok Shop Orders API 커넥터 — 주문 정본.
 *
 * 그동안 틱톡 주문은 CGETC(3PL) 피드로만 들어와서 두 가지 한계가 있었다:
 * 출고돼야 데이터가 생기고(미출고 주문은 안 보임), CGETC 연동 이전(~2026-03)이 통째로 빠졌다.
 * 이 커넥터는 셀러 API에서 주문을 직접 읽어 그 둘을 없앤다. CGETC는 물류 실측(교차검증)으로 남는다.
 *
 * 토큰: worker/tiktok-finance/tokens.json을 sync_pending.py와 **공유**한다(같은 맥·같은 파일이라
 * refresh rotation 충돌 없음). 만료 임박이면 여기서도 갱신해 같은 파일에 되쓴다.
 */
import { createHmac } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import type { Connector, ExternalOrderData } from "../types";

const API_BASE = "https://open-api.tiktokglobalshop.com";
const REFRESH_MARGIN_SEC = 24 * 3600;

interface TiktokCredentials {
  appKey: string;
  appSecret: string;
  /** tokens.json 절대경로 (sync_pending.py와 공유) */
  tokensPath: string;
  /** 미지정 시 authorized shops에서 1회 조회 */
  shopCipher?: string;
}

interface TokenFile {
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  [k: string]: unknown;
}

function sign(path: string, params: Record<string, string>, body: string | null, secret: string): string {
  const keys = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  let s = path + keys.map((k) => `${k}${params[k]}`).join("");
  if (body) s += body;
  return createHmac("sha256", secret).update(secret + s + secret).digest("hex");
}

function loadTokens(path: string): TokenFile {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function refreshTokens(creds: TiktokCredentials, tokens: TokenFile): Promise<TokenFile> {
  const qs = new URLSearchParams({
    app_key: creds.appKey,
    app_secret: creds.appSecret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(`https://auth.tiktok-shops.com/api/v2/token/refresh?${qs}`);
  const body = await res.json();
  if (body.code !== 0 || !body.data?.access_token) {
    throw new Error(`TikTok token refresh failed: ${body.code} ${body.message}`);
  }
  const next = { ...tokens, ...body.data } as TokenFile;
  writeFileSync(creds.tokensPath, JSON.stringify(next, null, 2));
  return next;
}

async function ensureTokens(creds: TiktokCredentials): Promise<TokenFile> {
  const tokens = loadTokens(creds.tokensPath);
  const left = Number(tokens.access_token_expire_in || 0) - Math.floor(Date.now() / 1000);
  if (left > REFRESH_MARGIN_SEC) return tokens;
  return refreshTokens(creds, tokens);
}

async function signedCall(
  creds: TiktokCredentials,
  tokens: TokenFile,
  path: string,
  extraParams: Record<string, string>,
  body: unknown | null,
  method = "GET",
): Promise<any> {
  const params: Record<string, string> = {
    app_key: creds.appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...extraParams,
  };
  const bodyText = body === null ? null : JSON.stringify(body);
  params.sign = sign(path, params, bodyText, creds.appSecret);
  const res = await fetch(`${API_BASE}${path}?${new URLSearchParams(params)}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": tokens.access_token,
    },
    body: bodyText ?? undefined,
  });
  return res.json();
}

async function getShopCipher(creds: TiktokCredentials, tokens: TokenFile): Promise<string> {
  if (creds.shopCipher) return creds.shopCipher;
  const r = await signedCall(creds, tokens, "/authorization/202309/shops", {}, null);
  const shop = (r.data?.shops || [])[0];
  if (!shop?.cipher) throw new Error(`TikTok shop cipher 조회 실패: ${r.code} ${r.message}`);
  return shop.cipher;
}

/**
 * 주문 상태 → 출고 상태.
 * TikTok: UNPAID / ON_HOLD / AWAITING_SHIPMENT / AWAITING_COLLECTION / PARTIALLY_SHIPPING /
 *         IN_TRANSIT / DELIVERED / COMPLETED / CANCELLED
 * COMPLETED는 배송 완료 후 정산까지 끝난 상태라 DELIVERED와 같이 인도 완료로 본다.
 */
function mapFulfillmentStatus(status: string): string {
  switch (status) {
    case "DELIVERED":
    case "COMPLETED":
      return "DELIVERED";
    case "IN_TRANSIT":
    case "AWAITING_COLLECTION":
      return "FULFILLED";
    case "PARTIALLY_SHIPPING":
      return "PARTIALLY_FULFILLED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "UNFULFILLED";
  }
}

/** 틱톡은 결제 완료분만 주문으로 내려온다(UNPAID는 결제 대기). 취소는 환불 처리. */
function mapFinancialStatus(status: string): string {
  if (status === "CANCELLED") return "REFUNDED";
  if (status === "UNPAID") return "PENDING";
  return "PAID";
}

export interface TiktokOrderFinance {
  /** 플랫폼 수수료·세금 합(양수). 정산서의 fee_tax_amount는 음수로 오므로 뒤집는다. */
  fee: number;
  /** 셀러 실수령액. 미정산 건은 예상치. */
  settlement: number;
  /** 정산 기준 매출. */
  revenue: number;
  /** true = 정산 완료(정산서 확정), false = 미정산 예상치. */
  settled: boolean;
}

async function paged(
  creds: TiktokCredentials,
  tokens: TokenFile,
  path: string,
  params: Record<string, string>,
  listKey: string,
): Promise<any[]> {
  const out: any[] = [];
  let pageToken: string | undefined;
  let guard = 0;
  while (guard++ < 200) {
    const p: Record<string, string> = { ...params, page_size: "100" };
    if (pageToken) p.page_token = pageToken;
    const r = await signedCall(creds, tokens, path, p, null);
    if (r.code !== 0) throw new Error(`TikTok ${path} failed: ${r.code} ${r.message}`);
    out.push(...(r.data?.[listKey] || []));
    pageToken = r.data?.next_page_token;
    if (!pageToken) break;
  }
  return out;
}

/**
 * 주문별 수수료·정산액 — Orders API엔 없고 Finance API에만 있다.
 * 정산서(확정) + 미정산(예상)을 한 번에 훑어 주문 ID로 맵을 만든다.
 * 정산은 주문 N건을 배치로 묶어 지급하므로 건별 조회보다 배치 수집이 맞다.
 */
export async function fetchTiktokOrderFinance(
  credentials: TiktokCredentials,
  since: Date | null,
): Promise<Map<string, TiktokOrderFinance>> {
  const tokens = await ensureTokens(credentials);
  const cipher = await getShopCipher(credentials, tokens);
  const map = new Map<string, TiktokOrderFinance>();

  const from = Math.floor((since ?? new Date(Date.UTC(2026, 0, 1))).getTime() / 1000);
  const to = Math.floor(Date.now() / 1000) + 86400;

  const statements = await paged(credentials, tokens, "/finance/202309/statements", {
    shop_cipher: cipher,
    sort_field: "statement_time",
    sort_order: "ASC",
    statement_time_ge: String(from),
    statement_time_lt: String(to),
  }, "statements");

  for (const s of statements) {
    const txns = await paged(
      credentials, tokens,
      `/finance/202501/statements/${s.id}/statement_transactions`,
      { shop_cipher: cipher, sort_field: "order_create_time" },
      "transactions",
    );
    for (const t of txns) {
      if (!t.order_id) continue;
      map.set(String(t.order_id), {
        fee: Math.abs(parseFloat(t.fee_tax_amount || "0") || 0),
        settlement: parseFloat(t.settlement_amount || "0") || 0,
        revenue: parseFloat(t.revenue_amount || "0") || 0,
        settled: true,
      });
    }
  }

  const unsettled = await paged(credentials, tokens, "/finance/202507/orders/unsettled", {
    shop_cipher: cipher,
    sort_field: "order_create_time",
  }, "transactions");
  for (const t of unsettled) {
    if (!t.order_id || map.has(String(t.order_id))) continue; // 확정 정산이 우선
    map.set(String(t.order_id), {
      fee: Math.abs(parseFloat(t.est_fee_tax_amount || "0") || 0),
      settlement: parseFloat(t.est_settlement_amount || "0") || 0,
      revenue: parseFloat(t.est_revenue_amount || "0") || 0,
      settled: false,
    });
  }

  return map;
}

export const tiktokConnector: Connector = {
  platform: "TIKTOK",

  async fetchOrders(credentials: TiktokCredentials, since: Date | null) {
    if (!credentials.appKey || !credentials.appSecret || !credentials.tokensPath) {
      throw new Error("TikTok credentials incomplete (appKey/appSecret/tokensPath)");
    }
    const tokens = await ensureTokens(credentials);
    const cipher = await getShopCipher(credentials, tokens);

    // 증분은 **갱신 시각** 기준. 생성일 기준이면 한 번 수집한 주문의 출고·취소 갱신을 못 본다.
    // 전체 조회(since=null)는 2026-01-01 이후로 하한을 건다 — 2025는 확정·동결 회계연도.
    const body: Record<string, number> = {};
    if (since) body.update_time_ge = Math.floor(since.getTime() / 1000);
    else body.create_time_ge = Math.floor(Date.UTC(2026, 0, 1) / 1000);

    const orders: ExternalOrderData[] = [];
    let pageToken: string | undefined;
    let guard = 0;

    while (guard++ < 200) {
      const params: Record<string, string> = {
        shop_cipher: cipher,
        page_size: "50",
        sort_field: since ? "update_time" : "create_time",
      };
      if (pageToken) params.page_token = pageToken;

      const r = await signedCall(credentials, tokens, "/order/202309/orders/search", params, body, "POST");
      if (r.code !== 0) throw new Error(`TikTok orders search failed: ${r.code} ${r.message}`);

      for (const o of r.data?.orders || []) {
        const pay = o.payment || {};
        const lineItems: any[] = o.line_items || [];
        const recipient = o.recipient_address || {};

        // 매출 기준 = **정가 − 셀러 할인**. 플랫폼 할인(platform_discount)은 틱톡이 부담해서
        // 고객 결제액은 줄지만 셀러가 받는 금액은 정가 그대로다(정산 API est_revenue_amount와 전건 일치).
        // payment.total_amount(고객 결제액)를 쓰면 정산 축과 어긋난다.
        const listTotal = parseFloat(pay.original_total_product_price || "0") || 0;
        const sellerDiscount = parseFloat(pay.seller_discount || "0") || 0;
        const taxAmount = parseFloat(pay.tax || "0") || 0;
        const shippingAmount = parseFloat(pay.shipping_fee || "0") || 0;
        const revenueBase = listTotal - sellerDiscount;

        // 같은 SKU가 여러 줄로 오면 수량으로 합친다(틱톡은 개당 1줄).
        const bySku = new Map<string, { name: string; qty: number; paid: number; list: number; id: string }>();
        for (const li of lineItems) {
          const sku = li.seller_sku || li.sku_id || "";
          const cur = bySku.get(sku);
          const paid = parseFloat(li.sale_price || "0") || 0;
          const list = parseFloat(li.original_price || "0") || 0;
          if (cur) {
            cur.qty += 1;
            cur.paid += paid;
            cur.list += list;
          } else {
            bySku.set(sku, { name: li.product_name || li.sku_name || sku, qty: 1, paid, list, id: li.id });
          }
        }

        // 시스템 취소분 함정: 주문 status는 COMPLETED로 남는데 패키지가 전부 CANCELLED인
        // 경우가 있다(배송 지연 자동 취소 등). 정산 기록상 매출 0·수수료만 청구되므로
        // 매출로 잡으면 안 된다. 품목이 전부 취소면 취소 주문으로 본다.
        const allItemsCancelled =
          lineItems.length > 0 && lineItems.every((li) => li.package_status === "CANCELLED");
        const effectiveStatus = allItemsCancelled ? "CANCELLED" : o.status;

        const tracking =
          o.tracking_number || lineItems.find((li) => li.tracking_number)?.tracking_number || undefined;
        const carrier = lineItems.find((li) => li.shipping_provider_name)?.shipping_provider_name
          || o.shipping_provider || undefined;
        const rtsTime = o.rts_time || lineItems.find((li) => li.rts_time)?.rts_time;

        orders.push({
          externalOrderId: String(o.id),
          externalOrderNumber: `TTS #${o.id}`,
          rawData: o,
          orderDate: new Date(Number(o.create_time) * 1000),
          fulfillmentStatus: mapFulfillmentStatus(effectiveStatus),
          financialStatus: mapFinancialStatus(effectiveStatus),
          // Shopify와 같은 규약: total = 공급가 + 세금 + 배송비(단 여기서 공급가는 셀러 매출 기준).
          totalAmount: +(revenueBase + taxAmount + shippingAmount).toFixed(2),
          taxAmount,
          shippingAmount,
          customerName: o.buyer_nickname || undefined,
          customerEmail: o.buyer_email || undefined,
          recipientName: recipient.name || undefined,
          recipientPhone: recipient.phone_number || undefined,
          recipientZip: recipient.zipcode || undefined,
          shippingAddress: recipient.full_address || undefined,
          trackingNumber: tracking,
          trackingCarrier: carrier,
          shipDate: rtsTime ? new Date(Number(rtsTime) * 1000) : undefined,
          items: Array.from(bySku, ([sku, v]) => ({
            externalItemId: v.id,
            productName: v.name,
            sku,
            quantity: v.qty,
            // 단가도 셀러 매출 기준(정가). sale_price는 플랫폼 할인이 빠진 고객 결제가라
            // 매출로 쓰면 주문 총액과 어긋난다.
            unitPrice: +(v.list / v.qty).toFixed(2),
            originalUnitPrice: v.list > 0 ? +(v.list / v.qty).toFixed(2) : undefined,
          })),
        });
      }

      pageToken = r.data?.next_page_token;
      if (!pageToken) break;
    }

    return orders;
  },
};
