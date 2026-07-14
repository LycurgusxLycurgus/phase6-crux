import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  WEB_SESSION_INACTIVE_MS,
  WEB_SESSION_TOTAL_MS,
  digestWebLoginToken,
  isPlausibleWebLoginToken,
} from "./webAccess";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "telegram-link",
      authorize: async (credentials, ctx) => {
        const token = credentials.token;
        if (!isPlausibleWebLoginToken(token)) {
          throw new Error("WEB_LINK_INVALID");
        }

        const result = await ctx.runMutation(internal.webAuth.consumeWebLoginLink, {
          tokenDigest: await digestWebLoginToken(token),
        });
        if (!result.ok) {
          throw new Error(`WEB_LINK_${result.status.toUpperCase()}`);
        }
        return { userId: result.userId };
      },
    }),
  ],
  session: {
    totalDurationMs: WEB_SESSION_TOTAL_MS,
    inactiveDurationMs: WEB_SESSION_INACTIVE_MS,
  },
  jwt: {
    durationMs: 5 * 60 * 1000,
  },
});
