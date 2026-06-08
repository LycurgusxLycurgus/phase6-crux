import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const language = v.union(v.literal("es"), v.literal("en"));
const cadence = v.union(v.literal("weekly"), v.literal("biweekly"));
const eventType = v.union(v.literal("prep"), v.literal("challenge"), v.literal("debrief"), v.literal("integration"), v.literal("recovery"));

export const ensureTelegramUser = internalMutation({
  args: {
    telegramUserId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    language: v.optional(language),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_telegram_user_id", (q) => q.eq("telegramUserId", args.telegramUserId))
      .unique();

    const newUser = {
      telegramUserId: args.telegramUserId,
      chatId: args.chatId,
      language: args.language ?? "es",
      timezone: args.timezone ?? process.env.DEFAULT_TIMEZONE ?? "America/Bogota",
      createdAt: now,
      lastSeenAt: now,
    };
    if (args.username !== undefined) Object.assign(newUser, { username: args.username });
    if (args.firstName !== undefined) Object.assign(newUser, { firstName: args.firstName });

    const userId = existing?._id ?? await ctx.db.insert("users", newUser);

    if (existing) {
      const patch: Record<string, unknown> = {
        chatId: args.chatId,
        lastSeenAt: now,
      };
      if (args.username !== undefined) patch.username = args.username;
      if (args.firstName !== undefined) patch.firstName = args.firstName;
      await ctx.db.patch(existing._id, patch);
    }

    const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (!profile) {
      await ctx.db.insert("profiles", {
        userId,
        limits: [],
        updatedAt: now,
      });
    }

    const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (!session) {
      await ctx.db.insert("sessions", {
        userId,
        status: "onboarding",
        onboardingStep: "cadence",
        updatedAt: now,
      });
    }

    return { userId };
  },
});

export const recordMessage = internalMutation({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    text: v.string(),
    telegramMessageId: v.optional(v.number()),
    updateId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const recordRouterDecision = internalMutation({
  args: {
    userId: v.id("users"),
    route: v.string(),
    intent: v.string(),
    confidence: v.number(),
    needsHighThinking: v.boolean(),
    safetyFlag: v.string(),
    stateMutationCandidate: v.string(),
    reason: v.string(),
    messageExcerpt: v.string(),
    sessionStatus: v.optional(v.string()),
    onboardingStep: v.optional(v.string()),
    currentCycleId: v.optional(v.string()),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("routerDecisions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getUserState = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    const memories = await ctx.db.query("memories").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const ledger = await ctx.db
      .query("ledger")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(16);

    const currentPractice = session?.currentPracticeId
      ? await ctx.db.get(session.currentPracticeId)
      : await ctx.db
        .query("practices")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .first();

    const practices = await ctx.db
      .query("practices")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(50);
    const completedPreliminalCount = practices.filter((practice) =>
      practice.status === "completed"
      && ["cycle1_prehypnos_nsdr", "cycle2_social_fear", "cycle3_niacin_primer"].includes(practice.cycleId)
    ).length;

    return {
      user,
      profile,
      session,
      memories: memories
        .sort((a, b) => a.topic.localeCompare(b.topic))
        .map((memory) => ({
          topic: memory.topic,
          line: memory.line,
          confidence: memory.confidence,
          updatedAt: memory.updatedAt,
        })),
      recentMessages: recentMessages
        .reverse()
        .map((message) => ({
          direction: message.direction,
          text: message.text,
        })),
      ledgerSummary: {
        prepCount: ledger.filter((item) => item.eventType === "prep").length,
        challengeCount: ledger.filter((item) => item.eventType === "challenge").length,
        debriefCount: ledger.filter((item) => item.eventType === "debrief").length,
        integrationCount: ledger.filter((item) => item.eventType === "integration").length,
        completedPreliminalCount,
      },
      currentPractice,
    };
  },
});

export const updateProfile = internalMutation({
  args: {
    userId: v.id("users"),
    cadence: v.optional(cadence),
    timezone: v.optional(v.string()),
    checkInHour: v.optional(v.number()),
    heroName: v.optional(v.string()),
    heroWhy: v.optional(v.string()),
    villainInternal: v.optional(v.string()),
    villainExternal: v.optional(v.string()),
    villainPhilosophical: v.optional(v.string()),
    limits: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!profile) throw new Error("Profile not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of [
      "cadence",
      "timezone",
      "checkInHour",
      "heroName",
      "heroWhy",
      "villainInternal",
      "villainExternal",
      "villainPhilosophical",
      "limits",
    ] as const) {
      if (args[key] !== undefined) patch[key] = args[key];
    }

    await ctx.db.patch(profile._id, patch);
    return { ok: true };
  },
});

export const updateSession = internalMutation({
  args: {
    userId: v.id("users"),
    status: v.optional(v.union(v.literal("onboarding"), v.literal("active"), v.literal("paused"))),
    onboardingStep: v.optional(v.union(v.literal("cadence"), v.literal("hero"), v.literal("villains"), v.literal("complete"))),
    currentCycleId: v.optional(v.string()),
    currentPracticeId: v.optional(v.id("practices")),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!session) throw new Error("Session not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.onboardingStep !== undefined) patch.onboardingStep = args.onboardingStep;
    if (args.currentCycleId !== undefined) patch.currentCycleId = args.currentCycleId;
    if (args.currentPracticeId !== undefined) patch.currentPracticeId = args.currentPracticeId;
    await ctx.db.patch(session._id, patch);
    return { ok: true };
  },
});

export const startPracticeCycle = internalMutation({
  args: {
    userId: v.id("users"),
    cycleId: v.string(),
    title: v.string(),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("practices")
      .withIndex("by_user_cycle", (q) => q.eq("userId", args.userId).eq("cycleId", args.cycleId))
      .first();

    const practiceId = existing?._id ?? await ctx.db.insert("practices", {
      userId: args.userId,
      cycleId: args.cycleId,
      status: "active",
      title: args.title,
      plan: args.plan,
      createdAt: now,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        title: args.title,
        plan: args.plan,
      });
    }

    await updateSessionDirect(ctx, args.userId, {
      status: "active",
      onboardingStep: "complete",
      currentCycleId: args.cycleId,
      currentPracticeId: practiceId,
    });

    return { practiceId };
  },
});

