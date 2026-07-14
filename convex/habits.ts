import { v } from "convex/values";
import {
  baseTummoHabit,
  calculateRoutineStreak,
  deriveDailyRoutineState,
  localDateParts,
  parseHabitCompletionReply,
  renderDailyHabitTui,
  renderHabitCheckinPrompt,
  renderRoutineHistory,
  weekdayFromSpanish,
  type DailyCompletion,
  type HabitCheckinWindow,
} from "../bridgecrux/habits";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const dayType = v.union(v.literal("routine"), v.literal("cheat"), v.literal("empty"));
const checkinWindow = v.union(v.literal("morning"), v.literal("evening"));

export type DailyHabitCatalogItem = {
  slot: number;
  habitKey: string;
  title: string;
  description: string;
  source: "base_tummo_identity" | "hyperthematic_best_practice" | "manual_user_choice";
  status: "active" | "paused" | "archived";
  unlockWeek: number;
  compressedPractice?: string;
  planPrompt?: string;
};

export const getDailyRoutineState = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const raw = await loadRoutineInput(ctx, args.userId, args.nowMs ?? Date.now());
    const state = deriveDailyRoutineState(raw);
    const completions = raw.recentCompletions;
    return {
      state,
      tui: renderDailyHabitTui(state),
      checkinPromptMorning: renderHabitCheckinPrompt(state, "morning"),
      checkinPromptEvening: renderHabitCheckinPrompt(state, "evening"),
      streak: calculateRoutineStreak(completions, state.localDate, raw.cheatDayOfWeek, raw.emptyDayEnabled, raw.emptyDayOfWeek),
      needsCheatDay: raw.cheatDayOfWeek === undefined,
    };
  },
});

export const getDailyHabitCatalog = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const habits = await ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    return habits
      .sort((left, right) => left.slot - right.slot || left.addedAt - right.addedAt)
      .map(toDailyHabitDefinition);
  },
});

export const getDailyRoutineHistory = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(30, Math.round(args.limit ?? 14)));
    const [entries, habits] = await Promise.all([
      ctx.db.query("dailyHabitCompletions").withIndex("by_user_created", (q) => q.eq("userId", args.userId)).order("desc").take(limit),
      ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect(),
    ]);
    const history = entries.map(toDailyCompletion);
    return {
      entries: history,
      tui: renderRoutineHistory(history, habits.map(toDailyHabitDefinition)),
    };
  },
});

export const listUsersForHabitCheckin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(500);
    return users.map((user) => ({
      userId: user._id,
      chatId: user.chatId,
      timezone: user.timezone,
    }));
  },
});

export const ensureBaseDailyHabit = internalMutation({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ensureBaseHabitDirect(ctx, args.userId, user.timezone, now);
    return { ok: true };
  },
});

export const setCheatDay = internalMutation({
  args: {
    userId: v.id("users"),
    weekday: v.number(),
    emptyDayOfWeek: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.weekday < 0 || args.weekday > 6) throw new Error("Invalid weekday");
    if (args.emptyDayOfWeek !== undefined && (args.emptyDayOfWeek < 0 || args.emptyDayOfWeek > 6)) throw new Error("Invalid empty weekday");
    const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    if (!profile) throw new Error("Profile not found");
    await ctx.db.patch(profile._id, {
      cheatDayOfWeek: args.weekday,
      emptyDayOfWeek: args.emptyDayOfWeek ?? (args.weekday + 1) % 7,
      emptyDayEnabled: true,
      updatedAt: Date.now(),
    });
    return { ok: true, weekday: args.weekday, emptyDayOfWeek: args.emptyDayOfWeek ?? (args.weekday + 1) % 7 };
  },
});

