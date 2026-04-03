import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/cron-auth";
import { generateDailySummary } from "@/lib/telegram-bot";
import { sendTelegram } from "@/lib/notifications/telegram";

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await generateDailySummary();
    const sent = await sendTelegram("일일 요약", summary);

    return NextResponse.json({ sent, length: summary.length });
  } catch (err: any) {
    console.error("Daily summary failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
