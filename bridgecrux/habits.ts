export type DayType = "routine" | "cheat" | "empty";
export type HabitCheckinWindow = "morning" | "evening";
export type HabitSource = "base_tummo_identity" | "hyperthematic_best_practice" | "manual_user_choice";
export type HabitStatus = "active" | "paused" | "archived";
export type ArchePracticeBridgeMode = "do" | "plan" | "none";

export interface DailyHabitDefinition {
  slot: number;
  habitKey: string;
  title: string;
  description: string;
  source: HabitSource;
  status: HabitStatus;
  unlockWeek: number;
  compressedPractice?: string;
  planPrompt?: string;
}

export interface DailyCompletion {
  localDate: string;
  dayType: DayType;
  status: "partial" | "done" | "skipped_intentional";
  completedHabitKeys: string[];
}

export interface DailyRoutineInput {
  nowMs: number;
  timezone: string;
  routineStartDate?: string | undefined;
  cheatDayOfWeek?: number | undefined;
  emptyDayOfWeek?: number | undefined;
  emptyDayEnabled?: boolean | undefined;
  habits: DailyHabitDefinition[];
  completion?: DailyCompletion | null;
  cadence?: "weekly" | "biweekly" | undefined;
  currentPracticeTitle?: string | undefined;
  currentPracticeCycleId?: string | undefined;
}

export interface DailyRoutineState {
  localDate: string;
  weekday: number;
  dayType: DayType;
  scheduledDayType: DayType;
  emptyWindowEndsAtHour?: number;
  currentRoutineWeek: number;
  nextUnlockSlot?: number;
  activeHabits: DailyHabitDefinition[];
  completedHabitKeys: string[];
  pendingHabitKeys: string[];
  tummoRequired: boolean;
  archePracticeBridgeMode: ArchePracticeBridgeMode;
  currentPracticeTitle?: string;
  currentPracticeCycleId?: string;
}

export interface ParsedHabitReply {
  kind: "complete_all" | "partial" | "show_status" | "empty_done" | "ambiguous" | "none";
  habitKeys: string[];
  candidates?: string[];
  tummoDone?: boolean;
  archePracticeBridgeDone?: boolean;
  evidence?: string;
}

export interface HabitReferenceResolution {
  kind: "none" | "resolved" | "ambiguous";
  habitKeys: string[];
  candidates: string[];
}

export interface RoutineHistoryEntry {
  localDate: string;
  dayType: DayType;
  status: "partial" | "done" | "skipped_intentional";
  completedHabitKeys: string[];
}

const BASE_HABIT_KEY = "tummo_identity_base";
const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const EMPTY_DAY_WINDOW_END_HOUR = 6;

export function baseTummoHabit(nowMs = Date.now()): DailyHabitDefinition {
  return {
    slot: 1,
    habitKey: BASE_HABIT_KEY,
    title: "Tummo-Identidad",
    description: "Practica comprimida diaria + puente hacia la siguiente practica Archeidentity.",
    source: "base_tummo_identity",
    status: "active",
    unlockWeek: 1,
    addedAt: nowMs,
    compressedPractice: "Haz la version comprimida de Tummo-Identidad y usa el cuerpo como evidencia de identidad.",
    planPrompt: "Despues de Tummo, haz o planifica el siguiente paso de Archeidentity segun tu practica activa.",
  } as DailyHabitDefinition & { addedAt: number };
}

export function localDateParts(nowMs: number, timezone: string): { localDate: string; weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(nowMs));

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const localDate = `${value("year")}-${value("month")}-${value("day")}`;
  const weekdayText = value("weekday").toLowerCase();
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekdayText);
  return {
    localDate,
    weekday: weekday >= 0 ? weekday : new Date(`${localDate}T00:00:00Z`).getUTCDay(),
    hour: Number(value("hour")),
  };
}

export function getDayType(weekday: number, cheatDayOfWeek?: number, emptyDayEnabled = true, emptyDayOfWeek?: number): DayType {
  if (cheatDayOfWeek === undefined || cheatDayOfWeek < 0 || cheatDayOfWeek > 6) return "routine";
  if (weekday === cheatDayOfWeek) return "cheat";
  const resolvedEmptyDay = emptyDayOfWeek !== undefined && emptyDayOfWeek >= 0 && emptyDayOfWeek <= 6
    ? emptyDayOfWeek
    : (cheatDayOfWeek + 1) % 7;
  if (emptyDayEnabled && weekday === resolvedEmptyDay) return "empty";
  return "routine";
}

