"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const formatUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface ShippingChartProps {
  data: { month: string; yearMonth: string; total: number }[];
}

export function ShippingChart({ data }: ShippingChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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
          tickFormatter={(v) => `$${(v / 1).toFixed(0)}`}
          width={50}
        />
        <Tooltip
          formatter={(value) => [formatUSD(Number(value)), "Shipping"]}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar
          dataKey="total"
          name="Shipping Cost"
          fill="#6366f1"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