export const markDailyHabitsDone = internalMutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    habitKeys: v.optional(v.array(v.string())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ensureBaseHabitDirect(ctx, args.userId, user.timezone, now);

    const raw = await loadRoutineInput(ctx, args.userId, now);
    const state = deriveDailyRoutineState(raw);
    const parsed = parseHabitCompletionReply(args.text, state);
    const habitKeys = args.habitKeys ?? parsed.habitKeys;

    if (parsed.kind === "ambiguous") {
      return {
        ok: false,
        changed: false,
        message: [
          "No marque ningun habito porque la referencia puede significar mas de uno.",
          "Dime el nombre completo de uno de estos:",
          ...(parsed.candidates ?? []).map((title) => `- ${title}`),
        ].join("\n"),
      };
    }

    if (parsed.kind === "show_status" || parsed.kind === "none") {
      return {
        ok: false,
        changed: false,
        message: renderDailyHabitTui(state),
      };
    }

    const existing = await ctx.db
      .query("dailyHabitCompletions")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("localDate", state.localDate))
      .unique();

    const completed = unique([
      ...(existing?.completedHabitKeys ?? []),
      ...habitKeys,
    ]);
    const pending = state.activeHabits.map((habit) => habit.habitKey).filter((key) => !completed.includes(key));
    const status: "partial" | "done" | "skipped_intentional" = state.dayType === "cheat"
      ? "skipped_intentional"
      : pending.length === 0 || parsed.kind === "empty_done"
        ? "done"
        : "partial";

    const patch = {
      userId: args.userId,
      localDate: state.localDate,
      dayType: state.dayType,
      status,
      completedHabitKeys: state.dayType === "empty" ? [] : completed,
      pendingHabitKeysAtCompletion: pending,
      evidence: args.text.slice(0, 2000),
      tummoDone: parsed.tummoDone ?? completed.includes("tummo_identity_base"),
      archePracticeBridgeDone: parsed.archePracticeBridgeDone ?? (state.archePracticeBridgeMode === "none" ? false : pending.length === 0),
      archePracticeBridgeMode: state.archePracticeBridgeMode,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("dailyHabitCompletions", {
        ...patch,
        createdAt: now,
      });
    }

    const fresh = deriveDailyRoutineState({
      ...raw,
      completion: {
        localDate: state.localDate,
        dayType: state.dayType,
        status,
        completedHabitKeys: patch.completedHabitKeys,
      },
    });

    return {
      ok: true,
      changed: true,
      status,
      message: renderHabitCompletionResult(fresh, status),
    };
  },
});

export async function setDailyHabitCompletionDirect(
  ctx: MutationCtx,
  userId: Id<"users">,
  habitKeys: string[],
  completed: boolean,
  now = Date.now(),
) {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  await ensureBaseHabitDirect(ctx, userId, user.timezone, now);

  const raw = await loadRoutineInput(ctx, userId, now);
  const state = deriveDailyRoutineState(raw);
  if (state.dayType !== "routine") {
    throw new Error("ROUTINE_NOT_ACTIVE_TODAY");
  }

  const activeKeys = new Set(state.activeHabits.map((habit) => habit.habitKey));
  if (habitKeys.length === 0 || habitKeys.some((key) => !activeKeys.has(key))) {
    throw new Error("HABIT_NOT_ACTIVE");
  }

  const existing = await ctx.db
    .query("dailyHabitCompletions")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("localDate", state.localDate))
    .unique();
  const changedKeys = new Set(habitKeys);
  const completedKeys = new Set(existing?.completedHabitKeys ?? []);
  for (const key of changedKeys) {
    if (completed) completedKeys.add(key);
    else completedKeys.delete(key);
  }

  const completedHabitKeys = state.activeHabits
    .map((habit) => habit.habitKey)
    .filter((key) => completedKeys.has(key));
  const pendingHabitKeysAtCompletion = state.activeHabits
    .map((habit) => habit.habitKey)
    .filter((key) => !completedKeys.has(key));
  const status: "partial" | "done" = pendingHabitKeysAtCompletion.length === 0 ? "done" : "partial";
  const patch = {
    userId,
    localDate: state.localDate,
    dayType: state.dayType,
    status,
    completedHabitKeys,
    pendingHabitKeysAtCompletion,
    evidence: "Actualizacion desde la aplicacion web.",
    tummoDone: completedKeys.has("tummo_identity_base"),
    archePracticeBridgeDone: state.archePracticeBridgeMode !== "none" && pendingHabitKeysAtCompletion.length === 0,
    archePracticeBridgeMode: state.archePracticeBridgeMode,
    updatedAt: now,
  };

  if (existing) await ctx.db.patch(existing._id, patch);
  else await ctx.db.insert("dailyHabitCompletions", { ...patch, createdAt: now });

  return {
    localDate: state.localDate,
    completedHabitKeys,
    pendingHabitKeys: pendingHabitKeysAtCompletion,
    status,
  };
}

