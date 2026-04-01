import { NextRequest, NextResponse } from "next/server";
import { markRead, markAllRead } from "@/lib/notifications";
import { z } from "zod";

const ReadSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ all: z.literal(true) }),
]);

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = ReadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if ("all" in parsed.data) {
    await markAllRead();
  } else {
    await markRead(parsed.data.id);
  }

  return NextResponse.json({ ok: true });
}
