export function formatOrderNumber(companyName: string, sequence: number): string {
  const padded = sequence.toString().padStart(4, "0");
  return `${companyName}-${padded}`;
}

export async function generateOrderNumber(companyId: string, tx: any): Promise<string> {
  const db = tx;
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const lastOrder = await db.order.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true },
  });
  const lastSeq = lastOrder ? parseInt(lastOrder.orderNumber.split("-")[1]) || 0 : 0;
  return formatOrderNumber(company.name, lastSeq + 1);
}
