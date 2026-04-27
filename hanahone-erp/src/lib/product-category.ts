/**
 * Product category for cross-channel reporting.
 *
 * The same physical product surfaces under different SKUs/names per region:
 *   - HOI Shopify Starter Kit     → SKU 8800316050001
 *   - HOI Shopify 30day Refill    → SKU XG-MNLD-D8SM
 *   - HOK Coupang 5개입 (Starter) → SKU ODD-M01-5
 *   - HOK Coupang 30개입 (Refill) → SKU ODD-M01-30
 *
 * Subscription is currently a Shopify-only offering — Naver/Coupang/Amazon/
 * TikTok don't sell recurring plans. We detect it via two signals:
 *   1) line_item.properties._selling_plan_id (authoritative — Shopify
 *      Subscriptions app sets this)
 *   2) variant title containing "subscription" / "monthly" / "month supply"
 *      (covers older orders where _selling_plan_id wasn't recorded)
 */

export type ProductCategory = "starter" | "refill" | "subscription" | "other";

/** SKUs that map to the Starter Kit category across HOI/HOK. */
const STARTER_SKUS = new Set(["8800316050001", "ODD-M01-5"]);

/** SKUs that map to the 30-day Refill master across HOI/HOK. */
const REFILL_SKUS = new Set(["XG-MNLD-D8SM", "ODD-M01-30"]);

const SUBSCRIPTION_NAME_RE = /subscription|monthly|month supply/i;

export function categorize(args: {
  masterSku: string | null | undefined;
  variantName?: string | null;
  sellingPlanId?: string | null;
}): ProductCategory {
  const sku = (args.masterSku || "").trim();
  if (STARTER_SKUS.has(sku)) return "starter";
  if (REFILL_SKUS.has(sku)) {
    if (args.sellingPlanId) return "subscription";
    if (args.variantName && SUBSCRIPTION_NAME_RE.test(args.variantName)) return "subscription";
    return "refill";
  }
  return "other";
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  starter: "Starter Kit",
  refill: "30day Refill",
  subscription: "Subscription",
  other: "Other",
};

export const CATEGORY_COLORS: Record<ProductCategory, string> = {
  starter: "text-amber-600 bg-amber-500/[0.10]",
  refill: "text-teal-600 bg-teal-500/[0.10]",
  subscription: "text-violet-600 bg-violet-500/[0.10]",
  other: "text-slate-500 bg-slate-500/[0.10]",
};
