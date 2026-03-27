"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { DailyOrderData } from "@/lib/orders-chart-data";

interface OrdersChartProps {
  data: DailyOrderData[];
}

export function OrdersChart({ data }: OrdersChartProps) {
  const hasData = data.some(d => d.total > 0);
  if (!hasData) return null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <p className="text-xs text-[var(--text-secondary)]">Daily Orders</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-3 h-[2px] bg-blue-500 inline-block rounded" />
            <span className="text-[var(--text-secondary)]">Total</span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-3 h-[2px] bg-emerald-500 inline-block rounded" />
            <span className="text-[var(--text-secondary)]">Delivered</span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-3 h-[2px] bg-red-500 inline-block rounded" style={{ borderTop: "2px dashed" }} />
            <span className="text-[var(--text-secondary)]">Refunded</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="delivered"
            name="Delivered"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="refunded"
            name="Refunded"
            stroke="#EF4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
