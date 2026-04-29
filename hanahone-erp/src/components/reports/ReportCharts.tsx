"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface MonthlyRevenueProps {
  data: { month: string; revenue: number }[];
  currencyPrefix?: string;
}

export function MonthlyRevenueChart({ data, currencyPrefix = "$" }: MonthlyRevenueProps) {
  const fmtVal = (n: number) =>
    `${currencyPrefix}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
          tickFormatter={(v) => `${currencyPrefix}${(v / 1000).toFixed(0)}k`}
          width={55}
        />
        <Tooltip
          formatter={(value) => [fmtVal(Number(value)), "매출"]}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="revenue" fill="#0d9488" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface TopItemProps {
  data: { name: string; value: number }[];
  color: string;
  valuePrefix?: string;
}

export function HorizontalBarChart({ data, color, valuePrefix = "$" }: TopItemProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2.5">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[11px] font-semibold text-[var(--text-tertiary)] w-4 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-0.5">
              <span className="text-[13px] font-medium truncate">{item.name}</span>
              <span className="text-[12px] font-semibold ml-2 flex-shrink-0">
                {valuePrefix}{item.value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(item.value / maxValue) * 100}%`, backgroundColor: color }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
