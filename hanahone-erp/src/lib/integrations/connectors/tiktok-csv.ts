import type { ExternalOrderData } from "../types";

function mapFulfillmentStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "shipped":
    case "fulfilled":
    case "completed":
      return "FULFILLED";
    case "delivered":
      return "DELIVERED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return "UNFULFILLED";
  }
}

export function parseTikTokCsv(csvContent: string): ExternalOrderData[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const orders = new Map<string, ExternalOrderData>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));

    const orderId = row["Order ID"];
    if (!orderId) continue;

    const existing = orders.get(orderId);
    const item = {
      externalItemId: `${orderId}-${i}`,
      productName: row["Product Name"] || "",
      sku: row["SKU"] || "",
      quantity: parseInt(row["Quantity"]) || 1,
      unitPrice: parseFloat(row["Item Price"]) || 0,
    };

    if (existing) {
      existing.items.push(item);
    } else {
      const rawStatus = row["Order Status"] || "pending";
      const isCancelled = rawStatus.toLowerCase() === "cancelled" || rawStatus.toLowerCase() === "canceled";

      orders.set(orderId, {
        externalOrderId: orderId,
        externalOrderNumber: orderId,
        rawData: row,
        orderDate: new Date(row["Created Time"]),
        fulfillmentStatus: mapFulfillmentStatus(rawStatus),
        financialStatus: isCancelled ? "VOIDED" : "PAID",
        totalAmount: parseFloat(row["Order Total"]) || 0,
        items: [item],
      });
    }
  }

  return Array.from(orders.values());
}
