import { prisma } from "@/lib/prisma";
import { Platform, FulfillmentStatus, FinancialStatus, OrderType } from "@prisma/client";
import { generateOrderNumber } from "@/lib/order-number";
import type { ExternalOrderData } from "../types";

const FULFILLMENT_MAP: Record<string, FulfillmentStatus> = {
  UNFULFILLED: "UNFULFILLED",
  PARTIALLY_FULFILLED: "PARTIALLY_FULFILLED",
  FULFILLED: "FULFILLED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const FINANCIAL_MAP: Record<string, FinancialStatus> = {
  PENDING: "PENDING",
  PAID: "PAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  VOIDED: "VOIDED",
};

export function mapFulfillmentStatus(status: string): FulfillmentStatus {
  return FULFILLMENT_MAP[status] || "UNFULFILLED";
}

export function mapFinancialStatus(status: string): FinancialStatus {
  return FINANCIAL_MAP[status] || "PENDING";
}

interface CustomerContactData {
  phone?: string;
  address?: string;
  zipCode?: string;
  naverId?: string;
}

async function findOrCreateCustomer(
  companyId: string,
  name?: string,
  email?: string,
  contact?: CustomerContactData,
) {
  if (!name && !email) return null;

  // Try email match first (most reliable identifier)
  if (email) {
    const existing = await prisma.customer.findFirst({
      where: { email, companyId },
    });
    if (existing) {
      // Merge contact info if we have new data
      if (contact) {
        const existing_info = (existing.contactInfo as Record<string, string> | null) || {};
        const merged = { ...existing_info };
        if (contact.phone && !existing_info.phone) merged.phone = contact.phone;
        if (contact.address && !existing_info.address) merged.address = contact.address;
        if (contact.zipCode && !existing_info.zip) merged.zip = contact.zipCode;
        if (contact.naverId && !existing_info.naverId) merged.naverId = contact.naverId;
        if (Object.keys(merged).length > Object.keys(existing_info).length) {
          await prisma.customer.update({
            where: { id: existing.id },
            data: { contactInfo: merged },
          });
        }
      }
      return existing.id;
    }
  }

  const customerName = name || "Unknown";

  // Build contactInfo from available data
  const contactInfo: Record<string, string> = {};
  if (contact?.phone) contactInfo.phone = contact.phone;
  if (contact?.address) contactInfo.address = contact.address;
  if (contact?.zipCode) contactInfo.zip = contact.zipCode;
  if (contact?.naverId) contactInfo.naverId = contact.naverId;
  const hasContactInfo = Object.keys(contactInfo).length > 0;

  // Upsert by unique (name, companyId) to prevent duplicates
  const customer = await prisma.customer.upsert({
    where: {
      name_companyId: { name: customerName, companyId },
    },
    update: {
      ...(email ? { email } : {}),
    },
    create: {
      companyId,
      name: customerName,
      email: email || null,
      type: "INDIVIDUAL",
      ...(hasContactInfo ? { contactInfo } : {}),
    },
  });

  // For update case: merge contactInfo without overwriting existing values
  if (hasContactInfo) {
    const existing_info = (customer.contactInfo as Record<string, string> | null) || {};
    const merged = { ...existing_info };
    if (contact?.phone && !existing_info.phone) merged.phone = contact.phone;
    if (contact?.address && !existing_info.address) merged.address = contact.address;
    if (contact?.zipCode && !existing_info.zip) merged.zip = contact.zipCode;
    if (contact?.naverId && !existing_info.naverId) merged.naverId = contact.naverId;
    if (Object.keys(merged).length > Object.keys(existing_info).length) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { contactInfo: merged },
      });
    }
  }

  return customer.id;
}

export async function mapExternalOrder(
  extOrder: ExternalOrderData,
  companyId: string,
  platform: Platform,
) {
  const total = extOrder.totalAmount;
  const refund = extOrder.refundAmount || 0;
  const net = total - refund;

  const fulfillmentStatus = mapFulfillmentStatus(extOrder.fulfillmentStatus);
  const financialStatus = mapFinancialStatus(extOrder.financialStatus);

  // Extract naverId from Naver rawData if available
  const naverId = extOrder.rawData?.order?.ordererId || undefined;

  const customerId = await findOrCreateCustomer(
    companyId,
    extOrder.customerName,
    extOrder.customerEmail,
    {
      phone: extOrder.customerPhone || extOrder.recipientPhone,
      address: extOrder.shippingAddress,
      zipCode: extOrder.rawData?.productOrder?.shippingAddress?.zipCode,
      naverId,
    },
  );

  const resolvedItems = await Promise.all(
    extOrder.items.map(async (item) => {
      let productId: string | null = null;

      if (item.sku) {
        // 1. Try SkuMapping first (handles Naver channel product IDs → internal SKUs)
        const mapping = await prisma.skuMapping.findUnique({
          where: {
            companyId_platform_externalSku: {
              companyId,
              platform,
              externalSku: item.sku,
            },
          },
        });
        if (mapping?.productId) {
          productId = mapping.productId;
        } else {
          // 2. Fall back to direct Product.sku match
          const product = await prisma.product.findFirst({
            where: { sku: item.sku, companyId },
          });
          productId = product?.id || null;
        }
      }

      return {
        productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      };
    })
  );

  const validItems = resolvedItems.filter((item) => item.productId !== null);

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(companyId, tx);

    return tx.order.create({
      data: {
        orderNumber,
        companyId,
        customerId,
        type: (extOrder.orderType as OrderType) || OrderType.SALE,
        fulfillmentStatus,
        financialStatus,
        totalAmount: total,
        refundAmount: refund > 0 ? refund : null,
        netAmount: net,
        costAmount: extOrder.costAmount,
        marginAmount: extOrder.marginAmount,
        orderDate: new Date(extOrder.orderDate),
        deliveredAt: fulfillmentStatus === "DELIVERED"
          ? new Date(extOrder.rawData?.delivery?.deliveredDate || extOrder.orderDate)
          : null,
        externalSource: platform,
        externalOrderNumber: extOrder.externalOrderNumber,
        notes: extOrder.channelNote || null,
        shippingAddress: extOrder.shippingAddress || null,
        recipientName: extOrder.recipientName || null,
        recipientPhone: extOrder.recipientPhone || null,
        settlementAmount: extOrder.settlementAmount ?? null,
        commissionAmount: extOrder.commissionAmount ?? null,
        items: validItems.length > 0 ? {
          create: validItems.map((item) => ({
            productId: item.productId!,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        } : undefined,
      },
    });
  });

  return order;
}
