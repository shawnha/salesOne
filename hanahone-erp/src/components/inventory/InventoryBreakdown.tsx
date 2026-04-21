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
  channelSales: ChannelSales;
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
 * Breakdown card for a single SKU. Used for HOI, HOR, and Group views to
 * mirror the HOK-style "전체 재고 + channel distribution" display.
 */
export function InventoryBreakdownCard({ item }: { item: InventoryBreakdownItem }) {
  const diff = item.baseline ? item.onHand - item.baseline.quantity : null;
  const channels = Object.entries(item.channelSales).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const totalSold30d = channels.reduce((s, [, v]) => s + (v ?? 0), 0);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{item.name}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
            {item.sku} · {item.warehouse}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold ${item.reorderLevel !== undefined && item.onHand <= item.reorderLevel ? "text-rose-500" : ""}`}>
            {item.onHand.toLocaleString()}
          </div>
          {item.baseline && (
            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
              기준 {item.baseline.quantity.toLocaleString()}
              {diff !== null && diff !== 0 && (
                <span className={`ml-1 font-medium ${diff < 0 ? "text-rose-500" : "text-amber-500"}`}>
                  ({diff > 0 ? "+" : ""}{diff})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            채널별 판매 (30일)
          </p>
          <p className="text-[10px] text-[var(--text-quaternary)]">
            합계 {totalSold30d.toLocaleString()}
          </p>
        </div>
        {channels.length === 0 ? (
          <p className="text-[11px] text-[var(--text-quaternary)]">최근 30일 판매 없음</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {channels.map(([ch, qty]) => (
              <ChannelBadge key={ch} channel={ch} qty={qty ?? 0} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function InventoryBreakdownGrid({ items }: { items: InventoryBreakdownItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map((it) => (
        <InventoryBreakdownCard key={it.sku + ":" + it.warehouse} item={it} />
      ))}
    </div>
  );
}
