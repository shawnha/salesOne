import { Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ChannelPayoutData } from "./types";

/**
 * Channel payout persistence — shared by the Coupang/Naver local sync scripts.
 *
 *   fetchXxxSettlements(creds, since) ──▶ ChannelPayoutData[] ──▶ syncChannelPayouts()
 *                          ▲                                          │ upsert by
 *            getPayoutSince(platform)                                 │ (platform, externalId)
 *            = max(payoutDate) ∥ 2026-01-01                           ▼
 *            (첫 실행이 곧 백필)                                  channel_payouts
 *
 * Re-running is safe: the unique key makes every row idempotent, and the
 * since-cursor re-covers the latest payout's month/window on purpose so
 * late-updated batches (e.g. SCHEDULED → DONE) get refreshed.
 */

/** Backfill horizon: first run pulls everything since this date (handoff §4). */
export const PAYOUT_BACKFILL_START = new Date("2026-01-01T00:00:00Z");

const RECOVER_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * Cursor for the next settlement fetch. Steps back 35 days from the latest
 * stored payoutDate so pending batches (Coupang 30% 유보, Naver SCHEDULED)
 * within the window keep getting refreshed until they settle.
 */
export async function getPayoutSince(platform: Platform): Promise<Date> {
  const latest = await prisma.channelPayout.findFirst({
    where: { platform },
    orderBy: { payoutDate: "desc" },
    select: { payoutDate: true },
  });
  if (!latest) return PAYOUT_BACKFILL_START;
  const stepped = new Date(latest.payoutDate.getTime() - RECOVER_MS);
  return stepped < PAYOUT_BACKFILL_START ? PAYOUT_BACKFILL_START : stepped;
}

export async function syncChannelPayouts(
  companyId: string,
  platform: Platform,
  payouts: ChannelPayoutData[],
): Promise<{ upserted: number; failed: number }> {
  let upserted = 0;
  let failed = 0;
  for (const p of payouts) {
    try {
      await prisma.channelPayout.upsert({
        where: { platform_externalId: { platform, externalId: p.externalId } },
        update: {
          payoutDate: p.payoutDate,
          amount: p.amount,
          currency: p.currency,
          periodStart: p.periodStart ?? null,
          periodEnd: p.periodEnd ?? null,
          feeAmount: p.feeAmount ?? null,
          status: p.status ?? null,
          rawData: p.rawData,
        },
        create: {
          companyId,
          platform,
          externalId: p.externalId,
          payoutDate: p.payoutDate,
          amount: p.amount,
          currency: p.currency,
          periodStart: p.periodStart ?? null,
          periodEnd: p.periodEnd ?? null,
          feeAmount: p.feeAmount ?? null,
          status: p.status ?? null,
          rawData: p.rawData,
        },
      });
      upserted++;
    } catch (err) {
      failed++;
      console.error(
        `ChannelPayout upsert failed (${platform} ${p.externalId}):`,
        (err as Error).message,
      );
    }
  }
  return { upserted, failed };
}
