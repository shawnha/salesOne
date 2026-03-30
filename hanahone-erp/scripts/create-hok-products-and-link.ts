/**
 * 1. Create HOK products based on Naver order SKUs
 * 2. Link existing orders to products by creating OrderItems
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HOK_COMPANY_ID = "5f8b00b1-c358-4ccd-9c1c-7ca37ce99c87";

// Based on actual rawData analysis:
// originalProductId 12741540578 = 30개입 base product
// originalProductId 12920504601 = 5개입 base product
// Different optionCodes represent different listings/options of the same product
const PRODUCT_DEFINITIONS: Array<{
  name: string;
  sku: string;
  basePrice: number;
  naverSkus: string[]; // optionCode values from orders
}> = [
  {
    name: "ODD M-01 30개입",
    sku: "ODD-M01-30",
    basePrice: 215000,
    naverSkus: ["12798860555"],
  },
  {
    name: "ODD M-01 30일분 키트",
    sku: "ODD-M01-30KIT",
    basePrice: 402000,
    naverSkus: ["54646680990"],
  },
  {
    name: "ODD M-01 5개입",
    sku: "ODD-M01-5",
    basePrice: 67000,
    naverSkus: ["12978218114"],
  },
  {
    name: "ODD M-01 5일분 스타터 키트",
    sku: "ODD-M01-5KIT",
    basePrice: 67000,
    naverSkus: ["54646680987", "55297876347"],
  },
];

async function main() {
  // Build reverse map: naverSku -> product definition
  const skuToProduct = new Map<string, typeof PRODUCT_DEFINITIONS[number]>();
  for (const def of PRODUCT_DEFINITIONS) {
    for (const ns of def.naverSkus) {
      skuToProduct.set(ns, def);
    }
  }

  // 1. Create products
  console.log("=== Creating HOK products ===");
  const productIdMap = new Map<string, string>(); // sku -> productId

  for (const def of PRODUCT_DEFINITIONS) {
    const product = await prisma.product.upsert({
      where: {
        sku_companyId: { sku: def.sku, companyId: HOK_COMPANY_ID },
      },
      update: { name: def.name },
      create: {
        companyId: HOK_COMPANY_ID,
        name: def.name,
        sku: def.sku,
        basePrice: def.basePrice,
        costPrice: 0,
        category: "Supplement",
      },
    });
    productIdMap.set(def.sku, product.id);
    console.log(`  Created/updated: ${def.name} (${def.sku}) -> ${product.id}`);
  }

  // 2. Link existing Naver orders to products
  console.log("\n=== Linking orders to products ===");
  const naverOrders = await prisma.order.findMany({
    where: { externalSource: "NAVER", companyId: HOK_COMPANY_ID },
    select: { id: true, items: { select: { id: true } } },
  });

  let linked = 0;
  let alreadyLinked = 0;
  let noMatch = 0;

  for (const order of naverOrders) {
    if (order.items.length > 0) {
      alreadyLinked++;
      continue;
    }

    const extOrder = await prisma.externalOrder.findFirst({
      where: { mappedOrderId: order.id },
      select: { rawData: true },
    });

    if (!extOrder) { noMatch++; continue; }

    const raw = extOrder.rawData as any;
    const po = raw?.productOrder;
    if (!po) { noMatch++; continue; }

    const naverSku = po.optionCode || po.sellerProductCode || "";
    const productDef = skuToProduct.get(naverSku);

    if (!productDef) {
      console.log(`  No match for SKU: ${naverSku} | ${po.productName} | option: ${po.productOption || "none"}`);
      noMatch++;
      continue;
    }

    const productId = productIdMap.get(productDef.sku);
    if (!productId) { noMatch++; continue; }

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId,
        quantity: po.quantity || 1,
        unitPrice: po.unitPrice || po.totalPaymentAmount || 0,
        subtotal: (po.quantity || 1) * (po.unitPrice || po.totalPaymentAmount || 0),
      },
    });
    linked++;
  }

  console.log(`\nDone! Linked: ${linked}, Already had items: ${alreadyLinked}, No match: ${noMatch}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
