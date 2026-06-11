/**
 * Compare OrderDesk's TIKTOK orders against our CGETC-sourced TIKTOK orders.
 *
 * Reads:
 *   ORDERDESK_STORE_ID, ORDERDESK_API_KEY  from .env.local
 *
 * Outputs:
 *   - Per-order diff: OrderDesk amount vs CGETC amount
 *   - Stats: how many match, how many differ, by how much
 *   - Orders only in OrderDesk (not in our DB) and vice versa
 *
 * Usage:  npx tsx scripts/compare-orderdesk-vs-cgetc.ts
 */
import { prisma } from "../src/lib/prisma";
import { orderdeskConnector } from "../src/lib/integrations/connectors/orderdesk";

const HOI = "69b44456-1369-4892-8a41-6760a8b13412";

async function main() {
  const storeId = process.env.ORDERDESK_STORE_ID;
  const apiKey = process.env.ORDERDESK_API_KEY;
  if (!storeId || !apiKey) {
    console.error("❌ Missing ORDERDESK_STORE_ID or ORDERDESK_API_KEY in .env.local");
    process.exit(1);
  }

  // 1. Pull OrderDesk orders (last 6 months should cover all 62 of our TIKTOK orders)
  const since = new Date();
  since.setMonth(since.getMonth() - 8);
  console.log(`📡 Fetching OrderDesk orders since ${since.toISOString().slice(0, 10)}...`);
  const odOrders = await orderdeskConnector.fetchOrders({ storeId, apiKey } as any, since);
  const odTiktok = odOrders.filter((o) => o.overridePlatform === "TIKTOK");
  console.log(`   OrderDesk total: ${odOrders.length}, TIKTOK: ${odTiktok.length}`);

  // 2. Pull our CGETC-sourced TIKTOK orders
  const ourTiktok = await prisma.externalOrder.findMany({
    where: {
      companyId: HOI,
      platform: "CGETC",
      mappedOrder: { externalSource: "TIKTOK" },
    },
    select: {
      rawData: true,
      mappedOrder: {
        select: {
          orderNumber: true,
          externalOrderNumber: true,
          totalAmount: true,
          orderDate: true,
          customer: { select: { name: true, email: true } },
        },
      },
    },
  });
  console.log(`   Our CGETC-TIKTOK: ${ourTiktok.length}`);

  // 3. Build lookup keys for matching. Try TTS# first, then customer-name+date
  // OrderDesk source_id should be the TTS order number
  const odByTts: Map<string, typeof odTiktok[0]> = new Map();
  const odByNameDate: Map<string, typeof odTiktok[0]> = new Map();
  for (const o of odTiktok) {
    const ttsId = o.externalOrderNumber || "";
    if (/^\d{15,20}$/.test(ttsId)) odByTts.set(ttsId, o);
    if (o.customerName && o.orderDate) {
      odByNameDate.set(
        `${o.customerName.toLowerCase().trim()}|${o.orderDate.toISOString().slice(0, 10)}`,
        o,
      );
    }
  }

  // 4. Match each of our orders against OrderDesk
  const matched: any[] = [];
  const onlyInOurs: any[] = [];

  for (const e of ourTiktok) {
    if (!e.mappedOrder) continue;
    const raw = e.rawData as any;
    const ref = String(raw?.reference || "");
    const m = ref.match(/(\d{15,20})/);
    const ttsId = m ? m[1] : "";

    const ourAmount = Number(e.mappedOrder.totalAmount);
    const ourDate = e.mappedOrder.orderDate.toISOString().slice(0, 10);
    const ourCustomer = e.mappedOrder.customer?.name || "";

    // Try matching by TTS#, fallback to customer-name+date
    let od = ttsId ? odByTts.get(ttsId) : undefined;
    let matchKind = "tts";
    if (!od && ourCustomer) {
      od = odByNameDate.get(`${ourCustomer.toLowerCase().trim()}|${ourDate}`);
      matchKind = "name+date";
    }

    if (od) {
      const odAmount = od.totalAmount;
      matched.push({
        cgetcSo: e.mappedOrder.externalOrderNumber,
        ttsId,
        date: ourDate,
        customer: ourCustomer,
        ourAmount,
        odAmount,
        diff: +(odAmount - ourAmount).toFixed(2),
        matchKind,
        odSourceId: od.externalOrderNumber,
      });
    } else {
      onlyInOurs.push({
        cgetcSo: e.mappedOrder.externalOrderNumber,
        ttsId: ttsId || "(no tts)",
        date: ourDate,
        customer: ourCustomer,
        ourAmount,
      });
    }
  }

  const matchedTtsIds = new Set(matched.filter((m) => m.matchKind === "tts").map((m) => m.ttsId));
  const matchedNameDates = new Set(
    matched
      .filter((m) => m.matchKind === "name+date")
      .map((m) => `${m.customer.toLowerCase().trim()}|${m.date}`),
  );
  const onlyInOd = odTiktok.filter((o) => {
    const tts = o.externalOrderNumber || "";
    if (/^\d{15,20}$/.test(tts) && matchedTtsIds.has(tts)) return false;
    const ndKey = o.customerName
      ? `${o.customerName.toLowerCase().trim()}|${o.orderDate.toISOString().slice(0, 10)}`
      : "";
    if (ndKey && matchedNameDates.has(ndKey)) return false;
    return true;
  });

  // 5. Report
  console.log("\n=== 매칭 결과 ===");
  console.log(`✅ 매칭됨:                ${matched.length}`);
  console.log(`📌 우리만 가진 주문:       ${onlyInOurs.length}`);
  console.log(`🆕 OrderDesk만 가진 주문:  ${onlyInOd.length}`);

  if (matched.length > 0) {
    const exact = matched.filter((m) => Math.abs(m.diff) < 0.01).length;
    const odHigher = matched.filter((m) => m.diff > 0.01).length;
    const odLower = matched.filter((m) => m.diff < -0.01).length;
    const sumDiff = matched.reduce((s, m) => s + m.diff, 0);
    const sumAbsDiff = matched.reduce((s, m) => s + Math.abs(m.diff), 0);
    console.log(`\n=== 금액 차이 분석 (${matched.length} 매칭 주문) ===`);
    console.log(`   정확히 일치:           ${exact} 건`);
    console.log(`   OrderDesk가 더 큼:      ${odHigher} 건`);
    console.log(`   OrderDesk가 더 작음:    ${odLower} 건`);
    console.log(`   누적 차이 (signed):    $${sumDiff.toFixed(2)}`);
    console.log(`   누적 차이 (절댓값):    $${sumAbsDiff.toFixed(2)}`);

    console.log("\n=== Top 10 큰 차이 ===");
    const sorted = [...matched].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10);
    for (const m of sorted) {
      console.log(
        `  ${m.cgetcSo} | ${m.date} | ${m.customer.padEnd(20)} | CGETC=$${m.ourAmount.toFixed(2)} OD=$${m.odAmount.toFixed(2)} diff=$${m.diff.toFixed(2)} (${m.matchKind})`,
      );
    }
  }

  if (onlyInOurs.length > 0) {
    console.log("\n=== 우리만 가진 주문 (top 10) ===");
    for (const o of onlyInOurs.slice(0, 10)) {
      console.log(`  ${o.cgetcSo} | ${o.date} | ${o.customer.padEnd(20)} | $${o.ourAmount.toFixed(2)} | tts=${o.ttsId}`);
    }
  }

  if (onlyInOd.length > 0) {
    console.log("\n=== OrderDesk만 가진 주문 (top 10) ===");
    for (const o of onlyInOd.slice(0, 10)) {
      console.log(
        `  ${o.externalOrderNumber} | ${o.orderDate.toISOString().slice(0, 10)} | ${(o.customerName || "").padEnd(20)} | $${o.totalAmount.toFixed(2)}`,
      );
    }
  }

  // Write detailed CSV
  const fs = require("fs");
  const csv =
    "match_kind,cgetc_so,tts_id,date,customer,cgetc_amount,orderdesk_amount,diff\n" +
    matched
      .map(
        (m) =>
          `${m.matchKind},${m.cgetcSo},${m.ttsId},${m.date},"${m.customer}",${m.ourAmount.toFixed(2)},${m.odAmount.toFixed(2)},${m.diff.toFixed(2)}`,
      )
      .join("\n");
  fs.writeFileSync("/tmp/orderdesk-vs-cgetc-diff.csv", csv);
  console.log("\n📄 상세 결과 저장: /tmp/orderdesk-vs-cgetc-diff.csv");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
