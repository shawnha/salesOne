import type { Connector, ExternalInventoryData } from "../types";

interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

interface OdooJsonRpcResponse {
  jsonrpc: string;
  id: number | null;
  result?: any;
  error?: { message: string; data: { message: string } };
}

interface StockQuant {
  id: number;
  product_id: [number, string];
  quantity: number;
  location_id: [number, string];
  product_uom_id: [number, string];
}

async function odooAuthenticate(
  url: string,
  db: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${url}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db, login: email, password },
    }),
  });

  if (!res.ok) throw new Error(`CGETC auth failed: HTTP ${res.status}`);

  const data: OdooJsonRpcResponse = await res.json();
  if (data.error) throw new Error(`CGETC auth error: ${data.error.data.message}`);
  if (!data.result?.uid) throw new Error("CGETC auth failed: no uid returned");

  const setCookie = res.headers.get("set-cookie");
  const sessionMatch = setCookie?.match(/session_id=([^;]+)/);
  if (!sessionMatch) throw new Error("CGETC auth failed: no session cookie");

  return sessionMatch[1];
}

async function odooSearchRead(
  url: string,
  sessionId: string,
  model: string,
  domain: any[],
  fields: string[],
  limit?: number
): Promise<any[]> {
  const res = await fetch(`${url}/web/dataset/call_kw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        model,
        method: "search_read",
        args: [domain],
        kwargs: { fields, ...(limit ? { limit } : {}) },
      },
    }),
  });

  if (!res.ok) throw new Error(`CGETC API error: HTTP ${res.status}`);

  const data: OdooJsonRpcResponse = await res.json();
  if (data.error) throw new Error(`CGETC API error: ${data.error.data.message}`);

  return data.result || [];
}

function extractSku(productName: string): string {
  const match = productName.match(/^\[([^\]]+)\]/);
  return match ? match[1] : productName;
}

export const cgetcConnector: Connector = {
  platform: "CGETC",

  async fetchOrders(_credentials: any, _since: Date | null) {
    return [];
  },

  async fetchInventory(credentials: CgetcCredentials): Promise<ExternalInventoryData[]> {
    const { url, email, password, db } = credentials;

    const sessionId = await odooAuthenticate(url, db, email, password);

    const quants: StockQuant[] = await odooSearchRead(
      url,
      sessionId,
      "stock.quant",
      [
        ["quantity", ">", 0],
        ["location_id.usage", "=", "internal"],
      ],
      ["product_id", "quantity", "location_id", "product_uom_id"]
    );

    const skuTotals = new Map<string, { productName: string; quantity: number }>();

    for (const quant of quants) {
      const sku = extractSku(quant.product_id[1]);
      const existing = skuTotals.get(sku);
      if (existing) {
        existing.quantity += quant.quantity;
      } else {
        const fullName = quant.product_id[1];
        const productName = fullName.replace(/^\[[^\]]+\]\s*/, "");
        skuTotals.set(sku, { productName, quantity: quant.quantity });
      }
    }

    const result: ExternalInventoryData[] = [];
    skuTotals.forEach((data, sku) => {
      result.push({
        sku,
        productName: data.productName,
        quantity: data.quantity,
        warehouseLocation: "CGETC",
      });
    });

    return result;
  },
};
