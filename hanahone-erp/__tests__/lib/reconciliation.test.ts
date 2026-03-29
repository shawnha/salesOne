import { describe, it, expect } from "vitest";
import { calculateExpectedStock, calculateBaselineExpected, buildBaselineRows } from "@/lib/reconciliation";

// Keep existing tests for legacy function
describe("calculateExpectedStock (legacy PO-based)", () => {
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

describe("calculateBaselineExpected", () => {
  it("returns baseline when no sales or adjustments", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: {},
      adjusted: 0,
    });
    expect(result).toBe(660);
  });

  it("subtracts total sales across channels from baseline", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: { SHOPIFY: 45, TIKTOK: 12, AMAZON: 3 },
      adjusted: 0,
    });
    expect(result).toBe(600);
  });

  it("subtracts adjustments from expected", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: { SHOPIFY: 45 },
      adjusted: 2,
    });
    expect(result).toBe(613);
  });

  it("handles negative adjustments (items returned)", () => {
    const result = calculateBaselineExpected({
      baseline: 660,
      salesByChannel: { SHOPIFY: 45 },
      adjusted: -5,
    });
    expect(result).toBe(620);
  });

  it("can result in negative expected stock", () => {
    const result = calculateBaselineExpected({
      baseline: 10,
      salesByChannel: { SHOPIFY: 50 },
      adjusted: 0,
    });
    expect(result).toBe(-40);
  });
});

describe("buildBaselineRows", () => {
  const baselineDate = new Date("2026-03-29T00:00:00Z");

  const baselines = [
    { sku: "SKU1", productName: "Product 1", quantity: 100, setAt: baselineDate },
    { sku: "SKU2", productName: "Product 2", quantity: 50, setAt: baselineDate },
  ];

  it("builds rows with no sales or adjustments", () => {
    const rows = buildBaselineRows(baselines, [], [], {});
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sku: "SKU1",
      baseline: 100,
      totalSales: 0,
      adjusted: 0,
      expected: 100,
      actual: 0,
      diff: -100,
      reconciled: false,
    });
  });

  it("filters sales by date — only counts sales AFTER baseline", () => {
    const orderItems = [
      { sku: "SKU1", quantity: 10, orderDate: new Date("2026-03-28T23:59:59Z"), channel: "SHOPIFY" },
      { sku: "SKU1", quantity: 5, orderDate: new Date("2026-03-29T00:00:01Z"), channel: "SHOPIFY" },
      { sku: "SKU1", quantity: 3, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "AMAZON" },
    ];
    const rows = buildBaselineRows(baselines, orderItems, [], { SKU1: 92 });
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.salesByChannel).toEqual({ SHOPIFY: 5, AMAZON: 3 });
    expect(row1.totalSales).toBe(8);
    expect(row1.expected).toBe(92);
    expect(row1.actual).toBe(92);
    expect(row1.diff).toBe(0);
    expect(row1.reconciled).toBe(true);
  });

  it("excludes sales exactly at baseline time (boundary)", () => {
    const orderItems = [
      { sku: "SKU1", quantity: 10, orderDate: baselineDate, channel: "SHOPIFY" },
    ];
    const rows = buildBaselineRows(baselines, orderItems, [], {});
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.totalSales).toBe(0);
  });

  it("filters adjustments by date — only counts adjustments AFTER baseline", () => {
    const adjustments = [
      { sku: "SKU1", quantity: -5, createdAt: new Date("2026-03-28T00:00:00Z") },
      { sku: "SKU1", quantity: -3, createdAt: new Date("2026-03-30T00:00:00Z") },
    ];
    const rows = buildBaselineRows(baselines, [], adjustments, { SKU1: 97 });
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.adjusted).toBe(-3);
    expect(row1.expected).toBe(103);
  });

  it("groups sales by channel correctly", () => {
    const orderItems = [
      { sku: "SKU1", quantity: 10, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "SHOPIFY" },
      { sku: "SKU1", quantity: 5, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "SHOPIFY" },
      { sku: "SKU1", quantity: 3, orderDate: new Date("2026-03-30T00:00:00Z"), channel: "TIKTOK" },
    ];
    const rows = buildBaselineRows(baselines, orderItems, [], {});
    const row1 = rows.find((r) => r.sku === "SKU1")!;
    expect(row1.salesByChannel).toEqual({ SHOPIFY: 15, TIKTOK: 3 });
  });

  it("sorts unreconciled first, then by absolute diff descending", () => {
    const rows = buildBaselineRows(baselines, [], [], { SKU1: 100, SKU2: 40 });
    expect(rows[0].sku).toBe("SKU2");
    expect(rows[1].sku).toBe("SKU1");
  });
});
