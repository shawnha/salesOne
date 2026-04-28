import type { NaverCredentials, NaverProduct } from "./types";
import type { ExternalInventoryData } from "../types";
import { naverFetch } from "./auth";

/**
 * Update stock quantity for a Naver origin product.
 *
 * Naver V2 PUT /v2/products/origin-products/{id} is a full-document update.
 * Sending only stockQuantity returns NotEmpty errors on statusType,
 * detailAttribute, etc. The robust pattern is GET → patch stockQuantity →
 * PUT the full originProduct body back, which preserves every other field
 * (status, name, options, content) untouched.
 *
 * Channel products (smartstoreChannelProduct.channelProductNo) and option
 * combinations (detailAttribute.optionInfo.optionCombinations[].stockQuantity)
 * have separate update flows and aren't covered here.
 */
export async function updateNaverStock(
  credentials: NaverCredentials,
  originProductNo: string,
  stockQuantity: number,
): Promise<void> {
  // 1. Fetch current product
  const getRes = await naverFetch(
    credentials,
    `/v2/products/origin-products/${originProductNo}`,
  );
  if (!getRes.ok) {
    const body = await getRes.text();
    throw new Error(`Naver product fetch failed (${getRes.status}): ${body}`);
  }
  const product = await getRes.json();
  if (!product?.originProduct) {
    throw new Error("Naver GET response missing originProduct");
  }

  // 2. Patch stockQuantity in-place. Naver auto-flips statusType to
  //    OUTOFSTOCK when stock hits 0, but OUTOFSTOCK is not a valid PUT input —
  //    coerce back to SALE so a restock works.
  product.originProduct.stockQuantity = stockQuantity;
  if (product.originProduct.statusType === "OUTOFSTOCK") {
    product.originProduct.statusType = "SALE";
  }

  // 3. PUT back the full originProduct body
  const putRes = await naverFetch(
    credentials,
    `/v2/products/origin-products/${originProductNo}`,
    {
      method: "PUT",
      body: JSON.stringify({ originProduct: product.originProduct }),
    },
  );

  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(`Naver stock update failed (${putRes.status}): ${body}`);
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
