import { ConvexError, v } from "convex/values";
import {
  calculateRoutineStreak,
  deriveDailyRoutineState,
  type DailyRoutineState,
} from "../bridgecrux/habits";
import { arqueidentidadFase6Content } from "../cruxes/arqueidentidad-fase6/content";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { loadRoutineInput, setDailyHabitCompletionDirect } from "./habits";
import { requireWebUser } from "./webIdentity";

const cadence = v.union(v.literal("weekly"), v.literal("biweekly"));

export const getBootstrap = query({
  args: {},
  handler: async (ctx) => {
    const { user, userId } = await requireWebUser(ctx);
    const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    return {
      displayName: user.firstName ?? user.username ?? "Tu espacio",
      timezone: user.timezone,
      onboarding: {
        complete: session?.status === "active" && session.onboardingStep === "complete",
        status: session?.status ?? "onboarding",
        step: session?.onboardingStep ?? "cadence",
      },
    };
  },
});

export const getToday = query({
  args: {},
  handler: async (ctx) => {
    const { user, userId } = await requireWebUser(ctx);
    const now = Date.now();
    const [profile, session, raw, recentPractice] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
      ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
      loadRoutineInput(ctx, userId, now),
      ctx.db.query("practices").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").first(),
    ]);
    const routine = deriveDailyRoutineState(raw);
    const currentPractice = session?.currentPracticeId
      ? await ctx.db.get(session.currentPracticeId)
      : recentPractice;
    const completedCount = routine.activeHabits.filter((habit) => routine.completedHabitKeys.includes(habit.habitKey)).length;
    return {
      localDate: routine.localDate,
      timezone: user.timezone,
      dayType: routine.dayType,
      identityName: profile?.heroName ?? profile?.initialIdentity?.name ?? null,
      statement: profile?.heroName
        ? `Hoy ${profile.heroName} vuelve a lo esencial.`
        : "Hoy vuelves a lo esencial.",
      routine: routineDto(routine),
      progress: {
        completed: completedCount,
        total: routine.activeHabits.length,
        ratio: routine.activeHabits.length === 0 ? 0 : completedCount / routine.activeHabits.length,
        streak: calculateRoutineStreak(
          raw.recentCompletions,
          routine.localDate,
          raw.cheatDayOfWeek,
          raw.emptyDayEnabled,
          raw.emptyDayOfWeek,
        ),
      },
      practice: currentPractice ? practiceSummary(currentPractice) : null,
      onboardingComplete: session?.status === "active" && session.onboardingStep === "complete",
    };
  },
});

export const getRoute = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireWebUser(ctx);
    const [session, records] = await Promise.all([
      ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
      ctx.db.query("practices").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);
    const byCycle = new Map(records.map((record) => [record.cycleId, record]));
    const currentCycleId = session?.currentCycleId ?? null;
    const currentDefinition = arqueidentidadFase6Content.practices.find((item) => item.id === currentCycleId) ?? null;
    return {
      currentCycleId,
      current: currentDefinition
        ? {
            id: currentDefinition.id,
            title: currentDefinition.title,
            phase: phaseForCycle(currentDefinition.id),
            instructions: currentDefinition.body,
            status: byCycle.get(currentDefinition.id)?.status ?? "planned",
          }
        : null,
      sequence: arqueidentidadFase6Content.practices.map((definition) => {
        const record = byCycle.get(definition.id);
        return {
          id: definition.id,
          title: definition.title,
          phase: phaseForCycle(definition.id),
          status: record?.status ?? "locked",
          isCurrent: definition.id === currentCycleId,
        };
      }),
    };
  },
});

export const getIdentityMap = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireWebUser(ctx);
    const [profile, session] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
      ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    ]);
    if (!profile) throw new ConvexError({ code: "PROFILE_NOT_FOUND", message: "Tu mapa todavia no esta disponible." });
    return {
      onboardingComplete: session?.status === "active" && session.onboardingStep === "complete",
      dreamline: profile.dreamline ?? null,
      fearSetting: profile.fearSetting ?? null,
      initialIdentity: profile.initialIdentity ?? null,
      hero: profile.heroName ? { name: profile.heroName, why: profile.heroWhy ?? "" } : null,
      challenges: {
        internal: profile.villainInternal ?? null,
        external: profile.villainExternal ?? null,
        philosophical: profile.villainPhilosophical ?? null,
      },
      resonances: profile.resonances ?? [],
      limits: profile.limits,
    };
  },
});

