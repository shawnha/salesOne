import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchShopifyProducts } from "@/lib/integrations/connectors/shopify";
import type { ShopifyProduct } from "@/lib/integrations/connectors/shopify";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  // 1. HOI의 Shopify integration config 가져오기
  const config = await prisma.integrationConfig.findFirst({
    where: {
      platform: "SHOPIFY",
      isActive: true,
    },
    include: { company: true },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No active Shopify integration found" },
      { status: 404 },
    );
  }

  const companyId = config.companyId;
  const credentials = JSON.parse(decrypt(config.credentials));

  // 2. Shopify 실제 상품 가져오기
  let shopifyProducts: ShopifyProduct[] = [];
  let shopifyError: string | null = null;
  try {
    shopifyProducts = await fetchShopifyProducts(credentials);
  } catch (err) {
    shopifyError = (err as Error).message;
  }

  // 3. ERP Products 조회
  const erpProducts = await prisma.product.findMany({
    where: { companyId },
    select: { id: true, name: true, sku: true, basePrice: true, costPrice: true },
  });

  // 4. ExternalOrders rawData에서 line_items SKU 추출
  const externalOrders = await prisma.externalOrder.findMany({
    where: { companyId, platform: "SHOPIFY" },
    select: { rawData: true },
  });

  // SKU별 집계
  const skuStats = new Map<
    string,
    { productName: string; names: Set<string>; count: number; prices: number[] }
  >();

  for (const eo of externalOrders) {
    const raw = eo.rawData as any;
    for (const item of raw.line_items || []) {
      const sku = item.sku || "(empty)";
      const existing = skuStats.get(sku);
      const price = parseFloat(item.price);
      if (existing) {
        existing.names.add(item.title);
        existing.count += item.quantity;
        existing.prices.push(price);
      } else {
        skuStats.set(sku, {
          productName: item.title,
          names: new Set([item.title]),
          count: item.quantity,
          prices: [price],
        });
      }
    }
  }

  // 5. 대조 리포트 생성
  const erpSkuMap = new Map(erpProducts.map((p) => [p.sku, p]));

  const orderSkuUsage = Array.from(skuStats.entries()).map(([sku, stats]) => {
    const matched = erpSkuMap.get(sku);
    return {
      sku,
      productName: stats.productName,
      orderCount: stats.count,
      priceRange: {
        min: Math.min(...stats.prices),
        max: Math.max(...stats.prices),
      },
      matchedErpProduct: matched ? matched.name : null,
      matchedErpBasePrice: matched ? Number(matched.basePrice) : null,
    };
  });

  const droppedItems = orderSkuUsage
    .filter((item) => item.matchedErpProduct === null)
    .map(({ sku, productName, orderCount }) => ({ sku, productName, count: orderCount }));

  const nameConflicts = Array.from(skuStats.entries())
    .filter(([, stats]) => stats.names.size > 1)
    .map(([sku, stats]) => ({ sku, names: Array.from(stats.names) }));

  return NextResponse.json({
    companyName: config.company.name,
    shopifyError,
    shopifyProducts: shopifyProducts.map((p) => ({
      title: p.title,
      status: p.status,
      variants: p.variants.map((v) => ({
        title: v.title,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
      })),
    })),
    erpProducts: erpProducts.map((p) => ({
      name: p.name,
      sku: p.sku,
      basePrice: Number(p.basePrice),
      costPrice: Number(p.costPrice),
    })),
    orderSkuUsage,
    droppedItems,
    nameConflicts,
    summary: {
      totalShopifyProducts: shopifyProducts.length,
      totalShopifyVariants: shopifyProducts.reduce((sum, p) => sum + p.variants.length, 0),
      totalErpProducts: erpProducts.length,
      totalOrderSkus: skuStats.size,
      totalDroppedSkus: droppedItems.length,
      totalNameConflicts: nameConflicts.length,
      totalExternalOrders: externalOrders.length,
    },
  });
}
