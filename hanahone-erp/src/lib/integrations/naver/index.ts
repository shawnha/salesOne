import type { Connector, ExternalOrderData } from "../types";
import type { NaverCredentials } from "./types";
import { fetchNaverOrders } from "./orders";
import { fetchNaverInventory } from "./products";
import { prisma } from "@/lib/prisma";

async function syncNaverInventory(
  credentials: NaverCredentials,
  companyId: string,
): Promise<void> {
  const inventoryData = await fetchNaverInventory(credentials);
  const now = new Date();

  for (const item of inventoryData) {
    await prisma.externalInventory.upsert({
      where: {
        companyId_platform_externalSku: {
          companyId,
          platform: "NAVER",
          externalSku: item.sku,
        },
      },
      update: {
        externalName: item.productName,
        quantity: item.quantity,
        lastSyncAt: now,
      },
      create: {
        companyId,
        platform: "NAVER",
        externalSku: item.sku,
        externalName: item.productName,
        quantity: item.quantity,
        lastSyncAt: now,
      },
    });
  }
}

export const naverConnector: Connector & {
  syncInventory: (credentials: NaverCredentials, companyId: string) => Promise<void>;
} = {
  platform: "NAVER",

  async fetchOrders(
    credentials: NaverCredentials,
    since: Date | null,
  ): Promise<ExternalOrderData[]> {
    return fetchNaverOrders(credentials, since);
  },

  syncInventory: syncNaverInventory,
};
