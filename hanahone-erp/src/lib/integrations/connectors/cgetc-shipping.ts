import { prisma } from "@/lib/prisma";
import { authenticate } from "./cgetc";

interface CgetcCredentials {
  url: string; email: string; password: string; db: string;
}

interface InvoiceData {
  soNumber: string;
  date: string;
  amount: number;
}

export function parseInvoiceRow(cells: string[]): InvoiceData | null {
  if (cells.length < 5) return null;

  const soMatch = cells[0]?.match(/^(SO\d+)$/);
  if (!soMatch) return null;

  const dateMatch = cells[2]?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dateMatch) return null;
  const date = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;

  const amountStr = cells.find((c) => c.includes("$"));
  if (!amountStr) return null;
  const amount = parseFloat(amountStr.replace(/[$,\s]/g, ""));
  if (isNaN(amount)) return null;

  return { soNumber: soMatch[1], date, amount };
}

export async function syncShippingCosts(credentials: CgetcCredentials, companyId: string) {
  const sessionId = await authenticate(credentials.url, credentials.db, credentials.email, credentials.password);

  const invoices: InvoiceData[] = [];
  let page = 1;

  while (true) {
    const path = page === 1 ? "/my/invoices" : `/my/invoices?page=${page}`;
    const res = await fetch(`${credentials.url}${path}`, {
      headers: { Cookie: `session_id=${sessionId}` },
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    if (!res.ok) break;

    const html = await res.text();
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) break;

    const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
    if (rows.length === 0) break;

    let foundAny = false;
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [])
        .map((c) => c.replace(/<[^>]+>/g, "").replace(/[\n\t]/g, "").trim());
      const parsed = parseInvoiceRow(cells);
      if (parsed) {
        invoices.push(parsed);
        foundAny = true;
      }
    }

    if (!foundAny) break;
    page++;
    if (page > 50) break;
  }

  let synced = 0;
  for (const inv of invoices) {
    const order = await prisma.order.findFirst({
      where: { companyId, externalOrderNumber: inv.soNumber },
    });

    await prisma.shippingCost.upsert({
      where: { companyId_soNumber: { companyId, soNumber: inv.soNumber } },
      update: { amount: inv.amount, invoiceDate: new Date(inv.date), orderId: order?.id || null },
      create: {
        companyId,
        soNumber: inv.soNumber,
        invoiceDate: new Date(inv.date),
        amount: inv.amount,
        orderId: order?.id || null,
      },
    });
    synced++;
  }

  return { synced, total: invoices.length };
}
