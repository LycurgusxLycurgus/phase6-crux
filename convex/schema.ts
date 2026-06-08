import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const cadence = v.union(v.literal("weekly"), v.literal("biweekly"));

export default defineSchema({
  users: defineTable({
    telegramUserId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    language: v.union(v.literal("es"), v.literal("en")),
    timezone: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_telegram_user_id", ["telegramUserId"])
    .index("by_chat_id", ["chatId"]),

  profiles: defineTable({
    userId: v.id("users"),
    cadence: v.optional(cadence),
    checkInHour: v.optional(v.number()),
    heroName: v.optional(v.string()),
    heroWhy: v.optional(v.string()),
    villainInternal: v.optional(v.string()),
    villainExternal: v.optional(v.string()),
    villainPhilosophical: v.optional(v.string()),
    resonances: v.optional(v.array(v.string())),
    limits: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  sessions: defineTable({
    userId: v.id("users"),
    status: v.union(v.literal("onboarding"), v.literal("active"), v.literal("paused")),
    onboardingStep: v.optional(
      v.union(
        v.literal("cadence"),
        v.literal("hero"),
        v.literal("villains"),
        v.literal("complete"),
      ),
    ),
    currentCycleId: v.optional(v.string()),
    currentPracticeId: v.optional(v.id("practices")),
    lastModelInteractionId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  memories: defineTable({
    userId: v.id("users"),
    topic: v.string(),
    line: v.string(),
    confidence: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_topic", ["userId", "topic"]),

  practices: defineTable({
    userId: v.id("users"),
    cycleId: v.string(),
    status: v.union(v.literal("planned"), v.literal("active"), v.literal("completed"), v.literal("skipped")),
    title: v.string(),
    plan: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_cycle", ["userId", "cycleId"]),

  ledger: defineTable({
    userId: v.id("users"),
    practiceId: v.optional(v.id("practices")),
    date: v.string(),
    eventType: v.union(v.literal("prep"), v.literal("challenge"), v.literal("debrief"), v.literal("integration"), v.literal("recovery")),
    resonance: v.optional(v.number()),
    evidence: v.string(),
    reward: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_practice", ["practiceId"]),

  messages: defineTable({
    userId: v.id("users"),
    chatId: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    text: v.string(),
    telegramMessageId: v.optional(v.number()),
    updateId: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_update", ["updateId"]),

  routerDecisions: defineTable({
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
    createdAt: v.number(),
  }).index("by_user_created", ["userId", "createdAt"]),

  reports: defineTable({
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
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
  }).index("by_user_created", ["userId", "createdAt"]),
});
