import { prisma } from "@/lib/prisma";
import * as notify from "@/lib/notifications";

const STALE_THRESHOLD_HOURS = 26;

export type StaleEntry = {
  platform: string;
  companyId: string;
  hours: number;
};

export async function findStaleSyncs(): Promise<StaleEntry[]> {
  const configs = await prisma.integrationConfig.findMany({
    where: { isActive: true },
    select: { platform: true, companyId: true, lastSyncAt: true },
  });

  const stale: StaleEntry[] = [];
  for (const c of configs) {
    if (!c.lastSyncAt) continue;
    const hours = (Date.now() - c.lastSyncAt.getTime()) / (1000 * 60 * 60);
    if (hours > STALE_THRESHOLD_HOURS) {
      stale.push({ platform: c.platform, companyId: c.companyId, hours });
    }
  }
  return stale;
}

export async function notifyStaleSyncs(): Promise<{ stale: StaleEntry[]; alerted: boolean }> {
  const stale = await findStaleSyncs();
  if (stale.length === 0) return { stale, alerted: false };

  const lines = stale.map((s) => `• ${s.platform}: ${Math.round(s.hours)}h ago`).join("\n");
  await notify.send({
    type: "SYNC_FAILED",
    priority: "URGENT",
    title: `동기화 정체 ${stale.length}건`,
    message: lines,
  });
  return { stale, alerted: true };
}
