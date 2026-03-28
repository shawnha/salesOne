interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

export interface CgetcProduct {
  sku: string;
  name: string;
  barcode: string;
  quantity: number;
  reserved: number;
  available: number;
}

async function authenticate(url: string, db: string, email: string, password: string): Promise<string> {
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

  const data = await res.json();
  if (data.error) throw new Error(`CGETC auth error: ${data.error.data?.message || data.error.message}`);
  if (!data.result?.uid) throw new Error("CGETC auth failed: no uid");

  // Node.js fetch: use getSetCookie() for reliable cookie extraction
  const cookies = res.headers.getSetCookie?.() || [];
  const setCookie = cookies.length > 0
    ? cookies.join("; ")
    : res.headers.get("set-cookie") || "";
  const match = setCookie.match(/session_id=([^;]+)/);
  if (!match) throw new Error("CGETC auth failed: no session cookie");

  return match[1];
}

function parsePortalProducts(html: string): CgetcProduct[] {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];

  const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  const products: CgetcProduct[] = [];

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [])
      .map((c) => c.replace(/<[^>]+>/g, "").replace(/[\n\t]/g, "").trim());

    if (cells.length < 12) continue;

    products.push({
      sku: cells[1] || "",
      name: cells[3] || "",
      barcode: cells[4] || "",
      quantity: parseFloat(cells[8]) || 0,
      reserved: parseFloat(cells[10]) || 0,
      available: parseFloat(cells[11]) || 0,
    });
  }

  return products;
}

export async function fetchCgetcInventory(credentials: CgetcCredentials): Promise<CgetcProduct[]> {
  const sessionId = await authenticate(
    credentials.url,
    credentials.db,
    credentials.email,
    credentials.password,
  );

  const res = await fetch(`${credentials.url}/portal/product`, {
    headers: { Cookie: `session_id=${sessionId}` },
  });
  if (!res.ok) throw new Error(`CGETC portal error: HTTP ${res.status}`);

  const html = await res.text();
  return parsePortalProducts(html);
}
