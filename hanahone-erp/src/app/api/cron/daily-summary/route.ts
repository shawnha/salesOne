import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/cron-auth";
import { generateDailySummary } from "@/lib/telegram-bot";
import { sendTelegram } from "@/lib/notifications/telegram";
import { notifyStaleSyncs } from "@/lib/stale-monitor";

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let staleResult: { count: number; alerted: boolean; error?: string } = { count: 0, alerted: false };
  try {
    const r = await notifyStaleSyncs();
    staleResult = { count: r.stale.length, alerted: r.alerted };
  } catch (err: any) {
    staleResult = { count: 0, alerted: false, error: err.message };
    console.error("Stale-sync monitor failed:", err.message);
  }

  try {
    const summary = await generateDailySummary();
    const sent = await sendTelegram("일일 요약", summary);
    return NextResponse.json({ sent, length: summary.length, stale: staleResult });
  } catch (err: any) {
    console.error("Daily summary failed:", err.message);
    return NextResponse.json({ error: err.message, stale: staleResult }, { status: 500 });
  }
}
