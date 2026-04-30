/**
 * Shipping batch lifecycle ops.
 *
 * DELETE /api/shipping/batch/{id}
 *   Removes a draft (PENDING) batch and its items, returning the orders to
 *   the pending-orders list. Refuses if the batch has already moved past
 *   PENDING (SHIPPED/COMPLETED) — at that point tracking has been uploaded
 *   or dispatch has run, and unwinding could de-sync our state from the
 *   channel APIs. Cancel manually via DB if you really need to.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const batch = await prisma.shippingBatch.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, companyId: true },
  });
  if (!batch) {
    return NextResponse.json({ error: "라운드를 찾을 수 없습니다" }, { status: 404 });
  }
  const { error: companyErr } = await requireCompanyAccess(batch.companyId);
  if (companyErr) return companyErr;

  if (batch.status !== "PENDING") {
    return NextResponse.json(
      {
        error: `상태가 ${batch.status} 인 라운드는 삭제할 수 없습니다. 작성 중(PENDING) 라운드만 삭제 가능.`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.shippingBatchItem.deleteMany({ where: { batchId: batch.id } }),
    prisma.shippingBatch.delete({ where: { id: batch.id } }),
  ]);

  return NextResponse.json({ success: true });
}
