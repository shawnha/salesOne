/**
 * One-off: zero out all option combination stocks for Naver origin product
 * 13211473962 (HOK 공구 통합상품 — 5개입/15개입/40개입/75개입/110개입).
 *
 * Why: each option had stockQuantity=1,000,000 (effectively unlimited) — a
 * customer could place a massive order before we noticed. Setting all options
 * to 0 puts the listing into a safe state; the operator can dial in real
 * numbers from the seller console afterwards.
 *
 * Run modes:
 *   npx tsx scripts/naver-zero-gonggu-options.ts          (DRY — fetches and logs structure)
 *   npx tsx scripts/naver-zero-gonggu-options.ts --apply  (DRY + writes the PUT)
 */
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { naverFetch } from "@/lib/integrations/naver/auth";
import type { NaverCredentials } from "@/lib/integrations/naver/types";

const ORIGIN_PRODUCT_NO = "13211473962";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[${new Date().toISOString()}] Mode: ${apply ? "APPLY (will PUT)" : "DRY (read-only)"}`);

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "NAVER", isActive: true },
  });
  if (!config) {
    console.error("No active NAVER integration found");
    process.exit(1);
  }
  const credentials: NaverCredentials = JSON.parse(decrypt(config.credentials));

  // 1. GET
  console.log(`\nGET /v2/products/origin-products/${ORIGIN_PRODUCT_NO}`);
  const getRes = await naverFetch(
    credentials,
    `/v2/products/origin-products/${ORIGIN_PRODUCT_NO}`,
  );
  if (!getRes.ok) {
    const body = await getRes.text();
    throw new Error(`GET failed (${getRes.status}): ${body}`);
  }
  const product = await getRes.json();
  if (!product?.originProduct) {
    throw new Error("GET response missing originProduct");
  }

  const op = product.originProduct;
  const combos = op?.detailAttribute?.optionInfo?.optionCombinations;
  console.log(`\noriginProduct.statusType: ${op.statusType}`);
  console.log(`originProduct.stockQuantity: ${op.stockQuantity}`);
  console.log(`Option combinations: ${Array.isArray(combos) ? combos.length : "none"}`);
  if (Array.isArray(combos)) {
    for (const c of combos) {
      const labels = [c.optionName1, c.optionName2, c.optionName3].filter(Boolean).join(" / ");
      console.log(`  - ${labels}: stockQuantity=${c.stockQuantity} usable=${c.usable} sellerManagerCode=${c.sellerManagerCode ?? "—"}`);
    }
  } else {
    console.log("(no optionCombinations array — this product may not have options)");
  }

  if (!apply) {
    console.log("\nDRY mode — nothing changed. Re-run with --apply to write zero stocks.");
    return;
  }

  if (!Array.isArray(combos) || combos.length === 0) {
    console.log("\nNo options to update. Exiting.");
    return;
  }

  // 2. Patch — zero all option stocks. Keep top-level stockQuantity at 0 too;
  //    leave statusType at SALE (OUTOFSTOCK is not a valid PUT input).
  for (const c of combos) {
    c.stockQuantity = 0;
  }
  op.stockQuantity = 0;
  if (op.statusType === "OUTOFSTOCK") op.statusType = "SALE";

  // 3. PUT
  console.log(`\nPUT /v2/products/origin-products/${ORIGIN_PRODUCT_NO} (zero ${combos.length} options)`);
  const putRes = await naverFetch(
    credentials,
    `/v2/products/origin-products/${ORIGIN_PRODUCT_NO}`,
    {
      method: "PUT",
      body: JSON.stringify({ originProduct: op }),
    },
  );
  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(`PUT failed (${putRes.status}): ${body}`);
  }
  console.log(`PUT ok (${putRes.status})`);

  // 4. Verify
  console.log("\nGET again to verify…");
  const verRes = await naverFetch(
    credentials,
    `/v2/products/origin-products/${ORIGIN_PRODUCT_NO}`,
  );
  if (verRes.ok) {
    const verified = await verRes.json();
    const verCombos = verified?.originProduct?.detailAttribute?.optionInfo?.optionCombinations ?? [];
    for (const c of verCombos) {
      const labels = [c.optionName1, c.optionName2, c.optionName3].filter(Boolean).join(" / ");
      console.log(`  ✓ ${labels}: stockQuantity=${c.stockQuantity}`);
    }
  } else {
    console.log(`(verify GET failed: ${verRes.status})`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
