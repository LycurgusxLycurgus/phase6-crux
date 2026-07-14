import { describe, expect, it } from "vitest";
import {
  baseTummoHabit,
  calculateRoutineStreak,
  calculateRoutineWeek,
  deriveDailyRoutineState,
  getDayType,
  getUnlockSlotForWeek,
  parseHabitCompletionReply,
  renderDailyHabitTui,
  renderHabitCheckinPrompt,
  renderRoutineHistory,
  resolveHabitReferences,
  weekdayFromSpanish,
  type DailyCompletion,
} from "./habits";

const mondayNoonBogota = Date.parse("2026-06-08T17:00:00Z");
const mondayThreeAmBogota = Date.parse("2026-06-08T08:00:00Z");

describe("BridgeCrux habits", () => {
  it("derives routine, cheat and empty day types with wraparound", () => {
    expect(getDayType(0, 0)).toBe("cheat");
    expect(getDayType(1, 0)).toBe("empty");
    expect(getDayType(0, 6)).toBe("empty");
    expect(getDayType(2, 0)).toBe("routine");
  });

  it("calculates routine weeks and unlock slots", () => {
    expect(calculateRoutineWeek("2026-06-08", "2026-06-08")).toBe(1);
    expect(calculateRoutineWeek("2026-06-08", "2026-07-06")).toBe(5);
    expect(getUnlockSlotForWeek(4)).toBeNull();
    expect(getUnlockSlotForWeek(5)).toBe(2);
    expect(getUnlockSlotForWeek(9)).toBe(3);
    expect(getUnlockSlotForWeek(13)).toBe(4);
  });

  it("derives Tummo bridge mode from active practice cadence", () => {
    const state = deriveDailyRoutineState({
      nowMs: mondayNoonBogota,
      timezone: "America/Bogota",
      routineStartDate: "2026-06-08",
      habits: [baseTummoHabit()],
      cadence: "biweekly",
      currentPracticeCycleId: "cycle1_prehypnos_nsdr",
      currentPracticeTitle: "Ciclo 1 - NSDR",
    });

    expect(state.dayType).toBe("routine");
    expect(state.archePracticeBridgeMode).toBe("plan");
    expect(state.pendingHabitKeys).toEqual(["tummo_identity_base"]);
  });

  it("renders routine, cheat and empty TUI panels", () => {
    const routine = deriveDailyRoutineState({
      nowMs: mondayNoonBogota,
      timezone: "America/Bogota",
      routineStartDate: "2026-06-08",
      habits: [baseTummoHabit()],
    });
    expect(renderDailyHabitTui(routine)).toContain("RUTINA NUCLEO");

    const cheat = deriveDailyRoutineState({
      nowMs: mondayNoonBogota,
      timezone: "America/Bogota",
      cheatDayOfWeek: 1,
      habits: [baseTummoHabit()],
    });
    expect(renderDailyHabitTui(cheat)).toContain("cheat day");

    const emptyWindow = deriveDailyRoutineState({
      nowMs: mondayThreeAmBogota,
      timezone: "America/Bogota",
      cheatDayOfWeek: 0,
      habits: [baseTummoHabit()],
    });
    expect(renderDailyHabitTui(emptyWindow)).toContain("DIA VACIO");

    const emptyAfterWindow = deriveDailyRoutineState({
      nowMs: mondayNoonBogota,
      timezone: "America/Bogota",
      cheatDayOfWeek: 0,
      habits: [baseTummoHabit()],
    });
    expect(emptyAfterWindow.dayType).toBe("routine");
    expect(emptyAfterWindow.scheduledDayType).toBe("empty");
    expect(emptyAfterWindow.pendingHabitKeys).toEqual(["tummo_identity_base"]);
    expect(renderDailyHabitTui(emptyAfterWindow)).toContain("la ventana de vaciado termino");
  });

  it("parses completion replies without confusing status requests", () => {
    const state = deriveDailyRoutineState({
      nowMs: mondayNoonBogota,
      timezone: "America/Bogota",
      habits: [baseTummoHabit()],
    });

    expect(parseHabitCompletionReply("rutina", state).kind).toBe("show_status");
    expect(parseHabitCompletionReply("tummo hecho", state)).toMatchObject({
      kind: "partial",
      habitKeys: ["tummo_identity_base"],
    });
    expect(parseHabitCompletionReply("rutina lista", state).kind).toBe("complete_all");
  });

  it("resolves a named habit without marking the whole routine", () => {
    const habits = [
      baseTummoHabit(),
      {
        slot: 2,
        habitKey: "slot_2_diario",
        title: "Diario de gratitud",
        description: "Escribir una linea",
        source: "manual_user_choice" as const,
        status: "active" as const,
        unlockWeek: 1,
      },
    ];
    const state = deriveDailyRoutineState({
      nowMs: mondayNoonBogota,
      timezone: "America/Bogota",
      habits,
    });

    expect(parseHabitCompletionReply("diario de gratitud hecho", state)).toMatchObject({
      kind: "partial",
      habitKeys: ["slot_2_diario"],
    });
    expect(resolveHabitReferences("termine gratitud", habits)).toMatchObject({
      kind: "resolved",
      habitKeys: ["slot_2_diario"],
    });
  });

  it("keeps ambiguous habit references non-mutating", () => {
    const habits = [
      { ...baseTummoHabit(), habitKey: "respirar_1", title: "Respirar con calma" },
      { ...baseTummoHabit(), habitKey: "respirar_2", title: "Respirar al despertar" },
    ];
    expect(resolveHabitReferences("respirar hecho", habits).kind).toBe("ambiguous");
  });

  it("renders persisted routine history with habit titles", () => {
    const history = renderRoutineHistory([{
      localDate: "2026-06-08",
      dayType: "routine",
      status: "done",
      completedHabitKeys: ["tummo_identity_base"],
    }], [baseTummoHabit()]);
    expect(history).toContain("2026-06-08 - completa");
    expect(history).toContain("Tummo-Identidad");
  });

  it("renders check-in prompt with identity vote, habit and prediction pieces", () => {
    const state = deriveDailyRoutineState({
      nowMs: mondayNoonBogota,
      timezone: "America/Bogota",
      habits: [baseTummoHabit()],
    });
    const prompt = renderHabitCheckinPrompt(state, "morning");
    expect(prompt).toContain("por que votas");
    expect(prompt).toContain("que habitos hiciste hoy");
    expect(prompt).toContain("que habitos vas a hacer manana");
  });

  it("excludes only cheat day from streak because empty day resumes routine", () => {
    const completions: DailyCompletion[] = [
      { localDate: "2026-06-05", dayType: "routine", status: "done", completedHabitKeys: ["tummo_identity_base"] },
      { localDate: "2026-06-08", dayType: "routine", status: "done", completedHabitKeys: ["tummo_identity_base"] },
    ];
    expect(calculateRoutineStreak(completions, "2026-06-08", 6)).toBe(1);
  });

  it("parses Spanish weekday names", () => {
    expect(weekdayFromSpanish("/cheatday domingo")).toBe(0);
    expect(weekdayFromSpanish("quiero viernes")).toBe(5);
  });
});
