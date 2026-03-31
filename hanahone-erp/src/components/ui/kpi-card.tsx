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
    up: "text-teal-600 bg-teal-600/[0.08] dark:text-teal-400 dark:bg-teal-400/[0.10]",
    down: "text-rose-600 bg-rose-600/[0.08] dark:text-rose-400 dark:bg-rose-400/[0.10]",
    neutral: "text-[var(--text-tertiary)] bg-black/[0.04] dark:bg-white/[0.04]",
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
