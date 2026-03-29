import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const companyId = req.nextUrl.searchParams.get("companyId");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const summary = req.nextUrl.searchParams.get("summary") === "true";

  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const where: any = { companyId };
  if (from || to) {
    where.invoiceDate = {};
    if (from) where.invoiceDate.gte = new Date(from);
    if (to) where.invoiceDate.lte = new Date(to);
  }

  if (summary) {
    const costs = await prisma.shippingCost.findMany({ where, select: { amount: true, invoiceDate: true } });
    const total = costs.reduce((sum, c) => sum + Number(c.amount), 0);
    const byMonth: Record<string, { total: number; count: number }> = {};
    for (const c of costs) {
      const month = c.invoiceDate.toISOString().slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { total: 0, count: 0 };
      byMonth[month].total += Number(c.amount);
      byMonth[month].count++;
    }
    return NextResponse.json({
      total: Math.round(total * 100) / 100,
      count: costs.length,
      byMonth: Object.entries(byMonth)
        .map(([month, data]) => ({ month, total: Math.round(data.total * 100) / 100, count: data.count }))
        .sort((a, b) => b.month.localeCompare(a.month)),
    });
  }

  const costs = await prisma.shippingCost.findMany({
    where,
    include: { order: { select: { orderNumber: true } } },
    orderBy: { invoiceDate: "desc" },
  });

  return NextResponse.json(costs);
}
