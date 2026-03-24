import { describe, it, expect } from "vitest";
import { mapStatusToOrderStatus, calculateOrderTotal } from "@/lib/integrations/mappers/order-mapper";

describe("order-mapper", () => {
  it("maps common statuses to OrderStatus", () => {
    expect(mapStatusToOrderStatus("paid")).toBe("PROCESSING");
    expect(mapStatusToOrderStatus("shipped")).toBe("SHIPPED");
    expect(mapStatusToOrderStatus("delivered")).toBe("DELIVERED");
    expect(mapStatusToOrderStatus("cancelled")).toBe("CANCELLED");
    expect(mapStatusToOrderStatus("unfulfilled")).toBe("PENDING");
    expect(mapStatusToOrderStatus("unknown_status")).toBe("PENDING");
  });

  it("calculates order total from items", () => {
    const items = [
      { externalItemId: "1", productName: "A", sku: "A1", quantity: 2, unitPrice: 10000 },
      { externalItemId: "2", productName: "B", sku: "B1", quantity: 1, unitPrice: 5000 },
    ];
    expect(calculateOrderTotal(items)).toBe(25000);
  });
});
