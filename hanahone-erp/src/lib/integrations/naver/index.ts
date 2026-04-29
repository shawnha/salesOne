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
  const liveSkus = new Set(inventoryData.map((i) => i.sku));

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

  // Drop rows for products that disappeared from Naver (e.g. seller deleted
  // them in 스마트스토어센터). Without this, stale rows linger as fake
  // inventory forever — the upsert above never touches them.
  const existing = await prisma.externalInventory.findMany({
    where: { companyId, platform: "NAVER" },
    select: { externalSku: true },
  });
  const stale = existing.filter((e) => !liveSkus.has(e.externalSku)).map((e) => e.externalSku);
  if (stale.length > 0) {
    await prisma.externalInventory.deleteMany({
      where: {
        companyId,
        platform: "NAVER",
        externalSku: { in: stale },
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
    companyId?: string,
  ): Promise<ExternalOrderData[]> {
    return fetchNaverOrders(credentials, since, companyId);
  },

  syncInventory: syncNaverInventory,
};
