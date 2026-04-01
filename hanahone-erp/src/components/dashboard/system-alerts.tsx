import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  SYNC_FAILED: { icon: "\u26A0\uFE0F", color: "bg-red-500/[0.08]" },
  LOW_STOCK: { icon: "\uD83D\uDCE6", color: "bg-amber-500/[0.08]" },
  NEW_ORDERS: { icon: "\uD83D\uDED2", color: "bg-blue-500/[0.08]" },
};

export async function SystemAlerts() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alerts = await prisma.notification.findMany({
    where: { createdAt: { gte: twentyFourHoursAgo } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (alerts.length === 0) return null;

  const unreadCount = alerts.filter((a) => !a.readAt).length;

  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-4">
        System Alerts
        {unreadCount > 0 && (
          <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/[0.08] text-red-500">
            {unreadCount} new
          </span>
        )}
      </div>
      <div className="space-y-0">
        {alerts.map((alert) => {
          const config = TYPE_CONFIG[alert.type] || { icon: "\u2139\uFE0F", color: "bg-gray-500/[0.08]" };
          return (
            <div key={alert.id} className="flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] flex-shrink-0 ${config.color}`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold truncate">{alert.title}</div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">{alert.message}</div>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
                {new Date(alert.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
