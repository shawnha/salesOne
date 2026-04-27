/**
 * Settlement reconciliation: write-side only.
 * GET (read) is server-rendered on the Reconciliation page directly so the
 * UI can sum across orders + reconciliation rows in a single trip.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { Platform } from "@prisma/client";
import { z } from "zod";

const UpsertSchema = z.object({
  companyId: z.string().uuid(),
  platform: z.nativeEnum(Platform),
  periodStart: z.string(),
  periodEnd: z.string(),
  expectedAmount: z.number(),
  actualAmount: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = UpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { companyId, platform, periodStart, periodEnd, expectedAmount, actualAmount, notes } =
    parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const row = await prisma.settlementReconciliation.upsert({
    where: {
      companyId_platform_periodStart: { companyId, platform, periodStart: start },
    },
    update: {
      expectedAmount,
      actualAmount: actualAmount ?? null,
      notes: notes ?? null,
      periodEnd: end,
    },
    create: {
      companyId,
      platform,
      periodStart: start,
      periodEnd: end,
      expectedAmount,
      actualAmount: actualAmount ?? null,
      notes: notes ?? null,
    },
  });

  return NextResponse.json({ ok: true, row });
}
