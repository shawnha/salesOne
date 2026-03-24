import type { Connector, ExternalOrderData } from "../types";

export const pharmacyConnector: Connector = {
  platform: "PHARMACY",

  async fetchOrders(credentials: { baseUrl: string; apiKey?: string }, since: Date | null) {
    const url = credentials.baseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (credentials.apiKey) headers["Authorization"] = `Bearer ${credentials.apiKey}`;

    const params = new URLSearchParams();
    if (since) params.set("since", since.toISOString());

    const res = await fetch(`${url}/api/orders?${params}`, { headers });
    if (!res.ok) throw new Error(`Pharmacy ERP error: ${res.status} ${res.statusText}`);
    const data = await res.json();

    return (data.orders || data || []).map((order: any) => ({
      externalOrderId: String(order.id || order.orderId),
      rawData: order,
      orderDate: new Date(order.createdAt || order.orderDate),
      status: (order.status || "pending").toLowerCase(),
      totalAmount: order.totalAmount || order.total || 0,
      customerName: order.pharmacyName || order.customerName,
      items: (order.items || order.lineItems || []).map((item: any) => ({
        externalItemId: String(item.id || item.itemId),
        productName: item.productName || item.name || "",
        sku: item.sku || "",
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.price || 0,
      })),
    }));
  },
};
