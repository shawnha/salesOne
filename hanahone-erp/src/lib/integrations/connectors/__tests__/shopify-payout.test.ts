import { describe, it, expect } from "vitest";
import { mapShopifyPayout, ShopifyPayout } from "../shopify";

// 2026-06-11 라이브 응답 기반 픽스처 (payouts.json 6/1 지급)
const paidPayout: ShopifyPayout = {
  id: 135205224622,
  status: "paid",
  date: "2026-06-01",
  currency: "USD",
  amount: "211.94",
  summary: {
    adjustments_fee_amount: "0.00",
    adjustments_gross_amount: "0.00",
    charges_fee_amount: "6.06",
    charges_gross_amount: "218.00",
    refunds_fee_amount: "0.00",
    refunds_gross_amount: "0.00",
    reserved_funds_fee_amount: "0.00",
    reserved_funds_gross_amount: "0.00",
    retried_payouts_fee_amount: "0.00",
    retried_payouts_gross_amount: "0.00",
  },
};

describe("mapShopifyPayout", () => {
  it("uses the platform payout id as externalId (no derivation needed)", () => {
    const p = mapShopifyPayout(paidPayout);
    expect(p.externalId).toBe("135205224622");
  });

  it("maps deposit amount, USD currency, date, and raw status", () => {
    const p = mapShopifyPayout(paidPayout);
    expect(p.amount).toBe(211.94);
    expect(p.currency).toBe("USD");
    expect(p.payoutDate.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(p.status).toBe("paid");
    expect(p.rawData).toBe(paidPayout);
  });

  it("sums every *_fee_amount field in summary (gross 필드는 제외)", () => {
    const p = mapShopifyPayout({
      ...paidPayout,
      summary: { ...paidPayout.summary, refunds_fee_amount: "1.50", adjustments_fee_amount: "0.44" },
    });
    expect(p.feeAmount).toBe(8.0); // 6.06 + 1.50 + 0.44
  });

  it("handles a payout with no summary (fee 0, not NaN)", () => {
    const p = mapShopifyPayout({ ...paidPayout, summary: undefined });
    expect(p.feeAmount).toBe(0);
    expect(p.amount).toBe(211.94);
  });

  it("keeps scheduled payouts with their raw status for ERP filtering", () => {
    const p = mapShopifyPayout({ ...paidPayout, status: "scheduled" });
    expect(p.status).toBe("scheduled");
  });
});
