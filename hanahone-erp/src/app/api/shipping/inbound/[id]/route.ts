/**
 * PATCH /api/shipping/inbound/[id]
 * 입고 라운드 상태 변경 (PLANNED → REQUESTED → SHIPPED → RECEIVED)
 * + 부분 필드 업데이트 (coupangInboundNo, notes)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["PLANNED", "REQUESTED", "SHIPPED", "RECEIVED", "CANCELLED"]).optional(),
  coupangInboundNo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const raw = await req.json();
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    // status 변경 시 timestamp 자동 채움
    if (parsed.data.status === "REQUESTED") data.requestedAt = new Date();
    if (parsed.data.status === "SHIPPED") data.shippedAt = new Date();
    if (parsed.data.status === "RECEIVED") data.receivedAt = new Date();
  }
  if (parsed.data.coupangInboundNo !== undefined) data.coupangInboundNo = parsed.data.coupangInboundNo;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const updated = await prisma.rocketGrowthInbound.update({
    where: { id: params.id },
    data,
    include: { items: { include: { product: { select: { sku: true, name: true } } } } },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    coupangInboundNo: updated.coupangInboundNo,
    notes: updated.notes,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  await prisma.rocketGrowthInbound.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
