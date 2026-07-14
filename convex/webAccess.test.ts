import { describe, expect, it } from "vitest";
import { createWebLoginToken, digestWebLoginToken, isPlausibleWebLoginToken } from "./webAccess";

describe("web access token primitives", () => {
  it("creates opaque 256-bit URL-safe tokens", () => {
    const first = createWebLoginToken();
    const second = createWebLoginToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(isPlausibleWebLoginToken(first)).toBe(true);
  });

  it("creates stable non-reversible lookup digests", async () => {
    const token = createWebLoginToken();
    const digest = await digestWebLoginToken(token);
    expect(digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).not.toBe(token);
    expect(await digestWebLoginToken(token)).toBe(digest);
  });

  it("rejects malformed credential values before database access", () => {
    expect(isPlausibleWebLoginToken(undefined)).toBe(false);
    expect(isPlausibleWebLoginToken("short")).toBe(false);
    expect(isPlausibleWebLoginToken("a".repeat(42) + "!")).toBe(false);
  });
});
