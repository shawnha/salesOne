import { prisma } from "@/lib/prisma";
import { sendTelegram } from "./telegram";

export type NotificationType = "SYNC_FAILED" | "LOW_STOCK" | "NEW_ORDERS" | "MAPPING_BROKEN";
export type NotificationPriority = "URGENT" | "NORMAL";

export async function send(params: {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  companyId?: string;
}): Promise<void> {
  // Dedup: skip LOW_STOCK/MAPPING_BROKEN with same title within 24h
  if (params.type === "LOW_STOCK" || params.type === "MAPPING_BROKEN") {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await prisma.notification.findFirst({
      where: {
        type: params.type,
        title: params.title,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });
    if (existing) return;
  }

  const notification = await prisma.notification.create({
    data: {
      type: params.type,
      priority: params.priority,
      title: params.title,
      message: params.message,
      data: params.data ?? undefined,
      companyId: params.companyId,
    },
  });

  if (params.priority === "URGENT") {
    const success = await sendTelegram(params.title, params.message);
    if (success) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { sentAt: new Date(), sentVia: "telegram" },
      });
    }
  }
}

export async function getUnread(limit = 20): Promise<any[]> {
  return prisma.notification.findMany({
    where: { readAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRecent(limit = 20): Promise<any[]> {
  return prisma.notification.findMany({
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function markRead(id: string): Promise<void> {
  await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(): Promise<void> {
  await prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(): Promise<number> {
  return prisma.notification.count({
    where: { readAt: null },
  });
}
