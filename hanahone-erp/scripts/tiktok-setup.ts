/**
 * 틱톡 Orders API 연동 1회 셋업 — 자격증명 등록 + 기존 CGETC 주문 연결(중복 방지).
 *
 * ①integration_configs에 TIKTOK 행 생성/갱신(앱키·시크릿·tokens.json 경로를 암호화 저장)
 * ②이미 CGETC 경로로 들어온 틱톡 주문에 대해 (TIKTOK, 틱톡주문ID) external_orders 행을 추가하고
 *   같은 order를 가리키게 한다 → 다음 동기화가 새로 만들지 않고 기존 주문을 갱신한다.
 *   CGETC 원본 행은 그대로 둔다(3PL 출고 실측 기록 = 교차검증용).
 *
 * Usage: TIKTOK_APP_KEY=… TIKTOK_APP_SECRET=… npx tsx scripts/tiktok-setup.ts
 */
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/integrations/encryption";

const TOKENS_PATH = "/Users/admin/Desktop/claude/hanahone-erp/worker/tiktok-finance/tokens.json";

async function main() {
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("TIKTOK_APP_KEY / TIKTOK_APP_SECRET 환경변수가 필요합니다.");
    process.exit(1);
  }

  // HOI 회사 = 기존 Shopify 연동과 동일한 companyId
  const shopify = await prisma.integrationConfig.findFirst({ where: { platform: "SHOPIFY", isActive: true } });
  if (!shopify) {
    console.error("기준으로 삼을 SHOPIFY 연동을 찾지 못했습니다.");
    process.exit(1);
  }

  const credentials = encrypt(JSON.stringify({ appKey, appSecret, tokensPath: TOKENS_PATH }));
  const existing = await prisma.integrationConfig.findFirst({
    where: { companyId: shopify.companyId, platform: "TIKTOK" },
  });

  if (existing) {
    await prisma.integrationConfig.update({
      where: { id: existing.id },
      data: { credentials, isActive: true },
    });
    console.log(`[설정] TIKTOK 연동 갱신 (lastSyncAt=${existing.lastSyncAt?.toISOString() ?? "null"})`);
  } else {
    await prisma.integrationConfig.create({
      data: {
        companyId: shopify.companyId,
        platform: "TIKTOK",
        credentials,
        isActive: true,
        syncIntervalMinutes: 720,
      },
    });
    console.log("[설정] TIKTOK 연동 신규 생성");
  }

  // ② 기존 CGETC 경로 틱톡 주문 → (TIKTOK, 틱톡ID) 별칭 행 추가
  const cgetcRows = await prisma.externalOrder.findMany({
    where: { companyId: shopify.companyId, platform: "CGETC", mappedOrderId: { not: null } },
  });

  let linked = 0;
  let already = 0;
  for (const row of cgetcRows) {
    const raw = row.rawData as any;
    const ref: string = raw?.reference || raw?.origin || "";
    const m = String(ref).match(/(\d{15,20})/);
    if (!m) continue;
    const tiktokId = m[1];

    const dup = await prisma.externalOrder.findUnique({
      where: { platform_externalOrderId: { platform: "TIKTOK", externalOrderId: tiktokId } },
    });
    if (dup) {
      already++;
      continue;
    }

    await prisma.externalOrder.create({
      data: {
        companyId: row.companyId,
        platform: "TIKTOK",
        externalOrderId: tiktokId,
        rawData: { linked_from_cgetc: row.id, reference: ref },
        mappedOrderId: row.mappedOrderId,
        status: row.status,
      },
    });
    linked++;
  }

  console.log(`[연결] 기존 CGETC 틱톡 주문 → TIKTOK 키 별칭 ${linked}건 생성 (이미 있음 ${already}건)`);
  console.log("→ 다음 동기화는 이 주문들을 '갱신'하고, 없던 주문만 새로 만든다.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
