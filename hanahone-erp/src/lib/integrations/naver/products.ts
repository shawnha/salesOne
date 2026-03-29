import type { NaverCredentials, NaverProduct } from "./types";
import type { ExternalInventoryData } from "../types";
import { naverFetch } from "./auth";

export async function fetchNaverInventory(
  credentials: NaverCredentials,
): Promise<ExternalInventoryData[]> {
  const results: ExternalInventoryData[] = [];
  let page = 0;
  const PAGE_SIZE = 100;
  let hasMore = true;

  while (hasMore) {
    const res = await naverFetch(credentials, "/v1/products/search", {
      method: "POST",
      body: JSON.stringify({ page, size: PAGE_SIZE }),
    });

    if (!res.ok) {
      throw new Error(`Naver products fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const products: NaverProduct[] = data?.contents || [];

    for (const product of products) {
      results.push({
        sku: product.sellerManagementCode || String(product.originProductNo),
        productName: product.name,
        quantity: product.stockQuantity || 0,
      });
    }

    hasMore = products.length === PAGE_SIZE;
    page++;
    if (page >= 100) break;
  }

  return results;
}
