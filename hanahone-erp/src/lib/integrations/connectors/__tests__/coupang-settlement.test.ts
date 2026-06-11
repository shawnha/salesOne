import { describe, it, expect } from "vitest";
import {
  settlementMonthsBetween,
  mapCoupangSettlement,
  CoupangSettlementBatch,
} from "../coupang";

// 2026-06-11 라이브 응답 기반 픽스처 (settlement-histories 5월 WEEKLY 배치)
const weeklyBatch: CoupangSettlementBatch = {
  settlementType: "WEEKLY",
  settlementDate: "2026-05-26",
  revenueRecognitionYearMonth: "2026-05",
  revenueRecognitionDateFrom: "2026-05-01",
  revenueRecognitionDateTo: "2026-05-03",
  totalSale: 1789400,
  serviceFee: 208648,
  settlementTargetAmount: 1580752,
  settlementAmount: 1106527, // 70% 선지급
  lastAmount: 474225, // 30% 유보 — 후속 배치로 별도 지급
  finalAmount: 1106527, // 이번 배치 실입금액
  status: "DONE",
};

describe("mapCoupangSettlement", () => {
  it("stores the actual deposit (finalAmount), not the 100% settlement target", () => {
    const p = mapCoupangSettlement(weeklyBatch);
    expect(p.amount).toBe(1106527);
    expect(p.amount).not.toBe(weeklyBatch.settlementTargetAmount);
  });

  it("derives a stable composite externalId (no platform payout id exists)", () => {
    const p = mapCoupangSettlement(weeklyBatch);
    expect(p.externalId).toBe("WEEKLY:2026-05-26:2026-05-01");
    expect(mapCoupangSettlement({ ...weeklyBatch }).externalId).toBe(p.externalId);
  });

  it("maps payout date, sales period, fee, status, and preserves rawData", () => {
    const p = mapCoupangSettlement(weeklyBatch);
    expect(p.payoutDate.toISOString().slice(0, 10)).toBe("2026-05-26");
    expect(p.periodStart?.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(p.periodEnd?.toISOString().slice(0, 10)).toBe("2026-05-03");
    expect(p.feeAmount).toBe(208648);
    expect(p.status).toBe("DONE");
    expect(p.currency).toBe("KRW");
    expect(p.rawData).toBe(weeklyBatch);
  });

  it("keeps scheduled (not yet DONE) batches with their platform-reported status", () => {
    const p = mapCoupangSettlement({ ...weeklyBatch, status: "EXPECTED" });
    expect(p.status).toBe("EXPECTED");
  });

  it("treats missing amounts as 0 instead of NaN", () => {
    const sparse = {
      settlementType: "WEEKLY",
      settlementDate: "2026-05-26",
      revenueRecognitionDateFrom: "2026-05-01",
    } as unknown as CoupangSettlementBatch;
    const p = mapCoupangSettlement(sparse);
    expect(p.amount).toBe(0);
    expect(p.feeAmount).toBe(0);
  });
});

describe("settlementMonthsBetween", () => {
  it("lists months inclusive of both endpoints", () => {
    expect(
      settlementMonthsBetween(new Date("2026-01-15"), new Date("2026-06-11")),
    ).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  });

  it("returns a single month when since and now share a month", () => {
    expect(
      settlementMonthsBetween(new Date("2026-06-01"), new Date("2026-06-11")),
    ).toEqual(["2026-06"]);
  });

  it("crosses year boundaries", () => {
    expect(
      settlementMonthsBetween(new Date("2025-11-20"), new Date("2026-02-01")),
    ).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("caps runaway ranges at maxMonths", () => {
    expect(
      settlementMonthsBetween(new Date("2000-01-01"), new Date("2026-06-11")),
    ).toHaveLength(24);
  });
});
