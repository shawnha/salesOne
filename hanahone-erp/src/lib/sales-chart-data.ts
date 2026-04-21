import { prisma } from "@/lib/prisma";

export interface ChannelSalesData {
  channel: string;
  amount: number;
  color: string;
}

export interface MonthlyChannelData {
  month: string;
  yearMonth: string; // "YYYY-MM" for navigation
  SHOPIFY: number;
  AMAZON: number;
  TIKTOK: number;
  NAVER: number;
  COUPANG: number;
  GONGGU: number;
  PHARMACY: number;
  CGETC: number;
  SEEDING: number;
  MANUAL: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  SHOPIFY: "#95BF47",
  AMAZON: "#FF9900",
  TIKTOK: "#EE1D52",
  NAVER: "#1B9E77",
  COUPANG: "#DC2626",
  GONGGU: "#E11D48",
  PHARMACY: "#6B7280",
  CGETC: "#4F46E5",
  SEEDING: "#7C3AED",
  MANUAL: "#9CA3AF",
};

const CHANNEL_LABELS: Record<string, string> = {
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK: "TikTok",
  NAVER: "네이버",
  COUPANG: "쿠팡",
  GONGGU: "공구",
  PHARMACY: "약국",
  CGETC: "CGETC",
  SEEDING: "Seeding",
  MANUAL: "Manual",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { CHANNEL_COLORS, CHANNEL_LABELS };

export function applyChannelFilter(where: any, channel?: string) {
  if (channel === "SEEDING") {
    where.externalSource = "CGETC";
    where.notes = { startsWith: "free gifting", mode: "insensitive" };
  } else if (channel === "CGETC") {
    where.externalSource = "CGETC";
    where.OR = [
      { notes: null },
      { NOT: { notes: { startsWith: "free gifting", mode: "insensitive" } } },
    ];
  } else if (channel === "GONGGU") {
    where.externalSource = "NAVER";
    where.notes = "공구";
  } else if (channel === "NAVER") {
    where.externalSource = "NAVER";
    where.OR = [
      { notes: null },
      { NOT: { notes: "공구" } },
    ];
  } else if (channel) {
    where.externalSource = channel;
  }
}

const KRW_SOURCES = new Set(["NAVER", "COUPANG", "PHARMACY", "GONGGU"]);

export async function getChannelSalesData(
  companyId: string | undefined,
  month: string | undefined,
  channel?: string | undefined,
  options?: { exchangeRate?: number; primaryCurrency?: "USD" | "KRW" },
): Promise<{ donut: ChannelSalesData[]; monthly: MonthlyChannelData[] }> {
  const rate = options?.exchangeRate || 1;
  const primary = options?.primaryCurrency || "USD";

  function normalize(amount: number, source: string | null): number {
    const isKrw = KRW_SOURCES.has(source || "");
    if (primary === "USD" && isKrw) return amount / rate;
    if (primary === "KRW" && !isKrw) return amount * rate;
    return amount;
  }
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
    } else if (channel === "NAVER" && order.notes === "공구") {
      channel = "GONGGU";
    }
    // Seeding is not revenue — always $0
    if (channel === "SEEDING") continue;
    const raw = Number(order.netAmount ?? order.totalAmount);
    channelTotals[channel] = (channelTotals[channel] || 0) + normalize(raw, order.externalSource);
  }

  const donut: ChannelSalesData[] = Object.entries(channelTotals)
    .filter(([, amount]) => amount > 0)
    .map(([channel, amount]) => ({
      channel: CHANNEL_LABELS[channel] || channel,
      amount,
      color: CHANNEL_COLORS[channel] || "#9CA3AF",
    }))
    .sort((a, b) => b.amount - a.amount);

  // 5 months centered on selected month: -2 ... selected ... +2
  const RANGE = 5;
  const OFFSET = 2;
  const rangeStart = new Date(targetYear, targetMonth - OFFSET, 1);
  const rangeEnd = new Date(targetYear, targetMonth + OFFSET + 1, 1);
  const monthlyWhere: any = {
    type: "SALE",
    fulfillmentStatus: { in: ["FULFILLED", "DELIVERED"] },
    financialStatus: { in: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"] },
    orderDate: { gte: rangeStart, lt: rangeEnd },
  };
  if (companyId) monthlyWhere.companyId = companyId;
  applyChannelFilter(monthlyWhere, channel);

  const monthlyOrders = await prisma.order.findMany({
    where: monthlyWhere,
    select: { externalSource: true, netAmount: true, totalAmount: true, orderDate: true, notes: true },
  });

  const monthly: MonthlyChannelData[] = [];
  for (let i = 0; i < RANGE; i++) {
    const m = new Date(targetYear, targetMonth - OFFSET + i, 1);
    monthly.push({
      month: MONTH_NAMES[m.getMonth()],
      yearMonth: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
      SHOPIFY: 0, AMAZON: 0, TIKTOK: 0, NAVER: 0, COUPANG: 0, GONGGU: 0, PHARMACY: 0, CGETC: 0, SEEDING: 0, MANUAL: 0,
    });
  }

  for (const order of monthlyOrders) {
    const d = new Date(order.orderDate);
    const idx = (d.getFullYear() - rangeStart.getFullYear()) * 12 + d.getMonth() - rangeStart.getMonth();
    if (idx >= 0 && idx < RANGE) {
      let channel = (order.externalSource || "MANUAL") as keyof Omit<MonthlyChannelData, "month" | "yearMonth">;
      if (channel === "CGETC" && order.notes?.toLowerCase().startsWith("free gifting")) {
        channel = "SEEDING";
      } else if (channel === "NAVER" && order.notes === "공구") {
        channel = "GONGGU" as typeof channel;
      }
      // Seeding is not revenue — skip
      if (channel === "SEEDING") continue;
      if (channel in monthly[idx]) {
        const raw = Number(order.netAmount ?? order.totalAmount);
        monthly[idx][channel] += normalize(raw, order.externalSource);
      }
    }
  }

  return { donut, monthly };
}
