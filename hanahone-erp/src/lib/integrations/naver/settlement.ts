import type { NaverCredentials } from "./types";
import type { ChannelPayoutData } from "../types";
import { naverFetch } from "./auth";

// ---------------------------------------------------------------------------
// Settlement (정산/지급) — what Naver actually deposited.
//
//   GET /v1/pay-settle/settle/daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//
// Response: { elements: [...], pagination: { page, size, totalPages, totalElements } }
// Live-verified 2026-06-11: 정산 기준기간(settleBasisStart/EndDate)별 1행,
// commissionSettleAmount는 음수로 옴, settleCompleteDate가 null이면 아직
// 미지급(예정) 건. elements가 비면 그 기간 정산 없음(정상).
// Elements have NO unique id → externalId is derived (see ChannelPayoutData).
// ---------------------------------------------------------------------------

export type NaverSettleElement = {
  settleBasisStartDate: string;
  settleBasisEndDate: string;
  settleExpectDate: string;
  settleCompleteDate: string | null;
  settleAmount: number;
  paySettleAmount: number;
  commissionSettleAmount: number; // 음수로 옴
  [key: string]: unknown;
};

type NaverSettleDailyResponse = {
  elements?: NaverSettleElement[];
  pagination?: { page: number; size: number; totalPages: number; totalElements: number };
};

/**
 * Calendar-month windows: [max(from, 월 1일), min(to, 월말일)] per month.
 * Naver rejects ranges spanning more than 1 month ("시작일과 종료일은 1 달
 * 이내여야 합니다" — live-verified 2026-06-11), so windows never cross a
 * month boundary.
 */
export function splitIntoMonthlyWindows(
  from: Date,
  to: Date,
  maxMonths = 36,
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  if (from >= to && from.toISOString().slice(0, 10) !== to.toISOString().slice(0, 10)) return windows;
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  while (y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth())) {
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0)); // 해당 월의 마지막 날
    const start = from > monthStart ? from : monthStart;
    const end = to < monthEnd ? to : monthEnd;
    if (start <= end) {
      windows.push({
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      });
    }
    if (windows.length >= maxMonths) break;
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return windows;
}

export function mapNaverSettleElement(el: NaverSettleElement): ChannelPayoutData {
  const completed = Boolean(el.settleCompleteDate);
  return {
    externalId: `DAILY:${el.settleBasisStartDate}:${el.settleExpectDate}`,
    // 미지급(예정) 건은 예정일을 지급일로 두고 status=SCHEDULED로 구분
    payoutDate: new Date(el.settleCompleteDate || el.settleExpectDate),
    amount: Number(el.settleAmount || 0),
    currency: "KRW",
    periodStart: el.settleBasisStartDate ? new Date(el.settleBasisStartDate) : undefined,
    periodEnd: el.settleBasisEndDate ? new Date(el.settleBasisEndDate) : undefined,
    feeAmount: Math.abs(Number(el.commissionSettleAmount || 0)),
    status: completed ? "DONE" : "SCHEDULED",
    rawData: el,
  };
}

export async function fetchNaverSettlements(
  credentials: NaverCredentials,
  since: Date,
): Promise<ChannelPayoutData[]> {
  const out: ChannelPayoutData[] = [];
  for (const window of splitIntoMonthlyWindows(since, new Date())) {
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams({
        startDate: window.start,
        endDate: window.end,
        page: String(page),
      });
      const res = await naverFetch(credentials, `/v1/pay-settle/settle/daily?${params.toString()}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Naver settle/daily failed: ${res.status} - ${body.slice(0, 200)}`);
      }
      const json: NaverSettleDailyResponse = await res.json();
      for (const el of json.elements ?? []) {
        if (!el?.settleBasisStartDate || !el?.settleExpectDate) continue;
        out.push(mapNaverSettleElement(el));
      }
      totalPages = json.pagination?.totalPages ?? 1;
      page++;
    } while (page <= totalPages);
  }
  return out;
}