export const markHabitCheckinSent = internalMutation({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
    localDate: v.string(),
    window: checkinWindow,
    dayType,
    promptText: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyHabitCheckins")
      .withIndex("by_user_date_window", (q) => q.eq("userId", args.userId).eq("localDate", args.localDate).eq("window", args.window))
      .unique();
    if (existing) return { ok: true, skipped: true, checkinId: existing._id };
    const checkinId = await ctx.db.insert("dailyHabitCheckins", {
      userId: args.userId,
      chatId: args.chatId,
      localDate: args.localDate,
      window: args.window,
      dayType: args.dayType,
      promptText: args.promptText,
      sentAt: args.nowMs ?? Date.now(),
    });
    return { ok: true, skipped: false, checkinId };
  },
});

export const markHabitCheckinResponded = internalMutation({
  args: {
    userId: v.id("users"),
    localDate: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const checkins = await ctx.db
      .query("dailyHabitCheckins")
      .withIndex("by_user_date_window", (q) => q.eq("userId", args.userId).eq("localDate", args.localDate))
      .take(10);
    for (const checkin of checkins) {
      if (checkin.respondedAt === undefined) await ctx.db.patch(checkin._id, { respondedAt: args.nowMs ?? Date.now() });
    }
    return { ok: true, count: checkins.length };
  },
});

export const addCoreRoutineHabit = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    createdFromCycleId: v.optional(v.string()),
    createdFromHyperthematic: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ensureBaseHabitDirect(ctx, args.userId, user.timezone, now);
    const habits = await ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const active = habits.filter((habit) => habit.status === "active");
    if (active.length >= 4) return { ok: false, reason: "max_habits" };
    const normalizedTitle = normalizeHabitTitle(args.title);
    if (habits.some((habit) => habit.status !== "archived" && normalizeHabitTitle(habit.title) === normalizedTitle)) {
      return { ok: false, reason: "already_exists" };
    }
    const usedSlots = new Set(habits.filter((habit) => habit.status !== "archived").map((habit) => habit.slot));
    const slot = [2, 3, 4].find((candidate) => !usedSlots.has(candidate));
    if (slot === undefined) return { ok: false, reason: "no_available_slot" };
    const habitKey = uniqueHabitKey(args.title, slot, habits, now);
    await ctx.db.insert("dailyHabits", {
      userId: args.userId,
      slot,
      habitKey,
      title: args.title.slice(0, 120),
      description: (args.description ?? "Habito elegido por el usuario para reforzar identidad diaria.").slice(0, 500),
      source: "manual_user_choice",
      status: "active",
      unlockWeek: slot === 2 ? 5 : slot === 3 ? 9 : 13,
      addedAt: now,
      ...(args.createdFromCycleId !== undefined ? { createdFromCycleId: args.createdFromCycleId } : {}),
      ...(args.createdFromHyperthematic !== undefined ? { createdFromHyperthematic: args.createdFromHyperthematic } : {}),
    });
    return { ok: true, habitKey, slot };
  },
});

