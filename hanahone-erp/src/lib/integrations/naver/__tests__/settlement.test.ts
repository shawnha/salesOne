import { describe, it, expect } from "vitest";
import { splitIntoMonthlyWindows, mapNaverSettleElement, NaverSettleElement } from "../settlement";

// 2026-06-11 라이브 응답 기반 픽스처 (settle/daily 3월 실데이터 축약)
const completedElement: NaverSettleElement = {
  settleBasisStartDate: "2026-02-27",
  settleBasisEndDate: "2026-03-02",
  settleExpectDate: "2026-03-03",
  settleCompleteDate: "2026-03-03",
  settleAmount: 11240023,
  paySettleAmount: 11825000,
  commissionSettleAmount: -584977, // 라이브 검증: 음수로 옴
};

describe("mapNaverSettleElement", () => {
  it("maps a completed settlement to a DONE payout", () => {
    const p = mapNaverSettleElement(completedElement);
    expect(p.externalId).toBe("DAILY:2026-02-27:2026-03-03");
    expect(p.payoutDate.toISOString().slice(0, 10)).toBe("2026-03-03");
    expect(p.amount).toBe(11240023);
    expect(p.currency).toBe("KRW");
    expect(p.periodStart?.toISOString().slice(0, 10)).toBe("2026-02-27");
    expect(p.periodEnd?.toISOString().slice(0, 10)).toBe("2026-03-02");
    expect(p.status).toBe("DONE");
    expect(p.rawData).toBe(completedElement);
  });

  it("normalizes the negative commission to a positive feeAmount", () => {
    const p = mapNaverSettleElement(completedElement);
    expect(p.feeAmount).toBe(584977);
  });

  it("marks not-yet-deposited rows SCHEDULED and falls back to settleExpectDate", () => {
    const pending: NaverSettleElement = {
      ...completedElement,
      settleCompleteDate: null,
      settleExpectDate: "2026-06-15",
    };
    const p = mapNaverSettleElement(pending);
    expect(p.status).toBe("SCHEDULED");
    expect(p.payoutDate.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("is deterministic — same element always yields the same externalId", () => {
    expect(mapNaverSettleElement(completedElement).externalId).toBe(
      mapNaverSettleElement({ ...completedElement }).externalId,
    );
  });

  it("treats missing amounts as 0 instead of NaN", () => {
    const sparse = {
      settleBasisStartDate: "2026-05-01",
      settleBasisEndDate: "2026-05-01",
      settleExpectDate: "2026-05-02",
      settleCompleteDate: null,
    } as unknown as NaverSettleElement;
    const p = mapNaverSettleElement(sparse);
    expect(p.amount).toBe(0);
    expect(p.feeAmount).toBe(0);
  });
});

describe("splitIntoMonthlyWindows", () => {
  it("returns a single window for a range inside one month", () => {
    const w = splitIntoMonthlyWindows(new Date("2026-06-01"), new Date("2026-06-10"));
    expect(w).toEqual([{ start: "2026-06-01", end: "2026-06-10" }]);
  });

  it("never crosses a month boundary (Naver: 시작일~종료일 1달 이내)", () => {
    const w = splitIntoMonthlyWindows(new Date("2026-01-01"), new Date("2026-03-15"));
    expect(w).toEqual([
      { start: "2026-01-01", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-01", end: "2026-03-15" },
    ]);
  });

  it("starts mid-month when `from` is mid-month", () => {
    const w = splitIntoMonthlyWindows(new Date("2026-04-20"), new Date("2026-05-05"));
    expect(w).toEqual([
      { start: "2026-04-20", end: "2026-04-30" },
      { start: "2026-05-01", end: "2026-05-05" },
    ]);
  });

  it("handles a same-day range as a single one-day window", () => {
    const w = splitIntoMonthlyWindows(new Date("2026-06-10"), new Date("2026-06-10"));
    expect(w).toEqual([{ start: "2026-06-10", end: "2026-06-10" }]);
  });

  it("caps runaway ranges at maxMonths", () => {
    expect(splitIntoMonthlyWindows(new Date("2000-01-01"), new Date("2026-06-11"))).toHaveLength(36);
  });
});
