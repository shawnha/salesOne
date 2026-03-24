import { describe, it, expect } from "vitest";
import { calculateInventory } from "@/lib/integrations/inventory-calculator";

describe("calculateInventory", () => {
  it("calculates inventory from initial - sales + adjustments", () => {
    const result = calculateInventory(1000, 300, 50);
    expect(result).toBe(750);
  });

  it("returns 0 if result would be negative", () => {
    const result = calculateInventory(100, 200, 0);
    expect(result).toBe(0);
  });

  it("handles zero sales", () => {
    const result = calculateInventory(500, 0, 100);
    expect(result).toBe(600);
  });
});
