import { describe, it, expect } from "vitest";
import { calculateExpectedStock } from "@/lib/reconciliation";

describe("calculateExpectedStock", () => {
  it("calculates expected stock from PO, sales, and adjustments", () => {
    const result = calculateExpectedStock({ purchased: 8840, sold: 8154, adjusted: 0 });
    expect(result).toBe(686);
  });

  it("subtracts adjustments from expected", () => {
    const result = calculateExpectedStock({ purchased: 8840, sold: 8154, adjusted: 20 });
    expect(result).toBe(666);
  });

  it("handles zero purchases", () => {
    const result = calculateExpectedStock({ purchased: 0, sold: 0, adjusted: 0 });
    expect(result).toBe(0);
  });

  it("can result in negative expected stock", () => {
    const result = calculateExpectedStock({ purchased: 100, sold: 150, adjusted: 0 });
    expect(result).toBe(-50);
  });
});
