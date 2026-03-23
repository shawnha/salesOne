import { describe, it, expect } from "vitest";
import { calculateAdjustment } from "@/lib/inventory-adjuster";

describe("calculateAdjustment", () => {
  it("calculates sale deduction correctly", () => {
    const result = calculateAdjustment(100, -30, "SALE");
    expect(result).toEqual({ previousQuantity: 100, newQuantity: 70, quantityChange: -30, adjustmentType: "SALE" });
  });
  it("calculates production addition correctly", () => {
    const result = calculateAdjustment(100, 50, "PRODUCTION");
    expect(result).toEqual({ previousQuantity: 100, newQuantity: 150, quantityChange: 50, adjustmentType: "PRODUCTION" });
  });
  it("throws if deduction would go negative", () => {
    expect(() => calculateAdjustment(10, -20, "SALE")).toThrow("Insufficient inventory");
  });
});
