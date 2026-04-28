import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/notifications/telegram";

type CommandHandler = (args: string) => Promise<string>;

const commands: Record<string, CommandHandler> = {
  재고: handleInventory,
  주문: handleOrders,
  매출: handleSales,
  오늘: handleToday,
  베스트: handleBestsellers,
  동기화: handleSyncStatus,
  정산: handleSettlement,
  수수료: handleCommission,
  도움말: handleHelp,
  help: handleHelp,
};

export async function handleTelegramMessage(text: string): Promise<void> {
  const trimmed = text.trim();

  // Match command (first word)
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  const args = trimmed.slice(firstWord.length).trim();

  // Direct command match
  const handler = commands[firstWord];
  if (handler) {
    const response = await handler(args);
    await sendTelegram("", response);
    return;
  }

  // Try keyword matching
  if (trimmed.includes("재고")) {
    const response = await handleInventory(trimmed);
    await sendTelegram("", response);
    return;
  }
  if (trimmed.includes("주문")) {
    const response = await handleOrders(trimmed);
    await sendTelegram("", response);
    return;
  }
  if (trimmed.includes("매출")) {
    const response = await handleSales(trimmed);
    await sendTelegram("", response);
    return;
  }

  // Unknown command
  const response = await handleHelp("");
  await sendTelegram("", response);
}

async function resolveCompany(args: string): Promise<{ id: string; name: string } | null> {
  const upper = args.toUpperCase();
  if (upper.includes("HOI")) return prisma.company.findFirst({ where: { name: { contains: "HOI" } }, select: { id: true, name: true } });
  if (upper.includes("HOK")) return prisma.company.findFirst({ where: { name: { contains: "HOK" } }, select: { id: true, name: true } });
  if (upper.includes("HOR")) return prisma.company.findFirst({ where: { name: { contains: "HOR" } }, select: { id: true, name: true } });
  return null; // all companies
}

async function handleInventory(args: string): Promise<string> {
  const company = await resolveCompany(args);

  if (company) {
    // Specific company
    const baselines = await prisma.inventoryBaseline.findMany({ where: { companyId: company.id } });
    const inventories = await prisma.inventory.findMany({
      where: { companyId: company.id },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { quantity: "asc" },
    });

    const lines = [`[${company.name} 재고]`];

    if (baselines.length > 0) {
      lines.push("--- Baseline ---");
      for (const b of baselines) {
        lines.push(`${b.productName}: ${b.quantity.toLocaleString()}`);
      }
    }

    if (inventories.length > 0) {
      lines.push("--- On Hand ---");
      for (const inv of inventories.slice(0, 10)) {
        lines.push(`${inv.product.name}: ${inv.quantity.toLocaleString()}`);
      }
      if (inventories.length > 10) lines.push(`... 외 ${inventories.length - 10}건`);
    }

    return lines.join("\n");
  }

  // All companies summary
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const lines = ["[전체 재고 요약]"];
  for (const c of companies) {
    const count = await prisma.inventory.count({ where: { companyId: c.id } });
    lines.push(`${c.name}: ${count}개 상품`);
  }
  return lines.join("\n");
}

async function handleOrders(args: string): Promise<string> {
  const company = await resolveCompany(args);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const where: any = {
    orderDate: { gte: yesterday, lt: today },
  };
  if (company) where.companyId = company.id;

  const orders = await prisma.order.findMany({
    where,
    select: { companyId: true, totalAmount: true, financialStatus: true },
  });

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  // Group by company
  const byCompany = new Map<string, { count: number; total: number; paid: number }>();
  for (const o of orders) {
    const key = o.companyId;
    const current = byCompany.get(key) || { count: 0, total: 0, paid: 0 };
    current.count++;
    current.total += Number(o.totalAmount);
    if (o.financialStatus === "PAID") current.paid++;
    byCompany.set(key, current);
  }

  const lines = [`[어제 주문 (${yesterday.toLocaleDateString("ko-KR")})]`];
  if (byCompany.size === 0) {
    lines.push("주문 없음");
  } else {
    for (const [cid, data] of Array.from(byCompany)) {
      lines.push(`${companyMap.get(cid) || cid}: ${data.count}건 (결제완료 ${data.paid}건) / ${data.total.toLocaleString()}원`);
    }
  }
  return lines.join("\n");
}