export const setDailyHabitStatus = internalMutation({
  args: {
    userId: v.id("users"),
    habitKey: v.string(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    const habit = await ctx.db
      .query("dailyHabits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("habitKey"), args.habitKey))
      .first();
    if (!habit) return { ok: false, reason: "not_found", title: "" };
    if (habit.source === "base_tummo_identity") return { ok: false, reason: "base_protected", title: habit.title };
    if (habit.status === args.status) return { ok: true, reason: "unchanged", title: habit.title };

    if (args.status === "active") {
      const habits = await ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
      if (habits.filter((candidate) => candidate.status === "active").length >= 4) {
        return { ok: false, reason: "max_habits", title: habit.title };
      }
      if (habits.some((candidate) => candidate._id !== habit._id && candidate.status === "active" && candidate.slot === habit.slot)) {
        return { ok: false, reason: "slot_conflict", title: habit.title };
      }
    }

    await ctx.db.patch(habit._id, { status: args.status });
    return { ok: true, reason: "updated", title: habit.title };
  },
});

export const condenseDailyHabits = internalMutation({
  args: {
    userId: v.id("users"),
    sourceHabitKeys: v.array(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const requested = unique(args.sourceHabitKeys);
    if (requested.length < 2) return { ok: false, reason: "needs_two", title: "" };
    const habits = await ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const sources = habits.filter((habit) => requested.includes(habit.habitKey));
    if (sources.length !== requested.length) return { ok: false, reason: "not_found", title: "" };
    if (sources.some((habit) => habit.source === "base_tummo_identity")) return { ok: false, reason: "base_protected", title: "" };
    if (sources.some((habit) => habit.status !== "active")) return { ok: false, reason: "source_not_active", title: "" };

    const slot = Math.min(...sources.map((habit) => habit.slot));
    const title = args.title.trim().slice(0, 120);
    if (!title) return { ok: false, reason: "missing_title", title: "" };
    const habitKey = uniqueHabitKey(title, slot, habits, now);
    for (const source of sources) await ctx.db.patch(source._id, { status: "archived" });
    await ctx.db.insert("dailyHabits", {
      userId: args.userId,
      slot,
      habitKey,
      title,
      description: (args.description ?? `Rutina condensada desde: ${sources.map((habit) => habit.title).join(", ")}.`).slice(0, 500),
      source: "manual_user_choice",
      status: "active",
      unlockWeek: Math.min(...sources.map((habit) => habit.unlockWeek)),
      addedAt: now,
    });
    return { ok: true, reason: "updated", title, habitKey, archivedTitles: sources.map((habit) => habit.title) };
  },
});

export const maybeUnlockNextRoutineHabit = internalMutation({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const raw = await loadRoutineInput(ctx, args.userId, args.nowMs ?? Date.now());
    const state = deriveDailyRoutineState(raw);
    return {
      nextUnlockSlot: state.nextUnlockSlot ?? null,
      prompt: state.nextUnlockSlot ? renderUnlockPrompt(state.nextUnlockSlot, raw.recentEvidence) : "",
    };
  },
});

export function parseCheatDayArg(text: string): number | null {
  return weekdayFromSpanish(text);
}

export async function loadRoutineInput(ctx: QueryCtx | MutationCtx, userId: Id<"users">, nowMs: number) {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  const habits = await ctx.db.query("dailyHabits").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  const date = localDateParts(nowMs, user.timezone);
  const completion = await ctx.db
    .query("dailyHabitCompletions")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("localDate", date.localDate))
    .unique();
  const recentCompletionsDocs = await ctx.db
    .query("dailyHabitCompletions")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(60);
  const currentPractice = await loadCurrentPractice(ctx, userId);
  const recentLedger = await ctx.db
    .query("ledger")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(10);

  return {
    nowMs,
    timezone: user.timezone,
    routineStartDate: profile?.routineStartDate,
    cheatDayOfWeek: profile?.cheatDayOfWeek,
    emptyDayOfWeek: profile?.emptyDayOfWeek,
    emptyDayEnabled: profile?.emptyDayEnabled ?? true,
    cadence: profile?.cadence,
    habits: habits.map(toDailyHabitDefinition),
    completion: completion ? toDailyCompletion(completion) : null,
    recentCompletions: recentCompletionsDocs.map(toDailyCompletion),
    currentPracticeTitle: currentPractice?.title,
    currentPracticeCycleId: currentPractice?.cycleId,
    recentEvidence: recentLedger.map((item) => item.evidence).join("\n"),
  };
}

async function ensureBaseHabitDirect(ctx: MutationCtx, userId: Id<"users">, timezone: string, now: number) {
  const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  if (!profile) throw new Error("Profile not found");
  const date = localDateParts(now, timezone);
  const existing = await ctx.db
    .query("dailyHabits")
    .withIndex("by_user_slot", (q) => q.eq("userId", userId).eq("slot", 1))
    .unique();
  if (!existing) {
    const base = baseTummoHabit(now);
    const baseDoc: {
      userId: Id<"users">;
      slot: number;
      habitKey: string;
      title: string;
      description: string;
      source: "base_tummo_identity" | "hyperthematic_best_practice" | "manual_user_choice";
      status: "active" | "paused" | "archived";
      unlockWeek: number;
      addedAt: number;
      compressedPractice?: string;
      planPrompt?: string;
    } = {
      userId,
      slot: base.slot,
      habitKey: base.habitKey,
      title: base.title,
      description: base.description,
      source: base.source,
      status: base.status,
      unlockWeek: base.unlockWeek,
      addedAt: now,
    };
    if (base.compressedPractice !== undefined) baseDoc.compressedPractice = base.compressedPractice;
    if (base.planPrompt !== undefined) baseDoc.planPrompt = base.planPrompt;
    await ctx.db.insert("dailyHabits", baseDoc);
  }
  const profilePatch: Record<string, unknown> = { updatedAt: now };
  if (!profile.routineStartedAt) profilePatch.routineStartedAt = now;
  if (!profile.routineStartDate) profilePatch.routineStartDate = date.localDate;
  if (profile.emptyDayEnabled === undefined) profilePatch.emptyDayEnabled = true;
  if (profile.dailyHabitMorningHour === undefined) profilePatch.dailyHabitMorningHour = 6;
  if (profile.dailyHabitEveningHour === undefined) profilePatch.dailyHabitEveningHour = 18;
  if (Object.keys(profilePatch).length > 1) await ctx.db.patch(profile._id, profilePatch);
}

async function loadCurrentPractice(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Doc<"practices"> | null> {
  const session = await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  if (session?.currentPracticeId) return await ctx.db.get(session.currentPracticeId);
  return await ctx.db.query("practices").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").first();
}

function toDailyHabitDefinition(doc: Doc<"dailyHabits">): DailyHabitCatalogItem {
  const habit: DailyHabitCatalogItem = {
    slot: doc.slot,
    habitKey: doc.habitKey,
    title: doc.title,
    description: doc.description,
    source: doc.source,
    status: doc.status,
    unlockWeek: doc.unlockWeek,
  };
  if (doc.compressedPractice !== undefined) habit.compressedPractice = doc.compressedPractice;
  if (doc.planPrompt !== undefined) habit.planPrompt = doc.planPrompt;
  return habit;
}

function toDailyCompletion(doc: Doc<"dailyHabitCompletions">): DailyCompletion {
  return {
    localDate: doc.localDate,
    dayType: doc.dayType,
    status: doc.status,
    completedHabitKeys: doc.completedHabitKeys,
  };
}

function renderHabitCompletionResult(state: ReturnType<typeof deriveDailyRoutineState>, status: "partial" | "done" | "skipped_intentional"): string {
  if (state.dayType === "empty") {
    return [
      "Dia vacio cerrado.",
      "--------------------------------",
      "La semana queda reiniciada desde filosofia, no desde presion.",
    ].join("\n");
  }
  if (status === "done") {
    return [
      "Dia marcado.",
      "--------------------------------",
      ...state.activeHabits.map((habit) => `[x] ${habit.title}`),
      "",
      "Este voto cuenta para tu identidad de hoy.",
    ].join("\n");
  }
  return [
    "Guardado parcial.",
    "--------------------------------",
    ...state.activeHabits.map((habit) => `${state.completedHabitKeys.includes(habit.habitKey) ? "[x]" : "[ ]"} ${habit.title}`),
    "",
    "Te queda una pieza. Responde \"hecho\" cuando la cierres.",
  ].join("\n");
}

function renderUnlockPrompt(slot: number, recentEvidence: string): string {
  const suggestion = suggestHabitFromEvidence(recentEvidence);
  return [
    "NUEVO SLOT DE RUTINA DISPONIBLE",
    "--------------------------------",
    `Se abrio el slot ${slot}. Puedes convertir una hipertematica fuerte en habito diario.`,
    "",
    "Sugerencia por tu evidencia reciente:",
    suggestion,
    "",
    "Responde \"agregar esta\" o escribe el habito que quieres automatizar.",
  ].join("\n");
}

function suggestHabitFromEvidence(evidence: string): string {
  const lines = evidence.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const hyper = lines.find((line) => /hipertematica|ancla|identidad|microtematica/i.test(line));
  if (hyper) return `${hyper.slice(0, 120)} -> 60 segundos diarios de postura, frase y accion minima.`;
  return "Hipertematica diaria -> 60 segundos de postura, frase y una accion pequena que vote por tu identidad.";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugHabit(title: string, slot: number): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return `slot_${slot}_${slug || "habito"}`;
}

function uniqueHabitKey(title: string, slot: number, habits: Doc<"dailyHabits">[], now: number): string {
  const base = slugHabit(title, slot);
  return habits.some((habit) => habit.habitKey === base) ? `${base}_${now.toString(36)}` : base;
}

function normalizeHabitTitle(title: string): string {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
