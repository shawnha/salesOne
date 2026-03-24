import type { ExternalOrderData } from "../types";

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
      orders.set(orderId, {
        externalOrderId: orderId,
        rawData: row,
        orderDate: new Date(row["Created Time"]),
        status: (row["Order Status"] || "pending").toLowerCase(),
        totalAmount: parseFloat(row["Order Total"]) || 0,
        items: [item],
      });
    }
  }

  return Array.from(orders.values());
}