async function handleSales(args: string): Promise<string> {
  const company = await resolveCompany(args);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const where: any = {
    orderDate: { gte: startOfMonth },
    financialStatus: "PAID",
    type: "SALE",
  };
  if (company) where.companyId = company.id;

  const orders = await prisma.order.findMany({
    where,
    select: { companyId: true, netAmount: true },
  });

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  const byCompany = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    const current = byCompany.get(o.companyId) || { count: 0, total: 0 };
    current.count++;
    current.total += Number(o.netAmount);
    byCompany.set(o.companyId, current);
  }

  const monthStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const lines = [`[${monthStr} 매출 MTD]`];
  if (byCompany.size === 0) {
    lines.push("매출 없음");
  } else {
    for (const [cid, data] of Array.from(byCompany)) {
      lines.push(`${companyMap.get(cid) || cid}: ${data.count}건 / ${data.total.toLocaleString()}원`);
    }
  }
  return lines.join("\n");
}

async function handleToday(args: string): Promise<string> {
  const company = await resolveCompany(args);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const where: any = {
    orderDate: { gte: start },
    type: "SALE",
  };
  if (company) where.companyId = company.id;

  const orders = await prisma.order.findMany({
    where,
    select: { companyId: true, netAmount: true, financialStatus: true, externalSource: true },
  });

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  const byCompany = new Map<string, { count: number; paid: number; total: number }>();
  for (const o of orders) {
    const c = byCompany.get(o.companyId) || { count: 0, paid: 0, total: 0 };
    c.count++;
    if (o.financialStatus === "PAID") c.paid++;
    c.total += Number(o.netAmount ?? 0);
    byCompany.set(o.companyId, c);
  }

  const lines = [`[오늘 매출 (${start.toLocaleDateString("ko-KR")})]`];
  if (byCompany.size === 0) {
    lines.push("주문 없음");
  } else {
    for (const [cid, d] of Array.from(byCompany)) {
      lines.push(`${companyMap.get(cid) || cid}: ${d.count}건 (결제 ${d.paid}) / ${Math.round(d.total).toLocaleString()}원`);
    }
  }
  return lines.join("\n");
}

async function handleBestsellers(args: string): Promise<string> {
  // Default 7d, support "베스트 30" for 30d
  const company = await resolveCompany(args);
  const m = args.match(/(\d+)/);
  const days = m ? Math.min(Number(m[1]), 90) : 7;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const where: any = {
    order: {
      orderDate: { gte: since },
      type: { notIn: ["SEEDING", "GIFT", "INTER_COMPANY"] },
    },
  };
  if (company) where.order.companyId = company.id;

  const items = await prisma.orderItem.findMany({
    where,
    select: {
      quantity: true,
      product: { select: { name: true, sku: true } },
    },
  });

  const counts = new Map<string, { name: string; qty: number }>();
  for (const it of items) {
    const key = it.product.sku;
    const c = counts.get(key) || { name: it.product.name, qty: 0 };
    c.qty += it.quantity;
    counts.set(key, c);
  }

  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10);

  const lines = [`[베스트셀러 ${days}일${company ? " · " + company.name : ""}]`];
  if (ranked.length === 0) {
    lines.push("판매 데이터 없음");
  } else {
    ranked.forEach(([sku, d], i) => {
      lines.push(`${i + 1}. ${d.name} (${sku}): ${d.qty}개`);
    });
  }
  return lines.join("\n");
}

