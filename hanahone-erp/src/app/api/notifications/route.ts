import { NextResponse } from "next/server";
import { getRecent, getUnreadCount } from "@/lib/notifications";

export async function GET() {
  const [notifications, unreadCount] = await Promise.all([
    getRecent(20),
    getUnreadCount(),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
