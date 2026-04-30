/**
 * Order detail edit endpoint.
 *
 * PATCH /api/orders/{id}
 *   body: { type?: OrderType }
 *
 * Currently only handles classification changes (e.g. tagging a Coupang
 * order as REVIEW for 지인 리뷰 작업, or reverting to SALE). Refunds and
 * fulfillment edits live elsewhere — this endpoint stays narrow on
 * purpose so it's safe to call from the detail page action menu.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";

// User-toggleable types only. SALE is the default-on revert target.
// PURCHASE / BROKERAGE / INTER_COMPANY are set by sync logic, not by
// the operator — exclude them so a fat-finger click can't reclassify
// an inter-company transfer.
const ALLOWED_TYPES = ["SALE", "SEEDING", "GIFT", "REVIEW"] as const satisfies readonly OrderType[];

const PatchSchema = z.object({
  type: z.enum(ALLOWED_TYPES).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: { id: true, companyId: true, type: true },
  });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }
  const { error } = await requireCompanyAccess(order.companyId);
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { type } = parsed.data;
  if (!type) {
    return NextResponse.json({ error: "변경할 필드가 없습니다" }, { status: 400 });
  }

  const updated = await prisma.order.update({
    where: { id: params.id },
    data: { type },
    select: { id: true, type: true },
  });

  return NextResponse.json({ success: true, order: updated });
}