async function handleSyncStatus(_args: string): Promise<string> {
  const configs = await prisma.integrationConfig.findMany({
    where: { isActive: true },
    select: { platform: true, lastSyncAt: true, companyId: true },
    orderBy: { lastSyncAt: "desc" },
  });

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  const lines = ["[동기화 상태]"];
  if (configs.length === 0) {
    lines.push("활성 채널 없음");
  } else {
    for (const c of configs) {
      const co = companyMap.get(c.companyId) ?? "?";
      if (!c.lastSyncAt) {
        lines.push(`${c.platform} (${co}): 한 번도 sync 안 됨`);
        continue;
      }
      const hours = (Date.now() - c.lastSyncAt.getTime()) / 3600000;
      const tag = hours > 26 ? "⚠️" : hours > 6 ? "🟡" : "✅";
      const ago = hours < 1 ? `${Math.round(hours * 60)}분` : `${Math.round(hours)}시간`;
      lines.push(`${tag} ${c.platform} (${co}): ${ago} 전`);
    }
  }
  return lines.join("\n");
}

async function handleSettlement(_args: string): Promise<string> {
  // Naver settlement reconciliation: expected (sum settlementAmount) vs actual (manual entry)
  const HOK_NAME = "HOK";
  const hok = await prisma.company.findFirst({ where: { name: HOK_NAME }, select: { id: true } });
  if (!hok) return "HOK 회사를 찾을 수 없습니다.";

  const orders = await prisma.order.findMany({
    where: { companyId: hok.id, externalSource: "NAVER", settlementAmount: { not: null } },
    select: { orderDate: true, settlementAmount: true },
  });

  const buckets = new Map<string, number>();
  for (const o of orders) {
    const ym = o.orderDate.toISOString().slice(0, 7);
    buckets.set(ym, (buckets.get(ym) ?? 0) + Number(o.settlementAmount ?? 0));
  }

  const recon = await prisma.settlementReconciliation.findMany({
    where: { companyId: hok.id, platform: "NAVER" },
  });
  const actualByYm = new Map<string, { actual: number | null; notes: string | null }>();
  for (const r of recon) {
    const ym = r.periodStart.toISOString().slice(0, 7);
    actualByYm.set(ym, { actual: r.actualAmount ? Number(r.actualAmount) : null, notes: r.notes });
  }

  const sortedYms = Array.from(buckets.keys()).sort().reverse().slice(0, 6);
  const lines = ["[네이버 정산 대사 (HOK)]"];
  for (const ym of sortedYms) {
    const expected = buckets.get(ym) ?? 0;
    const r = actualByYm.get(ym);
    const actual = r?.actual ?? null;
    if (actual === null) {
      lines.push(`${ym}  예상 ₩${Math.round(expected).toLocaleString()}  · 미입력`);
    } else {
      const variance = actual - expected;
      const tag = Math.abs(variance) < 1 ? "≈" : variance < 0 ? "▼" : "▲";
      lines.push(
        `${ym}  예상 ₩${Math.round(expected).toLocaleString()}  실제 ₩${Math.round(actual).toLocaleString()}  ${tag}${Math.round(Math.abs(variance)).toLocaleString()}`,
      );
    }
  }
  if (sortedYms.length === 0) lines.push("정산 데이터 없음");
  return lines.join("\n");
}

