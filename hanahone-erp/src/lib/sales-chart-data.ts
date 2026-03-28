import { prisma } from "@/lib/prisma";

export interface ChannelSalesData {
  channel: string;
  amount: number;
  color: string;
}

export interface MonthlyChannelData {
  month: string;
  SHOPIFY: number;
  AMAZON: number;
  TIKTOK: number;
  NAVER: number;
  PHARMACY: number;
  CGETC: number;
  SEEDING: number;
  MANUAL: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  SHOPIFY: "#95BF47",
  AMAZON: "#FF9900",
  TIKTOK: "#000000",
  NAVER: "#03C75A",
  PHARMACY: "#6B7280",
  CGETC: "#4F46E5",
  SEEDING: "#7C3AED",
  MANUAL: "#9CA3AF",
};

const CHANNEL_LABELS: Record<string, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  NAVER: "Naver",
  PHARMACY: "Pharmacy",
  CGETC: "CGETC",
  SEEDING: "Seeding",
  MANUAL: "Manual",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { CHANNEL_COLORS, CHANNEL_LABELS };

function applyChannelFilter(where: any, channel?: string) {
  if (channel === "SEEDING") {
    where.externalSource = "CGETC";
    where.notes = { startsWith: "free gifting", mode: "insensitive" };
  } else if (channel === "CGETC") {
    where.externalSource = "CGETC";
    where.OR = [
      { notes: null },
      { NOT: { notes: { startsWith: "free gifting", mode: "insensitive" } } },
    ];
  } else if (channel) {
    where.externalSource = channel;
  }
}

export async function getChannelSalesData(
  companyId: string | undefined,
  month: string | undefined,
  channel?: string | undefined,
): Promise<{ donut: ChannelSalesData[]; monthly: MonthlyChannelData[] }> {
  const now = new Date();
  const [targetYear, targetMonth] = month
    ? [parseInt(month.split("-")[0]), parseInt(month.split("-")[1]) - 1]
    : [now.getFullYear(), now.getMonth()];

  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 1);

  const where: any = {
    type: "SALE",
    fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
    financialStatus: { in: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"] },
    orderDate: { gte: monthStart, lt: monthEnd },
  };
  if (companyId) where.companyId = companyId;
  applyChannelFilter(where, channel);

  const orders = await prisma.order.findMany({
    where,
    select: { externalSource: true, netAmount: true, totalAmount: true, notes: true },
  });

  const channelTotals: Record<string, number> = {};
  for (const order of orders) {
    let channel = order.externalSource || "MANUAL";
    if (channel === "CGETC" && order.notes?.toLowerCase().startsWith("free gifting")) {
      channel = "SEEDING";
    }
    channelTotals[channel] = (channelTotals[channel] || 0) + Number(order.netAmount ?? order.totalAmount);
  }

  const donut: ChannelSalesData[] = Object.entries(channelTotals)
    .map(([channel, amount]) => ({
      channel: CHANNEL_LABELS[channel] || channel,
      amount,
      color: CHANNEL_COLORS[channel] || "#9CA3AF",
    }))
    .sort((a, b) => b.amount - a.amount);

  const sixMonthsAgo = new Date(targetYear, targetMonth - 5, 1);
  const monthlyWhere: any = {
    type: "SALE",
    fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
    financialStatus: { in: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"] },
    orderDate: { gte: sixMonthsAgo, lt: monthEnd },
  };
  if (companyId) monthlyWhere.companyId = companyId;
  applyChannelFilter(monthlyWhere, channel);

  const monthlyOrders = await prisma.order.findMany({
    where: monthlyWhere,
    select: { externalSource: true, netAmount: true, totalAmount: true, orderDate: true, notes: true },
  });

  const monthly: MonthlyChannelData[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new Date(targetYear, targetMonth - 5 + i, 1);
    monthly.push({
      month: MONTH_NAMES[m.getMonth()],
      SHOPIFY: 0, AMAZON: 0, TIKTOK: 0, NAVER: 0, PHARMACY: 0, CGETC: 0, SEEDING: 0, MANUAL: 0,
    });
  }

  for (const order of monthlyOrders) {
    const d = new Date(order.orderDate);
    const idx = (d.getFullYear() - sixMonthsAgo.getFullYear()) * 12 + d.getMonth() - sixMonthsAgo.getMonth();
    if (idx >= 0 && idx < 6) {
      let channel = (order.externalSource || "MANUAL") as keyof Omit<MonthlyChannelData, "month">;
      if (channel === "CGETC" && order.notes?.toLowerCase().startsWith("free gifting")) {
        channel = "SEEDING";
      }
      if (channel in monthly[idx]) {
        monthly[idx][channel] += Number(order.netAmount ?? order.totalAmount);
      }
    }
  }

  return { donut, monthly };
}
