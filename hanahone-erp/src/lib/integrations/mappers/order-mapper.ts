import { prisma } from "@/lib/prisma";
import { Platform, OrderStatus, OrderType } from "@prisma/client";
import { generateOrderNumber } from "@/lib/order-number";
import type { ExternalOrderData, ExternalOrderItemData } from "../types";

const STATUS_MAP: Record<string, OrderStatus> = {
  paid: "PROCESSING",
  processing: "PROCESSING",
  shipped: "SHIPPED",
  fulfilled: "SHIPPED",
  delivered: "DELIVERED",
  completed: "DELIVERED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  refunded: "CANCELLED",
  unfulfilled: "PENDING",
  pending: "PENDING",
};

export function mapStatusToOrderStatus(status: string): OrderStatus {
  return STATUS_MAP[status.toLowerCase()] || "PENDING";
}

export function calculateOrderTotal(items: ExternalOrderItemData[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export async function mapExternalOrder(
  extOrder: ExternalOrderData,
  companyId: string,
  platform: Platform,
) {
  const total = extOrder.totalAmount || calculateOrderTotal(extOrder.items);

  const resolvedItems = await Promise.all(
    extOrder.items.map(async (item) => {
      const product = await prisma.product.findFirst({ where: { sku: item.sku, companyId } });
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
        type: OrderType.SALE,
        status: mapStatusToOrderStatus(extOrder.status),
        totalAmount: total,
        costAmount: extOrder.costAmount,
        marginAmount: extOrder.marginAmount,
        orderDate: new Date(extOrder.orderDate),
        externalSource: platform,
        items: {
          create: validItems.map((item) => ({
            productId: item.productId!,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        },
      },
    });
  });

  return order;
}
