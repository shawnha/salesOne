interface ExchangeRateCache {
  rate: number;
  date: string; // actual business day the rate came from
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for "current/today"
const dateCacheMap = new Map<string, ExchangeRateCache>(); // key: "YYYY-MM-DD" (query date)
const FALLBACK_RATE = 1450;

export interface ExchangeRate {
  rate: number; // KRW per 1 USD
  date: string; // "YYYY-MM-DD" — the business day the rate is from
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Fetch USD/KRW exchange rate from the Korea Eximbank API for a specific date.
 * Walks back up to 10 days to find the nearest business-day rate.
 *
 * Cache semantics:
 * - Past dates: cached forever (historical rates are immutable)
 * - Today: cached for 1 hour (intra-day rate can update)
 * - No API key configured: returns FALLBACK_RATE with date "N/A"
 */
export async function getUsdKrwRateForDate(asOf: Date): Promise<ExchangeRate> {
  const now = new Date();
  const isToday = isSameUtcDay(asOf, now);
  const queryKey = toDateKey(asOf);

  const cached = dateCacheMap.get(queryKey);
  if (cached) {
    if (!isToday || Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { rate: cached.rate, date: cached.date };
    }
  }

  const apiKey = process.env.KOREAEXIM_API_KEY;
  if (!apiKey) {
    return cached
      ? { rate: cached.rate, date: cached.date }
      : { rate: FALLBACK_RATE, date: "N/A" };
  }

  for (let daysBack = 0; daysBack < 10; daysBack++) {
    const d = new Date(asOf);
    d.setUTCDate(d.getUTCDate() - daysBack);
    const searchDate = toDateKey(d).replace(/-/g, "");

    try {
      const res = await fetch(
        `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${apiKey}&searchdate=${searchDate}&data=AP01`,
        { next: { revalidate: isToday ? 3600 : 86400 * 30 } },
      );
      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const usd = data.find((item: any) => item.cur_unit === "USD");
      if (!usd || usd.result !== 1) continue;

      const rate = parseFloat(usd.deal_bas_r.replace(/,/g, ""));
      if (isNaN(rate)) continue;

      const dateStr = toDateKey(d);
      const entry: ExchangeRateCache = { rate, date: dateStr, fetchedAt: Date.now() };
      dateCacheMap.set(queryKey, entry);
      // Also warm intermediate keys (weekends/holidays between d and asOf) with the same rate
      for (let k = 0; k < daysBack; k++) {
        const mid = new Date(asOf);
        mid.setUTCDate(mid.getUTCDate() - k);
        const midKey = toDateKey(mid);
        if (!dateCacheMap.has(midKey)) dateCacheMap.set(midKey, entry);
      }
      return { rate, date: dateStr };
    } catch {
      continue;
    }
  }

  return cached
    ? { rate: cached.rate, date: cached.date }
    : { rate: FALLBACK_RATE, date: "N/A" };
}

/**
 * Fetch rates for many dates concurrently. Returns a Map keyed by the *query*
 * date (YYYY-MM-DD) so callers can look up `map.get(toDateKey(order.orderDate))`
 * without worrying about weekend/holiday adjustment.
 */
export async function getUsdKrwRatesForDates(dates: Date[]): Promise<Map<string, ExchangeRate>> {
  const unique = new Map<string, Date>();
  for (const d of dates) {
    if (!d) continue;
    const k = toDateKey(d);
    if (!unique.has(k)) unique.set(k, d);
  }
  const entries = await Promise.all(
    Array.from(unique.entries()).map(async ([k, d]) => {
      const rate = await getUsdKrwRateForDate(d);
      return [k, rate] as const;
    }),
  );
  return new Map(entries);
}

/**
 * Legacy single-rate helper. Prefer getUsdKrwRateForDate / getUsdKrwRatesForDates
 * for new code. Kept to avoid breaking callers that still want a period-level
 * reference rate (e.g. the "₩1,475.6/\$ (date)" footer).
 */
export async function getUsdKrwRate(asOf?: Date): Promise<ExchangeRate> {
  return getUsdKrwRateForDate(asOf || new Date());
}

export function convertUsdToKrw(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

export function convertKrwToUsd(krw: number, rate: number): number {
  return krw / rate;
}

export function dateKey(d: Date): string {
  return toDateKey(d);
}