async function handleCommission(args: string): Promise<string> {
  const company = await resolveCompany(args);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const where: any = {
    orderDate: { gte: startOfMonth },
    type: "SALE",
    commissionAmount: { not: null },
  };
  if (company) where.companyId = company.id;

  const orders = await prisma.order.findMany({
    where,
    select: { companyId: true, externalSource: true, commissionAmount: true, totalAmount: true },
  });

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const cm = new Map(companies.map((c) => [c.id, c.name]));

  // Group by company × source
  const byKey = new Map<string, { count: number; commission: number; total: number }>();
  for (const o of orders) {
    const key = `${o.companyId}|${o.externalSource ?? "?"}`;
    const c = byKey.get(key) || { count: 0, commission: 0, total: 0 };
    c.count++;
    c.commission += Number(o.commissionAmount ?? 0);
    c.total += Number(o.totalAmount);
    byKey.set(key, c);
  }

  const monthStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const lines = [`[${monthStr} 수수료 MTD]`];
  if (byKey.size === 0) {
    lines.push("수수료 데이터 없음");
  } else {
    const rows = Array.from(byKey.entries())
      .map(([key, d]) => {
        const [cid, src] = key.split("|");
        const co = cm.get(cid) ?? "?";
        const rate = d.total > 0 ? ((d.commission / d.total) * 100).toFixed(1) : "0.0";
        return { co, src, count: d.count, commission: d.commission, rate };
      })
      .sort((a, b) => b.commission - a.commission);
    for (const r of rows) {
      // Pick currency by company (HOI=USD, others=KRW). For mixed Group totals fall back to ₩.
      const isUsd = r.co === "HOI";
      const symbol = isUsd ? "$" : "₩";
      const num = isUsd
        ? r.commission.toFixed(2)
        : Math.round(r.commission).toLocaleString();
      lines.push(`${r.co} ${r.src}: ${symbol}${num} (${r.rate}% / ${r.count}건)`);
    }
  }
  return lines.join("\n");
}

async function handleHelp(_args: string): Promise<string> {
  return [
    "[HanahOne ERP Bot]",
    "",
    "사용 가능한 명령어:",
    "- 재고 / 재고 HOK / 재고 HOI",
    "- 주문 (어제) / 주문 HOK",
    "- 매출 (이번 달) / 매출 HOI",
    "- 오늘 / 오늘 HOK — 오늘 매출 실시간",
    "- 베스트 / 베스트 30 / 베스트 HOK — 베스트셀러",
    "- 동기화 — 모든 채널 sync 상태",
    "- 정산 — 네이버 월별 정산 대사 (예상 vs 실제)",
    "- 수수료 [HOK] — 이번 달 채널별 수수료",
    "- 도움말",
    "",
    "회사명을 포함하면 해당 회사만 조회합니다.",
  ].join("\n");
}

/**
 * Generate daily summary report text
 */
export async function generateDailySummary(): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const lines = [`[일일 요약] ${dateStr}`, ""];

  for (const company of companies) {
    const orders = await prisma.order.findMany({
      where: {
        companyId: company.id,
        orderDate: { gte: yesterday, lt: today },
      },
      select: { totalAmount: true, netAmount: true, financialStatus: true, type: true },
    });

    const sales = orders.filter((o) => o.type === "SALE");
    const paidSales = sales.filter((o) => o.financialStatus === "PAID");
    const totalRevenue = paidSales.reduce((sum, o) => sum + Number(o.netAmount), 0);

    // Baselines for HOK
    const baselines = await prisma.inventoryBaseline.findMany({ where: { companyId: company.id } });

    lines.push(`--- ${company.name} ---`);
    lines.push(`주문: ${sales.length}건 (결제완료 ${paidSales.length}건)`);
    if (totalRevenue > 0) {
      lines.push(`매출: ${totalRevenue.toLocaleString()}원`);
    }

    if (baselines.length > 0) {
      const baselineStr = baselines.map((b) => `${b.productName}: ${b.quantity.toLocaleString()}`).join(", ");
      lines.push(`재고: ${baselineStr}`);
    }

    lines.push("");
  }

  // Low stock alerts
  const lowStock = await prisma.inventory.findMany({
    where: { reorderLevel: { gt: 0 } },
    include: { product: { select: { name: true } }, company: { select: { name: true } } },
  });
  const actualLow = lowStock.filter((i) => i.quantity <= i.reorderLevel);
  if (actualLow.length > 0) {
    lines.push("--- Low Stock ---");
    for (const item of actualLow) {
      lines.push(`${item.company.name} ${item.product.name}: ${item.quantity}`);
    }
  }

  return lines.join("\n");
}
