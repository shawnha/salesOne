import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  totalAmount: number;
  externalSource?: string | null;
  isTransfer?: boolean;
  transferLabel?: string;
}

const KRW_PLATFORMS = new Set(["NAVER", "PHARMACY"]);

function formatAmount(n: number, platform: string | null | undefined) {
  if (KRW_PLATFORMS.has(platform || "")) {
    return n >= 1_000_000 ? `₩${(n / 1_000_000).toFixed(1)}M` : `₩${n.toLocaleString()}`;
  }
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-tight">Recent orders</h3>
        <Link href="/orders" className="text-xs font-semibold text-accent">View all orders →</Link>
      </div>
      {orders.map((order) => (
        <div key={order.id} className="grid grid-cols-4 py-3 border-b border-[var(--border)] last:border-b-0 text-[13px] items-center">
          <span className="font-semibold">{order.orderNumber}</span>
          <span className={order.isTransfer ? "text-accent" : "text-[var(--text-secondary)]"}>{order.isTransfer ? order.transferLabel : order.customerName}</span>
          <span><Badge status={order.status} /></span>
          <span className="font-semibold text-right">{formatAmount(order.totalAmount, order.externalSource)}</span>
        </div>
      ))}
    </Card>
  );
}
