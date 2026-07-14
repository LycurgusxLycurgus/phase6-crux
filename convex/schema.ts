import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const cadence = v.union(v.literal("weekly"), v.literal("biweekly"));

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    telegramUserId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    language: v.union(v.literal("es"), v.literal("en")),
    timezone: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_telegram_user_id", ["telegramUserId"])
    .index("by_chat_id", ["chatId"]),

  profiles: defineTable({
    userId: v.id("users"),
    cadence: v.optional(cadence),
    checkInHour: v.optional(v.number()),
    routineStartedAt: v.optional(v.number()),
    routineStartDate: v.optional(v.string()),
    cheatDayOfWeek: v.optional(v.number()),
    emptyDayOfWeek: v.optional(v.number()),
    emptyDayEnabled: v.optional(v.boolean()),
    dailyHabitMorningHour: v.optional(v.number()),
    dailyHabitEveningHour: v.optional(v.number()),
    dreamline: v.optional(v.object({
      have: v.string(),
      do: v.string(),
      be: v.string(),
      updatedAt: v.number(),
    })),
    fearSetting: v.optional(v.object({
      whatIf: v.string(),
      prevent: v.string(),
      repair: v.string(),
      partialWins: v.string(),
      cost6Months: v.string(),
      cost1Year: v.string(),
      cost3Years: v.string(),
      updatedAt: v.number(),
    })),
    initialIdentity: v.optional(v.object({
      name: v.string(),
      behavior: v.string(),
      belief: v.string(),
      updatedAt: v.number(),
    })),
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
        v.literal("introduction"),
        v.literal("cadence"),
        v.literal("initial_identity"),
        v.literal("hero"),
        v.literal("villains"),
        v.literal("dreamline"),
        v.literal("fear_setting"),
        v.literal("routine_days"),
        v.literal("extra_habits"),
        v.literal("complete"),
      ),
    ),
    currentCycleId: v.optional(v.string()),
    currentPracticeId: v.optional(v.id("practices")),
    lastModelInteractionId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  webLoginLinks: defineTable({
    userId: v.id("users"),
    tokenDigest: v.string(),
    issuedFrom: v.literal("telegram"),
    createdAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_digest", ["tokenDigest"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_expires_at", ["expiresAt"]),

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
    skippedAt: v.optional(v.number()),
    skipReason: v.optional(v.string()),
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

  dailyHabits: defineTable({
    userId: v.id("users"),
    slot: v.number(),
    habitKey: v.string(),
    title: v.string(),
    description: v.string(),
    source: v.union(
      v.literal("base_tummo_identity"),
      v.literal("hyperthematic_best_practice"),
      v.literal("manual_user_choice"),
    ),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
    unlockWeek: v.number(),
    addedAt: v.number(),
    createdFromCycleId: v.optional(v.string()),
    createdFromHyperthematic: v.optional(v.string()),
    compressedPractice: v.optional(v.string()),
    planPrompt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_slot", ["userId", "slot"]),

  dailyHabitCompletions: defineTable({
    userId: v.id("users"),
    localDate: v.string(),
    dayType: v.union(v.literal("routine"), v.literal("cheat"), v.literal("empty")),
    status: v.union(v.literal("partial"), v.literal("done"), v.literal("skipped_intentional")),
    completedHabitKeys: v.array(v.string()),
    pendingHabitKeysAtCompletion: v.array(v.string()),
    evidence: v.optional(v.string()),
    tummoDone: v.optional(v.boolean()),
    archePracticeBridgeDone: v.optional(v.boolean()),
    archePracticeBridgeMode: v.optional(v.union(v.literal("do"), v.literal("plan"), v.literal("none"))),
    reward: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_date", ["userId", "localDate"])
    .index("by_user_created", ["userId", "createdAt"]),

  dailyHabitCheckins: defineTable({
    userId: v.id("users"),
    chatId: v.string(),
    localDate: v.string(),
    window: v.union(v.literal("morning"), v.literal("evening")),
    dayType: v.union(v.literal("routine"), v.literal("cheat"), v.literal("empty")),
    promptText: v.string(),
    sentAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_user_date_window", ["userId", "localDate", "window"])
    .index("by_sent", ["sentAt"]),

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
    anticipatedRoute: v.optional(v.string()),
    capabilityGap: v.optional(v.string()),
    capabilityGapType: v.optional(v.string()),
    model: v.string(),
    createdAt: v.number(),
  }).index("by_user_created", ["userId", "createdAt"]),

  reports: defineTable({
    userId: v.optional(v.id("users")),
    severity: v.union(v.literal("info"), v.literal("bug"), v.literal("safety"), v.literal("missing_knowledge"), v.literal("tool_error"), v.literal("capability_gap")),
    summary: v.string(),
    transcriptExcerpt: v.optional(v.string()),
    boundary: v.optional(v.string()),
    errorName: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorCause: v.optional(v.string()),
    route: v.optional(v.string()),
    intent: v.optional(v.string()),
    currentCycleId: v.optional(v.string()),
    anticipatedRoute: v.optional(v.string()),
    capabilityGap: v.optional(v.string()),
    capabilityGapType: v.optional(v.string()),
    retryAfterMs: v.optional(v.number()),
    model: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
  }).index("by_user_created", ["userId", "createdAt"]),
});
