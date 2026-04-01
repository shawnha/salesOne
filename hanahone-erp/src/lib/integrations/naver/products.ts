import type { NaverCredentials, NaverProduct } from "./types";
import type { ExternalInventoryData } from "../types";
import { naverFetch } from "./auth";

/**
 * Update stock quantity for a Naver origin product.
 * Uses PATCH /v2/products/origin-products/{originProductNo}
 */
export async function updateNaverStock(
  credentials: NaverCredentials,
  originProductNo: string,
  stockQuantity: number,
): Promise<void> {
  const res = await naverFetch(
    credentials,
    `/v2/products/origin-products/${originProductNo}`,
    {
      method: "PUT",
      body: JSON.stringify({
        originProduct: {
          stockQuantity,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Naver stock update failed (${res.status}): ${body}`);
  }
}

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
      const channel = product.channelProducts?.[0];
      if (!channel) continue;
      results.push({
        sku: channel.sellerManagementCode || String(product.originProductNo),
        productName: channel.name,
        quantity: channel.stockQuantity || 0,
      });
    }

    hasMore = products.length === PAGE_SIZE;
    page++;
    if (page >= 100) break;
  }

  return results;
}
