import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchPartnerDetails } from "@/lib/integrations/connectors/cgetc-partners";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { companyId } = await req.json();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_platform: { companyId, platform: "CGETC" } },
  });
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "CGETC integration not active" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(config.credentials));

  // Find CGETC orders with partner IDs in rawData
  const externalOrders = await prisma.externalOrder.findMany({
    where: { companyId, platform: "CGETC", status: "MAPPED", mappedOrderId: { not: null } },
    select: { mappedOrderId: true, rawData: true },
    take: 500,
  });

  // Extract unique partner IDs from rawData
  const partnerIdToOrderIds = new Map<number, string[]>();
  for (const eo of externalOrders) {
    const raw = eo.rawData as any;
    const partnerId = raw?.shippingId || raw?.customerId;
    if (partnerId && eo.mappedOrderId) {
      const existing = partnerIdToOrderIds.get(partnerId) || [];
      existing.push(eo.mappedOrderId);
      partnerIdToOrderIds.set(partnerId, existing);
    }
  }

  if (partnerIdToOrderIds.size === 0) {
    return NextResponse.json({ updated: 0, message: "No partner IDs found" });
  }

  // Fetch partner details via res.partner API (replaces portal scraping)
  const partnerDetails = await fetchPartnerDetails(credentials, Array.from(partnerIdToOrderIds.keys()));

  // Update customers
  let updated = 0;
  for (const [partnerId, orderIds] of Array.from(partnerIdToOrderIds.entries())) {
    const contact = partnerDetails.get(partnerId);
    if (!contact) continue;

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, customerId: { not: null } },
      select: { customerId: true },
    });

    const customerIds = Array.from(new Set(orders.map((o) => o.customerId).filter(Boolean))) as string[];

    for (const customerId of customerIds) {
      const contactInfo: Record<string, string> = {};
      if (contact.address) contactInfo.address = contact.address;
      if (contact.city) contactInfo.city = contact.city;
      if (contact.state) contactInfo.state = contact.state;
      if (contact.zip) contactInfo.zip = contact.zip;
      if (contact.phone) contactInfo.phone = contact.phone;

      if (Object.keys(contactInfo).length === 0 && !contact.email) continue;

      await prisma.customer.update({
        where: { id: customerId },
        data: {
          ...(contact.email ? { email: contact.email } : {}),
          ...(Object.keys(contactInfo).length > 0 ? { contactInfo } : {}),
        },
      });
      updated++;
    }
  }

  return NextResponse.json({ updated, total: partnerIdToOrderIds.size });
}
