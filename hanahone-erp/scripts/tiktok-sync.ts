/**
 * TikTok Shop 주문 동기화 — 셀러 Orders API가 정본(CGETC 3PL 피드 대체).
 * 증분은 갱신 시각 기준이라 출고·취소가 사후에 붙어도 따라잡는다.
 * Usage: npx tsx scripts/tiktok-sync.ts [--since=YYYY-MM-DD | --full]
 */
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/integrations/sync-runner";
import { tiktokConnector } from "@/lib/integrations/connectors/tiktok";

async function main() {
  const full = process.argv.includes("--full");
  const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.slice(8);

  const config = await prisma.integrationConfig.findFirst({
    where: { platform: "TIKTOK", isActive: true },
  });
  if (!config) {
    console.error("활성 TIKTOK 연동이 없습니다. 먼저 scripts/tiktok-setup.ts를 실행하세요.");
    process.exit(1);
  }

  if (full || sinceArg) {
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { lastSyncAt: sinceArg ? new Date(`${sinceArg}T00:00:00Z`) : null },
    });
    console.log(`[i] 조회 시작점 = ${sinceArg ?? "전체(null)"}`);
  }

  console.log(`[${new Date().toISOString()}] TikTok 주문 동기화 시작`);
  const result = await runSync(tiktokConnector, config.companyId);
  console.log(`주문 ${result.recordsProcessed}건 처리, ${result.recordsFailed}건 실패`);
  if (result.errorMessage) console.warn("sync error:", result.errorMessage);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
