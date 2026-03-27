interface ExchangeRateCache {
  rate: number;
  date: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: ExchangeRateCache | null = null;

export interface ExchangeRate {
  rate: number; // KRW per 1 USD
  date: string; // "2026-03-27"
}

export async function getUsdKrwRate(): Promise<ExchangeRate> {
  // Return cache if valid
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { rate: cache.rate, date: cache.date };
  }

  const apiKey = process.env.KOREAEXIM_API_KEY;
  if (!apiKey) {
    // Fallback if no API key configured
    return cache
      ? { rate: cache.rate, date: cache.date }
      : { rate: 1450, date: "N/A" };
  }

  // Try today first, then previous days (weekends/holidays return null)
  for (let daysBack = 0; daysBack < 5; daysBack++) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    const searchDate = d.toISOString().slice(0, 10).replace(/-/g, "");

    try {
      const res = await fetch(
        `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${apiKey}&searchdate=${searchDate}&data=AP01`,
        { next: { revalidate: 3600 } }
      );

      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const usd = data.find((item: any) => item.cur_unit === "USD");
      if (!usd || usd.result !== 1) continue;

      // deal_bas_r has commas: "1,506.2" → 1506.2
      const rate = parseFloat(usd.deal_bas_r.replace(/,/g, ""));
      if (isNaN(rate)) continue;

      const dateStr = `${searchDate.slice(0, 4)}-${searchDate.slice(4, 6)}-${searchDate.slice(6, 8)}`;

      cache = { rate, date: dateStr, fetchedAt: Date.now() };
      return { rate, date: dateStr };
    } catch {
      continue;
    }
  }

  // All attempts failed — return cache or fallback
  return cache
    ? { rate: cache.rate, date: cache.date }
    : { rate: 1450, date: "N/A" };
}

export function convertUsdToKrw(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

export function convertKrwToUsd(krw: number, rate: number): number {
  return krw / rate;
}
