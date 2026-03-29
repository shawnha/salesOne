// src/lib/integrations/connectors/cgetc-purchase.ts
import { prisma } from "@/lib/prisma";
import { authenticate, odooRpc } from "./cgetc";
import type { Platform } from "@prisma/client";

interface CgetcCredentials {
  url: string;
  email: string;
  password: string;
  db: string;
}

export function parseSkuFromProductName(name: string): string | null {
  const match = name.match(/^\[([^\]]+)\]/);
  return match ? match[1] : null;
}

export async function syncPurchaseOrders(credentials: CgetcCredentials, companyId: string) {
  const sessionId = await authenticate(credentials.url, credentials.db, credentials.email, credentials.password);

  const pos = await odooRpc(credentials.url, sessionId, "purchase.order", "search_read", [[]], {
    fields: ["name", "partner_id", "date_order", "amount_total", "state", "order_line"],
    order: "id desc",
  });

  if (!Array.isArray(pos)) return { synced: 0 };

  let synced = 0;
  for (const po of pos) {
    const lineIds = po.order_line || [];
    let lines: any[] = [];
    if (lineIds.length > 0) {
      lines = await odooRpc(credentials.url, sessionId, "purchase.order.line", "read", [lineIds], {
        fields: ["product_id", "name", "product_qty", "price_unit", "price_subtotal"],
      });
      if (!Array.isArray(lines)) lines = [];
    }

    const poRecord = await prisma.purchaseOrder.upsert({
      where: {
        companyId_platform_externalPoId: {
          companyId,
          platform: "CGETC" as Platform,
          externalPoId: String(po.id),
        },
      },
      update: {
        poNumber: po.name || "",
        supplierName: po.partner_id?.[1] || "",
        orderDate: new Date(po.date_order || Date.now()),
        totalAmount: po.amount_total || 0,
        state: po.state || "",
        rawData: po,
      },
      create: {
        companyId,
        platform: "CGETC" as Platform,
        externalPoId: String(po.id),
        poNumber: po.name || "",
        supplierName: po.partner_id?.[1] || "",
        orderDate: new Date(po.date_order || Date.now()),
        totalAmount: po.amount_total || 0,
        state: po.state || "",
        rawData: po,
      },
    });

    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: poRecord.id } });

    for (const line of lines) {
      const productName = line.product_id?.[1] || line.name || "";
      const sku = parseSkuFromProductName(productName);
      await prisma.purchaseOrderLine.create({
        data: {
          purchaseOrderId: poRecord.id,
          productName: productName.replace(/^\[[^\]]+\]\s*/, "").trim(),
          sku,
          quantity: line.product_qty || 0,
          unitPrice: line.price_unit || 0,
          subtotal: line.price_subtotal || 0,
        },
      });
    }

    synced++;
  }

  return { synced };
}
