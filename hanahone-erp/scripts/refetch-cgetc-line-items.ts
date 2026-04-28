/**
 * Re-fetch line items for CGETC ExternalOrders that were synced before the
 * connector started persisting `lineItems` on rawData (March 2026 bulk sync,
 * 706 rows). Calls Odoo directly for each SO id, then fills missing
 * OrderItem.externalVariantName/Sku using the same productId-first +
 * positional-fallback matching as backfill-order-item-variants.ts.
 *
 * Idempotent. Dry run by default; pass --apply to commit.
 */
import { prisma } from "../src/lib/prisma";
import { Platform } from "@prisma/client";
import { authenticate, odooRpc } from "../src/lib/integrations/connectors/cgetc";
import { decrypt } from "../src/lib/integrations/encryption";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 100;

async function resolveProductId(
  companyId: string,
  sku: string | null,
): Promise<string | null> {
  if (!sku) return null;
  const mapping = await prisma.skuMapping.findUnique({
    where: {
      companyId_platform_externalSku: {
        companyId,
        platform: Platform.CGETC,
        externalSku: sku,
      },
    },
  });
  if (mapping?.productId) return mapping.productId;
  const product = await prisma.product.findFirst({
    where: { sku, companyId },
    select: { id: true },
  });
  return product?.id || null;
}

async function main() {
  const config = await prisma.integrationConfig.findFirst({
    where: { platform: Platform.CGETC, isActive: true },
  });
  if (!config) throw new Error("No active CGETC integration found");

  const credentials = JSON.parse(decrypt(config.credentials));

  // Find ExternalOrders that need line refetch
  const exts = await prisma.externalOrder.findMany({
    where: { platform: Platform.CGETC, mappedOrderId: { not: null } },
    select: {
      id: true,
      externalOrderId: true,
      companyId: true,
      rawData: true,
      mappedOrder: {
        select: {
          id: true,
          items: {
            select: {
              id: true,
              productId: true,
              externalVariantName: true,
              externalVariantSku: true,
            },
          },
        },
      },
    },
  });

  const needsFetch = exts.filter((e) => !Array.isArray((e.rawData as any)?.lineItems));
  console.log(`CGETC ExternalOrders missing lineItems: ${needsFetch.length} of ${exts.length}`);
  if (needsFetch.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const sessionId = await authenticate(
    credentials.url,
    credentials.db,
    credentials.email,
    credentials.password,
  );

  // Build SO id → ext map
  const soIds = needsFetch.map((e) => Number(e.externalOrderId)).filter((n) => Number.isFinite(n));
  const extBySoId = new Map<number, (typeof needsFetch)[number]>();
  for (const e of needsFetch) extBySoId.set(Number(e.externalOrderId), e);

  let totalLines = 0;
  let matched = 0;
  let alreadyFilled = 0;
  let unmatched = 0;
  let ordersTouched = 0;

  for (let i = 0; i < soIds.length; i += BATCH_SIZE) {
    const batch = soIds.slice(i, i + BATCH_SIZE);
    const sos = await odooRpc(credentials.url, sessionId, "sale.order", "read", [batch], {
      fields: ["order_line"],
    });
    if (!Array.isArray(sos)) continue;

    const allLineIds: number[] = [];
    const lineIdsBySoId = new Map<number, number[]>();
    for (const so of sos) {
      const ids = (so.order_line || []) as number[];
      lineIdsBySoId.set(so.id, ids);
      allLineIds.push(...ids);
    }
    if (allLineIds.length === 0) continue;

    const lines = await odooRpc(credentials.url, sessionId, "sale.order.line", "read", [allLineIds], {
      fields: ["product_id", "name", "product_uom_qty", "price_unit", "price_subtotal"],
    });
    const lineById = new Map<number, any>();
    if (Array.isArray(lines)) for (const ln of lines) lineById.set(ln.id, ln);

    for (const so of sos) {
      const ext = extBySoId.get(so.id);
      if (!ext || !ext.mappedOrder) continue;

      const rawLines: { title: string; sku: string }[] = [];
      for (const lineId of lineIdsBySoId.get(so.id) || []) {
        const line = lineById.get(lineId);
        if (!line) continue;
        const productName: string = line.product_id?.[1] || line.name || "";
        if (productName.toLowerCase().includes("delivery product")) continue;
        if (line.price_unit === 0 && line.price_subtotal === 0) continue;
        const skuMatch = productName.match(/\[([^\]]+)\]/);
        rawLines.push({
          title: productName.replace(/\[[^\]]+\]\s*/, "").trim(),
          sku: skuMatch ? skuMatch[1] : "",
        });
      }
      if (rawLines.length === 0) continue;
      ordersTouched++;

      // Same matching as backfill-order-item-variants.ts
      const queue = ext.mappedOrder.items.slice().sort((a, b) => a.id.localeCompare(b.id));
      const available = new Set(queue.map((it) => it.id));

      const pendingLi: { title: string; sku: string }[] = [];
      for (const li of rawLines) {
        totalLines++;
        const targetPid = await resolveProductId(ext.companyId, li.sku || null);
        const hit = targetPid
          ? queue.find((it) => available.has(it.id) && it.productId === targetPid)
          : null;
        if (!hit) {
          pendingLi.push(li);
          continue;
        }
        available.delete(hit.id);
        if (hit.externalVariantName && hit.externalVariantSku) {
          alreadyFilled++;
          continue;
        }
        matched++;
        if (APPLY) {
          await prisma.orderItem.update({
            where: { id: hit.id },
            data: { externalVariantName: li.title || null, externalVariantSku: li.sku || null },
          });
        }
      }

      const leftover = queue.filter((it) => available.has(it.id));
      for (let k = 0; k < pendingLi.length; k++) {
        const li = pendingLi[k];
        const oi = leftover[k];
        if (!oi) {
          unmatched++;
          continue;
        }
        available.delete(oi.id);
        if (oi.externalVariantName && oi.externalVariantSku) {
          alreadyFilled++;
          continue;
        }
        matched++;
        if (APPLY) {
          await prisma.orderItem.update({
            where: { id: oi.id },
            data: { externalVariantName: li.title || null, externalVariantSku: li.sku || null },
          });
        }
      }
    }

    console.log(`  batch ${i / BATCH_SIZE + 1} (${batch.length} orders): cum matched=${matched} unmatched=${unmatched}`);
  }

  console.log("\n── summary ──");
  console.log("Orders touched:    ", ordersTouched);
  console.log("Lines processed:   ", totalLines);
  console.log("Matched & updated: ", matched);
  console.log("Already filled:    ", alreadyFilled);
  console.log("Unmatched:         ", unmatched);
  console.log(APPLY ? "\nAPPLIED." : "\nDry run. Pass --apply to commit.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
