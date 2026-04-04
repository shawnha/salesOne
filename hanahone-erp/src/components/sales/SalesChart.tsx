"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ChannelSalesData, MonthlyChannelData } from "@/lib/sales-chart-data";
import { CHANNEL_COLORS } from "@/lib/sales-chart-data";

const formatUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatKRW = (n: number) =>
  `₩${Math.round(n).toLocaleString("ko-KR")}`;

const BAR_CHANNELS = [
  { key: "SHOPIFY", label: "Shopify" },
  { key: "AMAZON", label: "Amazon" },
  { key: "TIKTOK", label: "TikTok" },
  { key: "NAVER", label: "Naver" },
  { key: "GONGGU", label: "공구" },
  { key: "PHARMACY", label: "Pharmacy" },
  { key: "CGETC", label: "CGETC" },
  { key: "SEEDING", label: "Seeding" },
  { key: "MANUAL", label: "Manual" },
] as const;

interface SalesChartProps {
  donut: ChannelSalesData[];
  monthly: MonthlyChannelData[];
  currentMonth?: string; // "YYYY-MM"
  primaryCurrency?: "USD" | "KRW";
}

export function SalesChart({ donut, monthly, currentMonth, primaryCurrency = "USD" }: SalesChartProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const total = donut.reduce((sum, d) => sum + d.amount, 0);
  const fmt = primaryCurrency === "KRW" ? formatKRW : formatUSD;

  // Reverse lookup: channel label → channel key
  const LABEL_TO_KEY: Record<string, string> = {
    Shopify: "SHOPIFY", Amazon: "AMAZON", TikTok: "TIKTOK",
    Naver: "NAVER", "공구": "GONGGU", Pharmacy: "PHARMACY",
    CGETC: "CGETC", Seeding: "SEEDING", Manual: "MANUAL",
  };

  function handleChannelClick(channelKey: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("channel");
    if (current === channelKey) {
      params.delete("channel");
    } else {
      params.set("channel", channelKey);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleBarClick(data: any) {
    const yearMonth = data?.payload?.yearMonth || data?.yearMonth;
    if (!yearMonth) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", yearMonth);
    router.push(`${pathname}?${params.toString()}`);
  }

  const activeChannels = BAR_CHANNELS.filter((ch) =>
    monthly.some((m) => m[ch.key as keyof MonthlyChannelData] as number > 0)
  );

  const currentMonthLabel = monthly.find((m) => m.yearMonth === currentMonth)?.month;

  if (donut.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
      {/* Donut Chart */}
      <div className="flex flex-col items-center">
        <p className="text-xs text-[var(--text-secondary)] mb-2">Channel Breakdown</p>
        <div className="relative">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                data={donut}
                dataKey="amount"
                nameKey="channel"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                onClick={(_, index) => {
                  const label = donut[index]?.channel;
                  const key = label ? LABEL_TO_KEY[label] : null;
                  if (key) handleChannelClick(key);
                }}
                cursor="pointer"
              >
                {donut.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => fmt(Number(value))}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm font-bold">{fmt(total)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
          {donut.map((d) => {
            const key = LABEL_TO_KEY[d.channel];
            const isActive = searchParams.get("channel") === key;
            return (
              <button
                key={d.channel}
                onClick={() => key && handleChannelClick(key)}
                className={`flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 transition-colors ${
                  isActive ? "bg-[var(--hover-bg)] ring-1 ring-accent" : "hover:bg-[var(--hover-bg)]"
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-[var(--text-secondary)]">{d.channel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div>
        <p className="text-xs text-[var(--text-secondary)] mb-2">Monthly Trend</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={(props: any) => {
                const { x, y, payload, index } = props;
                const isSelected = monthly[index]?.yearMonth === currentMonth;
                return (
                  <text
                    x={x} y={y + 12}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={isSelected ? 700 : 400}
                    fill={isSelected ? "var(--text-primary)" : "var(--text-secondary)"}
                  >
                    {payload.value}
                  </text>
                );
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => primaryCurrency === "KRW" ? `₩${(v / 10000).toFixed(0)}만` : `$${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
                    {payload.filter((p: any) => Number(p.value) > 0).map((p: any) => {
                      const key = BAR_CHANNELS.find((c) => c.label === p.name)?.key || p.dataKey;
                      return (
                        <div
                          key={p.dataKey}
                          onClick={(e) => { e.stopPropagation(); handleChannelClick(key); }}
                          style={{ color: p.fill, cursor: "pointer", padding: "1px 0" }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                        >
                          {p.name} : {fmt(Number(p.value))}
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {currentMonthLabel && (
              <ReferenceArea
                x1={currentMonthLabel}
                x2={currentMonthLabel}
                fill="var(--accent)"
                fillOpacity={0.06}
                stroke="var(--accent)"
                strokeOpacity={0.15}
              />
            )}
            {activeChannels.map((ch) => (
              <Bar
                key={ch.key}
                dataKey={ch.key}
                name={ch.label}
                stackId="sales"
                fill={CHANNEL_COLORS[ch.key]}
                radius={ch.key === activeChannels[activeChannels.length - 1].key ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                onClick={handleBarClick}
                cursor="pointer"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
