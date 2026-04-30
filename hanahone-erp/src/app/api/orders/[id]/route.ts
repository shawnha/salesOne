/**
 * Order detail edit endpoint.
 *
 * PATCH /api/orders/{id}
 *   body: {
 *     type?: OrderType                      // SALE | SEEDING | GIFT | REVIEW
 *     financialAction?: "REVERT_REFUND"     // undo a refund (REFUNDED → PAID)
 *     reviewRefunded?: boolean              // mark/unmark the friend-refund as completed
 *   }
 *
 * Refunds and fulfillment edits otherwise live in the sync layer; this
 * endpoint only handles the operator-driven actions exposed in the UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrderType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";

// User-toggleable types only. SALE is the default-on revert target.
// PURCHASE / BROKERAGE / INTER_COMPANY are set by sync logic, not by
// the operator — exclude them so a fat-finger click can't reclassify
// an inter-company transfer.
const ALLOWED_TYPES = ["SALE", "SEEDING", "GIFT", "REVIEW"] as const satisfies readonly OrderType[];

const PatchSchema = z.object({
  type: z.enum(ALLOWED_TYPES).optional(),
  financialAction: z.enum(["REVERT_REFUND"]).optional(),
  reviewRefunded: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      companyId: true,
      type: true,
      totalAmount: true,
      refundAmount: true,
      financialStatus: true,
      reviewRefundedAt: true,
    },
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

  const { type, financialAction, reviewRefunded } = parsed.data;
  if (!type && !financialAction && reviewRefunded === undefined) {
    return NextResponse.json({ error: "변경할 필드가 없습니다" }, { status: 400 });
  }

  const data: Prisma.OrderUpdateInput = {};
  if (type) data.type = type;

  if (reviewRefunded !== undefined) {
    // Effective type after this PATCH (in case both type and reviewRefunded change).
    const effectiveType = type ?? order.type;
    if (effectiveType !== "REVIEW") {
      return NextResponse.json(
        { error: "REVIEW 분류 주문에서만 환급 완료 표시가 가능합니다" },
        { status: 409 },
      );
    }
    data.reviewRefundedAt = reviewRefunded ? new Date() : null;
  }

  if (financialAction === "REVERT_REFUND") {
    if (order.financialStatus !== "REFUNDED") {
      return NextResponse.json(
        { error: "환불 상태가 아닌 주문은 번복할 수 없습니다" },
        { status: 409 },
      );
    }

    // Undo any inventory restore that was issued when the order flipped to
    // REFUNDED. inventory-deduction.ts records "restore:{orderId}:item:*"
    // adjustments that added stock back; reverse them so the post-revert
    // inventory matches PAID state. The original "order:{orderId}:item:*"
    // SALE adjustment is left in place — its quantityChange is still
    // accurate because the SKU was sold once and never un-sold.
    const restoreAdjs = await prisma.inventoryAdjustment.findMany({
      where: { referenceId: { startsWith: `restore:${params.id}:` } },
      select: { id: true, inventoryId: true, quantityChange: true },
    });
    for (const adj of restoreAdjs) {
      const inv = await prisma.inventory.findUnique({ where: { id: adj.inventoryId } });
      if (inv) {
        await prisma.inventory.update({
          where: { id: inv.id },
          data: { quantity: inv.quantity - adj.quantityChange },
        });
      }
      await prisma.inventoryAdjustment.delete({ where: { id: adj.id } });
    }

    data.financialStatus = "PAID";
    data.refundAmount = null;
    data.netAmount = order.totalAmount;
  }

  const updated = await prisma.order.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      type: true,
      financialStatus: true,
      refundAmount: true,
      netAmount: true,
      reviewRefundedAt: true,
    },
  });

  return NextResponse.json({ success: true, order: updated });
}
