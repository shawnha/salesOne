import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. HOI 회사 찾기
  const hoi = await prisma.company.findFirst({ where: { name: "HOI" } });
  if (!hoi) throw new Error("HOI company not found");

  console.log(`HOI company: ${hoi.id}`);

  // 2. 기존 상품 조회
  const products = await prisma.product.findMany({ where: { companyId: hoi.id } });
  console.log(`Found ${products.length} HOI products:`);
  for (const p of products) {
    console.log(`  - ${p.name} (SKU: ${p.sku}, base: ${p.basePrice}, cost: ${p.costPrice})`);
  }

  // 3. 원본 상품 업데이트 (이름, basePrice, salePrice)
  const updates = [
    { sku: "8800316050001", name: "5 Bottle Pack", basePrice: 49, salePrice: 29 },
    { sku: "XG-MNLD-D8SM", name: "30 Bottle Pack", basePrice: 159, salePrice: 129 },
    { sku: "8800316050018", name: "Monthly Subscription", basePrice: 129, salePrice: 109 },
  ];

  for (const upd of updates) {
    const product = products.find((p) => p.sku === upd.sku);
    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: { name: upd.name, basePrice: upd.basePrice, salePrice: upd.salePrice },
      });
      console.log(`✓ Updated ${upd.sku}: name="${upd.name}", base=$${upd.basePrice}, sale=$${upd.salePrice}`);
    } else {
      console.log(`✗ SKU ${upd.sku} not found — skipping`);
    }
  }

  // 4. -SH 중복 상품 삭제 (merge into 원본)
  const shProducts = [
    { shSku: "8800316050001-SH", originalSku: "8800316050001" },
    { shSku: "XG-MNLD-D8SM-SH", originalSku: "XG-MNLD-D8SM" },
  ];

  for (const { shSku, originalSku } of shProducts) {
    const shProduct = products.find((p) => p.sku === shSku);
    const original = products.find((p) => p.sku === originalSku);

    if (!shProduct) {
      console.log(`✗ ${shSku} not found — already deleted?`);
      continue;
    }
    if (!original) {
      console.log(`✗ Original ${originalSku} not found — cannot merge`);
      continue;
    }

    // Check dependencies (sequential to avoid exhausting connection pool)
    const orderItems = await prisma.orderItem.count({ where: { productId: shProduct.id } });
    const productionOrders = await prisma.productionOrder.count({ where: { productId: shProduct.id } });
    const inventory = await prisma.inventory.count({ where: { productId: shProduct.id } });
    const snapshots = await prisma.inventorySnapshot.count({ where: { productId: shProduct.id } });
    const skuMappings = await prisma.skuMapping.count({ where: { productId: shProduct.id } });

    console.log(`\n${shSku} dependencies: ${orderItems} orderItems, ${productionOrders} prodOrders, ${inventory} inventory, ${snapshots} snapshots, ${skuMappings} skuMappings`);

    // Merge: reassign linked records to original, then delete
    await prisma.$transaction([
      ...(orderItems > 0 ? [prisma.orderItem.updateMany({ where: { productId: shProduct.id }, data: { productId: original.id } })] : []),
      ...(productionOrders > 0 ? [prisma.productionOrder.updateMany({ where: { productId: shProduct.id }, data: { productId: original.id } })] : []),
      prisma.inventory.deleteMany({ where: { productId: shProduct.id } }),
      prisma.inventorySnapshot.deleteMany({ where: { productId: shProduct.id } }),
      prisma.skuMapping.deleteMany({ where: { productId: shProduct.id } }),
      prisma.product.delete({ where: { id: shProduct.id } }),
    ]);
    console.log(`✓ Deleted ${shSku}, merged ${orderItems} orderItems into ${originalSku}`);
  }

  // 5. 오타 SKU 수정: ExternalOrder rawData에서 a8800316050018 → 8800316050018
  const typoOrders = await prisma.externalOrder.findMany({
    where: {
      platform: "SHOPIFY",
      companyId: hoi.id,
    },
    select: { id: true, rawData: true },
  });

  let typoFixed = 0;
  for (const eo of typoOrders) {
    const raw = eo.rawData as any;
    let changed = false;
    for (const item of raw.line_items || []) {
      if (item.sku === "a8800316050018") {
        item.sku = "8800316050018";
        changed = true;
      }
    }
    if (changed) {
      await prisma.externalOrder.update({
        where: { id: eo.id },
        data: { rawData: raw },
      });
      typoFixed++;
    }
  }
  console.log(`\n✓ Fixed ${typoFixed} orders with typo SKU a8800316050018`);

  // 6. 최종 상태 확인
  const finalProducts = await prisma.product.findMany({
    where: { companyId: hoi.id },
    orderBy: { sku: "asc" },
  });
  console.log(`\nFinal HOI products (${finalProducts.length}):`);
  for (const p of finalProducts) {
    console.log(`  - ${p.name} | SKU: ${p.sku} | base: $${p.basePrice} | sale: ${p.salePrice ? "$" + p.salePrice : "null"} | cost: $${p.costPrice}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
