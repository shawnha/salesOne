/**
 * Naver dispatch — 송장번호를 네이버에 등록.
 *
 * 단일 endpoint: POST /v1/pay-order/seller/product-orders/dispatch
 * body: { dispatchProductOrders: [{ productOrderId, deliveryMethod,
 *         deliveryCompanyCode, trackingNumber, dispatchDate }] }
 *
 * 한 번 호출에 여러 productOrder를 같이 보낼 수 있음. 부분 실패 가능.
 */
import type { NaverCredentials } from "./types";
import { naverFetch } from "./auth";

export type NaverDispatchItem = {
  productOrderId: string;
  trackingNumber: string;
  deliveryCompanyCode?: string; // 네이버 코드. 기본 "CJGLS"
};

export type NaverDispatchResult = {
  ok: number;
  failed: Array<{ productOrderId: string; error: string }>;
};

/**
 * 네이버 택배사 코드 (자주 쓰는 것만 — 필요 시 확장).
 */
const CARRIER_CODES: Record<string, string> = {
  CJ대한통운: "CJGLS",
  CJ: "CJGLS",
  한진: "HANJIN",
  로젠: "LOGEN",
  우체국: "EPOST",
  롯데: "LOTTE",
};

export function carrierToNaverCode(carrier: string | null | undefined): string {
  if (!carrier) return "CJGLS";
  return CARRIER_CODES[carrier] ?? carrier;
}

export async function dispatchNaverOrders(
  credentials: NaverCredentials,
  items: NaverDispatchItem[],
): Promise<NaverDispatchResult> {
  if (items.length === 0) return { ok: 0, failed: [] };

  const body = {
    dispatchProductOrders: items.map((it) => ({
      productOrderId: it.productOrderId,
      deliveryMethod: "DELIVERY",
      deliveryCompanyCode: it.deliveryCompanyCode ?? "CJGLS",
      trackingNumber: it.trackingNumber,
      dispatchDate: new Date().toISOString(),
    })),
  };

  const res = await naverFetch(credentials, "/v1/pay-order/seller/product-orders/dispatch", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // 전체 실패로 보고
    return {
      ok: 0,
      failed: items.map((it) => ({
        productOrderId: it.productOrderId,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      })),
    };
  }

  // 네이버 응답 shape: { data: { successProductOrderInfos: [], failProductOrderInfos: [{ productOrderId, errorMessage }] } }
  const data = await res.json();
  const failed: Array<{ productOrderId: string; error: string }> = [];
  const failInfos = data?.data?.failProductOrderInfos ?? [];
  for (const f of failInfos) {
    failed.push({
      productOrderId: String(f.productOrderId),
      error: f.errorMessage || "unknown",
    });
  }
  const ok = items.length - failed.length;
  return { ok, failed };
}
