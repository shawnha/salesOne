import { describe, it, expect } from "vitest";
import { mapNaverStatus, isGongguOrder } from "../orders";

describe("mapNaverStatus", () => {
  it("maps PAYMENT_WAITING to UNFULFILLED/PENDING", () => {
    expect(mapNaverStatus("PAYMENT_WAITING")).toEqual({ fulfillment: "UNFULFILLED", financial: "PENDING" });
  });

  it("maps PAYED to UNFULFILLED/PAID", () => {
    expect(mapNaverStatus("PAYED")).toEqual({ fulfillment: "UNFULFILLED", financial: "PAID" });
  });

  it("maps DELIVERING to PARTIALLY_FULFILLED/PAID", () => {
    expect(mapNaverStatus("DELIVERING")).toEqual({ fulfillment: "PARTIALLY_FULFILLED", financial: "PAID" });
  });

  it("maps DELIVERED to FULFILLED/PAID", () => {
    expect(mapNaverStatus("DELIVERED")).toEqual({ fulfillment: "FULFILLED", financial: "PAID" });
  });

  it("maps PURCHASE_DECIDED to DELIVERED/PAID", () => {
    expect(mapNaverStatus("PURCHASE_DECIDED")).toEqual({ fulfillment: "DELIVERED", financial: "PAID" });
  });

  it("maps EXCHANGED to FULFILLED/PARTIALLY_REFUNDED", () => {
    expect(mapNaverStatus("EXCHANGED")).toEqual({ fulfillment: "FULFILLED", financial: "PARTIALLY_REFUNDED" });
  });

  it("maps CANCELED to CANCELLED/VOIDED", () => {
    expect(mapNaverStatus("CANCELED")).toEqual({ fulfillment: "CANCELLED", financial: "VOIDED" });
  });

  it("maps RETURNED to CANCELLED/REFUNDED", () => {
    expect(mapNaverStatus("RETURNED")).toEqual({ fulfillment: "CANCELLED", financial: "REFUNDED" });
  });

  it("returns defaults for unknown status", () => {
    expect(mapNaverStatus("SOME_UNKNOWN")).toEqual({ fulfillment: "UNFULFILLED", financial: "PENDING" });
  });
});

describe("isGongguOrder", () => {
  it("detects gonggu via sellerCustomCode1 containing gonggu", () => {
    expect(isGongguOrder({ sellerCustomCode1: "GONGGU-2026-04" }, new Set())).toBe(true);
  });

  it("detects gonggu via sellerCustomCode1 containing korean 공구", () => {
    expect(isGongguOrder({ sellerCustomCode1: "예영공구4월" }, new Set())).toBe(true);
  });

  it("detects gonggu via gongguSkus set with productId", () => {
    expect(isGongguOrder({ productId: "12345" }, new Set(["12345"]))).toBe(true);
  });

  it("detects gonggu via gongguSkus set with originalProductId", () => {
    expect(isGongguOrder({ originalProductId: "99999" }, new Set(["99999"]))).toBe(true);
  });

  it("returns false when no match", () => {
    expect(isGongguOrder({ sellerCustomCode1: "" }, new Set())).toBe(false);
  });

  it("returns false when sellerCustomCode1 is undefined", () => {
    expect(isGongguOrder({}, new Set())).toBe(false);
  });
});
