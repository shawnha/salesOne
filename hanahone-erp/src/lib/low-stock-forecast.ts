import { prisma } from "@/lib/prisma";
import * as notify from "@/lib/notifications";

export type ForecastEntry = {
  productId: string;
  productName: string;
  companyId: string;
  companyName: string;
  quantity: number;
  reorderLevel: number;
  burnRate: number | null;
  daysLeft: number | null;
  /** True when current stock already at/below reorder threshold. */
  belowReorder: boolean;
  /** True when projected to fall below reorder within `horizonDays`. */
  willCrossSoon: boolean;
};

const NON_REVENUE_TYPES = ["SEEDING", "GIFT", "INTER_COMPANY"] as const;

export async function forecastLowStock(opts?: {
  horizonDays?: number;
  windowDays?: number;
}): Promise<ForecastEntry[]> {
  const horizon = opts?.horizonDays ?? 30;
  const window = opts?.windowDays ?? 30;

  const since = new Date(Date.now() - window * 24 * 3600 * 1000);

  const inventories = await prisma.inventory.findMany({
    select: {
      productId: true,
      companyId: true,
      quantity: true,
      reorderLevel: true,
      product: { select: { name: true } },
      company: { select: { name: true } },
    },
  });

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        orderDate: { gte: since },
        type: { notIn: NON_REVENUE_TYPES as any },
      },
    },
    select: { productId: true, quantity: true, order: { select: { companyId: true } } },
  });

  const soldByKey = new Map<string, number>();
  for (const it of items) {
    if (!it.productId) continue;
    const key = `${it.order.companyId}:${it.productId}`;
    soldByKey.set(key, (soldByKey.get(key) ?? 0) + it.quantity);
  }

  const out: ForecastEntry[] = [];
  for (const inv of inventories) {
    const key = `${inv.companyId}:${inv.productId}`;
    const sold = soldByKey.get(key) ?? 0;
    const burnRate = sold > 0 ? sold / window : null;
    const daysLeft = burnRate ? Math.round(inv.quantity / burnRate) : null;
    const projected = burnRate ? inv.quantity - burnRate * horizon : inv.quantity;

    const belowReorder = inv.quantity <= inv.reorderLevel && inv.reorderLevel > 0;
    const willCrossSoon =
      !belowReorder &&
      inv.reorderLevel > 0 &&
      burnRate !== null &&
      projected <= inv.reorderLevel;

    if (!belowReorder && !willCrossSoon) continue;

    out.push({
      productId: inv.productId,
      productName: inv.product.name,
      companyId: inv.companyId,
      companyName: inv.company.name,
      quantity: inv.quantity,
      reorderLevel: inv.reorderLevel,
      burnRate,
      daysLeft,
      belowReorder,
      willCrossSoon,
    });
  }

  out.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  return out;
}

export async function notifyLowStockForecast(
  opts?: { horizonDays?: number },
): Promise<{ entries: ForecastEntry[]; alerted: number }> {
  const entries = await forecastLowStock(opts);
  let alerted = 0;
  for (const e of entries) {
    const eta = e.daysLeft !== null ? `약 ${e.daysLeft}일 후 소진` : "최근 30일 판매 없음";
    const tag = e.belowReorder ? "재주문 임계 도달" : "30일 내 임계 도달 예상";
    const ok = await notify.send({
      type: "LOW_STOCK",
      priority: "URGENT",
      title: `${tag}: ${e.productName}`,
      message: `${e.companyName} · 현 재고 ${e.quantity} (재주문 ${e.reorderLevel}) · ${eta}`,
      data: {
        productId: e.productId,
        companyId: e.companyId,
        quantity: e.quantity,
        reorderLevel: e.reorderLevel,
        burnRate: e.burnRate,
        daysLeft: e.daysLeft,
      },
      companyId: e.companyId,
    }).then(() => true).catch((err) => {
      console.error(`low-stock notify failed for ${e.productName}:`, err.message);
      return false;
    });
    if (ok) alerted++;
  }
  return { entries, alerted };
}

export function formatForecastSummary(entries: ForecastEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    const tag = e.belowReorder ? "🔴 below" : "🟠 soon";
    const eta = e.daysLeft !== null ? `${e.daysLeft}d` : "no recent sales";
    const rate = e.burnRate !== null ? `${e.burnRate.toFixed(1)}/d` : "—";
    lines.push(
      `${tag} ${e.companyName} · ${e.productName}: 재고 ${e.quantity} (재주문 ${e.reorderLevel}, 소진 ${rate}, ETA ${eta})`,
    );
  }
  return lines.join("\n");
}
