/**
 * Seed BOM data for HOK manufacturing.
 * HOK manufactures ODD M-01 products in different pack sizes.
 * BOM: Each pack uses N units of base material (ODD M-01 단위).
 * Also creates sample production orders.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Pack sizes extracted from product names
const PACK_SIZES: Record<string, number> = {
  "ODD-M01-5": 5,
  "ODD-M01-5G": 5,
  "ODD-M01-15": 15,
  "ODD-M01-30": 30,
  "ODD-M01-40": 40,
  "ODD-M01-75": 75,
  "ODD-M01-110": 110,
};

async function main() {
  const hok = await prisma.company.findFirst({ where: { name: "HOK" } });
  if (!hok) throw new Error("HOK company not found");

  const products = await prisma.product.findMany({
    where: { companyId: hok.id },
    select: { id: true, name: true, sku: true },
  });

  if (products.length === 0) throw new Error("No HOK products found");

  // Use the smallest unit product as the base raw material
  // ODD-M01-5 (5개입) is the base unit for BOM
  const baseProduct = products.find(p => p.sku === "ODD-M01-5");
  if (!baseProduct) throw new Error("Base product ODD-M01-5 not found");

  // Clear existing BOMs
  await prisma.billOfMaterials.deleteMany({ where: { companyId: hok.id } });

  // Create BOMs: each pack size consumes (packSize / 5) units of base product
  // e.g. 30개입 = 6x base (5개입), 110개입 = 22x base
  const bomData: any[] = [];
  for (const product of products) {
    if (product.sku === baseProduct.sku) continue; // Skip self
    const packSize = PACK_SIZES[product.sku];
    if (!packSize) continue;
    const baseUnitsNeeded = packSize / 5;
    bomData.push({
      companyId: hok.id,
      finishedProductId: product.id,
      rawMaterialId: baseProduct.id,
      quantityRequired: baseUnitsNeeded,
    });
  }

  if (bomData.length > 0) {
    await prisma.billOfMaterials.createMany({ data: bomData });
    console.log(`Created ${bomData.length} BOM records`);
    for (const bom of bomData) {
      const prod = products.find(p => p.id === bom.finishedProductId);
      console.log(`  ${prod?.name} → ${bom.quantityRequired}x ${baseProduct.name}`);
    }
  }

  // Create sample production orders
  const existingOrders = await prisma.productionOrder.count({ where: { companyId: hok.id } });
  if (existingOrders === 0) {
    const prod30 = products.find(p => p.sku === "ODD-M01-30");
    const prod110 = products.find(p => p.sku === "ODD-M01-110");

    const orders = [];
    if (prod30) orders.push({
      companyId: hok.id,
      productId: prod30.id,
      quantityToProduce: 100,
      quantityProduced: 0,
      status: "PLANNED" as const,
      startDate: new Date("2026-04-01"),
      notes: "4월 네이버 일반 주문 대비",
    });
    if (prod110) orders.push({
      companyId: hok.id,
      productId: prod110.id,
      quantityToProduce: 50,
      quantityProduced: 0,
      status: "IN_PROGRESS" as const,
      startDate: new Date("2026-03-20"),
      notes: "3월 대량 주문 대비 생산 중",
    });

    if (orders.length > 0) {
      await prisma.productionOrder.createMany({ data: orders });
      console.log(`Created ${orders.length} production orders`);
    }
  } else {
    console.log(`Skipped production orders (${existingOrders} already exist)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
