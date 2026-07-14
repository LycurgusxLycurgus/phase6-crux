"use node";

import { v } from "convex/values";
import { renderHabitCheckinPrompt } from "../bridgecrux/habits";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { sendTelegramText } from "./telegram";

export const sendMorningHabitCheckins = internalAction({
  args: {},
  handler: async (ctx) => {
    return await sendHabitCheckins(ctx, "morning");
  },
});

export const sendEveningHabitCheckins = internalAction({
  args: {},
  handler: async (ctx) => {
    return await sendHabitCheckins(ctx, "evening");
  },
});

export const sendHabitCheckinForUser = internalAction({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
    window: v.union(v.literal("morning"), v.literal("evening")),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId: args.userId });
    const routine = await ctx.runQuery(internal.habits.getDailyRoutineState, { userId: args.userId });
    const state = routine.state;
    if (state.dayType === "cheat") return { ok: true, skipped: "cheat_day" };
    if (state.dayType === "routine" && state.pendingHabitKeys.length === 0) return { ok: true, skipped: "already_done" };

    const promptText = renderHabitCheckinPrompt(state, args.window);
    const sent = await ctx.runMutation(internal.habits.markHabitCheckinSent, {
      userId: args.userId,
      chatId: args.chatId,
      localDate: state.localDate,
      window: args.window,
      dayType: state.dayType,
      promptText,
    });
    if (sent.skipped) return { ok: true, skipped: "duplicate" };

    await sendTelegramText(args.chatId, promptText);
    return { ok: true, skipped: null };
  },
});

async function sendHabitCheckins(ctx: ActionCtx, window: "morning" | "evening") {
  const users: Array<{ userId: Id<"users">; chatId: string; timezone: string }> = await ctx.runQuery(internal.habits.listUsersForHabitCheckin, {});
  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      const result = await ctx.runAction(internal.habitActions.sendHabitCheckinForUser, {
        userId: user.userId,
        chatId: user.chatId,
        window,
      });
      if (result.skipped === null) sent += 1;
      else skipped += 1;
    } catch (error) {
      await ctx.runMutation(internal.store.createReport, {
        userId: user.userId,
        severity: "tool_error",
        summary: `Habit check-in failed: ${error instanceof Error ? error.message : String(error)}`,
        boundary: "habit_checkin",
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ok: true, window, sent, skipped };
}
