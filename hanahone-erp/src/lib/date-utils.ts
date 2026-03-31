/**
 * Get current date in KST (UTC+9).
 * Server-side new Date() returns UTC which can differ from Korean date.
 */
export function nowKST(): Date {
  const utc = new Date();
  return new Date(utc.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * Get month range for DB queries. If no month param, uses current KST month.
 */
export function getMonthRange(monthParam?: string): { gte: Date; lt: Date } {
  const kst = nowKST();
  const [y, m] = monthParam
    ? [parseInt(monthParam.split("-")[0]), parseInt(monthParam.split("-")[1]) - 1]
    : [kst.getFullYear(), kst.getMonth()];
  return { gte: new Date(y, m, 1), lt: new Date(y, m + 1, 1) };
}

/**
 * Get date range supporting both month and year params. Uses KST for defaults.
 */
export function getDateRange(month?: string, year?: string): { gte: Date; lt: Date } {
  if (year) {
    const y = parseInt(year);
    return { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
  }
  return getMonthRange(month);
}

/**
 * Get current month string in YYYY-MM format (KST).
 */
export function currentMonthKST(): string {
  const kst = nowKST();
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}`;
}
