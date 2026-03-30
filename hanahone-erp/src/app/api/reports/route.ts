import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireCompanyAccess } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "sales-by-period";
  const companyId = req.nextUrl.searchParams.get("company");
  const format = req.nextUrl.searchParams.get("format") || "json";

  if (companyId) {
    const { error } = await requireCompanyAccess(companyId);
    if (error) return error;
  } else {
    const { error } = await requireAuth();
    if (error) return error;
  }

  const companyFilter = companyId ? { companyId } : {};

  let data: any;

  switch (type) {
    case "sales-by-period": {
      const orders = await prisma.order.findMany({
        where: { ...companyFilter, type: { in: ["SALE", "BROKERAGE"] } },
        select: { orderDate: true, totalAmount: true, type: true, company: { select: { name: true } } },
        orderBy: { orderDate: "desc" },
      });
      data = orders;
      break;
    }
    case "top-products": {
      const items = await prisma.orderItem.findMany({
        where: { order: { ...companyFilter, type: { in: ["SALE", "BROKERAGE"] } } },
        include: { product: { select: { name: true, sku: true } } },
      });
      const productMap = new Map<string, { name: string; sku: string; revenue: number; volume: number }>();
      for (const item of items) {
        const key = item.productId;
        const existing = productMap.get(key) || { name: item.product.name, sku: item.product.sku, revenue: 0, volume: 0 };
        existing.revenue += Number(item.subtotal);
        existing.volume += item.quantity;
        productMap.set(key, existing);
      }
      data = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
      break;
    }
    case "order-fulfillment": {
      const total = await prisma.order.count({ where: { ...companyFilter, type: "SALE" } });
      const delivered = await prisma.order.count({ where: { ...companyFilter, type: "SALE", fulfillmentStatus: "DELIVERED" } });
      data = { total, delivered, rate: total > 0 ? ((delivered / total) * 100).toFixed(1) : "0" };
      break;
    }
    case "inventory-levels": {
      data = await prisma.inventory.findMany({
        where: companyFilter,
        include: { product: { select: { name: true, sku: true, costPrice: true } }, company: { select: { name: true } } },
        orderBy: { quantity: "asc" },
      });
      break;
    }
    case "customer-breakdown": {
      const customers = await prisma.customer.findMany({
        where: companyFilter,
        include: {
          orders: { where: { type: "SALE" }, select: { totalAmount: true } },
          company: { select: { name: true } },
        },
      });
      data = customers.map((c) => ({
        name: c.name,
        type: c.type,
        company: c.company.name,
        orderCount: c.orders.length,
        totalRevenue: c.orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      })).sort((a, b) => b.totalRevenue - a.totalRevenue);
      break;
    }
    case "production-efficiency": {
      data = await prisma.productionOrder.findMany({
        where: { ...companyFilter, status: "COMPLETED" },
        include: { product: { select: { name: true } } },
      });
      break;
    }
    case "consulting-revenue": {
      data = await prisma.consultingEngagement.findMany({
        where: companyFilter,
        include: { customer: { select: { name: true } } },
        orderBy: { billingAmount: "desc" },
      });
      break;
    }
    case "brokerage-margins": {
      data = await prisma.order.findMany({
        where: { ...companyFilter, type: "BROKERAGE" },
        select: { orderNumber: true, totalAmount: true, costAmount: true, marginAmount: true, orderDate: true, onBehalfOfCustomer: { select: { name: true } } },
        orderBy: { orderDate: "desc" },
      });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  if (format === "csv") {
    if (!Array.isArray(data)) data = [data];
    if (data.length === 0) return new NextResponse("No data", { status: 200, headers: { "Content-Type": "text/csv" } });
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map((row: any) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(","))].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${type}.csv"` } });
  }

  return NextResponse.json(data);
}
