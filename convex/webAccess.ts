export const WEB_LOGIN_LINK_TTL_MS = 10 * 60 * 1000;
export const WEB_SESSION_TOTAL_MS = 30 * 24 * 60 * 60 * 1000;
export const WEB_SESSION_INACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

export function createWebLoginToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function digestWebLoginToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function isPlausibleWebLoginToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
