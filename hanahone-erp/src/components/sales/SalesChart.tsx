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
} from "recharts";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ChannelSalesData, MonthlyChannelData } from "@/lib/sales-chart-data";
import { CHANNEL_COLORS } from "@/lib/sales-chart-data";

const formatUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const BAR_CHANNELS = [
  { key: "SHOPIFY", label: "Shopify" },
  { key: "AMAZON", label: "Amazon" },
  { key: "TIKTOK", label: "TikTok" },
  { key: "NAVER", label: "Naver" },
  { key: "PHARMACY", label: "Pharmacy" },
  { key: "CGETC", label: "CGETC" },
  { key: "SEEDING", label: "Seeding" },
  { key: "MANUAL", label: "Manual" },
] as const;

interface SalesChartProps {
  donut: ChannelSalesData[];
  monthly: MonthlyChannelData[];
}

export function SalesChart({ donut, monthly }: SalesChartProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const total = donut.reduce((sum, d) => sum + d.amount, 0);

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
              >
                {donut.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatUSD(Number(value))}
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
            <p className="text-sm font-bold">{formatUSD(total)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
          {donut.map((d) => (
            <div key={d.channel} className="flex items-center gap-1 text-[11px]">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-[var(--text-secondary)]">{d.channel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div>
        <p className="text-xs text-[var(--text-secondary)] mb-2">Monthly Trend (6 months)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip
              formatter={(value, name) => [formatUSD(Number(value)), name]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
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
