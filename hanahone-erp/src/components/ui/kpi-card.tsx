import { Card } from "./card";

interface KpiCardProps {
  label: string;
  value: string;
  subValue?: string;
  change?: { value: string; direction: "up" | "down" | "neutral" };
  subtitle?: string;
}

export function KpiCard({ label, value, subValue, change, subtitle }: KpiCardProps) {
  const changeColors = {
    up: "text-[var(--badge-teal)] bg-[var(--badge-teal-bg)]",
    down: "text-[var(--badge-red)] bg-[var(--badge-red-bg)]",
    neutral: "text-[var(--text-tertiary)] bg-[var(--skeleton-bg)]",
  };
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-4">{label}</div>
      <div className="text-4xl font-bold tracking-tighter leading-none">{value}</div>
      {subValue && <div className="text-sm text-[var(--text-secondary)] mt-1">{subValue}</div>}
      {change && (
        <div className={`inline-flex items-center gap-1 mt-2.5 text-[13px] font-semibold px-2.5 py-0.5 rounded-full ${changeColors[change.direction]}`}>
          {change.value}
        </div>
      )}
      {subtitle && <div className="text-[13px] text-[var(--text-tertiary)] mt-1.5">{subtitle}</div>}
    </Card>
  );
}
