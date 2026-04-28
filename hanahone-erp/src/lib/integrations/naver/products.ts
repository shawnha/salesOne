import type { NaverCredentials, NaverProduct } from "./types";
import type { ExternalInventoryData } from "../types";
import { naverFetch } from "./auth";

/**
 * Update stock quantity for a Naver origin product.
 *
 * Naver V2 PUT /v2/products/origin-products/{id} is a full update — it requires
 * statusType (SALE/SUSPENSION/etc) and rejects partial bodies. We GET the
 * current product first, then PUT back with the same statusType plus the new
 * stockQuantity, so we never accidentally toggle the listing state.
 */
export async function updateNaverStock(
  credentials: NaverCredentials,
  originProductNo: string,
  stockQuantity: number,
): Promise<void> {
  // 1. Fetch current product to preserve statusType
  const getRes = await naverFetch(
    credentials,
    `/v2/products/origin-products/${originProductNo}`,
  );
  if (!getRes.ok) {
    const body = await getRes.text();
    throw new Error(`Naver product fetch failed (${getRes.status}): ${body}`);
  }
  const current = await getRes.json();
  const statusType: string =
    current?.originProduct?.statusType ||
    current?.statusType ||
    "SALE";

  // 2. PUT back with the statusType we just read
  const res = await naverFetch(
    credentials,
    `/v2/products/origin-products/${originProductNo}`,
    {
      method: "PUT",
      body: JSON.stringify({
        originProduct: {
          statusType,
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
