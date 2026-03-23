import { Card } from "@/components/ui/card";
import Link from "next/link";

interface AlertItem { productName: string; companyName: string; reorderLevel: number; quantity: number; }

export function LowStockAlerts({ items }: { items: AlertItem[] }) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-tight">Low stock alerts</h3>
        <Link href="/inventory" className="text-xs font-semibold text-accent">Inventory →</Link>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex justify-between items-center py-2.5 border-b border-[var(--border)] last:border-b-0">
          <div>
            <div className="text-[13px] font-medium">{item.productName}</div>
            <div className="text-xs text-[var(--text-tertiary)]">{item.companyName} · Reorder at {item.reorderLevel}</div>
          </div>
          <div className="text-[13px] font-bold text-rose-500">{item.quantity} left</div>
        </div>
      ))}
    </Card>
  );
}