export const logPracticeEvent = internalMutation({
  args: {
    userId: v.id("users"),
    practiceId: v.optional(v.id("practices")),
    eventType,
    evidence: v.string(),
    reward: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    const practiceId = args.practiceId ?? session?.currentPracticeId;
    const now = Date.now();

    const event = {
      userId: args.userId,
      date: new Date(now).toISOString().slice(0, 10),
      eventType: args.eventType,
      evidence: args.evidence.slice(0, 4000),
      createdAt: now,
    };
    if (practiceId !== undefined) Object.assign(event, { practiceId });
    if (args.reward !== undefined) Object.assign(event, { reward: args.reward });

    const ledgerId = await ctx.db.insert("ledger", event);

    if (practiceId && (args.eventType === "debrief" || args.eventType === "integration")) {
      const patch: Record<string, unknown> = {
        status: args.eventType === "integration" ? "completed" : "active",
      };
      if (args.eventType === "integration") patch.completedAt = now;
      await ctx.db.patch(practiceId, patch);
    }

    return { ledgerId };
  },
});

export const completeCurrentPractice = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!session?.currentPracticeId) return { ok: true, completed: false };
    await ctx.db.patch(session.currentPracticeId, {
      status: "completed",
      completedAt: Date.now(),
    });
    return { ok: true, completed: true };
  },
});

export const replaceMemoryLines = internalMutation({
  args: {
    userId: v.id("users"),
    lines: v.array(v.object({
      topic: v.string(),
      line: v.string(),
      confidence: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const old = await ctx.db.query("memories").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    for (const item of old) {
      await ctx.db.delete(item._id);
    }

    for (const line of args.lines.slice(0, 12)) {
      await ctx.db.insert("memories", {
        userId: args.userId,
        topic: line.topic,
        line: line.line,
        confidence: line.confidence ?? 0.7,
        updatedAt: now,
      });
    }

    return { count: args.lines.length };
  },
});

export const createReport = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    severity: v.union(v.literal("info"), v.literal("bug"), v.literal("safety"), v.literal("missing_knowledge"), v.literal("tool_error")),
    summary: v.string(),
    transcriptExcerpt: v.optional(v.string()),
    boundary: v.optional(v.string()),
    errorName: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorCause: v.optional(v.string()),
    route: v.optional(v.string()),
    intent: v.optional(v.string()),
    currentCycleId: v.optional(v.string()),
    retryAfterMs: v.optional(v.number()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const report = {
      severity: args.severity,
      summary: args.summary.slice(0, 2000),
      status: "open" as const,
      createdAt: Date.now(),
    };
    if (args.userId !== undefined) Object.assign(report, { userId: args.userId });
    if (args.transcriptExcerpt !== undefined) Object.assign(report, { transcriptExcerpt: args.transcriptExcerpt.slice(0, 2000) });
    if (args.boundary !== undefined) Object.assign(report, { boundary: args.boundary.slice(0, 120) });
    if (args.errorName !== undefined) Object.assign(report, { errorName: args.errorName.slice(0, 160) });
    if (args.errorMessage !== undefined) Object.assign(report, { errorMessage: args.errorMessage.slice(0, 1000) });
    if (args.errorCause !== undefined) Object.assign(report, { errorCause: args.errorCause.slice(0, 1000) });
    if (args.route !== undefined) Object.assign(report, { route: args.route.slice(0, 120) });
    if (args.intent !== undefined) Object.assign(report, { intent: args.intent.slice(0, 120) });
    if (args.currentCycleId !== undefined) Object.assign(report, { currentCycleId: args.currentCycleId.slice(0, 160) });
    if (args.retryAfterMs !== undefined) Object.assign(report, { retryAfterMs: args.retryAfterMs });
    if (args.model !== undefined) Object.assign(report, { model: args.model.slice(0, 160) });

    const reportId = await ctx.db.insert("reports", report);

    return { reportId };
  },
});

export const listUsersForMemoryRewrite = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((user) => user._id).slice(0, 100);
  },
});

export const getMemoryRewriteInput = internalQuery({
  args: {
    userId: v.id("users"),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.userId);
    const memories = await ctx.db.query("memories").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const ledger = await ctx.db
      .query("ledger")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId).gte("createdAt", args.since))
      .collect();
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId).gte("createdAt", args.since))
      .collect();

    return {
      user: state,
      memories: memories.map((memory) => ({ topic: memory.topic, line: memory.line, confidence: memory.confidence })),
      ledger: ledger.map((item) => ({ eventType: item.eventType, evidence: item.evidence })),
      messages: messages.map((message) => ({ direction: message.direction, text: message.text })),
    };
  },
});

async function updateSessionDirect(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Record<string, unknown>,
) {
  const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  if (!session) throw new Error("Session not found");
  await ctx.db.patch(session._id, { ...patch, updatedAt: Date.now() });
}