export const getHistory = query({
  args: { before: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId } = await requireWebUser(ctx);
    const limit = Math.max(5, Math.min(30, Math.round(args.limit ?? 20)));
    const ledgerQuery = ctx.db.query("ledger").withIndex("by_user_created", (q) =>
      args.before === undefined ? q.eq("userId", userId) : q.eq("userId", userId).lt("createdAt", args.before),
    );
    const routineQuery = ctx.db.query("dailyHabitCompletions").withIndex("by_user_created", (q) =>
      args.before === undefined ? q.eq("userId", userId) : q.eq("userId", userId).lt("createdAt", args.before),
    );
    const [ledger, routine] = await Promise.all([
      ledgerQuery.order("desc").take(limit),
      routineQuery.order("desc").take(limit),
    ]);
    const items = [
      ...ledger.map((event) => ({
        id: event._id,
        kind: "practice" as const,
        at: event.createdAt,
        title: historyTitle(event.eventType),
        detail: event.evidence,
      })),
      ...routine.map((event) => ({
        id: event._id,
        kind: "routine" as const,
        at: event.createdAt,
        title: event.status === "done" ? "Rutina completada" : "Rutina actualizada",
        detail: `${event.completedHabitKeys.length} habitos registrados`,
      })),
    ].sort((left, right) => right.at - left.at).slice(0, limit);
    return {
      items,
      nextBefore: items.length === limit ? items[items.length - 1]?.at ?? null : null,
    };
  },
});

export const getHabits = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireWebUser(ctx);
    const habits = await ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return habits
      .sort((left, right) => left.slot - right.slot || left.addedAt - right.addedAt)
      .map((habit) => ({
        id: habit._id,
        habitKey: habit.habitKey,
        title: habit.title,
        description: habit.description,
        slot: habit.slot,
        source: habit.source,
        status: habit.status,
        unlockWeek: habit.unlockWeek,
      }));
  },
});

export const getKnowledgeIndex = query({
  args: {},
  handler: async (ctx) => {
    await requireWebUser(ctx);
    return knowledgeSections().map(({ slug, title, body }) => ({
      slug,
      title,
      excerpt: firstParagraph(body).slice(0, 220),
    }));
  },
});

export const getKnowledgeEntry = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    await requireWebUser(ctx);
    const entry = knowledgeSections().find((section) => section.slug === args.slug);
    if (!entry) throw new ConvexError({ code: "KNOWLEDGE_NOT_FOUND", message: "No encontramos ese tema." });
    return entry;
  },
});

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const { user, userId } = await requireWebUser(ctx);
    const [profile, sessions] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
      ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
    ]);
    return {
      timezone: user.timezone,
      cadence: profile?.cadence ?? null,
      cheatDayOfWeek: profile?.cheatDayOfWeek ?? null,
      emptyDayOfWeek: profile?.emptyDayOfWeek ?? null,
      activeWebSessions: sessions.filter((session) => session.expirationTime > Date.now()).length,
      reminderHoursEditable: false,
    };
  },
});

export const setTodayHabitCompletion = mutation({
  args: { habitKey: v.string(), completed: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireWebUser(ctx);
    return await setDailyHabitCompletionDirect(ctx, userId, [args.habitKey], args.completed);
  },
});

export const completeAllTodayHabits = mutation({
  args: { completed: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireWebUser(ctx);
    const raw = await loadRoutineInput(ctx, userId, Date.now());
    const state = deriveDailyRoutineState(raw);
    const keys = state.activeHabits.map((habit) => habit.habitKey);
    if (keys.length === 0) throw new ConvexError({ code: "NO_ACTIVE_HABITS", message: "No hay habitos activos para hoy." });
    return await setDailyHabitCompletionDirect(ctx, userId, keys, args.completed);
  },
});

