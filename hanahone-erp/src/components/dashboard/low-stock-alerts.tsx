import { Card } from "@/components/ui/card";
import Link from "next/link";

interface AlertItem {
  productName: string;
  companyName: string;
  reorderLevel: number;
  quantity: number;
  daysLeft: number | null;
  burnRate: number | null;
}

export function LowStockAlerts({ items }: { items: AlertItem[] }) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-tight">Low stock alerts</h3>
        <Link href="/inventory" className="text-xs font-semibold text-accent">Inventory →</Link>
      </div>
      {items.length === 0 && (
        <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">All stock levels healthy</div>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex justify-between items-center py-2.5 border-b border-[var(--border)] last:border-b-0">
          <div>
            <div className="text-[13px] font-medium">{item.productName}</div>
            <div className="text-xs text-[var(--text-tertiary)]">
              {item.companyName}
              {item.burnRate !== null && ` · ${item.burnRate.toFixed(1)}/day`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-bold text-rose-500">{item.quantity} left</div>
            {item.daysLeft !== null && (
              <div className={`text-[11px] font-semibold ${item.daysLeft <= 7 ? "text-rose-500" : item.daysLeft <= 30 ? "text-amber-500" : "text-teal-600"}`}>
                ~{item.daysLeft}d remaining
              </div>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