export function calculateRoutineWeek(routineStartDate: string | undefined, localDate: string): number {
  if (!routineStartDate) return 1;
  const start = Date.parse(`${routineStartDate}T00:00:00Z`);
  const current = Date.parse(`${localDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(current) || current < start) return 1;
  return Math.floor((current - start) / 604_800_000) + 1;
}

export function getUnlockSlotForWeek(week: number): number | null {
  if (week >= 13) return 4;
  if (week >= 9) return 3;
  if (week >= 5) return 2;
  return null;
}

export function deriveBridgeMode(cadence?: "weekly" | "biweekly", currentPracticeCycleId?: string): ArchePracticeBridgeMode {
  if (!currentPracticeCycleId) return "none";
  return cadence === "weekly" || cadence === "biweekly" ? "plan" : "do";
}

export function deriveDailyRoutineState(input: DailyRoutineInput): DailyRoutineState {
  const date = localDateParts(input.nowMs, input.timezone || "America/Bogota");
  const scheduledDayType = getDayType(date.weekday, input.cheatDayOfWeek, input.emptyDayEnabled ?? true, input.emptyDayOfWeek);
  const dayType = scheduledDayType === "empty" && date.hour >= EMPTY_DAY_WINDOW_END_HOUR ? "routine" : scheduledDayType;
  const week = calculateRoutineWeek(input.routineStartDate, date.localDate);
  const activeHabits = input.habits
    .filter((habit) => habit.status === "active" && habit.unlockWeek <= week)
    .sort((a, b) => a.slot - b.slot);
  const completedHabitKeys = input.completion?.completedHabitKeys ?? [];
  const pendingHabitKeys = dayType === "routine"
    ? activeHabits.map((habit) => habit.habitKey).filter((key) => !completedHabitKeys.includes(key))
    : [];
  const unlockedSlot = getUnlockSlotForWeek(week);
  const hasUnlockedSlot = unlockedSlot !== null && !activeHabits.some((habit) => habit.slot === unlockedSlot);
  const state: DailyRoutineState = {
    localDate: date.localDate,
    weekday: date.weekday,
    dayType,
    scheduledDayType,
    currentRoutineWeek: week,
    activeHabits,
    completedHabitKeys,
    pendingHabitKeys,
    tummoRequired: activeHabits.some((habit) => habit.habitKey === BASE_HABIT_KEY),
    archePracticeBridgeMode: deriveBridgeMode(input.cadence, input.currentPracticeCycleId),
  };
  if (scheduledDayType === "empty") state.emptyWindowEndsAtHour = EMPTY_DAY_WINDOW_END_HOUR;
  if (hasUnlockedSlot && unlockedSlot !== null) state.nextUnlockSlot = unlockedSlot;
  if (input.currentPracticeTitle) state.currentPracticeTitle = input.currentPracticeTitle;
  if (input.currentPracticeCycleId) state.currentPracticeCycleId = input.currentPracticeCycleId;
  return state;
}

export function renderDailyHabitTui(state: DailyRoutineState): string {
  if (state.dayType === "cheat") return renderCheatDayTui(state);
  if (state.dayType === "empty") return renderEmptyDayTui(state);

  const habitLines = state.activeHabits.length > 0
    ? state.activeHabits.map((habit) => `${state.completedHabitKeys.includes(habit.habitKey) ? "[x]" : "[ ]"} ${habit.title}`)
    : ["[ ] Tummo-Identidad"];
  const pending = state.pendingHabitKeys.length === 0 ? "nada pendiente" : state.pendingHabitKeys.map((key) => titleForKey(state, key)).join(", ");

  return [
    "ARQUEIDENTIDAD - RUTINA NUCLEO",
    "--------------------------------",
    `Hoy: ${weekdayName(state.weekday)} ${state.localDate}`,
    "Tipo de dia: rutina",
    `Semana de rutina: ${state.currentRoutineWeek}`,
    ...(state.scheduledDayType === "empty"
      ? ["Dia vacio: la ventana de vaciado termino a las 6 AM; ahora la rutina sigue con normalidad."]
      : []),
    "",
    "Habitos de hoy:",
    ...habitLines,
    "",
    "Practica de fase activa:",
    state.currentPracticeTitle ?? "sin practica activa",
    `Modo puente: ${bridgeModeCopy(state.archePracticeBridgeMode)}`,
    "",
    "Pendiente:",
    pending,
    "",
    "Como se cierra el dia:",
    "1. Por que votas por tu identidad: recuerda el sentido.",
    "2. Que habitos hiciste hoy: crea evidencia de que puedes sostenerlos.",
    "3. Que habitos vas a hacer manana: deja una prediccion facil de cumplir.",
    "",
    "Responde:",
    "- hecho = marcar lo pendiente si ya lo hiciste",
    "- tummo hecho = marcar solo Tummo",
    "- rutina = ver este panel otra vez",
  ].join("\n");
}

export function renderHabitCheckinPrompt(state: DailyRoutineState, window: HabitCheckinWindow): string {
  if (state.dayType === "cheat") return renderCheatDayTui(state);
  if (state.dayType === "empty") return renderEmptyDayTui(state);
  const pendingHabits = state.pendingHabitKeys.length > 0
    ? state.pendingHabitKeys.map((key) => `[ ] ${titleForKey(state, key)}`)
    : ["[x] Rutina completa"];
  return [
    `RUTINA NUCLEO - ${window === "morning" ? "6 AM" : "6 PM"}`,
    "--------------------------------",
    "Hoy toca rutina.",
    "Pendiente:",
    ...pendingHabits,
    "",
    "Cada cierre tiene tres piezas:",
    "1. por que votas por tu identidad hoy: sentido",
    "2. que habitos hiciste hoy: evidencia",
    "3. que habitos vas a hacer manana: prediccion facil de cumplir",
    "",
    "Responde \"hecho\" cuando lo cierres, o \"rutina\" para ver detalles.",
  ].join("\n");
}

export function parseHabitCompletionReply(text: string, state: DailyRoutineState): ParsedHabitReply {
  const normalized = normalize(text);
  if (/\b(rutina|habitos|pendiente|estado)\b/.test(normalized) && !/\b(hecho|hice|list[ao])\b/.test(normalized)) {
    return { kind: "show_status", habitKeys: [] };
  }
  if (state.dayType === "empty" && /\b(hecho|list[ao]|cerrado|complete|hice)\b/.test(normalized)) {
    return { kind: "empty_done", habitKeys: [], evidence: text.trim() };
  }
  if (!/\b(hecho|hice|list[ao]|complete|termine|ya lo hice|ya hice)\b/.test(normalized)) {
    return { kind: "none", habitKeys: [] };
  }

  const references = resolveHabitReferences(text, state.activeHabits, { allowMultiple: true });
  if (references.kind === "ambiguous") {
    return { kind: "ambiguous", habitKeys: [], candidates: references.candidates };
  }
  if (references.kind === "resolved" && !/\b(rutina|todo|todos|todas|habitos)\b/.test(normalized)) {
    return {
      kind: "partial",
      habitKeys: references.habitKeys,
      tummoDone: references.habitKeys.includes(BASE_HABIT_KEY),
      evidence: text.trim(),
    };
  }
  return {
    kind: "complete_all",
    habitKeys: state.pendingHabitKeys.length > 0 ? state.pendingHabitKeys : state.activeHabits.map((habit) => habit.habitKey),
    tummoDone: state.tummoRequired,
    archePracticeBridgeDone: state.archePracticeBridgeMode !== "none",
    evidence: text.trim(),
  };
}

export function resolveHabitReferences(
  text: string,
  habits: DailyHabitDefinition[],
  options: { allowMultiple?: boolean } = {},
): HabitReferenceResolution {
  const normalizedText = normalize(text);
  const exact = habits.filter((habit) => {
    const title = normalize(habit.title);
    return title.length >= 3 && normalizedText.includes(title);
  });

  if (exact.length > 0) {
    if (exact.length > 1 && !options.allowMultiple) {
      return { kind: "ambiguous", habitKeys: [], candidates: exact.map((habit) => habit.title) };
    }
    return {
      kind: "resolved",
      habitKeys: exact.map((habit) => habit.habitKey),
      candidates: exact.map((habit) => habit.title),
    };
  }

  const textTokens = new Set(significantHabitTokens(normalizedText));
  const scored = habits.map((habit) => {
    const tokens = significantHabitTokens(normalize(habit.title));
    const hits = tokens.filter((token) => textTokens.has(token)).length;
    return { habit, score: tokens.length > 0 ? hits / tokens.length : 0, hits };
  }).filter((item) => item.hits > 0 && item.score >= 0.5);
  if (scored.length === 0) return { kind: "none", habitKeys: [], candidates: [] };

  const maxScore = Math.max(...scored.map((item) => item.score));
  const best = scored.filter((item) => item.score === maxScore);
  if (best.length > 1) {
    return { kind: "ambiguous", habitKeys: [], candidates: best.map((item) => item.habit.title) };
  }
  return {
    kind: "resolved",
    habitKeys: [best[0]!.habit.habitKey],
    candidates: [best[0]!.habit.title],
  };
}

export function extractCondensedHabitTitle(text: string): string | undefined {
  const match = text.match(/\b(?:en|como)\s+(?:un\s+)?(?:nuevo\s+)?(?:habito\s+)?["']?([^.;\n"']+)$/i);
  return match?.[1]?.trim();
}

export function renderRoutineHistory(entries: RoutineHistoryEntry[], habits: DailyHabitDefinition[]): string {
  if (entries.length === 0) return "Todavia no hay cierres de rutina guardados.";
  const titleByKey = new Map(habits.map((habit) => [habit.habitKey, habit.title]));
  return [
    "HISTORIAL DE RUTINA",
    "--------------------------------",
    ...entries.slice(0, 14).flatMap((entry) => [
      `${entry.localDate} - ${routineStatusCopy(entry.status, entry.dayType)}`,
      entry.completedHabitKeys.length > 0
        ? `  ${entry.completedHabitKeys.map((key) => titleByKey.get(key) ?? key).join(", ")}`
        : "  sin habitos marcados",
    ]),
  ].join("\n");
}

export function calculateRoutineStreak(
  completions: DailyCompletion[],
  todayLocalDate: string,
  cheatDayOfWeek?: number,
  emptyDayEnabled = true,
  emptyDayOfWeek?: number,
): number {
  const doneDates = new Set(completions.filter((item) => item.status === "done").map((item) => item.localDate));
  let cursor = Date.parse(`${todayLocalDate}T00:00:00Z`);
  let streak = 0;

  for (let i = 0; i < 366; i += 1) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    const weekday = new Date(cursor).getUTCDay();
    const dayType = getDayType(weekday, cheatDayOfWeek, emptyDayEnabled, emptyDayOfWeek);
    if (dayType === "cheat") {
      cursor -= 86_400_000;
      continue;
    }
    if (!doneDates.has(date)) break;
    streak += 1;
    cursor -= 86_400_000;
  }
  return streak;
}

export function weekdayFromSpanish(value: string): number | null {
  const normalized = normalize(value);
  const names = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const index = names.findIndex((name) => normalized.includes(name));
  return index >= 0 ? index : null;
}

function renderCheatDayTui(state: DailyRoutineState): string {
  return [
    "ARQUEIDENTIDAD - RUTINA NUCLEO",
    "--------------------------------",
    `Hoy: ${weekdayName(state.weekday)} ${state.localDate}`,
    "Tipo de dia: cheat day",
    "",
    "No hay notificaciones de habitos hoy.",
    "Este dia no rompe la racha. Manana aparece el dia vacio para reiniciar la semana desde filosofia, no desde presion.",
  ].join("\n");
}

function renderEmptyDayTui(state: DailyRoutineState): string {
  return [
    "ARQUEIDENTIDAD - DIA VACIO",
    "--------------------------------",
    `Hoy: ${weekdayName(state.weekday)} ${state.localDate}`,
    "Tipo de dia: empty day",
    "",
    "Durante las primeras 6 horas del dia se suspende la presion de rutina y se ancla la filosofia de Archeidentity.",
    "Despues de las 6 AM, los habitos vuelven a estar activos con normalidad.",
    "",
    "Serie sugerida:",
    "1. Vaciar ruido: 3 minutos de respiracion nasal suave.",
    "2. Nombrar interpretacion default de la semana pasada.",
    "3. Eliminar una microtematica que la reinicia.",
    "4. Elegir una hipertematica para esta semana.",
    "5. Tomar una accion pequena que vote por la identidad.",
    "",
    "Cuando cierres el ancla, continua con tus habitos normales del dia.",
  ].join("\n");
}

function titleForKey(state: DailyRoutineState, habitKey: string): string {
  return state.activeHabits.find((habit) => habit.habitKey === habitKey)?.title ?? habitKey;
}

function bridgeModeCopy(mode: ArchePracticeBridgeMode): string {
  if (mode === "do") return "hacer";
  if (mode === "plan") return "planear";
  return "sin puente activo";
}

function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? "dia";
}

function significantHabitTokens(text: string): string[] {
  const ignored = new Set([
    "hecho", "hecha", "hice", "hacer", "habito", "habitos", "rutina", "diario", "diaria",
    "minuto", "minutos", "cada", "todos", "todas", "quiero", "pausar", "reanudar", "eliminar",
  ]);
  return text.split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !ignored.has(token));
}

function routineStatusCopy(status: RoutineHistoryEntry["status"], dayType: DayType): string {
  if (dayType === "cheat" || status === "skipped_intentional") return "descanso intencional";
  if (status === "done") return "completa";
  return "parcial";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
