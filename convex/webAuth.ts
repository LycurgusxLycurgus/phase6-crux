import { invalidateSessions } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  WEB_LOGIN_LINK_TTL_MS,
  createWebLoginToken,
  digestWebLoginToken,
} from "./webAccess";

type ConsumeResult =
  | { ok: true; userId: Id<"users"> }
  | { ok: false; status: "invalid" | "used" | "expired" | "revoked" };

export const issueWebLoginLink = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ url: string; expiresAt: number }> => {
    const siteUrl = requireSiteUrl();
    const token = createWebLoginToken();
    const createdAt = Date.now();
    const expiresAt = createdAt + WEB_LOGIN_LINK_TTL_MS;
    await ctx.runMutation(internal.webAuth.storeWebLoginLink, {
      userId: args.userId,
      tokenDigest: await digestWebLoginToken(token),
      createdAt,
      expiresAt,
    });

    const url = new URL("/acceso", siteUrl);
    url.searchParams.set("t", token);
    return { url: url.toString(), expiresAt };
  },
});

export const storeWebLoginLink = internalMutation({
  args: {
    userId: v.id("users"),
    tokenDigest: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const pending = await ctx.db
      .query("webLoginLinks")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);
    for (const link of pending) {
      if (link.consumedAt === undefined && link.revokedAt === undefined) {
        await ctx.db.patch(link._id, { revokedAt: args.createdAt });
      }
    }

    const linkId = await ctx.db.insert("webLoginLinks", {
      userId: args.userId,
      tokenDigest: args.tokenDigest,
      issuedFrom: "telegram",
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
    return { linkId };
  },
});

export const consumeWebLoginLink = internalMutation({
  args: { tokenDigest: v.string() },
  handler: async (ctx, args): Promise<ConsumeResult> => {
    const link = await ctx.db
      .query("webLoginLinks")
      .withIndex("by_digest", (q) => q.eq("tokenDigest", args.tokenDigest))
      .unique();
    if (!link) return { ok: false, status: "invalid" };
    if (link.revokedAt !== undefined) return { ok: false, status: "revoked" };
    if (link.consumedAt !== undefined) return { ok: false, status: "used" };

    const now = Date.now();
    if (link.expiresAt <= now) return { ok: false, status: "expired" };
    const user = await ctx.db.get(link.userId);
    if (!user) return { ok: false, status: "invalid" };

    await ctx.db.patch(link._id, { consumedAt: now });
    return { ok: true, userId: link.userId };
  },
});

export const revokePendingWebLinks = internalMutation({
  args: { userId: v.id("users"), nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const links = await ctx.db
      .query("webLoginLinks")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);
    let revoked = 0;
    for (const link of links) {
      if (link.consumedAt === undefined && link.revokedAt === undefined) {
        await ctx.db.patch(link._id, { revokedAt: now });
        revoked += 1;
      }
    }
    return { revoked };
  },
});

export const revokeAllWebAccess = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ ok: true; pendingLinksRevoked: number }> => {
    const pending: { revoked: number } = await ctx.runMutation(internal.webAuth.revokePendingWebLinks, {
      userId: args.userId,
    });
    // @convex-dev/auth 0.0.94's GenericDataModel constraint is not compatible
    // with TypeScript 6's optional-field inference; keep the cast at this edge.
    await invalidateSessions(ctx as never, { userId: args.userId });
    return { ok: true, pendingLinksRevoked: pending.revoked };
  },
});

export const cleanupExpiredWebLoginLinks = internalMutation({
  args: { nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const retentionCutoff = now - 7 * 24 * 60 * 60 * 1000;
    const expired = await ctx.db
      .query("webLoginLinks")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", retentionCutoff))
      .take(500);
    for (const link of expired) await ctx.db.delete(link._id);
    return { deleted: expired.length };
  },
});

function requireSiteUrl(): string {
  const value = process.env.SITE_URL;
  if (!value) throw new Error("SITE_URL is not configured");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("SITE_URL must use HTTPS outside localhost");
  }
  return url.toString();
}
