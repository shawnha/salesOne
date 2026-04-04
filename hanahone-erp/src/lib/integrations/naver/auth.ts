import bcrypt from "bcryptjs";
import type { NaverCredentials, NaverTokenResponse } from "./types";

const NAVER_API_BASE = "https://api.commerce.naver.com/external";
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function generateClientSecretSign(
  clientId: string,
  clientSecret: string,
  timestamp: number,
): string {
  const password = `${clientId}_${timestamp}`;
  const hashed = bcrypt.hashSync(password, clientSecret);
  return Buffer.from(hashed).toString("base64");
}

export async function getAccessToken(
  credentials: NaverCredentials,
): Promise<string> {
  const { clientId, clientSecret } = credentials;

  const cacheKey = clientId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
    return cached.token;
  }

  const timestamp = Date.now();
  const clientSecretSign = generateClientSecretSign(clientId, clientSecret, timestamp);

  const res = await fetch(`${NAVER_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      timestamp: String(timestamp),
      client_secret_sign: clientSecretSign,
      grant_type: "client_credentials",
      type: "SELF",
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Naver token request failed: ${res.status} - ${errorBody}`);
  }

  const data: NaverTokenResponse = await res.json();

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

export async function naverFetch(
  credentials: NaverCredentials,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(credentials);

  const res = await fetch(`${NAVER_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 429) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise((r) => setTimeout(r, attempt * 1500));
      const retry = await fetch(`${NAVER_API_BASE}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (retry.status !== 429) return retry;
    }
    throw new Error(`Naver API rate limited after 3 retries: ${path}`);
  }

  return res;
}
