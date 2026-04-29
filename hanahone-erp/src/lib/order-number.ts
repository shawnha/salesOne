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

  // Use MAX(sequence) rather than "latest by createdAt" so the next number is
  // always strictly greater than every existing one — even if rows were
  // inserted out of band (Excel import, admin tooling, backdated migration)
  // with a sequence below the current max. The advisory lock above prevents
  // concurrent generators from racing; this query keeps us correct under any
  // historical insert path.
  //
  // Pattern matches "<companyName>-<digits>" exactly so a stray non-conforming
  // orderNumber can't poison the parse.
  const pattern = `^${company.name.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}-\\d+$`;
  const rows = await tx.$queryRaw<Array<{ max_seq: number | null }>>`
    SELECT COALESCE(
      MAX(CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)),
      0
    )::int AS max_seq
    FROM "salesone"."orders"
    WHERE company_id = ${companyId}::uuid
      AND order_number ~ ${pattern}
  `;
  const lastSeq = rows[0]?.max_seq ?? 0;
  return formatOrderNumber(company.name, lastSeq + 1);
}
