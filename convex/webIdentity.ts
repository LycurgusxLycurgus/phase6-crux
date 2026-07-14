import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type WebIdentity = {
  user: Doc<"users">;
  userId: Id<"users">;
  sessionId: Id<"authSessions">;
};

export async function requireWebUser(ctx: QueryCtx | MutationCtx): Promise<WebIdentity> {
  const [rawUserId, rawSessionId] = await Promise.all([
    getAuthUserId(ctx),
    getAuthSessionId(ctx),
  ]);
  if (!rawUserId || !rawSessionId) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "No hay una sesion web activa." });
  }

  const userId = rawUserId as Id<"users">;
  const sessionId = rawSessionId as Id<"authSessions">;
  const [user, session] = await Promise.all([ctx.db.get(userId), ctx.db.get(sessionId)]);
  if (!user) {
    throw new ConvexError({ code: "USER_NOT_FOUND", message: "No encontramos tu espacio de Arqueidentidad." });
  }
  if (!session || session.userId !== userId || session.expirationTime <= Date.now()) {
    throw new ConvexError({ code: "SESSION_REVOKED", message: "Este acceso web ya no esta activo." });
  }
  return { user, userId, sessionId };
}
