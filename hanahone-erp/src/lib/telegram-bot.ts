import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/notifications/telegram";

type CommandHandler = (args: string) => Promise<string>;

const commands: Record<string, CommandHandler> = {
  재고: handleInventory,
  주문: handleOrders,
  매출: handleSales,
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

    let lines = [`[${company.name} 재고]`];

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
  let lines = ["[전체 재고 요약]"];
  for (const c of companies) {
    const count = await prisma.inventory.count({ where: { companyId: c.id } });
    const lowStock = await prisma.inventory.count({
      where: { companyId: c.id, quantity: { lte: prisma.inventory.fields?.reorderLevel ?? 0 } },
    });
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

  let lines = [`[어제 주문 (${yesterday.toLocaleDateString("ko-KR")})]`];
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
  let lines = [`[${monthStr} 매출 MTD]`];
  if (byCompany.size === 0) {
    lines.push("매출 없음");
  } else {
    for (const [cid, data] of Array.from(byCompany)) {
      lines.push(`${companyMap.get(cid) || cid}: ${data.count}건 / ${data.total.toLocaleString()}원`);
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
    "- 주문 / 주문 HOK",
    "- 매출 / 매출 HOI",
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

  let lines = [`[일일 요약] ${dateStr}`, ""];

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
