/**
 * Coupang dispatch — 송장번호를 쿠팡에 등록.
 *
 * 네이버와 다르게 2단계:
 *   1. PUT /ordersheets/acknowledgement
 *      body: { vendorId, shipmentBoxIds: [...] }
 *      → 상품준비중 처리 (ACCEPT → INSTRUCT). 이미 처리됐으면 에러 무시.
 *   2. POST /orders/invoices
 *      body: {
 *        vendorId,
 *        orderSheetInvoiceApplyDtos: [{
 *          shipmentBoxId, orderId, vendorItemId,
 *          deliveryCompanyCode, invoiceNumber,
 *          splitShipping, preSplitShipped, estimatedShippingDate
 *        }]
 *      }
 *      → 송장번호 등록.
 *
 * 식별자 3개 모두 필요: shipmentBoxId + orderId + vendorItemId.
 */
import crypto from "crypto";
import type { CoupangCredentials } from "../connectors/coupang";

const COUPANG_HOST = "https://api-gateway.coupang.com";
const API_PREFIX = "/v2/providers/openapi/apis/api/v4/vendors";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function signedDate(): string {
  const d = new Date();
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

function buildAuthHeader(method: string, path: string, query: string, secretKey: string, accessKey: string): string {
  const datetime = signedDate();
  const message = datetime + method.toUpperCase() + path + (query || "");
  const signature = crypto.createHmac("sha256", secretKey).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

async function coupangFetch(
  creds: CoupangCredentials,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${COUPANG_HOST}${path}`, {
    method,
    headers: {
      Authorization: buildAuthHeader(method, path, "", creds.secretKey, creds.accessKey),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
}

export type CoupangDispatchItem = {
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  trackingNumber: string;
  deliveryCompanyCode?: string; // 기본 "CJGLS"
};

export type CoupangDispatchResult = {
  ok: number;
  failed: Array<{ shipmentBoxId: string; error: string }>;
};

/**
 * Step 1 — ACCEPT 상태인 shipmentBox들을 INSTRUCT (상품준비중)로 전환.
 * 이미 INSTRUCT면 쿠팡이 에러 반환하지만 무시 (송장 등록은 진행 가능).
 */
export async function acknowledgeCoupangShipmentBoxes(
  credentials: CoupangCredentials,
  shipmentBoxIds: string[],
): Promise<{ status: number; body: string }> {
  if (shipmentBoxIds.length === 0) return { status: 200, body: "no boxes" };
  const path = `${API_PREFIX}/${encodeURIComponent(credentials.vendorId)}/ordersheets/acknowledgement`;
  const body = {
    vendorId: credentials.vendorId,
    shipmentBoxIds: shipmentBoxIds.map((id) => Number(id)),
  };
  const res = await coupangFetch(credentials, "PUT", path, body);
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 400) };
}

/**
 * Step 2 — 송장번호 등록. 한 번 호출에 여러 건 가능.
 * Coupang은 부분 성공/실패 응답 형식이 명확하지 않아서 호출 전체가 실패하면
 * 모든 행 실패로 처리. 응답에 errors 가 있으면 거기서 분리.
 */
export async function uploadCoupangInvoices(
  credentials: CoupangCredentials,
  items: CoupangDispatchItem[],
): Promise<CoupangDispatchResult> {
  if (items.length === 0) return { ok: 0, failed: [] };

  const path = `${API_PREFIX}/${encodeURIComponent(credentials.vendorId)}/orders/invoices`;
  const body = {
    vendorId: credentials.vendorId,
    orderSheetInvoiceApplyDtos: items.map((it) => ({
      shipmentBoxId: Number(it.shipmentBoxId),
      orderId: Number(it.orderId),
      vendorItemId: Number(it.vendorItemId),
      deliveryCompanyCode: it.deliveryCompanyCode ?? "CJGLS",
      invoiceNumber: it.trackingNumber,
      splitShipping: false,
      preSplitShipped: false,
      estimatedShippingDate: "",
    })),
  };

  const res = await coupangFetch(credentials, "POST", path, body);
  const text = await res.text();

  if (!res.ok) {
    return {
      ok: 0,
      failed: items.map((it) => ({
        shipmentBoxId: it.shipmentBoxId,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      })),
    };
  }

  // 성공 응답 — 쿠팡은 일반적으로 200 OK + { code, message, data: [...] }
  // 부분 실패는 data 배열 안 errorCode/errorMessage 필드로 표현됨.
  let parsed: { data?: Array<Record<string, unknown>> } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // 파싱 실패 시 전체 성공으로 간주 (200이라서)
    return { ok: items.length, failed: [] };
  }
  const failed: Array<{ shipmentBoxId: string; error: string }> = [];
  const dataArr = Array.isArray(parsed.data) ? parsed.data : [];
  for (let i = 0; i < dataArr.length; i++) {
    const row = dataArr[i];
    const errorCode = row?.errorCode as string | undefined;
    const errorMsg = row?.errorMessage as string | undefined;
    if (errorCode || errorMsg) {
      const shipmentBoxId = String(row?.shipmentBoxId ?? items[i]?.shipmentBoxId ?? "");
      failed.push({ shipmentBoxId, error: errorMsg || errorCode || "unknown" });
    }
  }
  return { ok: items.length - failed.length, failed };
}
