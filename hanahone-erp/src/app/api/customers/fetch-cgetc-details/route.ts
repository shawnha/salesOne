import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/api-guard";
import { decrypt } from "@/lib/integrations/encryption";
import { fetchPartnerDetails } from "@/lib/integrations/connectors/cgetc-partners";
import { z } from "zod";

const FetchDetailsSchema = z.object({
  companyId: z.string().uuid(),
  platform: z.enum(["CGETC", "NAVER"]).optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const parsed = FetchDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, platform } = parsed.data;

  const { error } = await requireCompanyAccess(companyId);
  if (error) return error;

  // Naver: extract contacts from stored rawData
  if (platform === "NAVER") {
    const naverOrders = await prisma.externalOrder.findMany({
      where: { companyId, platform: "NAVER" },
      select: { rawData: true, mappedOrder: { select: { customerId: true } } },
    });

    const customerData = new Map<string, { phone?: string; address?: string; naverId?: string }>();
    for (const eo of naverOrders) {
      const customerId = eo.mappedOrder?.customerId;
      if (!customerId) continue;
      const rawData = eo.rawData as any;
      const order = rawData?.order;
      const addr = rawData?.productOrder?.shippingAddress;
      if (!order && !addr) continue;

      const existing = customerData.get(customerId) || {};
      if (order?.ordererTel && !order.ordererTel.includes("*") && !existing.phone) {
        existing.phone = order.ordererTel;
      }
      if (addr?.baseAddress && !addr.baseAddress.includes("*") && !existing.address) {
        existing.address = [addr.baseAddress, addr.detailAddress].filter(Boolean).join(" ");
      }
      if (order?.ordererId && !existing.naverId) {
        existing.naverId = order.ordererId;
      }
      customerData.set(customerId, existing);
    }

    let updated = 0;
    for (const [customerId, newData] of Array.from(customerData.entries())) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { contactInfo: true } });
      if (!customer) continue;
      const existingInfo = (customer.contactInfo as Record<string, string> | null) || {};
      const merged = { ...existingInfo };
      let changed = false;
      if (newData.phone && !existingInfo.phone) { merged.phone = newData.phone; changed = true; }
      if (newData.address && !existingInfo.address) { merged.address = newData.address; changed = true; }
      if (newData.naverId && !existingInfo.naverId) { merged.naverId = newData.naverId; changed = true; }
      if (changed) {
        await prisma.customer.update({ where: { id: customerId }, data: { contactInfo: merged } });
        updated++;
      }
    }

    return NextResponse.json({ updated, total: customerData.size });
  }

  // CGETC flow (default)
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
