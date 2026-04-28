export function formatOrderNumber(companyName: string, sequence: number): string {
  const padded = sequence.toString().padStart(4, "0");
  return `${companyName}-${padded}`;
}

/**
 * Map a UUID companyId to a signed int8 for pg_advisory_xact_lock.
 * Uses the first 16 hex chars (8 bytes) of the UUID.
 */
function companyIdToLockKey(companyId: string): bigint {
  const hex = companyId.replace(/-/g, "").slice(0, 16);
  let n = BigInt("0x" + hex);
  const INT8_MAX = (BigInt(1) << BigInt(63)) - BigInt(1);
  if (n > INT8_MAX) n -= BigInt(1) << BigInt(64);
  return n;
}

export async function generateOrderNumber(companyId: string, tx: any): Promise<string> {
  // Serialize concurrent inserts for the same company. Released at tx commit/rollback.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${companyIdToLockKey(companyId)})`;

  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const lastOrder = await tx.order.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true },
  });
  const lastSeq = lastOrder ? parseInt(lastOrder.orderNumber.split("-")[1]) || 0 : 0;
  return formatOrderNumber(company.name, lastSeq + 1);
}
