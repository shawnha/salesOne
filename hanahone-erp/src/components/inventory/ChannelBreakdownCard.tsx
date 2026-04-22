import { Card } from "@/components/ui/card";

export interface ChannelBreakdownRow {
  /** Variant label shown to the channel's customer (e.g. "Monthly Plan"). */
  variantName: string;
  /** Variant SKU as seen on the channel (e.g. "8800316050018", "95191843055"). Null when it equals masterSku. */
  variantSku: string | null;
  /** Master product the variant draws inventory from (e.g. "ODD M-01 30day Refill-pack"). */
  masterName: string;
  masterSku: string;
  /** 30-day sold qty on this channel. */
  qty30d: number;
  /** Optional current master on-hand for context. */
  masterOnHand?: number;
}

const CHANNEL_META: Record<string, { label: string; color: string; dot: string }> = {
  SHOPIFY: { label: "Shopify", color: "text-green-600 bg-green-600/[0.08]", dot: "bg-green-500" },
  AMAZON: { label: "Amazon", color: "text-orange-600 bg-orange-600/[0.08]", dot: "bg-orange-500" },
  TIKTOK: { label: "TikTok", color: "text-pink-600 bg-pink-600/[0.08]", dot: "bg-pink-500" },
  NAVER: { label: "네이버 스마트스토어", color: "text-emerald-600 bg-emerald-600/[0.08]", dot: "bg-emerald-500" },
  COUPANG: { label: "쿠팡", color: "text-red-600 bg-red-600/[0.08]", dot: "bg-red-500" },
  PHARMACY: { label: "약국", color: "text-blue-600 bg-blue-600/[0.08]", dot: "bg-blue-500" },
  CGETC: { label: "CGETC", color: "text-indigo-600 bg-indigo-600/[0.08]", dot: "bg-indigo-500" },
  GONGGU: { label: "공구", color: "text-rose-600 bg-rose-600/[0.08]", dot: "bg-rose-500" },
};

export function ChannelBreakdownCard({
  channel,
  rows,
  companyLabel,
}: {
  channel: string;
  rows: ChannelBreakdownRow[];
  companyLabel?: string;
}) {
  if (rows.length === 0) return null;
  const meta = CHANNEL_META[channel] || { label: channel, color: "text-slate-500 bg-slate-500/[0.08]", dot: "bg-slate-400" };
  const totalQty = rows.reduce((sum, r) => sum + r.qty30d, 0);
  const headerLabel = companyLabel ? `${companyLabel} · ${meta.label}` : meta.label;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {headerLabel}
          <span className="text-[var(--text-quaternary)] normal-case">({rows.length})</span>
        </h2>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full ${meta.color}`}>
          30일 {totalQty.toLocaleString()}
        </span>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--bg)]">
            <tr className="text-left text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              <th className="px-4 py-2.5">채널 상품명</th>
              <th className="px-4 py-2.5">채널 SKU</th>
              <th className="px-4 py-2.5">마스터 상품</th>
              <th className="px-4 py-2.5 text-right">30일 판매</th>
              <th className="px-4 py-2.5 text-right">현 재고</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .sort((a, b) => b.qty30d - a.qty30d)
              .map((r, i) => {
                const sameSku = !r.variantSku || r.variantSku === r.masterSku;
                return (
                  <tr
                    key={`${r.variantName}::${r.variantSku ?? ""}::${r.masterSku}::${i}`}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-4 py-2.5 font-semibold">{r.variantName}</td>
                    <td className="px-4 py-2.5 text-[var(--text-tertiary)] text-xs">
                      {r.variantSku || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="text-[var(--text-secondary)]">{r.masterName}</span>
                        <span className="text-[10px] text-[var(--text-quaternary)]">{r.masterSku}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{r.qty30d.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                      {typeof r.masterOnHand === "number" ? r.masterOnHand.toLocaleString() : "—"}
                      {sameSku && (
                        <span className="ml-1 text-[10px] text-[var(--text-quaternary)]">= 마스터</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
