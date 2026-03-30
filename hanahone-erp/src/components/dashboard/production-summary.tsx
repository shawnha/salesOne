import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface ProductionItem {
  id: string;
  productName: string;
  status: string;
  quantityToProduce: number;
  quantityProduced: number;
}

export function ProductionSummary({ items }: { items: ProductionItem[] }) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-tight">Production orders</h3>
        <Link href="/manufacturing" className="text-xs font-semibold text-accent">Manufacturing →</Link>
      </div>
      {items.length === 0 && (
        <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">No active production orders</div>
      )}
      {items.map((item) => {
        const pct = item.quantityToProduce > 0
          ? Math.round((item.quantityProduced / item.quantityToProduce) * 100)
          : 0;
        return (
          <Link key={item.id} href={`/manufacturing/${item.id}`} className="block py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-hover)] -mx-4 px-4 transition-colors">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[13px] font-medium">{item.productName}</div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  {item.quantityProduced}/{item.quantityToProduce} units
                </div>
              </div>
              <Badge status={item.status} />
            </div>
            {item.status === "IN_PROGRESS" && (
              <div className="mt-1.5 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
              </div>
            )}
          </Link>
        );
      })}
    </Card>
  );
}
