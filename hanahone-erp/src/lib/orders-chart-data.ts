import { prisma } from "@/lib/prisma";

export interface DailyOrderData {
  day: string; // "1", "2", ... "31"
  total: number;
  delivered: number;
  refunded: number;
}

export async function getDailyOrderData(
  companyId: string | undefined,
  month: string | undefined // "YYYY-MM" format
): Promise<DailyOrderData[]> {
  const now = new Date();
  const [targetYear, targetMonth] = month
    ? [parseInt(month.split("-")[0]), parseInt(month.split("-")[1]) - 1]
    : [now.getFullYear(), now.getMonth()];

  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 1);
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  const where: any = {
    type: "SALE",
    orderDate: { gte: monthStart, lt: monthEnd },
  };
  if (companyId) where.companyId = companyId;

  const orders = await prisma.order.findMany({
    where,
    select: {
      orderDate: true,
      fulfillmentStatus: true,
      financialStatus: true,
    },
  });

  // Initialize all days
  const daily: DailyOrderData[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    daily.push({ day: String(d), total: 0, delivered: 0, refunded: 0 });
  }

  // Aggregate
  for (const order of orders) {
    const dayIndex = new Date(order.orderDate).getDate() - 1;
    if (dayIndex < 0 || dayIndex >= daysInMonth) continue;

    daily[dayIndex].total++;

    if (order.fulfillmentStatus === "DELIVERED") {
      daily[dayIndex].delivered++;
    }

    if (order.financialStatus === "REFUNDED" || order.financialStatus === "PARTIALLY_REFUNDED") {
      daily[dayIndex].refunded++;
    }
  }

  return daily;
}
