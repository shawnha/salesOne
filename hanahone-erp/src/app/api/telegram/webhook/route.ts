import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram-bot";

export async function POST(req: NextRequest) {
  // Verify the request is from Telegram (optional: check secret token)
  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const message = body?.message;

    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    // Only respond to messages from the authorized chat
    const chatId = String(message.chat.id);
    if (chatId !== process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true });
    }

    await handleTelegramMessage(message.text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", (err as Error).message);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
