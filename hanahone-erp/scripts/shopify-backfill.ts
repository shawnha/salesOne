/**
 * Shopify 1회 풀백필 — created_at_min → updated_at_min 교정 후, 이미 수집된 주문의
 * 출고·취소·환불 갱신을 한 번에 회수한다. lastSyncAt을 비우고 전 주문을 재조회.
 * 멱등(재고 차감은 refKey 가드, 주문 업데이트는 변경분만). Usage: npx tsx scripts/shopify-backfill.ts
 */
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { shopifyConnector } from "@/lib/integrations/connectors/shopify";

async function main() {
  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "SHOPIFY", isActive: true },
  });
  if (!config) {
    console.error("No active SHOPIFY integration found");
    process.exit(1);
  }

  console.log(`[백필] lastSyncAt ${config.lastSyncAt?.toISOString() ?? "null"} → null (전 주문 재조회)`);
  await prisma.integrationConfig.update({
    where: { id: config.id },
    data: { lastSyncAt: null },
  });

  const result = await runSync(shopifyConnector, config.companyId);
  console.log(`[백필] 주문 ${result.recordsProcessed}건 처리, ${result.recordsFailed}건 실패`);
  if (result.errorMessage) console.warn("sync error:", result.errorMessage);

  const after = await prisma.integrationConfig.findUnique({ where: { id: config.id } });
  console.log(`[백필] lastSyncAt 복원 = ${after?.lastSyncAt?.toISOString() ?? "null"}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
