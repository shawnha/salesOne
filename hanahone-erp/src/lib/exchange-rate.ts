interface ExchangeRateCache {
  rate: number;
  date: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cacheMap = new Map<string, ExchangeRateCache>(); // key: "YYYY-MM" or "current"

export interface ExchangeRate {
  rate: number; // KRW per 1 USD
  date: string; // "2026-03-27"
}

/**
 * Fetch USD/KRW exchange rate.
 * - No args or asOf in current month → today's rate (cached 1hr)
 * - asOf in past month → closing rate of that month (last business day, cached indefinitely)
 */
export async function getUsdKrwRate(asOf?: Date): Promise<ExchangeRate> {
  const now = new Date();
  const target = asOf || now;
  const isCurrentMonth = target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
  const cacheKey = isCurrentMonth ? "current" : `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;

  const cached = cacheMap.get(cacheKey);
  if (cached) {
    // Current month: honor TTL. Past months: cache forever (rate won't change)
    if (!isCurrentMonth || Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { rate: cached.rate, date: cached.date };
    }
  }

  const apiKey = process.env.KOREAEXIM_API_KEY;
  if (!apiKey) {
    return cached
      ? { rate: cached.rate, date: cached.date }
      : { rate: 1450, date: "N/A" };
  }

  // For past months, start from last day of that month. For current, start from today.
  const startDate = isCurrentMonth
    ? now
    : new Date(target.getFullYear(), target.getMonth() + 1, 0); // last day of month

  // Try up to 10 days back (covers weekends + holidays)
  for (let daysBack = 0; daysBack < 10; daysBack++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() - daysBack);
    const searchDate = d.toISOString().slice(0, 10).replace(/-/g, "");

    try {
      const res = await fetch(
        `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${apiKey}&searchdate=${searchDate}&data=AP01`,
        { next: { revalidate: isCurrentMonth ? 3600 : 86400 * 30 } }
      );

      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const usd = data.find((item: any) => item.cur_unit === "USD");
      if (!usd || usd.result !== 1) continue;

      const rate = parseFloat(usd.deal_bas_r.replace(/,/g, ""));
      if (isNaN(rate)) continue;

      const dateStr = `${searchDate.slice(0, 4)}-${searchDate.slice(4, 6)}-${searchDate.slice(6, 8)}`;

      cacheMap.set(cacheKey, { rate, date: dateStr, fetchedAt: Date.now() });
      return { rate, date: dateStr };
    } catch {
      continue;
    }
  }

  return cached
    ? { rate: cached.rate, date: cached.date }
    : { rate: 1450, date: "N/A" };
}

export function convertUsdToKrw(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

export function convertKrwToUsd(krw: number, rate: number): number {
  return krw / rate;
}
