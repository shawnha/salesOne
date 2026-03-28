import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchCgetcOrderDetails } from "@/lib/integrations/connectors/cgetc";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId } = await req.json();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Get CGETC credentials
  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: "CGETC" } },
  });
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "CGETC integration not active" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(config.credentials));

  // Find CGETC orders that have mapped orders with customers lacking contact info
  const externalOrders = await prisma.externalOrder.findMany({
    where: {
      companyId,
      platform: "CGETC",
      status: "MAPPED",
      mappedOrderId: { not: null },
    },
    take: 500,
  });

  if (externalOrders.length === 0) {
    return NextResponse.json({ updated: 0, message: "No CGETC orders found" });
  }

  // Get mapped orders with customers that lack contact info
  const mappedOrderIds = externalOrders
    .map((eo) => eo.mappedOrderId)
    .filter((id): id is string => id !== null);

  const orders = await prisma.order.findMany({
    where: {
      id: { in: mappedOrderIds },
      customerId: { not: null },
      customer: { contactInfo: { equals: Prisma.DbNull } },
    },
    select: { id: true, customerId: true },
  });

  if (orders.length === 0) {
    return NextResponse.json({ updated: 0, message: "No customers need detail fetching" });
  }

  // Build customerId → externalOrderId map
  const orderToExternal = new Map<string, string>();
  for (const eo of externalOrders) {
    if (eo.mappedOrderId) orderToExternal.set(eo.mappedOrderId, eo.externalOrderId);
  }

  const customerOrderMap = new Map<string, string>(); // customerId → externalOrderId
  for (const o of orders) {
    if (o.customerId && !customerOrderMap.has(o.customerId)) {
      const extId = orderToExternal.get(o.id);
      if (extId) customerOrderMap.set(o.customerId, extId);
    }
  }

  // Batch fetch details from CGETC portal
  const orderIds = Array.from(customerOrderMap.values());
  const details = await fetchCgetcOrderDetails(credentials, orderIds);

  // Update customers with fetched contact info
  let updated = 0;
  for (const [customerId, externalOrderId] of Array.from(customerOrderMap.entries())) {
    const detail = details.get(externalOrderId);
    if (!detail) continue;

    const contactInfo: Record<string, string> = {};
    if (detail.address) contactInfo.address = detail.address;
    if (detail.city) contactInfo.city = detail.city;
    if (detail.state) contactInfo.state = detail.state;
    if (detail.zip) contactInfo.zip = detail.zip;
    if (detail.phone) contactInfo.phone = detail.phone;

    if (Object.keys(contactInfo).length === 0 && !detail.email) continue;

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(detail.email ? { email: detail.email } : {}),
        ...(Object.keys(contactInfo).length > 0 ? { contactInfo } : {}),
      },
    });
    updated++;
  }

  return NextResponse.json({ updated, total: customerOrderMap.size });
}
