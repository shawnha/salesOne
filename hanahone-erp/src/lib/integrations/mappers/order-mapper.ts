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

async function findOrCreateCustomer(
  companyId: string,
  name?: string,
  email?: string,
) {
  if (!name && !email) return null;

  // Try email match first (most reliable identifier)
  if (email) {
    const existing = await prisma.customer.findFirst({
      where: { email, companyId },
    });
    if (existing) return existing.id;
  }

  const customerName = name || "Unknown";

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
    },
  });
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

  const customerId = await findOrCreateCustomer(
    companyId,
    extOrder.customerName,
    extOrder.customerEmail,
  );

  const resolvedItems = await Promise.all(
    extOrder.items.map(async (item) => {
      const product = item.sku
        ? await prisma.product.findFirst({ where: { sku: item.sku, companyId } })
        : null;
      return {
        productId: product?.id || null,
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
        type: OrderType.SALE,
        fulfillmentStatus,
        financialStatus,
        totalAmount: total,
        refundAmount: refund > 0 ? refund : null,
        netAmount: net,
        costAmount: extOrder.costAmount,
        marginAmount: extOrder.marginAmount,
        orderDate: new Date(extOrder.orderDate),
        deliveredAt: fulfillmentStatus === "DELIVERED" ? new Date(extOrder.orderDate) : null,
        externalSource: platform,
        externalOrderNumber: extOrder.externalOrderNumber,
        notes: extOrder.channelNote || null,
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