export const updateSettings = mutation({
  args: {
    timezone: v.optional(v.string()),
    cadence: v.optional(cadence),
    cheatDayOfWeek: v.optional(v.number()),
    emptyDayOfWeek: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, userId } = await requireWebUser(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (!profile) throw new ConvexError({ code: "PROFILE_NOT_FOUND", message: "Tu configuracion todavia no esta disponible." });

    const timezone = args.timezone === undefined ? user.timezone : validateTimezone(args.timezone);
    const cheatDay = args.cheatDayOfWeek ?? profile.cheatDayOfWeek;
    const emptyDay = args.emptyDayOfWeek ?? profile.emptyDayOfWeek;
    if (cheatDay !== undefined && (!Number.isInteger(cheatDay) || cheatDay < 0 || cheatDay > 6)) {
      throw new ConvexError({ code: "INVALID_WEEKDAY", message: "El dia elegido no es valido." });
    }
    if (emptyDay !== undefined && (!Number.isInteger(emptyDay) || emptyDay < 0 || emptyDay > 6)) {
      throw new ConvexError({ code: "INVALID_WEEKDAY", message: "El dia elegido no es valido." });
    }
    if (cheatDay !== undefined && emptyDay !== undefined && cheatDay === emptyDay) {
      throw new ConvexError({ code: "DAYS_MUST_DIFFER", message: "El cheat day y el dia vacio deben ser distintos." });
    }

    if (timezone !== user.timezone) await ctx.db.patch(userId, { timezone, lastSeenAt: Date.now() });
    await ctx.db.patch(profile._id, {
      ...(args.cadence === undefined ? {} : { cadence: args.cadence }),
      ...(args.cheatDayOfWeek === undefined ? {} : { cheatDayOfWeek: args.cheatDayOfWeek }),
      ...(args.emptyDayOfWeek === undefined ? {} : { emptyDayOfWeek: args.emptyDayOfWeek }),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const resetAllUserData = mutation({
  args: { confirmation: v.literal("DELETE_ALL_USER_DATA") },
  handler: async (ctx) => {
    const { userId, sessionId } = await requireWebUser(ctx);
    const [
      profiles,
      domainSessions,
      webLoginLinks,
      memories,
      practices,
      ledger,
      dailyHabits,
      dailyHabitCompletions,
      dailyHabitCheckins,
      messages,
      routerDecisions,
      reports,
      authSessions,
      authAccounts,
    ] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("webLoginLinks").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("memories").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("practices").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("ledger").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("dailyHabitCompletions").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("dailyHabitCheckins").withIndex("by_user_date_window", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("messages").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("routerDecisions").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("reports").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect(),
    ]);

    const otherAuthSessions = authSessions.filter((session) => session._id !== sessionId);
    const refreshTokens = (await Promise.all(otherAuthSessions.map((session) =>
      ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).collect()
    ))).flat();
    const verificationCodes = (await Promise.all(authAccounts.map((account) =>
      ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", account._id)).collect()
    ))).flat();

    for (const document of ledger) await ctx.db.delete(document._id);
    for (const document of dailyHabitCompletions) await ctx.db.delete(document._id);
    for (const document of dailyHabitCheckins) await ctx.db.delete(document._id);
    for (const document of dailyHabits) await ctx.db.delete(document._id);
    for (const document of practices) await ctx.db.delete(document._id);
    for (const document of memories) await ctx.db.delete(document._id);
    for (const document of messages) await ctx.db.delete(document._id);
    for (const document of routerDecisions) await ctx.db.delete(document._id);
    for (const document of reports) await ctx.db.delete(document._id);
    for (const document of webLoginLinks) await ctx.db.delete(document._id);
    for (const document of profiles) await ctx.db.delete(document._id);
    for (const document of domainSessions) await ctx.db.delete(document._id);
    for (const document of verificationCodes) await ctx.db.delete(document._id);
    for (const document of authAccounts) await ctx.db.delete(document._id);
    for (const document of refreshTokens) await ctx.db.delete(document._id);
    for (const document of otherAuthSessions) await ctx.db.delete(document._id);

    const now = Date.now();
    await ctx.db.insert("profiles", { userId, limits: [], updatedAt: now });
    await ctx.db.insert("sessions", {
      userId,
      status: "onboarding",
      onboardingStep: "introduction",
      updatedAt: now,
    });

    return { ok: true, onboardingStep: "introduction" as const };
  },
});

function routineDto(state: DailyRoutineState) {
  return {
    localDate: state.localDate,
    dayType: state.dayType,
    currentRoutineWeek: state.currentRoutineWeek,
    habits: state.activeHabits.map((habit) => ({
      habitKey: habit.habitKey,
      title: habit.title,
      description: habit.description,
      completed: state.completedHabitKeys.includes(habit.habitKey),
    })),
  };
}

function practiceSummary(practice: Doc<"practices">) {
  return {
    id: practice._id,
    cycleId: practice.cycleId,
    title: practice.title,
    status: practice.status,
    phase: phaseForCycle(practice.cycleId),
  };
}

function phaseForCycle(cycleId: string): "configuracion" | "preliminar" | "liminar" | "postliminar" {
  const number = Number(cycleId.match(/^cycle(\d+)/)?.[1] ?? 0);
  if (number === 0) return "configuracion";
  if (number <= 3) return "preliminar";
  if (number <= 6) return "liminar";
  return "postliminar";
}

function historyTitle(eventType: Doc<"ledger">["eventType"]): string {
  if (eventType === "prep") return "Preparacion registrada";
  if (eventType === "challenge") return "Reto registrado";
  if (eventType === "debrief") return "Evidencia de practica";
  if (eventType === "integration") return "Integracion registrada";
  return "Recuperacion registrada";
}

function knowledgeSections(): Array<{ slug: string; title: string; body: string }> {
  const source = arqueidentidadFase6Content.knowledge;
  const matches = [...source.matchAll(/^##\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const title = match[1]?.trim() ?? "Tema";
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    return { slug: slugify(title), title, body: source.slice(start, end).trim() };
  });
}

function firstParagraph(body: string): string {
  return body.split(/\n\s*\n/).find((paragraph) => paragraph.trim().length > 0)?.replace(/\s+/g, " ").trim() ?? "";
}

function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function validateTimezone(value: string): string {
  if (value.length < 3 || value.length > 80) {
    throw new ConvexError({ code: "INVALID_TIMEZONE", message: "La zona horaria no es valida." });
  }
  try {
    new Intl.DateTimeFormat("es", { timeZone: value }).format(new Date());
    return value;
  } catch {
    throw new ConvexError({ code: "INVALID_TIMEZONE", message: "La zona horaria no es valida." });
  }
}
