/**
 * Read-only BOM validator.
 *
 * Why: inventory-deduction.ts walks BillOfMaterials to subtract raw
 * components from on-hand inventory whenever a "공구" (gonggu) order is
 * paid. Missing or wrong BOM rows mean raw stock drifts silently and
 * Naver-pushed available quantity becomes inaccurate.
 *
 * Checks per company:
 *   1. Every Naver SkuMapping with isGonggu=true must point at a
 *      Product that has at least one BOM entry.
 *   2. Any pack-shaped product SKU (regex /-(\d+)$/ excluding the base
 *      unit) without a BOM entry — likely missing.
 *   3. BOMs that self-reference (finishedProductId === rawMaterialId).
 *   4. BOM quantity sanity:
 *        - quantityRequired ≤ 0
 *        - When finished SKU is ODD-M01-{N} and raw SKU is ODD-M01-5,
 *          quantityRequired should equal N/5. Flag mismatches.
 *        - quantityRequired > 1000 (suspicious magnitude).
 *   5. Orphan BOMs (FK should prevent, but cheap to verify).
 *
 * Output: human-readable report grouped by severity. No writes.
 *
 * Usage: npx tsx scripts/validate-bom.ts
 */
import { prisma } from "../src/lib/prisma";

type Severity = "ERROR" | "WARN" | "INFO";

interface Finding {
  severity: Severity;
  category: string;
  message: string;
}

function packSizeFromSku(sku: string): number | null {
  // ODD-M01-30 → 30; ODD-M01-5G → null (not a pure pack); ODD-M01-5 → 5
  const m = sku.match(/-(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const findings: Finding[] = [];

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  for (const co of companies) {
    console.log(`\n=== ${co.name} ===`);

    const products = await prisma.product.findMany({
      where: { companyId: co.id },
      select: { id: true, sku: true, name: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const boms = await prisma.billOfMaterials.findMany({
      where: { companyId: co.id },
      select: {
        id: true,
        finishedProductId: true,
        rawMaterialId: true,
        quantityRequired: true,
      },
    });

    const bomsByFinished = new Map<string, typeof boms>();
    for (const b of boms) {
      const arr = bomsByFinished.get(b.finishedProductId) ?? [];
      arr.push(b);
      bomsByFinished.set(b.finishedProductId, arr);
    }

    // Check 1: Naver gonggu mappings → must have BOM
    const gonggu = await prisma.skuMapping.findMany({
      where: { companyId: co.id, platform: "NAVER", isGonggu: true, productId: { not: null } },
      select: { externalSku: true, displayName: true, productId: true },
    });

    for (const g of gonggu) {
      if (!g.productId) continue;
      const prod = productById.get(g.productId);
      if (!prod) {
        findings.push({
          severity: "ERROR",
          category: "ORPHAN_GONGGU_MAPPING",
          message: `${co.name}: gonggu mapping ${g.externalSku} (${g.displayName}) → productId ${g.productId} does not exist`,
        });
        continue;
      }
      const productBoms = bomsByFinished.get(prod.id) ?? [];
      if (productBoms.length === 0) {
        findings.push({
          severity: "ERROR",
          category: "GONGGU_NO_BOM",
          message: `${co.name}: gonggu "${prod.name}" (${prod.sku}) has NO BOM — sales won't deduct raw materials`,
        });
      }
    }

    // Check 2: pack-shaped SKUs without BOM (excluding base unit -5)
    for (const p of products) {
      const size = packSizeFromSku(p.sku);
      if (size === null) continue;
      if (size === 5) continue; // base unit
      const productBoms = bomsByFinished.get(p.id) ?? [];
      if (productBoms.length === 0) {
        findings.push({
          severity: "WARN",
          category: "PACK_PRODUCT_NO_BOM",
          message: `${co.name}: pack product "${p.name}" (${p.sku}, size=${size}) has no BOM — auto-deduction inactive`,
        });
      }
    }

    // Check 3-5: per-BOM sanity
    for (const b of boms) {
      const finished = productById.get(b.finishedProductId);
      const raw = productById.get(b.rawMaterialId);

      if (!finished) {
        findings.push({
          severity: "ERROR",
          category: "BOM_ORPHAN_FINISHED",
          message: `${co.name}: BOM ${b.id.slice(0, 8)} finishedProductId ${b.finishedProductId} not found`,
        });
        continue;
      }
      if (!raw) {
        findings.push({
          severity: "ERROR",
          category: "BOM_ORPHAN_RAW",
          message: `${co.name}: BOM ${b.id.slice(0, 8)} rawMaterialId ${b.rawMaterialId} not found`,
        });
        continue;
      }
      if (b.finishedProductId === b.rawMaterialId) {
        findings.push({
          severity: "ERROR",
          category: "BOM_SELF_REF",
          message: `${co.name}: BOM ${b.id.slice(0, 8)} self-references "${finished.name}" (${finished.sku})`,
        });
      }
      const qty = Number(b.quantityRequired);
      if (!(qty > 0)) {
        findings.push({
          severity: "ERROR",
          category: "BOM_BAD_QTY",
          message: `${co.name}: BOM "${finished.sku}" → "${raw.sku}" has quantityRequired=${qty} (must be > 0)`,
        });
      } else if (qty > 1000) {
        findings.push({
          severity: "WARN",
          category: "BOM_HIGH_QTY",
          message: `${co.name}: BOM "${finished.sku}" → "${raw.sku}" qty=${qty} looks unusually large`,
        });
      }

      // Pack-size match heuristic: if finished is ODD-M01-{N} and raw is ODD-M01-5,
      // quantityRequired should be N/5.
      const finishedSize = packSizeFromSku(finished.sku);
      const rawSize = packSizeFromSku(raw.sku);
      if (finishedSize !== null && rawSize === 5) {
        const expected = finishedSize / 5;
        if (Math.abs(qty - expected) > 0.01) {
          findings.push({
            severity: "WARN",
            category: "BOM_QTY_MISMATCH",
            message: `${co.name}: BOM "${finished.sku}" (size ${finishedSize}) → "${raw.sku}" (size ${rawSize}) qty=${qty} but expected ${expected} based on pack ratio`,
          });
        }
      }
    }

    // Per-company summary
    console.log(`  products: ${products.length}`);
    console.log(`  BOMs:     ${boms.length}`);
    console.log(`  gonggu mappings (Naver): ${gonggu.length}`);
  }

  // Group + print findings
  const byCategory = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = byCategory.get(f.category) ?? [];
    arr.push(f);
    byCategory.set(f.category, arr);
  }

  console.log("\n── findings ──");
  if (findings.length === 0) {
    console.log("  ✓ No issues detected.");
  } else {
    for (const [cat, items] of Array.from(byCategory.entries()).sort()) {
      const sev = items[0].severity;
      const tag = sev === "ERROR" ? "✗" : sev === "WARN" ? "⚠" : "·";
      console.log(`\n  ${tag} ${cat} (${items.length})`);
      for (const f of items) {
        console.log(`     ${f.message}`);
      }
    }
  }

  const errors = findings.filter((f) => f.severity === "ERROR").length;
  const warns = findings.filter((f) => f.severity === "WARN").length;
  console.log(`\n  total: ${errors} error / ${warns} warn`);

  await prisma.$disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
