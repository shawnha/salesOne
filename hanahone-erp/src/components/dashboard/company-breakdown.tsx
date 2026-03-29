import { Card } from "@/components/ui/card";

interface CompanyData {
  name: string;
  color: string;
  stats: { label: string; value: string; subValue?: string }[];
}

export function CompanyBreakdown({ companies }: { companies: CompanyData[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {companies.map((c) => (
        <Card key={c.name}>
          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t" style={{ background: c.color }} />
          <div className="font-bold text-sm mb-4" style={{ color: c.color }}>{c.name}</div>
          {c.stats.map((s) => (
            <div key={s.label} className="flex justify-between items-baseline py-2 border-b border-[var(--border)] last:border-b-0">
              <span className="text-[13px] text-[var(--text-secondary)]">{s.label}</span>
              <div className="text-right">
                <span className="text-sm font-semibold">{s.value}</span>
                {s.subValue && (
                  <span className="text-[11px] text-[var(--text-tertiary)] ml-1.5">{s.subValue}</span>
                )}
              </div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
