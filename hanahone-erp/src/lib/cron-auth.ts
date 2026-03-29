import { timingSafeEqual } from "crypto";

export function validateCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (!authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authHeader);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
