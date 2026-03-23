import { describe, it, expect } from "vitest";
import { formatOrderNumber } from "@/lib/order-number";

describe("formatOrderNumber", () => {
  it("formats HOI order number", () => {
    expect(formatOrderNumber("HOI", 1)).toBe("HOI-0001");
    expect(formatOrderNumber("HOI", 42)).toBe("HOI-0042");
    expect(formatOrderNumber("HOI", 10000)).toBe("HOI-10000");
  });
  it("formats HOK order number", () => {
    expect(formatOrderNumber("HOK", 1)).toBe("HOK-0001");
  });
  it("formats HOR order number", () => {
    expect(formatOrderNumber("HOR", 5)).toBe("HOR-0005");
  });
});
