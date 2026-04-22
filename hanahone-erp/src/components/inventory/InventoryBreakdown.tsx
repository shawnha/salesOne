import { Card } from "@/components/ui/card";

export type ChannelSales = Partial<Record<
  "SHOPIFY" | "AMAZON" | "TIKTOK" | "NAVER" | "COUPANG" | "PHARMACY" | "CGETC" | "GONGGU" | "SEEDING" | "GIFT" | "MANUAL",
  number
>>;

export interface InventoryBreakdownItem {
  sku: string;
  name: string;
  warehouse: string;
  onHand: number;
  baseline?: { quantity: number; setAt: string } | null;
  reorderLevel?: number;
  reserved?: number;
  available?: number;
  channelSales: ChannelSales;
  /** 30-day sales grouped by channel variant name (e.g. "Monthly Plan" → 12). */
  variantSales?: Record<string, number>;
}

const CHANNEL_LABELS: Record<string, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  NAVER: "네이버",
  COUPANG: "쿠팡",
  PHARMACY: "약국",
  CGETC: "CGETC",
  GONGGU: "공구",
  SEEDING: "Seeding",
  GIFT: "Gift",
  MANUAL: "Manual",
};

const CHANNEL_COLORS: Record<string, string> = {
  SHOPIFY: "text-green-600 bg-green-600/[0.08]",
  AMAZON: "text-orange-600 bg-orange-600/[0.08]",
  TIKTOK: "text-pink-600 bg-pink-600/[0.08]",
  NAVER: "text-emerald-600 bg-emerald-600/[0.08]",
  COUPANG: "text-red-600 bg-red-600/[0.08]",
  PHARMACY: "text-blue-600 bg-blue-600/[0.08]",
  CGETC: "text-indigo-600 bg-indigo-600/[0.08]",
  GONGGU: "text-rose-600 bg-rose-600/[0.08]",
  SEEDING: "text-violet-600 bg-violet-600/[0.08]",
  GIFT: "text-amber-600 bg-amber-600/[0.08]",
  MANUAL: "text-slate-500 bg-slate-500/[0.08]",
};

function ChannelBadge({ channel, qty }: { channel: string; qty: number }) {
  const label = CHANNEL_LABELS[channel] || channel;
  const color = CHANNEL_COLORS[channel] || "text-slate-500 bg-slate-500/[0.08]";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full ${color}`}>
      <span>{label}</span>
      <span className="opacity-70">{qty.toLocaleString()}</span>
    </span>
  );
}

/**
 * Centered tile for a single SKU, matching HOK's 전체 재고 tile layout:
 * big on-hand number, product name, optional reserved/available split,
 * baseline reference, channel-sales badges.
 */
function InventoryTile({ item }: { item: InventoryBreakdownItem }) {
  const diff = item.baseline ? item.onHand - item.baseline.quantity : null;
  const channels = Object.entries(item.channelSales)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const hasReserved = typeof item.reserved === "number" && item.reserved > 0;
  const availableQty = item.available ?? item.onHand - (item.reserved ?? 0);
  const lowStock = item.reorderLevel !== undefined && item.onHand <= item.reorderLevel;

  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${lowStock ? "text-rose-500" : ""}`}>
        {item.onHand.toLocaleString()}
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-1">{item.name}</p>
      <p className="text-[10px] text-[var(--text-quaternary)] mt-0.5">
        {item.sku} · {item.warehouse}
      </p>

      {item.baseline && (
        <p className="text-[11px] text-[var(--text-tertiary)] mt-2">
          기준 {item.baseline.quantity.toLocaleString()}
          {diff !== null && diff !== 0 && (
            <span className={`ml-1 font-medium ${diff < 0 ? "text-rose-500" : "text-amber-500"}`}>
              ({diff > 0 ? "+" : ""}{diff.toLocaleString()})
            </span>
          )}
        </p>
      )}

      {hasReserved && (
        <div className="mt-2 space-y-0.5">
          <p className="text-[11px] text-amber-600 font-medium">
            예약: {item.reserved!.toLocaleString()}
          </p>
          <p className={`text-lg font-bold ${availableQty < 0 ? "text-rose-500" : "text-teal-600"}`}>
            {availableQty.toLocaleString()}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)]">가용</p>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[var(--border)]">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1.5">
          채널별 판매 (30일)
        </p>
        {channels.length === 0 ? (
          <p className="text-[11px] text-[var(--text-quaternary)]">최근 30일 판매 없음</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-1.5">
            {channels.map(([ch, qty]) => (
              <ChannelBadge key={ch} channel={ch} qty={qty ?? 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * HOK-style 전체 재고 card: one outer Card, all SKUs rendered as centered
 * tiles in a grid. Used for HOI / HOR / Group views to mirror how HOK
 * surfaces its stock + channel breakdown.
 */
export function InventoryBreakdownGrid({ items, title = "전체 재고" }: { items: InventoryBreakdownItem[]; title?: string }) {
  if (items.length === 0) return null;
  const gridCols = items.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <Card className="p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-4">
        {title}
      </h2>
      <div className={`grid ${gridCols} gap-6`}>
        {items.map((it) => (
          <InventoryTile key={it.sku + ":" + it.warehouse} item={it} />
        ))}
      </div>
    </Card>
  );
}
