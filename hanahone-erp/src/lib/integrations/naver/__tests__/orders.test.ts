import { describe, it, expect } from "vitest";
import { mapNaverStatus } from "../orders";

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
