/**
 * Monthly Excel export. One workbook with three sheets:
 *   1. 요약    — per-company KPIs for the period
 *   2. 주문    — every order in the period (one row each)
 *   3. 베스트  — top 20 products by quantity
 *
 * Usage: GET /api/reports/monthly-export?year=2026&month=4&company=<uuid>
 *        company is optional — omit to get all companies.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month")); // 1-12
  const companyId = req.nextUrl.searchParams.get("company");

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "year must be 2020–2100" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "month must be 1–12" }, { status: 400 });
  }

  if (companyId) {
    const { error } = await requireCompanyAccess(companyId);
    if (error) return error;
  } else {
    const { error } = await requireAuth();
    if (error) return error;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const companyFilter: any = companyId ? { companyId } : {};
  const dateFilter = { orderDate: { gte: start, lt: end } };

  const [orders, items, companies] = await Promise.all([
    prisma.order.findMany({
      where: { ...companyFilter, ...dateFilter },
      include: { company: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { orderDate: "asc" },
    }),
    prisma.orderItem.findMany({
      where: { order: { ...companyFilter, ...dateFilter, type: { notIn: ["SEEDING", "GIFT", "INTER_COMPANY"] } } },
      select: { quantity: true, subtotal: true, product: { select: { name: true, sku: true } } },
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);

  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  // Sheet 1: 요약 — per-company KPIs
  const summaryByCompany = new Map<string, {
    totalOrders: number;
    sales: number;
    paidSales: number;
    revenue: number;
    refund: number;
    commission: number;
    settlement: number;
    seeding: number;
    gift: number;
  }>();
  for (const o of orders) {
    const c = summaryByCompany.get(o.companyId) || {
      totalOrders: 0, sales: 0, paidSales: 0, revenue: 0, refund: 0,
      commission: 0, settlement: 0, seeding: 0, gift: 0,
    };
    c.totalOrders++;
    if (o.type === "SALE") c.sales++;
    if (o.financialStatus === "PAID") c.paidSales++;
    if (o.type === "SALE") c.revenue += Number(o.netAmount ?? o.totalAmount);
    c.refund += Number(o.refundAmount ?? 0);
    c.commission += Number(o.commissionAmount ?? 0);
    c.settlement += Number(o.settlementAmount ?? 0);
    if (o.type === "SEEDING") c.seeding++;
    if (o.type === "GIFT") c.gift++;
    summaryByCompany.set(o.companyId, c);
  }
  const summaryRows = Array.from(summaryByCompany.entries()).map(([cid, d]) => ({
    회사: companyName.get(cid) ?? cid,
    "전체 주문": d.totalOrders,
    "판매 주문": d.sales,
    "결제 완료": d.paidSales,
    "순매출": Math.round(d.revenue),
    "환불": Math.round(d.refund),
    "수수료": Math.round(d.commission),
    "예상 정산": Math.round(d.settlement),
    "시딩": d.seeding,
    "기프트": d.gift,
  }));

  // Sheet 2: 주문 — flat order list
  const orderRows = orders.map((o) => ({
    "주문일": o.orderDate.toISOString().slice(0, 10),
    "회사": o.company.name,
    "주문번호": o.externalOrderNumber || o.orderNumber,
    "채널": o.externalSource ?? "Manual",
    "유형": o.type,
    "고객": o.customer?.name ?? "",
    "수령인": o.recipientName ?? "",
    "전화": o.recipientPhone ?? "",
    "주소": o.shippingAddress ?? "",
    "이행상태": o.fulfillmentStatus,
    "결제상태": o.financialStatus,
    "총액": Number(o.totalAmount),
    "환불": Number(o.refundAmount ?? 0),
    "순금액": Number(o.netAmount ?? o.totalAmount),
    "수수료": Number(o.commissionAmount ?? 0),
    "예상정산": Number(o.settlementAmount ?? 0),
    "운송장": o.trackingNumber ?? "",
    "택배사": o.trackingCarrier ?? "",
    "메모": o.notes ?? "",
  }));

  // Sheet 3: 베스트 — top 20 products
  const productCounts = new Map<string, { name: string; sku: string; qty: number; revenue: number }>();
  for (const it of items) {
    const key = it.product.sku;
    const c = productCounts.get(key) || { name: it.product.name, sku: it.product.sku, qty: 0, revenue: 0 };
    c.qty += it.quantity;
    c.revenue += Number(it.subtotal);
    productCounts.set(key, c);
  }
  const bestRows = Array.from(productCounts.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 20)
    .map((d, i) => ({
      "순위": i + 1,
      "상품": d.name,
      "SKU": d.sku,
      "판매량": d.qty,
      "매출": Math.round(d.revenue),
    }));

  // Build workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "요약");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), "주문");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bestRows), "베스트");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `hanahone-${year}-${String(month).padStart(2, "0")}${companyId ? "-" + (companyName.get(companyId) ?? companyId).toLowerCase() : ""}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
