"use node";

import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import {
  buildDebrief,
  buildMemoryCandidates,
  assessPracticeEvidenceSignal,
  choosePractice,
  classifyPracticeRequest,
  compilePrompt,
  getToolDeclarations,
  isAgentToolAuthorized,
  isIdentityMapCorrectionSignal,
  isNaturalWebAccessRequest,
  normalizeMemoryLines,
  parseCadence,
  parseCycleChoice,
  parseHeroIdentity,
  parseIdentityMapPatch,
  parseVillains,
  renderLearnMap,
  renderMemory,
  renderPracticePlan,
  renderProgressDiagram,
  resolvePracticeReference,
  type CruxState,
  type MemoryLine,
} from "../bridgecrux/core";
import { extractCondensedHabitTitle, resolveHabitReferences, weekdayFromSpanish } from "../bridgecrux/habits";
import { arqueidentidadFase6Content } from "../cruxes/arqueidentidad-fase6/content";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { sendTelegramText, TelegramBoundaryError } from "./telegram";
import type { DailyHabitCatalogItem } from "./habits";

type TelegramInbound = {
  updateId?: number;
  messageId?: number;
  chatId: string;
  telegramUserId: string;
  username?: string;
  firstName?: string;
  text: string;
};

type ToolExecution = {
  result: unknown;
  sentDirect: boolean;
};

type HeroAssessment = {
  accepted: boolean;
  message: string;
  heroName?: string;
  heroWhy?: string;
};

type ObstaclesAssessment = {
  accepted: boolean;
  message: string;
  villainInternal?: string;
  villainExternal?: string;
  villainPhilosophical?: string;
};

type CadenceAssessment = {
  accepted: boolean;
  message: string;
  cadence?: "weekly" | "biweekly";
};

type DreamlineAssessment = {
  accepted: boolean;
  message: string;
  have?: string;
  do?: string;
  be?: string;
};

type FearSettingAssessment = {
  accepted: boolean;
  message: string;
  whatIf?: string;
  prevent?: string;
  repair?: string;
  partialWins?: string;
  cost6Months?: string;
  cost1Year?: string;
  cost3Years?: string;
};

type InitialIdentityAssessment = {
  accepted: boolean;
  message: string;
  name?: string;
  behavior?: string;
  belief?: string;
};

type RoutineDaysAssessment = {
  accepted: boolean;
  message: string;
  cheatDayOfWeek?: number;
  emptyDayOfWeek?: number;
};

type ExtraHabitsAssessment = {
  accepted: boolean;
  message: string;
  habits: Array<{
    title: string;
    description?: string;
  }>;
};

type CruxRoute =
  | "onboarding"
  | "daily_habit"
  | "habit_status"
  | "empty_day"
  | "active_practice"
  | "debrief"
  | "practice_history"
  | "knowledge_question"
  | "safety"
  | "settings"
  | "progress"
  | "memory"
  | "report"
  | "free_tutor"
  | "unknown";

type CruxIntent =
  | "answer_current_step"
  | "ask_clarification"
  | "confirm_previous_suggestion"
  | "revise_previous_answer"
  | "start_or_continue"
  | "adapt_practice"
  | "confirm_daily_habit"
  | "partial_daily_habit"
  | "ask_pending_habits"
  | "set_cheat_day"
  | "set_routine_days"
  | "add_core_habit"
  | "pause_habit"
  | "resume_habit"
  | "archive_habit"
  | "condense_habits"
  | "inspect_routine_history"
  | "start_empty_day"
  | "announce_evidence"
  | "submit_evidence"
  | "submit_mixed_evidence"
  | "defer_practice"
  | "reopen_practice"
  | "inspect_named_practice"
  | "inspect_phase_sequence"
  | "inspect_deferred_practices"
  | "inspect_practice_history"
  | "inspect_identity_map"
  | "edit_identity_map"
  | "ask_concept"
  | "browse_knowledge"
  | "report_problem"
  | "change_settings"
  | "open_web_app"
  | "revoke_web_access"
  | "other";

type RouterDecision = {
  route: CruxRoute;
  intent: CruxIntent;
  confidence: number;
  needsHighThinking: boolean;
  safetyFlag: "none" | "possible" | "urgent";
  stateMutationCandidate: "none" | "profile" | "session" | "practice" | "ledger" | "habit" | "habit_and_ledger" | "memory" | "report";
  reason: string;
  anticipatedRoute?: string;
  capabilityGap?: string;
  capabilityGapType?: CapabilityGapType;
};

type CapabilityGapType =
  | "software_capability"
  | "task_signal"
  | "intent_reading"
  | "field_extraction"
  | "state_contract"
  | "tool_binding"
  | "knowledge_content"
  | "channel_interface"
  | "external_integration"
  | "unknown";

type ExternalErrorDetails = {
  boundary: string;
  errorName: string;
  errorMessage: string;
  errorCause?: string;
};

class ExternalBoundaryError extends Error {
  boundary: string;
  original: unknown;

  constructor(boundary: string, original: unknown) {
    const details = describeExternalError(original, boundary);
    super(`${boundary}: ${details.errorMessage}`);
    this.name = "ExternalBoundaryError";
    this.boundary = boundary;
    this.original = original;
  }
}

export const handleTelegramUpdate = internalAction({
  args: { updateJson: v.string() },
  handler: async (ctx, args) => {
    const inbound = parseTelegramUpdate(JSON.parse(args.updateJson));
    if (!inbound) return { ok: true, ignored: true };

    const ensureArgs: {
      telegramUserId: string;
      chatId: string;
      username?: string;
      firstName?: string;
      language: "es";
      timezone: string;
    } = {
      telegramUserId: inbound.telegramUserId,
      chatId: inbound.chatId,
      language: "es",
      timezone: process.env.DEFAULT_TIMEZONE ?? "America/Bogota",
    };
    if (inbound.username !== undefined) ensureArgs.username = inbound.username;
    if (inbound.firstName !== undefined) ensureArgs.firstName = inbound.firstName;
    const ensured = await ctx.runMutation(internal.store.ensureTelegramUser, ensureArgs);
    const userId = ensured.userId as Id<"users">;

    const inboundMessageArgs: {
      userId: Id<"users">;
      chatId: string;
      direction: "inbound";
      text: string;
      telegramMessageId?: number;
      updateId?: number;
    } = {
      userId,
      chatId: inbound.chatId,
      direction: "inbound",
      text: inbound.text,
    };
    if (inbound.messageId !== undefined) inboundMessageArgs.telegramMessageId = inbound.messageId;
    if (inbound.updateId !== undefined) inboundMessageArgs.updateId = inbound.updateId;
    await ctx.runMutation(internal.store.recordMessage, inboundMessageArgs);

    let state: CruxState | undefined;
    try {
      state = await loadCruxState(ctx, userId);
      const answer = await handleTurn(ctx, userId, inbound.chatId, inbound.text, state);
      if (answer.trim()) {
        await sendTelegramText(inbound.chatId, answer);
        await ctx.runMutation(internal.store.recordMessage, {
          userId,
          chatId: inbound.chatId,
          direction: "outbound",
          text: answer,
        });
      }
      return { ok: true };
    } catch (error) {
      const errorDetails = describeExternalError(error);
      const summary = errorDetails.errorMessage;
      const reportArgs: {
        userId: Id<"users">;
        severity: "tool_error";
        summary: string;
        transcriptExcerpt: string;
        boundary: string;
        errorName: string;
        errorMessage: string;
        errorCause?: string;
        currentCycleId?: string;
        model: string;
      } = {
        userId,
        severity: "tool_error",
        summary: buildUnhandledTurnReport(summary, state, errorDetails),
        transcriptExcerpt: inbound.text,
        boundary: errorDetails.boundary,
        errorName: errorDetails.errorName,
        errorMessage: errorDetails.errorMessage,
        model: geminiModel(),
      };
      if (errorDetails.errorCause !== undefined) reportArgs.errorCause = errorDetails.errorCause;
      if (state?.session?.currentCycleId !== undefined) reportArgs.currentCycleId = state.session.currentCycleId;
      await ctx.runMutation(internal.store.createReport, reportArgs);

      const fallback = [
        "Algo se rompio en mi lado y ya lo deje registrado.",
        "Para recuperar el hilo, pideme tu estado o dime que quieres continuar desde el mapa inicial.",
      ].join("\n");
      try {
        await sendTelegramText(inbound.chatId, fallback);
      } catch (fallbackError) {
        const fallbackDetails = describeExternalError(fallbackError, "telegram:fallback_send");
        const fallbackReportArgs: {
          userId: Id<"users">;
          severity: "tool_error";
          summary: string;
          transcriptExcerpt: string;
          boundary: string;
          errorName: string;
          errorMessage: string;
          errorCause?: string;
          currentCycleId?: string;
          model: string;
        } = {
          userId,
          severity: "tool_error",
          summary: buildUnhandledTurnReport(fallbackDetails.errorMessage, state, fallbackDetails),
          transcriptExcerpt: inbound.text,
          boundary: fallbackDetails.boundary,
          errorName: fallbackDetails.errorName,
          errorMessage: fallbackDetails.errorMessage,
          model: geminiModel(),
        };
        if (fallbackDetails.errorCause !== undefined) fallbackReportArgs.errorCause = fallbackDetails.errorCause;
        if (state?.session?.currentCycleId !== undefined) fallbackReportArgs.currentCycleId = state.session.currentCycleId;
        await ctx.runMutation(internal.store.createReport, fallbackReportArgs);
      }
      return { ok: false, error: summary };
    }
  },
});

export const retryTutorAnswer = internalAction({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
    text: v.string(),
    routeJson: v.optional(v.string()),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    let state: CruxState | undefined;
    let route: RouterDecision | undefined;
    try {
      state = await loadCruxState(ctx, args.userId);
      route = args.routeJson ? routerDecisionFromJson(parseJsonObject(args.routeJson), deterministicRouteDecision(args.text, state)) : undefined;
      const answer = await runTutorAgentTurn(ctx, args.userId, args.chatId, args.text, state, route, { allowRetry: false });
      if (answer.trim()) {
        await sendTelegramText(args.chatId, answer);
        await ctx.runMutation(internal.store.recordMessage, {
          userId: args.userId,
          chatId: args.chatId,
          direction: "outbound",
          text: answer,
        });
      }
      return { ok: true, attempt: args.attempt };
    } catch (error) {
      const details = describeExternalError(error, "tutor:scheduled_retry");
      const reportArgs: {
        userId: Id<"users">;
        severity: "tool_error";
        summary: string;
        transcriptExcerpt: string;
        boundary: string;
        errorName: string;
        errorMessage: string;
        errorCause?: string;
        route?: string;
        intent?: string;
        currentCycleId?: string;
        model: string;
      } = {
        userId: args.userId,
        severity: "tool_error",
        summary: buildUnhandledTurnReport(details.errorMessage, state, details),
        transcriptExcerpt: args.text,
        boundary: details.boundary,
        errorName: details.errorName,
        errorMessage: details.errorMessage,
        model: geminiModel(),
      };
      if (details.errorCause !== undefined) reportArgs.errorCause = details.errorCause;
      if (route?.route !== undefined) reportArgs.route = route.route;
      if (route?.intent !== undefined) reportArgs.intent = route.intent;
      if (state?.session?.currentCycleId !== undefined) reportArgs.currentCycleId = state.session.currentCycleId;
      await ctx.runMutation(internal.store.createReport, reportArgs);
      return { ok: false, attempt: args.attempt, error: details.errorMessage };
    }
  },
});

async function handleTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  chatId: string,
  text: string,
  state: CruxState,
): Promise<string> {
  const command = extractCommand(text);

  if (text.trim().toUpperCase() === "CONFIRMAR RESET") {
    return "No hice cambios. El reinicio completo todavia no tiene un contrato que preserve historial, rutina y progreso de forma coherente.";
  }

  if (command) {
    return await handleCommand(ctx, userId, text, command, state);
  }

  const route = await routeCruxTurn(text, state);
  await recordRouterDecision(ctx, userId, text, state, route);

  if (route.intent === "open_web_app") {
    return await openWebAppTurn(ctx, userId);
  }

  if (route.intent === "revoke_web_access") {
    return await revokeWebAccessTurn(ctx, userId);
  }

  if (isActionableCapabilityGap(route, text)) {
    return await handleCapabilityGapTurn(ctx, userId, text, state, route);
  }

  if (shouldAutostartOnboarding(state)) {
    return await startOnboarding(ctx, userId);
  }

  if (state.session?.status === "onboarding") {
    return await handleOnboardingStep(ctx, userId, chatId, text, state);
  }

  if (route.route === "practice_history" || route.intent === "inspect_practice_history") {
    return await renderPracticeHistoryTurn(ctx, userId, text, state);
  }

  if (route.intent === "inspect_routine_history") {
    return await renderRoutineHistoryTurn(ctx, userId);
  }

  if (route.intent === "inspect_named_practice") {
    return renderNamedPracticeInstructions(text);
  }

  if (route.intent === "inspect_phase_sequence") {
    return renderPhaseSequence(state);
  }

  if (route.intent === "inspect_deferred_practices") {
    return renderDeferredPractices(state);
  }

  if (route.intent === "browse_knowledge") {
    return renderKnowledgeMenu();
  }

  if (route.route === "progress") {
    return await renderFullStatus(ctx, userId);
  }

  if (route.route === "memory") {
    return renderMemory(state.memories);
  }

  if (route.intent === "set_cheat_day" || route.intent === "set_routine_days") {
    return await handleRoutineDaysChange(ctx, userId, text);
  }

  if (route.intent === "reopen_practice") {
    return await reopenPracticeTurn(ctx, userId, text, state);
  }

  if (route.intent === "defer_practice") {
    return await deferCurrentPracticeTurn(ctx, userId, text, state);
  }

  if (route.intent === "submit_mixed_evidence") {
    return await handleMixedEvidenceTurn(ctx, userId, text);
  }

  if (route.intent === "pause_habit" || route.intent === "resume_habit" || route.intent === "archive_habit" || route.intent === "condense_habits") {
    return await handleHabitManagementTurn(ctx, userId, text, route.intent);
  }

  if (route.intent === "add_core_habit") {
    return await runTutorAgentTurn(ctx, userId, chatId, text, state, route);
  }

  if (route.route === "settings") {
    const identityPatch = parseIdentityMapPatch(text, state);
    if (identityPatch.kind === "update") {
      await ctx.runMutation(internal.store.updateProfile, { userId, ...identityPatch.patch });
      const fresh = await loadCruxState(ctx, userId);
      return [
        identityPatch.message,
        "",
        renderIdentityMapSummary(fresh),
      ].join("\n");
    }
    if (identityPatch.kind === "needs_field") {
      return [
        "Puedo corregir tu mapa, pero necesito que me digas que parte quieres cambiar.",
        "",
        "Puedes decirlo asi:",
        "- cambia mi reto externo a ...",
        "- agrega al reto interno ...",
        "- cambia mi identidad final a ... porque ...",
        "- cambia quiero hacer a ...",
        "- actualiza prevenir a ...",
        "",
        renderIdentityMapSummary(state),
      ].join("\n");
    }
    if (route.intent === "inspect_identity_map") {
      return renderIdentityMapSummary(state);
    }
    if (route.intent === "change_settings") {
      const cadence = parseCadence(text);
      if (cadence) {
        await ctx.runMutation(internal.store.updateProfile, { userId, cadence });
        return [
          `Ritmo actualizado a ${cadence === "weekly" ? "semanal" : "quincenal"}.`,
          "",
          renderSettings(await loadCruxState(ctx, userId)),
        ].join("\n");
      }
    }
    return renderSettings(state);
  }

  if (route.route === "report") {
    return await createReportTurn(ctx, userId, text, "bug");
  }

  if (route.route === "daily_habit" && (route.intent === "confirm_daily_habit" || route.intent === "partial_daily_habit")) {
    return await handleDailyHabitTurn(ctx, userId, text);
  }

  if (route.route === "empty_day") {
    return await renderEmptyDayCommand(ctx, userId);
  }

  if (route.route === "habit_status") {
    return await renderHabitPanel(ctx, userId);
  }

  const directPracticeHelp = explainActivePracticeQuestion(text, state);
  if (directPracticeHelp) return directPracticeHelp;

  const prevention = classifyPracticeRequest(text);
  if (prevention.blocked.length > 0) {
    return [
      "Interpreto que buscas la funcion de Fase VI detras de esa practica: liminalidad, plasticidad, reto y reintegracion.",
      "",
      renderPrevention(prevention),
      "",
      "Puedo construir una version conservadora de esa funcion: descanso profundo sin sueno, visualizacion, juego no estructurado y anclaje.",
    ].join("\n");
  }

  const evidenceSignal = assessPracticeEvidenceSignal(text);
  if (evidenceSignal.kind === "announcement") {
    return await renderPracticeEvidenceInvitationForTarget(ctx, userId, evidenceSignal, state);
  }
  if (evidenceSignal.kind === "partial") {
    return await renderPracticeEvidenceGapForTarget(ctx, userId, evidenceSignal, state);
  }
  if (evidenceSignal.kind === "sufficient") {
    return await createDebriefTurn(ctx, userId, text, evidenceSignal.reportedCycleId);
  }

  return await runTutorAgentTurn(ctx, userId, chatId, text, state, route);
}

async function handleCommand(
  ctx: ActionCtx,
  userId: Id<"users">,
  text: string,
  command: string,
  state: CruxState,
): Promise<string> {
  const args = text.replace(/^\/\w+\s*/, "").trim();

  switch (command) {
    case "/start":
      return state.session?.status === "onboarding" && state.session.onboardingStep === "introduction" && !state.profile?.cadence
        ? await startOnboarding(ctx, userId)
        : await renderFullStatus(ctx, userId);
    case "/learn":
      return renderLearnMap();
    case "/practice":
      return renderCommandPractice(args, state);
    case "/habits":
    case "/routine":
      return await renderHabitPanel(ctx, userId);
    case "/cheatday":
      return await handleRoutineDaysChange(ctx, userId, args);
    case "/emptyday":
      return await renderEmptyDayCommand(ctx, userId);
    case "/status":
      return await renderFullStatus(ctx, userId);
    case "/memory":
      return renderMemory((await loadCruxState(ctx, userId)).memories);
    case "/debrief":
      if (!args) {
        return explainDebrief();
      }
      {
        const evidenceSignal = assessPracticeEvidenceSignal(args);
        if (evidenceSignal.kind === "announcement" || evidenceSignal.kind === "none") {
          return await renderPracticeEvidenceInvitationForTarget(ctx, userId, evidenceSignal, state);
        }
        if (evidenceSignal.kind === "partial") {
          return await renderPracticeEvidenceGapForTarget(ctx, userId, evidenceSignal, state);
        }
        return await createDebriefTurn(ctx, userId, args, evidenceSignal.reportedCycleId);
      }
    case "/settings":
      return renderSettings(state);
    case "/web":
      return await openWebAppTurn(ctx, userId);
    case "/webclose":
      return await revokeWebAccessTurn(ctx, userId);
    case "/report":
      return await createReportTurn(ctx, userId, args || "El usuario reporto un fallo desde Telegram.", "bug");
    case "/reset":
      return "No hice cambios. El reinicio completo permanece deshabilitado hasta que pueda preservar historial, rutina y progreso sin dejar estados mezclados.";
    case "/help":
      return renderHelp();
    default:
      return renderHelp();
  }
}

async function openWebAppTurn(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  const access = await ctx.runAction(internal.webAuth.issueWebLoginLink, { userId });
  return [
    "Tu acceso web esta listo.",
    "El enlace funciona una sola vez y vence en 10 minutos.",
    "Si lo abres en otro dispositivo, el primero que lo use conservara el acceso.",
    "",
    access.url,
  ].join("\n");
}

async function revokeWebAccessTurn(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  await ctx.runAction(internal.webAuth.revokeAllWebAccess, { userId });
  return [
    "Cerre todos tus accesos web y revoque los enlaces pendientes.",
    "Cuando quieras volver, pideme abrir la app y creare un enlace nuevo.",
  ].join("\n");
}

function renderCommandPractice(args: string, state: CruxState): string {
  const directId = arqueidentidadFase6Content.practices.find((practice) => practice.id === args.trim())?.id;
  const requestedCycle = directId ?? resolvePracticeReference(args);
  const cycleId = requestedCycle ?? state.session?.currentCycleId;
  if (!cycleId) return "Todavia no hay una practica activa. Termina la configuracion inicial para comenzar por el primer umbral.";
  const practice = choosePractice(arqueidentidadFase6Content.practices, cycleId);
  return [
    requestedCycle && requestedCycle !== state.session?.currentCycleId
      ? "Te muestro esta practica como consulta. Tu progreso y tu ciclo activo no cambian."
      : "Esta es tu practica activa.",
    "",
    renderPracticePlan(practice),
  ].join("\n");
}

async function startOnboarding(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<string> {
  await ctx.runMutation(internal.store.updateSession, {
    userId,
    status: "onboarding",
    onboardingStep: "introduction",
  });
  return renderAppIntroduction();
}

async function renderFullStatus(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  const state = await loadCruxState(ctx, userId);
  if (state.session?.status === "onboarding") {
    return [
      "ARQUEIDENTIDAD - CONFIGURACION INICIAL",
      "--------------------------------",
      `Paso actual: ${onboardingStepCopy(state.session.onboardingStep)}`,
      "",
      renderIdentityMapSummary(state),
      "",
      "La rutina diaria se activa cuando terminemos dreamline, fear-setting, identidad inicial, retos, identidad final, habitos extra y dias de rutina.",
    ].join("\n");
  }

  await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
  const routine = await ctx.runQuery(internal.habits.getDailyRoutineState, { userId });

  return [
    "ARQUEIDENTIDAD - ESTADO",
    "--------------------------------",
    `Rutina nucleo: ${routine.state.pendingHabitKeys.length === 0 ? "cerrada" : "pendiente"}`,
    `Dia: ${routine.state.localDate} / ${routine.state.dayType}`,
    `Racha rutina: ${routine.streak} dias`,
    `Habitos activos: ${routine.state.activeHabits.length}/4`,
    routine.state.pendingHabitKeys.length > 0
      ? `Pendiente: ${routine.state.pendingHabitKeys.join(", ")}`
      : "Pendiente: nada",
    "",
    renderProgressDiagram(state),
  ].join("\n");
}

async function renderPracticeHistoryTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  text: string,
  state: CruxState,
): Promise<string> {
  const referencedCycle = assessPracticeEvidenceSignal(text).reportedCycleId;
  const history = await ctx.runQuery(internal.store.getPracticeHistory, {
    userId,
    ...(referencedCycle ? { cycleId: referencedCycle } : {}),
  });
  if (history.length === 0) {
    return referencedCycle
      ? "Todavia no encuentro un registro guardado para ese ciclo."
      : "Todavia no hay ciclos completados con evidencia guardada.";
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return renderPracticeHistoryFallback(history);
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: geminiModel(),
      contents: [{
        role: "user",
        parts: [{ text: [
          "Responde la consulta del usuario sobre sus registros de practicas de Arqueidentidad.",
          "Resume solo la evidencia persistida. Distingue ciclo, estado, numero de registros, aprendizajes y anclas.",
          "No muestres memoria compacta, JSON, nombres de tablas, ids ni lenguaje de backend.",
          "Si un campo no aparece en la evidencia, di que no quedo registrado; no lo inventes.",
          "Usa espanol natural y formato breve para Telegram.",
          `Identidad: ${state.profile?.heroName ?? "sin definir"}`,
          `Consulta: ${text}`,
          `Registros: ${JSON.stringify(history)}`,
        ].join("\n") }],
      }] as never,
      config: {
        systemInstruction: "Eres el tutor de Arqueidentidad consultando el historial real del usuario. La evidencia almacenada es la unica fuente de verdad.",
        temperature: 0.2,
        topP: 0.8,
        thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? "high" },
      } as never,
    } as never);
    return response.text?.trim() || renderPracticeHistoryFallback(history);
  } catch (error) {
    console.warn("Practice history rendering failed", error);
    return renderPracticeHistoryFallback(history);
  }
}

function renderPracticeHistoryFallback(history: Array<{
  title: string;
  status: string;
  events: Array<{ eventType: string; evidence: string }>;
}>): string {
  return history.map((practice) => [
    practice.title.toUpperCase(),
    "--------------------------------",
    `Estado: ${practice.status}`,
    `Registros: ${practice.events.length}`,
    ...practice.events.slice(-3).map((event, index) => `${index + 1}. ${event.evidence.slice(0, 500)}`),
  ].join("\n")).join("\n\n");
}

async function renderHabitPanel(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  const state = await loadCruxState(ctx, userId);
  if (state.session?.status === "onboarding") {
    return [
      "RUTINA NUCLEO",
      "--------------------------------",
      "Todavia no la activo.",
      "Primero terminamos dreamline, fear-setting, identidad inicial, retos, identidad final, habitos extra y dias de rutina. Asi la rutina nace de tu mapa, no de una plantilla.",
    ].join("\n");
  }

  await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
  const routine = await ctx.runQuery(internal.habits.getDailyRoutineState, { userId });
  const lines = [routine.tui];
  const pausedHabits = (state.dailyHabits ?? []).filter((habit) => habit.status === "paused");
  if (pausedHabits.length > 0) {
    lines.push("", "Habitos pausados:", ...pausedHabits.map((habit) => `- ${habit.title}`));
  }
  if (routine.needsCheatDay) {
    lines.push(
      "",
      "CHEAT DAY",
      "--------------------------------",
      "Todavia no elegiste dia libre. Dime algo como: quiero que mi dia libre sea domingo.",
    );
  }
  if (routine.state.nextUnlockSlot) {
    const unlock = await ctx.runMutation(internal.habits.maybeUnlockNextRoutineHabit, { userId });
    if (unlock.prompt) lines.push("", unlock.prompt);
  }
  return lines.join("\n");
}

async function renderRoutineHistoryTurn(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  const history = await ctx.runQuery(internal.habits.getDailyRoutineHistory, { userId, limit: 14 });
  return history.tui;
}

async function handleDailyHabitTurn(ctx: ActionCtx, userId: Id<"users">, text: string): Promise<string> {
  await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
  const result = await ctx.runMutation(internal.habits.markDailyHabitsDone, { userId, text });
  const routine = await ctx.runQuery(internal.habits.getDailyRoutineState, { userId });
  await ctx.runMutation(internal.habits.markHabitCheckinResponded, {
    userId,
    localDate: routine.state.localDate,
  });
  return result.message;
}

async function handleHabitManagementTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  text: string,
  intent: "pause_habit" | "resume_habit" | "archive_habit" | "condense_habits",
): Promise<string> {
  await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
  const catalog: DailyHabitCatalogItem[] = await ctx.runQuery(internal.habits.getDailyHabitCatalog, { userId });
  const eligible = catalog.filter((habit) => {
    if (habit.source === "base_tummo_identity") return false;
    if (intent === "pause_habit" || intent === "condense_habits") return habit.status === "active";
    if (intent === "resume_habit") return habit.status === "paused";
    return habit.status !== "archived";
  });
  if (eligible.length === 0) {
    return intent === "resume_habit"
      ? "No tienes habitos pausados para reactivar."
      : "No hay habitos extra disponibles para ese cambio. Tummo-Identidad permanece como base de la rutina.";
  }

  const allRequested = /\b(todos|todas|los extras|habitos extra)\b/.test(normalizeTelegramText(text));
  const resolution = allRequested
    ? { kind: "resolved" as const, habitKeys: eligible.map((habit) => habit.habitKey), candidates: eligible.map((habit) => habit.title) }
    : resolveHabitReferences(text, eligible, { allowMultiple: intent === "condense_habits" });
  if (resolution.kind !== "resolved") {
    return [
      "Necesito el nombre del habito que quieres cambiar.",
      "Disponibles:",
      ...eligible.map((habit) => `- ${habit.title} (${habit.status === "paused" ? "pausado" : "activo"})`),
    ].join("\n");
  }

  if (intent === "condense_habits") {
    if (resolution.habitKeys.length < 2) {
      return "Para condensar necesito al menos dos habitos extra. Nombralos en el mismo mensaje.";
    }
    const sourceTitles = eligible.filter((habit) => resolution.habitKeys.includes(habit.habitKey)).map((habit) => habit.title);
    const title = extractCondensedHabitTitle(text) ?? `Rutina ${sourceTitles.join(" + ")}`;
    const result = await ctx.runMutation(internal.habits.condenseDailyHabits, {
      userId,
      sourceHabitKeys: resolution.habitKeys,
      title,
    });
    if (!result.ok) return habitMutationFailureCopy(result.reason);
    return [
      `Condense ${(result.archivedTitles ?? sourceTitles).join(", ")} en ${result.title}.`,
      "Los habitos anteriores quedan archivados para conservar su historia.",
      "",
      await renderHabitPanel(ctx, userId),
    ].join("\n");
  }

  if (resolution.habitKeys.length !== 1) {
    return "Haz este cambio un habito a la vez para que el resultado sea claro y reversible.";
  }
  const status = intent === "pause_habit" ? "paused" as const : intent === "resume_habit" ? "active" as const : "archived" as const;
  const result = await ctx.runMutation(internal.habits.setDailyHabitStatus, {
    userId,
    habitKey: resolution.habitKeys[0]!,
    status,
  });
  if (!result.ok) return habitMutationFailureCopy(result.reason);
  const action = intent === "pause_habit" ? "Pause" : intent === "resume_habit" ? "Reactive" : "Archive";
  return [
    `${action} ${result.title}.`,
    intent === "archive_habit" ? "Su historial permanece guardado; deja de aparecer en la rutina diaria." : "La rutina queda actualizada desde hoy.",
    "",
    await renderHabitPanel(ctx, userId),
  ].join("\n");
}

function habitMutationFailureCopy(reason: string): string {
  if (reason === "base_protected") return "Tummo-Identidad es la base de esta fase y no se pausa, elimina ni condensa.";
  if (reason === "max_habits") return "La rutina ya tiene cuatro habitos activos. Pausa o archiva uno antes de reactivar otro.";
  if (reason === "slot_conflict") return "Ese lugar de la rutina ya esta ocupado. Archiva el habito que lo reemplazo antes de reactivar este.";
  if (reason === "needs_two") return "Necesito al menos dos habitos extra para condensarlos.";
  if (reason === "source_not_active") return "Solo puedo condensar habitos que esten activos.";
  return "No hice cambios porque no pude identificar un habito compatible con esa operacion.";
}

async function handleMixedEvidenceTurn(ctx: ActionCtx, userId: Id<"users">, text: string): Promise<string> {
  const habitResult = await handleDailyHabitTurn(ctx, userId, text);
  const practiceSignal = assessPracticeEvidenceSignal(text);
  const practiceResult = await createDebriefTurn(ctx, userId, text, practiceSignal.reportedCycleId);
  return [
    habitResult,
    "",
    practiceResult,
  ].join("\n");
}

async function handleRoutineDaysChange(ctx: ActionCtx, userId: Id<"users">, text: string): Promise<string> {
  const state = await loadCruxState(ctx, userId);
  const parsed = parseRoutineDaysFields(text);
  const cheatDay = parsed.cheatDayOfWeek;
  const emptyDay = parsed.emptyDayOfWeek;

  if (cheatDay === undefined && emptyDay === undefined) {
    return [
      "DIAS DE RUTINA",
      "--------------------------------",
      "Dime que dia quieres como cheat day y que dia quieres como dia vacio.",
      "",
      "Ejemplo: cheat day viernes; dia vacio sabado.",
    ].join("\n");
  }

  const resolvedCheat = cheatDay ?? state.profile?.cheatDayOfWeek;
  const resolvedEmpty = emptyDay ?? state.profile?.emptyDayOfWeek;
  if (resolvedCheat === undefined || resolvedEmpty === undefined) {
    return [
      "Tengo uno de los dos dias, pero necesito el otro para guardar el cambio.",
      "Indica cheat day y dia vacio en la misma respuesta.",
    ].join("\n");
  }
  if (resolvedCheat === resolvedEmpty) {
    return "Los dos dias deben ser distintos. El cheat day suspende habitos; el dia vacio solo abre una ventana de vaciado antes de retomar la rutina.";
  }

  await ctx.runMutation(internal.habits.setCheatDay, {
    userId,
    weekday: resolvedCheat,
    emptyDayOfWeek: resolvedEmpty,
  });
  return [
    "Dias de rutina actualizados.",
    "--------------------------------",
    `Cheat day: ${weekdayCopy(resolvedCheat)}. Ese dia no hay rutina ni recordatorios.`,
    `Dia vacio: ${weekdayCopy(resolvedEmpty)}. Las primeras 6 horas son de vaciado; despues los habitos vuelven a estar activos.`,
    "",
    await renderHabitPanel(ctx, userId),
  ].join("\n");
}

async function renderEmptyDayCommand(ctx: ActionCtx, userId: Id<"users">): Promise<string> {
  await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
  const routine = await ctx.runQuery(internal.habits.getDailyRoutineState, { userId });
  if (routine.state.dayType === "empty") return routine.tui;
  return [
    "DIA VACIO",
    "--------------------------------",
    "El dia vacio abre una ventana de seis horas para limpiar la semana desde filosofia.",
    "Despues de esa ventana, la rutina diaria sigue con normalidad.",
    "",
    routine.tui,
  ].join("\n");
}

function shouldAutostartOnboarding(state: CruxState): boolean {
  if (state.session?.status !== "onboarding") return false;
  if (state.session.onboardingStep !== "introduction") return false;
  if (state.profile?.cadence) return false;
  const messages = state.recentMessages ?? [];
  const inboundCount = messages.filter((message) => message.direction === "inbound").length;
  const outboundCount = messages.filter((message) => message.direction === "outbound").length;
  return inboundCount === 1 && outboundCount === 0;
}

async function handleOnboardingStep(
  ctx: ActionCtx,
  userId: Id<"users">,
  chatId: string,
  text: string,
  state: CruxState,
): Promise<string> {
  const step = state.session?.onboardingStep ?? "introduction";

  if (step === "introduction") {
    if (isIntroductionContinueSignal(text)) {
      await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "cadence" });
      return [
        "Empecemos. Primero voy a ajustar el ritmo para que el proceso tenga espacio real en tu vida.",
        "",
        explainCadenceStep(),
      ].join("\n");
    }
    return await runTutorAgentTurn(ctx, userId, chatId, text, state, {
      route: "knowledge_question",
      intent: "ask_concept",
      confidence: 1,
      needsHighThinking: true,
      safetyFlag: "none",
      stateMutationCandidate: "none",
      reason: "introductory question before onboarding",
    });
  }

  if (step === "cadence") {
    const assessment = await assessCadenceAnswer(text, state);
    if (!assessment.accepted || !assessment.cadence) {
      return assessment.message || explainCadenceStep();
    }
    await ctx.runMutation(internal.store.updateProfile, { userId, cadence: assessment.cadence });
    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "dreamline" });
    return [
      assessment.message,
      "",
      explainDreamlineStep(),
    ].join("\n");
  }

  if (step === "dreamline") {
    const assessment = await assessDreamlineAnswer(text, state);
    if (!assessment.accepted || !assessment.have || !assessment.do || !assessment.be) {
      return assessment.message || explainDreamlineStep();
    }
    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      dreamline: {
        have: assessment.have.slice(0, 500),
        do: assessment.do.slice(0, 500),
        be: assessment.be.slice(0, 500),
        updatedAt: Date.now(),
      },
    });
    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "fear_setting" });
    return [
      assessment.message,
      "",
      explainFearSettingStep(),
    ].join("\n");
  }

  if (step === "fear_setting") {
    const assessment = await assessFearSettingAnswer(text, state);
    if (!assessment.accepted || !assessment.whatIf || !assessment.prevent || !assessment.repair || !assessment.partialWins || !assessment.cost6Months || !assessment.cost1Year || !assessment.cost3Years) {
      return assessment.message || explainFearSettingStep();
    }
    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      fearSetting: {
        whatIf: assessment.whatIf.slice(0, 500),
        prevent: assessment.prevent.slice(0, 500),
        repair: assessment.repair.slice(0, 500),
        partialWins: assessment.partialWins.slice(0, 500),
        cost6Months: assessment.cost6Months.slice(0, 500),
        cost1Year: assessment.cost1Year.slice(0, 500),
        cost3Years: assessment.cost3Years.slice(0, 500),
        updatedAt: Date.now(),
      },
    });
    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "initial_identity" });
    return [
      assessment.message,
      "",
      explainInitialIdentityStep(),
    ].join("\n");
  }

  if (step === "initial_identity") {
    const assessment = await assessInitialIdentityAnswer(text, state);
    if (!assessment.accepted || !assessment.name || !assessment.behavior || !assessment.belief) {
      return assessment.message || explainInitialIdentityStep();
    }
    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      initialIdentity: {
        name: assessment.name.slice(0, 160),
        behavior: assessment.behavior.slice(0, 500),
        belief: assessment.belief.slice(0, 500),
        updatedAt: Date.now(),
      },
    });
    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "villains" });
    return [
      assessment.message,
      "",
      explainChallengesStep(),
    ].join("\n");
  }

  if (step === "villains") {
    const assessment = await assessObstaclesAnswer(text, state);
    if (!assessment.accepted || !assessment.villainInternal || !assessment.villainExternal || !assessment.villainPhilosophical) {
      return assessment.message || explainChallengesStep();
    }

    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      villainInternal: assessment.villainInternal,
      villainExternal: assessment.villainExternal,
      villainPhilosophical: assessment.villainPhilosophical,
    });
    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "hero" });

    return [
      assessment.message,
      "",
      explainHeroStep(),
    ].join("\n");
  }

  if (step === "hero") {
    const assessment = await assessHeroAnswer(text, state);
    if (!assessment.accepted || !assessment.heroName || !assessment.heroWhy) {
      return assessment.message || explainHeroStep();
    }

    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      heroName: assessment.heroName.slice(0, 160),
      heroWhy: assessment.heroWhy.slice(0, 500),
    });
    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "extra_habits" });
    const fresh = await loadCruxState(ctx, userId);
    return [
      assessment.message,
      "",
      "Ya tengo tu mapa Quest.",
      "",
      renderIdentityMapSummary(fresh),
      "",
      explainExtraHabitsStep(),
    ].join("\n");
  }

  if (step === "extra_habits") {
    const assessment = await assessExtraHabitsAnswer(text, state);
    if (!assessment.accepted) {
      return assessment.message || explainExtraHabitsStep();
    }

    await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
    for (const habit of assessment.habits.slice(0, 3)) {
      if (!habit.title.trim()) continue;
      await ctx.runMutation(internal.habits.addCoreRoutineHabit, {
        userId,
        title: habit.title.slice(0, 120),
        ...(habit.description ? { description: habit.description.slice(0, 500) } : {}),
      });
    }

    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "routine_days" });
    return [
      assessment.message,
      "",
      explainRoutineDaysStep(),
    ].join("\n");
  }

  if (step === "routine_days") {
    const assessment = await assessRoutineDaysAnswer(text, state);
    if (!assessment.accepted || assessment.cheatDayOfWeek === undefined || assessment.emptyDayOfWeek === undefined) {
      return assessment.message || explainRoutineDaysStep();
    }
    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      cheatDayOfWeek: assessment.cheatDayOfWeek,
      emptyDayOfWeek: assessment.emptyDayOfWeek,
      emptyDayEnabled: true,
    });

    const fresh = await loadCruxState(ctx, userId);
    await ctx.runMutation(internal.store.replaceMemoryLines, {
      userId,
      lines: buildMemoryCandidates(fresh, "onboarding quest completado"),
    });

    return [
      assessment.message,
      "",
      "RUTINA NUCLEO ACTIVADA",
      "--------------------------------",
      "Desde hoy queda la base diaria: Tummo-Identidad comprimida + puente hacia la siguiente practica Archeidentity.",
      "Si elegiste habitos extra, ya quedaron como extensiones pequenas de tu identidad diaria. Si no elegiste ninguno, empezamos liviano para crear evidencia antes de inflar la rutina.",
      "",
      "Cada cierre diario tiene tres piezas:",
      "1. Por que votas por tu identidad: para recordar el sentido de la transformacion.",
      "2. Que habitos hiciste hoy: para crear evidencia de que puedes sostenerlos.",
      "3. Que habitos vas a hacer manana: para hacer una prediccion pequena y cumplirla.",
      "",
      "Cuando esa prediccion se cumple, tu cerebro recibe una prueba simple: esta identidad no es una idea bonita, es algo que ya estas aprendiendo a ejecutar.",
      "",
      "Ahora empezamos por la primera practica segura. Antes de intensificar cualquier cosa, revisamos senales del cuerpo y adaptamos.",
      "",
      await startSelectedPractice(ctx, userId, "cycle1_prehypnos_nsdr", fresh),
    ].join("\n");
  }

  await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "dreamline" });
  return explainDreamlineStep();
}

async function startSelectedPractice(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawChoice: string,
  state: CruxState,
): Promise<string> {
  const cycleId = parseCycleChoice(rawChoice) ?? rawChoice;
  const practice = choosePractice(arqueidentidadFase6Content.practices, cycleId);

  await ctx.runMutation(internal.store.startPracticeCycle, {
    userId,
    cycleId: practice.id,
    title: practice.title,
    plan: practice.body,
  });

  const fresh = await loadCruxState(ctx, userId);
  return [
    renderPracticePlan(practice),
    "",
    renderProgressDiagram(fresh),
  ].join("\n");
}

async function createDebriefTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  rawDebrief: string,
  reportedCycleId?: string,
): Promise<string> {
  const state = await loadCruxState(ctx, userId);
  const currentCycleId = state.session?.currentCycleId;
  const targetCycleId = reportedCycleId ?? currentCycleId;

  if (targetCycleId && currentCycleId && targetCycleId !== currentCycleId) {
    const targetPractice = await ctx.runQuery(internal.store.getPracticeByCycle, {
      userId,
      cycleId: targetCycleId,
    });
    if (!targetPractice) {
      return [
        "Veo evidencia de una practica distinta a la activa, pero no encuentro ese ciclo en tu recorrido.",
        "Dime si corresponde a NSDR, reto social o niacina para ubicarla sin mover tu progreso por error.",
      ].join("\n");
    }

    const targetState: CruxState = {
      ...state,
      currentPractice: {
        cycleId: targetPractice.cycleId,
        title: targetPractice.title,
        status: targetPractice.status,
        plan: targetPractice.plan,
      },
    };
    const evidence = enrichDebriefEvidence(rawDebrief, targetState);
    const debrief = await createPracticeCloseout(evidence, targetState);
    await ctx.runMutation(internal.store.logPracticeEvent, {
      userId,
      practiceId: targetPractice._id,
      eventType: "debrief",
      evidence: debrief,
    });
    if (targetPractice.status === "skipped") {
      await ctx.runMutation(internal.store.completePracticeById, {
        userId,
        practiceId: targetPractice._id,
      });
    }
    return [
      debrief,
      "",
      "EVIDENCIA ANADIDA",
      "--------------------------------",
      `La guarde en ${targetPractice.title}.`,
      targetPractice.status === "skipped"
        ? "Ese ciclo pendiente ahora queda completado. La practica activa no cambio."
        : "No cambie ni complete la practica que tienes activa ahora.",
      "",
      renderProgressDiagram(await loadCruxState(ctx, userId)),
    ].join("\n");
  }

  const evidence = enrichDebriefEvidence(rawDebrief, state);
  const debrief = await createPracticeCloseout(evidence, state);
  await ctx.runMutation(internal.store.logPracticeEvent, {
    userId,
    eventType: "debrief",
    evidence: debrief,
  });
  await ctx.runMutation(internal.store.completeCurrentPractice, { userId });

  const nextCycleId = nextPracticeAfter(state.session?.currentCycleId);
  if (nextCycleId) {
    const fresh = await loadCruxState(ctx, userId);
    return [
      debrief,
      "",
      "CICLO CERRADO",
      "--------------------------------",
      "- tu evidencia quedo guardada",
      "- la practica queda completada",
      "- pasamos al siguiente umbral preliminar",
      "",
      await startSelectedPractice(ctx, userId, nextCycleId, fresh),
    ].join("\n");
  }

  return [
    debrief,
    "",
    "CICLO CERRADO",
    "--------------------------------",
    "- tu evidencia quedo guardada",
    "- la practica queda completada",
    "- la memoria estable se revisa por acumulacion, no por cada mensaje",
    "",
    renderProgressDiagram(await loadCruxState(ctx, userId)),
  ].join("\n");
}

function renderPracticeEvidenceInvitation(state: CruxState): string {
  return [
    "Si, puedes enviarlo aunque hoy sea cheat day.",
    "El cheat day pausa la rutina diaria, no bloquea los reportes de las practicas de fase.",
    "",
    `Para ${state.currentPractice?.title ?? "la practica"}, cuentame en un solo mensaje:`,
    "- descripcion o narracion de la practica",
    "- microtematica que aparecio",
    "- hipertematica que mejor funciono",
    "",
    "Cuando me lo envies, lo integrare sin cerrar nada antes de tiempo.",
  ].join("\n");
}

async function renderPracticeEvidenceInvitationForTarget(
  ctx: ActionCtx,
  userId: Id<"users">,
  signal: ReturnType<typeof assessPracticeEvidenceSignal>,
  state: CruxState,
): Promise<string> {
  const targetState = await stateForReportedPractice(ctx, userId, signal.reportedCycleId, state);
  return renderPracticeEvidenceInvitation(targetState);
}

function renderPracticeEvidenceGap(
  signal: ReturnType<typeof assessPracticeEvidenceSignal>,
  state: CruxState,
): string {
  const missing: string[] = [];
  if (!signal.evidenceDimensions.includes("execution")) missing.push("descripcion o narracion de la practica");
  if (!signal.evidenceDimensions.includes("interpretation")) missing.push("microtematica que aparecio");
  if (!signal.evidenceDimensions.includes("result")) missing.push("hipertematica que mejor funciono");
  return [
    "Ya veo que realizaste la practica, pero todavia no la cierro porque falta evidencia para integrarla bien.",
    `Sobre ${state.currentPractice?.title ?? "la practica activa"}, agrega: ${missing.slice(0, 3).join("; ")}.`,
    "Con eso puedo guardar el cierre y avanzar sin inventar partes.",
  ].join("\n");
}

async function renderPracticeEvidenceGapForTarget(
  ctx: ActionCtx,
  userId: Id<"users">,
  signal: ReturnType<typeof assessPracticeEvidenceSignal>,
  state: CruxState,
): Promise<string> {
  const targetState = await stateForReportedPractice(ctx, userId, signal.reportedCycleId, state);
  return renderPracticeEvidenceGap(signal, targetState);
}

async function stateForReportedPractice(
  ctx: ActionCtx,
  userId: Id<"users">,
  reportedCycleId: string | undefined,
  state: CruxState,
): Promise<CruxState> {
  if (!reportedCycleId || reportedCycleId === state.session?.currentCycleId) return state;
  const practice = await ctx.runQuery(internal.store.getPracticeByCycle, { userId, cycleId: reportedCycleId });
  if (!practice) return state;
  return {
    ...state,
    currentPractice: {
      cycleId: practice.cycleId,
      title: practice.title,
      status: practice.status,
      plan: practice.plan,
    },
  };
}

async function deferCurrentPracticeTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  text: string,
  state: CruxState,
): Promise<string> {
  const nextCycleId = nextPracticeAfter(state.session?.currentCycleId);
  if (!nextCycleId || !state.currentPractice) {
    return "Esta practica no tiene un ciclo posterior disponible. Puedo ayudarte a cerrarla o revisar que falta.";
  }
  const nextPractice = choosePractice(arqueidentidadFase6Content.practices, nextCycleId);
  const result = await ctx.runMutation(internal.store.deferCurrentPracticeAndStartNext, {
    userId,
    reason: text,
    nextCycleId: nextPractice.id,
    nextTitle: nextPractice.title,
    nextPlan: nextPractice.body,
  });
  if (!result.deferred) {
    return "No pude postergar la practica porque ya no figura como activa. Voy a conservar el estado actual para no mover tu progreso por error.";
  }
  const fresh = await loadCruxState(ctx, userId);
  return [
    `${result.deferredTitle} queda postergada, no completada.`,
    "La veras como pendiente en tu estado y podras entregar su evidencia mas adelante.",
    "",
    `Ahora continuamos con ${nextPractice.title}.`,
    "",
    renderPracticePlan(nextPractice),
    "",
    renderProgressDiagram(fresh),
  ].join("\n");
}

async function reopenPracticeTurn(ctx: ActionCtx, userId: Id<"users">, text: string, state: CruxState): Promise<string> {
  const cycleId = resolvePracticeReference(text) ?? state.session?.currentCycleId;
  if (!cycleId) return "Dime que practica quieres reabrir para conservar el resto de tu progreso.";
  const result = await ctx.runMutation(internal.store.reopenPracticeByCycle, { userId, cycleId });
  if (!result.reopened) {
    return [
      "No hice cambios.",
      result.reason === "not_completed"
        ? "Esa practica no figura como completada."
        : "No encuentro una practica guardada con esa referencia.",
    ].join("\n");
  }
  return [
    `${result.title} fue reabierta.`,
    "--------------------------------",
    result.mode === "deferred"
      ? "Conserve la evidencia anterior y la deje pendiente, sin mover la practica que tienes activa."
      : "Conserve la evidencia anterior, pero vuelve a estar activa y no cuenta como terminada.",
    "",
    renderProgressDiagram(await loadCruxState(ctx, userId)),
  ].join("\n");
}

function renderNamedPracticeInstructions(text: string): string {
  const cycleId = resolvePracticeReference(text);
  if (!cycleId) return "Dime que ciclo o practica quieres consultar y te muestro sus instrucciones sin cambiar tu progreso.";
  return renderPracticePlan(choosePractice(arqueidentidadFase6Content.practices, cycleId));
}

function renderPhaseSequence(state: CruxState): string {
  const practices = arqueidentidadFase6Content.practices;
  const currentIndex = practices.findIndex((practice) => practice.id === state.session?.currentCycleId);
  const previous = currentIndex > 0 ? practices[currentIndex - 1] : undefined;
  const current = currentIndex >= 0 ? practices[currentIndex] : undefined;
  const next = currentIndex >= 0 && currentIndex < practices.length - 1 ? practices[currentIndex + 1] : undefined;
  return [
    "SECUENCIA DE FASE VI",
    "--------------------------------",
    `Anterior: ${previous?.title ?? "ninguna"}`,
    `Actual: ${current?.title ?? "sin practica activa"}`,
    `Siguiente: ${next?.title ?? "fin de la secuencia"}`,
    ...(state.deferredPractices?.length
      ? ["", "Pendientes para retomar:", ...state.deferredPractices.map((practice) => `- ${practice.title}`)]
      : []),
    "",
    "Puedes pedirme las instrucciones de cualquier ciclo sin cambiar tu progreso.",
  ].join("\n");
}

function renderDeferredPractices(state: CruxState): string {
  if (!state.deferredPractices?.length) {
    return "No tienes practicas postergadas. Tu recorrido pendiente coincide con la secuencia activa.";
  }
  return [
    "PRACTICAS POSTERGADAS",
    "--------------------------------",
    ...state.deferredPractices.map((practice) => [
      `- ${practice.title}`,
      practice.reason ? `  Motivo guardado: ${practice.reason}` : "  Queda pendiente para retomarla despues.",
    ].join("\n")),
    "",
    "Puedes pedirme las instrucciones de una de ellas o contarme su evidencia cuando la completes. Tu practica activa no cambia por consultarlas.",
  ].join("\n");
}

function renderKnowledgeMenu(): string {
  return [
    "MAPA DE CONOCIMIENTO - FASE VI",
    "--------------------------------",
    "- conceptos base: identidad, interpretacion y ciclo vacio",
    "- preliminar: NSDR, miedo social y niacina",
    "- liminar: Ganzfeld, onirotecnologia y referencia enteogenica",
    "- postliminar: retrospectiva proteica y proxima repeticion",
    "",
    "Dime que tema quieres abrir y lo conecto con tu practica actual.",
  ].join("\n");
}

function nextPracticeAfter(cycleId?: string): string | null {
  if (cycleId === "cycle1_prehypnos_nsdr") return "cycle2_social_fear";
  if (cycleId === "cycle2_social_fear") return "cycle3_niacin_primer";
  if (cycleId === "cycle3_niacin_primer") return "cycle4_ganzfeld";
  if (cycleId === "cycle4_ganzfeld") return "cycle5_onirotechnology";
  if (cycleId === "cycle5_onirotechnology") return "cycle6_enteogenic_reference";
  if (cycleId === "cycle6_enteogenic_reference") return "cycle7_postliminal_retrospective";
  return null;
}

function enrichDebriefEvidence(rawDebrief: string, state: CruxState): string {
  const normalized = normalizeTelegramText(rawDebrief);
  const refersToPriorEvidence = /\b(te dije|ya te dije|lo anterior|eso que dije|como dije|ya conte|ya te conte)\b/.test(normalized);
  if (!refersToPriorEvidence) return rawDebrief;

  const recentUserEvidence = (state.recentMessages ?? [])
    .filter((message) => message.direction === "inbound")
    .map((message) => message.text)
    .filter((message) => message !== rawDebrief)
    .slice(-3);

  if (recentUserEvidence.length === 0) return rawDebrief;
  return [
    rawDebrief,
    "",
    "Evidencia reciente del usuario para recuperar contexto:",
    ...recentUserEvidence.map((message) => `- ${message}`),
  ].join("\n");
}

async function createPracticeCloseout(rawDebrief: string, state: CruxState): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return buildDebrief(rawDebrief);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = geminiModel();
    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: "user",
        parts: [{ text: [
          "Convierte la evidencia del usuario en un cierre de practica breve.",
          "No pidas que use comandos. No digas que eres IA. No menciones backend, memoria ni herramientas.",
          "Si el usuario se queja de que ya habia contado que paso, usa la evidencia reciente del usuario como fuente principal.",
          "Estructura el cierre alrededor de tres piezas: descripcion/narracion de la practica, microtematica que aparecio e hipertematica que mejor funciono.",
          "Puedes mencionar cuerpo, emocion, accion o resultado solo cuando ayuden a explicar esas tres piezas.",
          "Si falta un dato, escribe 'por precisar' en vez de reganar.",
          "No preguntes por resonancia ni disonancia. No pidas calificaciones numericas.",
          "Incluye un ancla practica: la hipertematica que el usuario puede conservar para votar por su identidad final.",
          "Termina con una frase de transicion hacia el siguiente umbral, no con una pregunta evaluativa.",
          `Identidad: ${state.profile?.heroName ?? "sin definir"}`,
          `Practica activa: ${state.currentPractice?.title ?? "sin practica"}`,
          `Evidencia: ${rawDebrief}`,
        ].join("\n") }],
      }] as never,
      config: {
        systemInstruction: "Eres tutor de Arqueidentidad Fase VI. Escribes solo en espanol natural para Telegram. Tu tarea es crear cierres de practica con ancla concreta, no reportes tecnicos.",
        temperature: 0.3,
        topP: 0.8,
        thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? "high" },
      } as never,
    } as never);
    return response.text?.trim() || buildDebrief(rawDebrief);
  } catch (error) {
    console.warn("Practice closeout generation failed", error);
    return buildDebrief(rawDebrief);
  }
}

async function routeCruxTurn(text: string, state: CruxState): Promise<RouterDecision> {
  const fallback = deterministicRouteDecision(text, state);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = geminiModel();
    const prompt = [
      "Decide la ruta interna de un turno BridgeCrux. No escribas al usuario.",
      "Aplica BEST ANSWER como router: infiere la necesidad real desde el mensaje literal, historial reciente, estado actual y costo de una mutacion equivocada.",
      "El router de baja reflexion nunca produce copia visible ni ejecuta acciones; solo clasifica para que el tutor de alta reflexion responda.",
      "Distingue tema de acto de habla: mencionar una practica no significa completarla; mencionar cheat day no significa cambiarlo; decir que enviara un reporte no significa que el reporte ya fue entregado.",
      "Distingue temporalidad: futuro, intencion, permiso o preparacion no autorizan mutacion. Solo una entrega presente con evidencia suficiente puede cerrar una practica.",
      "Distingue ruta e intent: la ruta nombra el area y el intent nombra la accion exacta. Una ruta correcta con intent incorrecto puede causar una mutacion destructiva.",
      "Usa evidencia negativa: preguntas, frases como 'quiero pasarte', 'voy a contarte', 'debo el reporte', 'se puede' o 'estoy por hacerlo' bloquean submit_evidence.",
      "Ante ambiguedad, elige tutor/clarificacion y stateMutationCandidate=none. El costo de no avanzar un turno es menor que completar una practica equivocada.",
      "Hay dos tracks internos: daily_habit = rutina nucleo diaria con Tummo-Identidad y habitos; phase_practice = practicas/subfases de Arqueidentidad como NSDR, miedo social, niacina, Ganzfeld, oniro o debriefs.",
      "Respuestas cortas a recordatorios como 'hecho', 'ya hice tummo', 'rutina lista', 'me falta el segundo' son daily_habit, no debrief.",
      "El usuario no debe depender de comandos. Si pide 'dame mi estado', 'muestrame mi rutina', 'quiero domingo como dia libre' o equivalente, enruta a la accion correspondiente.",
      "Mensajes con ejecucion concreta y al menos dos dimensiones entre interpretacion, cuerpo/emocion y resultado pueden ser submit_evidence.",
      "Si el usuario solo anuncia que enviara evidencia, route=active_practice intent=announce_evidence y no mutacion.",
      "Si el mensaje nombra una practica distinta de la activa, conserva esa referencia para que el controlador guarde evidencia sin completar la practica actual.",
      "Si el usuario dice explicitamente que la practica actual fue marcada por error, que no la termino o que quiere reabrirla, route=active_practice intent=reopen_practice stateMutationCandidate=practice.",
      "Si pide postergar o saltar temporalmente la practica activa y pasar a la siguiente, route=active_practice intent=defer_practice stateMutationCandidate=practice.",
      "Una pregunta sobre alternativas, adaptaciones o posibilidades sigue siendo active_practice/ask_clarification. No es capability gap ni autorizacion para mover el ciclo.",
      "Si el mismo mensaje entrega evidencia suficiente de la practica activa y confirma de forma explicita uno o mas habitos diarios, route=debrief intent=submit_mixed_evidence stateMutationCandidate=habit_and_ledger.",
      "Prioridad: seguridad > onboarding activo > daily_habit claro > evidencia de practica > comandos implicitos > tutor libre.",
      "Si el usuario confirma una sugerencia previa, marca intent confirm_previous_suggestion.",
      "Si entrega evidencia suficiente de una practica de fase, route=debrief intent=submit_evidence.",
      "Si responde a rutina diaria o pregunta habitos pendientes, route=daily_habit o habit_status.",
      "Si cambia cheat day o dia vacio con dias concretos, route=habit_status intent=set_routine_days stateMutationCandidate=profile.",
      "Si pide agregar un habito diario concreto, route=daily_habit intent=add_core_habit stateMutationCandidate=habit.",
      "Si pide pausar, reactivar, archivar o condensar habitos concretos, route=daily_habit con intent pause_habit, resume_habit, archive_habit o condense_habits y stateMutationCandidate=habit.",
      "Eliminar un habito significa archivarlo para conservar su historial; nunca borres evidencia historica.",
      "Si consulta historial o racha detallada de rutina, route=habit_status intent=inspect_routine_history.",
      "Si consulta evidencia, reportes o registros guardados de uno o varios ciclos, route=practice_history intent=inspect_practice_history.",
      "Si pide ver su identidad, mapa Quest, dreamline, fear-setting, identidad inicial o retos guardados, route=settings intent=inspect_identity_map stateMutationCandidate=none.",
      "Si pide abrir la app, entrar a la web, ver su espacio web o recibir el enlace web, route=settings intent=open_web_app stateMutationCandidate=session.",
      "Si pide cerrar, revocar o desconectar todos sus accesos web, route=settings intent=revoke_web_access stateMutationCandidate=session.",
      "Si pide corregir un campo concreto del mapa Quest, route=settings intent=edit_identity_map stateMutationCandidate=profile.",
      "Si pide ver instrucciones de un ciclo nombrado, route=active_practice intent=inspect_named_practice stateMutationCandidate=none; consultar no cambia el ciclo activo.",
      "Si pide ver anterior, actual y siguiente, route=progress intent=inspect_phase_sequence stateMutationCandidate=none.",
      "Si pide ver las practicas postergadas o pendientes para retomar, route=practice_history intent=inspect_deferred_practices stateMutationCandidate=none.",
      "Si pide un menu de conceptos, fases o temas disponibles, route=knowledge_question intent=browse_knowledge stateMutationCandidate=none.",
      "Si pide explicacion conceptual, route=knowledge_question intent=ask_concept.",
      "Si reporta fallo o algo roto, route=report intent=report_problem.",
      "Si pide estado/progreso, route=progress. Si pide memoria, route=memory. Si pide configuracion, route=settings.",
      "Inventario ejecutable actual: leer estado, rutina, historial de rutina, mapa de identidad, secuencia e historial de practicas; cambiar cadencia, cheat day, dia vacio y campos nombrados del mapa; agregar, pausar, reactivar, archivar o condensar habitos; marcar uno o todos los habitos; iniciar, cerrar, postergar o reabrir una practica nombrada; guardar evidencia; crear reportes.",
      "No existe todavia una operacion segura para cambiar horarios reales del cron, pausar/reanudar todo el programa, borrar o reescribir evidencia historica, ni reparar reportes automaticamente. Si el usuario pide una de esas operaciones, usa route=unknown, stateMutationCandidate=none y capabilityGap con la capa primaria correcta.",
      "Anticipa capacidades faltantes sin inventar ejecucion: si la necesidad es recurrente y no encaja en ninguna ruta disponible, usa route=free_tutor o unknown, stateMutationCandidate=none, anticipatedRoute con un nombre generico y capabilityGap con la capacidad que falta.",
      "Clasifica capabilityGapType como software_capability, task_signal, intent_reading, field_extraction, state_contract, tool_binding, knowledge_content, channel_interface, external_integration o unknown.",
      "No propongas una capacidad nueva cuando una ruta existente puede resolver la necesidad mediante otro intent.",
      `Estado: ${state.session?.status ?? "unknown"}`,
      `Paso onboarding: ${state.session?.onboardingStep ?? "none"}`,
      `Practica activa: ${state.currentPractice?.title ?? "none"}`,
      `Habitos guardados: ${(state.dailyHabits ?? []).map((habit) => `${habit.title} [${habit.status}]`).join("; ") || "none"}`,
      `Historial reciente:\n${formatRecentMessages(state, 12)}`,
      `Mensaje: ${text}`,
      'Devuelve solo JSON: {"route":"free_tutor","intent":"other","confidence":0.7,"needsHighThinking":true,"safetyFlag":"none","stateMutationCandidate":"none","reason":"...","anticipatedRoute":"","capabilityGap":"","capabilityGapType":"unknown"}',
    ].join("\n");

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }] as never,
      config: {
        systemInstruction: "Eres un router interno BridgeCrux. Devuelve solo JSON valido. Nunca redactes mensajes para el usuario.",
        temperature: 0.2,
        topP: 0.8,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "low" },
      } as never,
    } as never);

    return validateRouterDecision(routerDecisionFromJson(parseJsonObject(response.text ?? ""), fallback), text, state);
  } catch (error) {
    console.warn("Crux router failed", error);
    return fallback;
  }
}

async function recordRouterDecision(
  ctx: ActionCtx,
  userId: Id<"users">,
  text: string,
  state: CruxState,
  route: RouterDecision,
): Promise<void> {
  const args: {
    userId: Id<"users">;
    route: string;
    intent: string;
    confidence: number;
    needsHighThinking: boolean;
    safetyFlag: string;
    stateMutationCandidate: string;
    reason: string;
    messageExcerpt: string;
    sessionStatus?: string;
    onboardingStep?: string;
    currentCycleId?: string;
    anticipatedRoute?: string;
    capabilityGap?: string;
    capabilityGapType?: string;
    model: string;
  } = {
    userId,
    route: route.route,
    intent: route.intent,
    confidence: route.confidence,
    needsHighThinking: route.needsHighThinking,
    safetyFlag: route.safetyFlag,
    stateMutationCandidate: route.stateMutationCandidate,
    reason: route.reason.slice(0, 500),
    messageExcerpt: text.slice(0, 500),
    model: geminiModel(),
  };
  if (state.session?.status !== undefined) args.sessionStatus = state.session.status;
  if (state.session?.onboardingStep !== undefined) args.onboardingStep = state.session.onboardingStep;
  if (state.session?.currentCycleId !== undefined) args.currentCycleId = state.session.currentCycleId;
  if (route.anticipatedRoute !== undefined) args.anticipatedRoute = route.anticipatedRoute;
  if (route.capabilityGap !== undefined) args.capabilityGap = route.capabilityGap;
  if (route.capabilityGapType !== undefined) args.capabilityGapType = route.capabilityGapType;
  await ctx.runMutation(internal.store.recordRouterDecision, args);
}

function validateRouterDecision(decision: RouterDecision, text: string, state: CruxState): RouterDecision {
  const normalized = normalizeTelegramText(text);
  decision = sanitizeCapabilityGapDecision(decision, text);
  if (isRevokeWebAccessRequest(normalized)) {
    return baseRoute("settings", "revoke_web_access", 0.99, "none", "session", "validated web-access revocation request");
  }
  if (isOpenWebAppRequest(normalized)) {
    return baseRoute("settings", "open_web_app", 0.99, "none", "session", "validated web-app access request");
  }
  const habitManagementIntent = habitManagementIntentFromText(normalized);
  if (habitManagementIntent) {
    return baseRoute("daily_habit", habitManagementIntent, 0.96, "none", "habit", "validated explicit habit lifecycle mutation");
  }
  if (isIdentityMapCorrectionSignal(text)) {
    return baseRoute("settings", "edit_identity_map", 0.95, "none", "profile", "validated explicit identity-map correction");
  }
  if (isRoutineHistoryRequest(normalized)) {
    return baseRoute("habit_status", "inspect_routine_history", 0.94, "none", "none", "validated routine history inspection");
  }
  if (isNamedPracticeInstructionsRequest(text)) {
    return baseRoute("active_practice", "inspect_named_practice", 0.94, "none", "none", "validated named-practice instruction request");
  }
  if (isPhaseSequenceRequest(normalized)) {
    return baseRoute("progress", "inspect_phase_sequence", 0.92, "none", "none", "validated phase sequence inspection");
  }
  if (isDeferredPracticeListRequest(normalized)) {
    return baseRoute("practice_history", "inspect_deferred_practices", 0.95, "none", "none", "validated deferred-practice inspection");
  }
  if (isKnowledgeMenuRequest(normalized)) {
    return baseRoute("knowledge_question", "browse_knowledge", 0.9, "none", "none", "validated knowledge menu request");
  }
  if (isReopenPracticeRequest(normalized)) {
    return baseRoute("active_practice", "reopen_practice", 0.96, "none", "practice", "validated explicit practice correction");
  }
  if (isDeferPracticeRequest(normalized)) {
    return baseRoute("active_practice", "defer_practice", 0.97, "none", "practice", "explicit request to defer current practice");
  }
  const evidenceSignal = assessPracticeEvidenceSignal(text);
  if (evidenceSignal.kind === "sufficient" && hasExplicitHabitCompletion(normalized)) {
    return {
      ...decision,
      route: "debrief",
      intent: "submit_mixed_evidence",
      stateMutationCandidate: "habit_and_ledger",
      needsHighThinking: true,
      reason: "validated as combined daily-routine and phase-practice evidence",
    };
  }
  if (isIdentityMapRequest(normalized)) {
    return {
      ...decision,
      route: "settings",
      intent: "inspect_identity_map",
      stateMutationCandidate: "none",
      needsHighThinking: true,
      reason: "validated as persisted identity-map inspection",
    };
  }
  if (isPracticeHistoryRequest(normalized)) {
    return {
      ...decision,
      route: "practice_history",
      intent: "inspect_practice_history",
      stateMutationCandidate: "none",
      needsHighThinking: true,
      reason: "validated as persisted practice-history inspection",
    };
  }
  if (decision.route === "memory" && /\b(registro|registros|reporte|reportes|ciclo|ciclos|practica|practicas|evidencia)\b/.test(normalized)) {
    return {
      ...decision,
      route: "practice_history",
      intent: "inspect_practice_history",
      stateMutationCandidate: "none",
      needsHighThinking: true,
      reason: "memory route corrected to practice history",
    };
  }
  if (decision.route === "report" && !isExplicitAppProblemReport(normalized)) {
    return {
      ...decision,
      route: state.currentPractice ? "active_practice" : "knowledge_question",
      intent: "ask_clarification",
      stateMutationCandidate: "none",
      needsHighThinking: true,
      reason: "report route rejected because the user did not report an application failure",
    };
  }
  if (decision.capabilityGap && decision.stateMutationCandidate !== "none") {
    return {
      ...decision,
      route: "free_tutor",
      intent: "other",
      stateMutationCandidate: "none",
      needsHighThinking: true,
      reason: "anticipated capability kept audit-only; mutation blocked",
    };
  }
  return decision;
}

function deterministicRouteDecision(text: string, state: CruxState): RouterDecision {
  const normalized = normalizeTelegramText(text);
  if (isRevokeWebAccessRequest(normalized)) {
    return baseRoute("settings", "revoke_web_access", 0.99, "none", "session", "web-access revocation request");
  }
  if (isOpenWebAppRequest(normalized)) {
    return baseRoute("settings", "open_web_app", 0.99, "none", "session", "web-app access request");
  }
  const habitManagementIntent = habitManagementIntentFromText(normalized);
  if (habitManagementIntent) {
    return baseRoute("daily_habit", habitManagementIntent, 0.96, "none", "habit", "explicit habit lifecycle mutation");
  }
  if (isIdentityMapCorrectionSignal(text)) {
    return baseRoute("settings", "edit_identity_map", 0.95, "none", "profile", "explicit identity-map correction");
  }
  if (isRoutineHistoryRequest(normalized)) {
    return baseRoute("habit_status", "inspect_routine_history", 0.94, "none", "none", "routine history request");
  }
  if (isNamedPracticeInstructionsRequest(text)) {
    return baseRoute("active_practice", "inspect_named_practice", 0.94, "none", "none", "named-practice instruction request");
  }
  if (isPhaseSequenceRequest(normalized)) {
    return baseRoute("progress", "inspect_phase_sequence", 0.92, "none", "none", "phase sequence request");
  }
  if (isDeferredPracticeListRequest(normalized)) {
    return baseRoute("practice_history", "inspect_deferred_practices", 0.95, "none", "none", "deferred-practice inspection");
  }
  if (isKnowledgeMenuRequest(normalized)) {
    return baseRoute("knowledge_question", "browse_knowledge", 0.9, "none", "none", "knowledge menu request");
  }
  if (isReopenPracticeRequest(normalized)) {
    return baseRoute("active_practice", "reopen_practice", 0.96, "none", "practice", "explicit practice correction");
  }
  if (isDeferPracticeRequest(normalized)) {
    return baseRoute("active_practice", "defer_practice", 0.97, "none", "practice", "explicit request to defer current practice");
  }
  const prevention = classifyPracticeRequest(text);
  if (prevention.blocked.length > 0) {
    return baseRoute("safety", "adapt_practice", 0.9, "possible", "none", "detected prevention boundary");
  }
  if (state.session?.status === "onboarding") {
    const intent = isConfirmingTutorSuggestion(text)
      ? "confirm_previous_suggestion"
      : /[?]|\b(como|por que|para que|no entiendo|explica|diferencia)\b/.test(normalized)
        ? "ask_clarification"
        : "answer_current_step";
    return baseRoute("onboarding", intent, 0.95, "none", "profile", "active onboarding");
  }
  if (isPracticeHistoryRequest(normalized)) {
    return baseRoute("practice_history", "inspect_practice_history", 0.94, "none", "none", "practice history request");
  }
  if (isRoutineDayChangeRequest(normalized)) {
    return baseRoute("habit_status", "set_routine_days", 0.92, "none", "profile", "routine day change request");
  }
  if (isEmptyDayRequest(normalized)) {
    return baseRoute("empty_day", "start_empty_day", 0.88, "none", "none", "empty day request");
  }
  if (isHabitStatusRequest(normalized)) {
    return baseRoute("habit_status", "ask_pending_habits", 0.9, "none", "none", "habit status request");
  }
  if (isAddHabitRequest(normalized)) {
    return baseRoute("daily_habit", "add_core_habit", 0.88, "none", "habit", "add daily habit request");
  }
  if (isNamedHabitCompletion(text, state)) {
    return baseRoute("daily_habit", "partial_daily_habit", 0.93, "none", "habit", "named daily habit completion");
  }
  const evidenceSignal = assessPracticeEvidenceSignal(text);
  if (evidenceSignal.kind === "sufficient" && hasExplicitHabitCompletion(normalized)) {
    return baseRoute("debrief", "submit_mixed_evidence", 0.94, "none", "habit_and_ledger", "combined routine and practice evidence");
  }
  if (isShortHabitCompletion(text, state)) {
    return baseRoute("daily_habit", normalized.includes("tummo") ? "partial_daily_habit" : "confirm_daily_habit", 0.92, "none", "habit", "daily routine completion");
  }
  if (isIdentityMapRequest(normalized)) {
    return baseRoute("settings", "inspect_identity_map", 0.88, "none", "none", "identity map inspection");
  }
  if (/\b(memoria|recuerdas|recuerda)\b/.test(normalized)) {
    return baseRoute("memory", "ask_concept", 0.75, "none", "none", "memory request");
  }
  if (/\b(estado|status|progreso|avance|como voy)\b/.test(normalized)) {
    return baseRoute("progress", "ask_concept", 0.8, "none", "none", "progress request");
  }
  if (/\b(configuracion|settings|cadencia|ritmo)\b/.test(normalized)) {
    return baseRoute("settings", "change_settings", 0.7, "none", "none", "settings request");
  }
  if (isDeferPracticeRequest(normalized)) {
    return baseRoute("active_practice", "defer_practice", 0.97, "none", "practice", "explicit request to defer current practice");
  }
  if (/\b(reabrir|reabre|desmarcar|no la termine|no la complete|marcada por error|completada por error|volver a activar)\b/.test(normalized)
    && /\b(practica|ciclo|nsdr|reto social|niacina|ganzfeld|oniro)\b/.test(normalized)) {
    return baseRoute("active_practice", "reopen_practice", 0.95, "none", "practice", "explicit request to reopen current practice");
  }
  if (/\b(fallo|error|bug|se rompio|no funciona|problema)\b/.test(normalized)) {
    return baseRoute("report", "report_problem", 0.8, "none", "report", "reported problem");
  }
  if (evidenceSignal.kind === "announcement") {
    return baseRoute("active_practice", "announce_evidence", 0.95, "none", "none", "user announces future evidence");
  }
  if (evidenceSignal.kind === "sufficient" && isNaturalPracticeEvidence(text, state)) {
    return baseRoute("debrief", "submit_evidence", 0.88, "none", "ledger", "natural practice evidence");
  }
  if (state.currentPractice && /\b(como|que hago|puedo|debo|cuando|donde|sirve|importa|explica|no entiendo)\b/.test(normalized)) {
    return baseRoute("active_practice", "ask_clarification", 0.75, "none", "none", "active practice clarification");
  }
  if (/\b(que es|por que|para que|fase|identidad|interpretacion|proteico|liminar|preliminar|postliminar)\b/.test(normalized)) {
    return baseRoute("knowledge_question", "ask_concept", 0.72, "none", "none", "concept question");
  }
  return baseRoute("free_tutor", "other", 0.55, "none", "none", "fallback tutor route");
}

function routerDecisionFromJson(value: Record<string, unknown>, fallback: RouterDecision): RouterDecision {
  const route = routeFromValue(value.route) ?? fallback.route;
  const intent = intentFromValue(value.intent) ?? fallback.intent;
  const confidence = clamp(Number(value.confidence ?? fallback.confidence), 0, 1);
  const safetyFlag = value.safetyFlag === "possible" || value.safetyFlag === "urgent" || value.safetyFlag === "none"
    ? value.safetyFlag
    : fallback.safetyFlag;
  const stateMutationCandidate = mutationCandidateFromValue(value.stateMutationCandidate) ?? fallback.stateMutationCandidate;
  const reason = stringFromJson(value.reason) ?? fallback.reason;
  const decision: RouterDecision = {
    route,
    intent,
    confidence,
    needsHighThinking: value.needsHighThinking !== false,
    safetyFlag,
    stateMutationCandidate,
    reason,
  };
  const anticipatedRoute = meaningfulRouterString(value.anticipatedRoute);
  const capabilityGap = meaningfulRouterString(value.capabilityGap);
  const capabilityGapType = capabilityGapTypeFromValue(value.capabilityGapType);
  if (anticipatedRoute) decision.anticipatedRoute = anticipatedRoute.slice(0, 120);
  if (capabilityGap) decision.capabilityGap = capabilityGap.slice(0, 500);
  if (capabilityGapType) decision.capabilityGapType = capabilityGapType;
  return decision;
}

function capabilityGapTypeFromValue(value: unknown): CapabilityGapType | undefined {
  return value === "software_capability" || value === "task_signal" || value === "intent_reading"
    || value === "field_extraction" || value === "state_contract" || value === "tool_binding"
    || value === "knowledge_content" || value === "channel_interface" || value === "external_integration"
    || value === "unknown"
    ? value
    : undefined;
}

function meaningfulRouterString(value: unknown): string | undefined {
  const text = stringFromJson(value);
  if (!text) return undefined;
  const normalized = normalizeTelegramText(text);
  return normalized === "none" || normalized === "null" || normalized === "ninguna" || normalized === "ninguno"
    || normalized === "n/a" || normalized === "na" || normalized === "unknown"
    ? undefined
    : text;
}

function sanitizeCapabilityGapDecision(decision: RouterDecision, text: string): RouterDecision {
  if (isActionableCapabilityGap(decision, text)) return decision;
  if (!decision.capabilityGap && !decision.anticipatedRoute && !decision.capabilityGapType) return decision;
  const {
    anticipatedRoute: _anticipatedRoute,
    capabilityGap: _capabilityGap,
    capabilityGapType: _capabilityGapType,
    ...clean
  } = decision;
  return clean;
}

function isActionableCapabilityGap(decision: RouterDecision, text: string): boolean {
  if (!decision.capabilityGap || !decision.anticipatedRoute || decision.confidence < 0.75) return false;
  if (decision.route !== "free_tutor" && decision.route !== "unknown") return false;
  const normalized = normalizeTelegramText(text);
  const executionAct = /\b(quiero que|necesito que|haz|hacer|cambia|cambiar|actualiza|actualizar|borra|borrar|elimina|eliminar|pausa|pausar|reanuda|reanudar|programa|programar|conecta|conectar|envia|enviar|ejecuta|ejecutar)\b/.test(normalized);
  const conversationalAct = /\b(que alternativa|cual alternativa|explica|por que|para que|que significa|como funciona|quiero saber|hay manera)\b/.test(normalized);
  return executionAct && !conversationalAct;
}

function baseRoute(
  route: CruxRoute,
  intent: CruxIntent,
  confidence: number,
  safetyFlag: RouterDecision["safetyFlag"],
  stateMutationCandidate: RouterDecision["stateMutationCandidate"],
  reason: string,
): RouterDecision {
  return { route, intent, confidence, needsHighThinking: true, safetyFlag, stateMutationCandidate, reason };
}

function routeFromValue(value: unknown): CruxRoute | undefined {
  return value === "onboarding" || value === "daily_habit" || value === "habit_status" || value === "empty_day"
    || value === "active_practice" || value === "debrief" || value === "practice_history" || value === "knowledge_question"
    || value === "safety" || value === "settings" || value === "progress" || value === "memory" || value === "report"
    || value === "free_tutor" || value === "unknown"
    ? value
    : undefined;
}

function intentFromValue(value: unknown): CruxIntent | undefined {
  return value === "answer_current_step" || value === "ask_clarification" || value === "confirm_previous_suggestion"
    || value === "revise_previous_answer" || value === "start_or_continue" || value === "adapt_practice"
    || value === "confirm_daily_habit" || value === "partial_daily_habit" || value === "ask_pending_habits"
    || value === "set_cheat_day" || value === "set_routine_days" || value === "add_core_habit"
    || value === "pause_habit" || value === "resume_habit" || value === "archive_habit" || value === "condense_habits"
    || value === "inspect_routine_history" || value === "start_empty_day"
    || value === "announce_evidence" || value === "submit_evidence" || value === "submit_mixed_evidence" || value === "defer_practice"
    || value === "reopen_practice" || value === "inspect_named_practice" || value === "inspect_phase_sequence"
    || value === "inspect_deferred_practices" || value === "inspect_practice_history" || value === "inspect_identity_map" || value === "edit_identity_map"
    || value === "ask_concept" || value === "browse_knowledge" || value === "report_problem"
    || value === "change_settings" || value === "open_web_app" || value === "revoke_web_access" || value === "other"
    ? value
    : undefined;
}

function isOpenWebAppRequest(normalized: string): boolean {
  return isNaturalWebAccessRequest(normalized);
}

function isRevokeWebAccessRequest(normalized: string): boolean {
  const closes = /\b(cerrar|cierra|revocar|revoca|desconectar|desconecta|salir|bloquear|bloquea)\b/.test(normalized);
  const targetsWeb = /\b(acceso|accesos|sesion|sesiones|web|app|aplicacion|dispositivo|dispositivos)\b/.test(normalized);
  return closes && targetsWeb;
}

function mutationCandidateFromValue(value: unknown): RouterDecision["stateMutationCandidate"] | undefined {
  return value === "none" || value === "profile" || value === "session" || value === "practice" || value === "ledger"
    || value === "habit" || value === "habit_and_ledger" || value === "memory" || value === "report"
    ? value
    : undefined;
}

async function runTutorAgentTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  chatId: string,
  text: string,
  state: CruxState,
  route?: RouterDecision,
  options: { allowRetry?: boolean } = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return localTutorFallback(text, state);
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = geminiModel();
  const temperature = Number(process.env.GEMINI_TEMPERATURE ?? "0.6");
  const topP = Number(process.env.GEMINI_TOP_P ?? "1.0");
  const thinkingLevel = process.env.GEMINI_THINKING_LEVEL ?? "high";
  const compiled = compilePrompt(arqueidentidadFase6Content, state, text);
  const routedContext = route
    ? [
      "DECISION INTERNA DEL ROUTER",
      JSON.stringify(route),
      "Esta decision no se menciona al usuario. Usala solo para elegir herramientas y foco.",
      "",
      compiled.userContext,
    ].join("\n")
    : compiled.userContext;
  const toolConfig = { functionDeclarations: getToolDeclarations(route?.route, route?.intent) as never[] };
  const contents: unknown[] = [{ role: "user", parts: [{ text: routedContext }] }];
  let sentDirect = false;

  for (let i = 0; i < 3; i += 1) {
    let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
    try {
      response = await ai.models.generateContent({
        model,
        contents: contents as never,
        config: {
          systemInstruction: compiled.systemInstruction,
          temperature,
          topP,
          tools: [toolConfig],
          thinkingConfig: { thinkingLevel },
        } as never,
      } as never);
    } catch (error) {
      return await handleTutorGenerationFailure(ctx, userId, chatId, text, state, route, error, options.allowRetry !== false);
    }

    const functionCalls = (response as { functionCalls?: Array<{ name: string; args?: Record<string, unknown> }> }).functionCalls ?? [];
    if (functionCalls.length === 0) {
      return sentDirect ? "" : (response.text ?? localTutorFallback(text, state));
    }

    const call = functionCalls[0]!;
    const execution = await executeTool(ctx, userId, chatId, call.name, call.args ?? {}, state, route);
    sentDirect = sentDirect || execution.sentDirect;
    const candidateContent = (response as { candidates?: Array<{ content?: unknown }> }).candidates?.[0]?.content;
    if (candidateContent) contents.push(candidateContent);
    contents.push({
      role: "tool",
      parts: [{
        functionResponse: {
          name: call.name,
          response: execution.result,
        },
      }],
    });
  }

  await ctx.runMutation(internal.store.createReport, {
    userId,
    severity: "tool_error",
    summary: "Gemini tool loop exceeded maximum iterations.",
    transcriptExcerpt: text,
  });
  return sentDirect ? "" : "Necesito recalibrar: intente hacer demasiado en un solo turno. Ya deje registrado el fallo; envia /status para recuperar el hilo.";
}

async function handleTutorGenerationFailure(
  ctx: ActionCtx,
  userId: Id<"users">,
  chatId: string,
  text: string,
  state: CruxState,
  route: RouterDecision | undefined,
  error: unknown,
  allowRetry: boolean,
): Promise<string> {
  const details = describeExternalError(error, "gemini:tutor_generate");
  const retryable = isRetryableGeminiError(error);
  const retryAfterMs = 30_000;

  const reportArgs: {
    userId: Id<"users">;
    severity: "tool_error";
    summary: string;
    transcriptExcerpt: string;
    boundary: string;
    errorName: string;
    errorMessage: string;
    errorCause?: string;
    route?: string;
    intent?: string;
    currentCycleId?: string;
    retryAfterMs?: number;
    model: string;
  } = {
    userId,
    severity: "tool_error",
    summary: buildUnhandledTurnReport(details.errorMessage, state, details),
    transcriptExcerpt: text,
    boundary: details.boundary,
    errorName: details.errorName,
    errorMessage: details.errorMessage,
    model: geminiModel(),
  };
  if (details.errorCause !== undefined) reportArgs.errorCause = details.errorCause;
  if (route?.route !== undefined) reportArgs.route = route.route;
  if (route?.intent !== undefined) reportArgs.intent = route.intent;
  if (state.session?.currentCycleId !== undefined) reportArgs.currentCycleId = state.session.currentCycleId;
  if (retryable && allowRetry) reportArgs.retryAfterMs = retryAfterMs;
  await ctx.runMutation(internal.store.createReport, reportArgs);

  if (retryable && allowRetry) {
    const retryArgs: {
      userId: Id<"users">;
      chatId: string;
      text: string;
      routeJson?: string;
      attempt: number;
    } = {
      userId,
      chatId,
      text,
      attempt: 1,
    };
    if (route) retryArgs.routeJson = JSON.stringify(route);
    await ctx.scheduler.runAfter(retryAfterMs, internal.agent.retryTutorAnswer, retryArgs);

    return [
      "El tutor profundo esta con alta demanda en este momento.",
      "No perdi tu mensaje. Voy a intentarlo de nuevo y te respondo en este mismo chat en unos 30 segundos.",
    ].join("\n");
  }

  return localTutorFallback(text, state);
}

async function assessCadenceAnswer(text: string, state: CruxState): Promise<CadenceAssessment> {
  const parsed = parseCadence(text);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua una respuesta del paso de cadencia en onboarding de Arqueidentidad.",
      "El usuario debe elegir weekly/semanal o biweekly/quincenal.",
      "Acepta typos, frases conversacionales y correcciones si el significado es claro: 'quiincenal tentonces', 'quincenal dije', 'cada dos semanas' => biweekly.",
      "Si el usuario pregunta, duda, pide explicacion o dice que quiere pensarlo, no aceptes; responde como tutor y explica la diferencia segun su necesidad.",
      "La respuesta al usuario debe empezar con aceptacion, rechazo o no-aceptacion temporal.",
      "No menciones JSON, formato interno, backend, prompts ni herramientas.",
      "Si la respuesta confirma una sugerencia previa, usa el historial reciente para resolverla.",
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Respuesta: ${text}`,
      `Parse deterministic: ${JSON.stringify({ cadence: parsed })}`,
      'Devuelve solo JSON: {"accepted": true, "message": "...", "cadence": "weekly"}',
      'Usa cadence solo como "weekly" o "biweekly".',
    ].join("\n"));
    const assessed = cadenceAssessmentFromJson(reviewed, parsed);
    if (assessed.message) return assessed;
  }

  if (parsed) {
    return {
      accepted: true,
      message: `Aceptado: trabajaremos en ritmo ${parsed === "weekly" ? "semanal" : "quincenal"}.`,
      cadence: parsed,
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto: necesito que elijas semanal o quincenal para ajustar la exigencia del programa.",
  };
}

async function assessHeroAnswer(text: string, state: CruxState): Promise<HeroAssessment> {
  const parsed = parseHeroIdentity(text);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua la identidad final para onboarding Quest de Arqueidentidad.",
      "Acepta solo si hay un nombre de identidad final y un por que basado en una buena interpretacion.",
      "La identidad final aparece despues de dreamline, fear-setting, identidad inicial y retos. Debe nombrar hacia donde se transforma el usuario.",
      "Buena interpretacion: reduce ruido, no se auto-coacciona, no se autoinsulta, no nace de 'todo sale mal', no intenta arreglar la vida desde desprecio por si mismo.",
      "Rechaza identidades genericas como 'mejor version de mi mismo' si el por que es autoataque, fatalismo, vergueenza o desesperanza.",
      "Si rechazas, explica pedagogicamente por que todo proceso debe empezar desde una buena interpretacion: la identidad que nace de autoataque entrena obediencia al ruido, no transformacion.",
      "Usa estilo tutor Michel Thomas: el problema es de encuadre, no culpa del usuario; da una reformulacion posible.",
      "Si el formato esta mal pero el sentido es claro, normaliza sin mencionarlo al usuario.",
      "La respuesta al usuario debe empezar aprobando, rechazando o aceptando parcialmente claramente.",
      "No uses frases genericas como 'Bienvenido', 'registrado con exito', 'estamos listos' ni celebracion vacia.",
      "No menciones JSON, formato interno, backend, prompts ni herramientas.",
      "Si la respuesta confirma una sugerencia previa, usa el historial reciente para resolverla.",
      `Identidad inicial: ${JSON.stringify(state.profile?.initialIdentity ?? {})}`,
      `Retos: ${JSON.stringify({ interno: state.profile?.villainInternal, externo: state.profile?.villainExternal, filosofico: state.profile?.villainPhilosophical })}`,
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Respuesta: ${text}`,
      `Parse deterministic: ${JSON.stringify(parsed)}`,
      'Devuelve solo JSON: {"accepted": true, "message": "...", "heroName": "...", "heroWhy": "..."}',
    ].join("\n"));
    const assessed = heroAssessmentFromJson(reviewed, parsed);
    if (assessed.message) return assessed;
  }

  if (parsed.heroName && parsed.heroWhy) {
    return {
      accepted: true,
      message: `Aceptado: "${parsed.heroName}" tiene nombre y direccion. El por que tambien sirve porque conecta tecnologia con plenitud, no solo con rendimiento.`,
      heroName: parsed.heroName,
      heroWhy: parsed.heroWhy,
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto: veo una intuicion, pero necesito una identidad que nazca de una buena interpretacion, no de autoataque o fatalismo.",
  };
}

async function assessObstaclesAnswer(text: string, state: CruxState): Promise<ObstaclesAssessment> {
  const parsed = parseVillains(text);
  const deterministicRescue = confirmedOrDirectObstacles(text, state);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua una respuesta de retos para onboarding Quest de Arqueidentidad.",
      "Acepta si hay reto interno, externo y filosofico aunque esten escritos de forma imperfecta, siempre que puedas convertirlos en mapa entrenable.",
      "Rechaza si el usuario se insulta, convierte personas en enemigos a odiar, o deja un campo como 'no se', 'cualquier cosa', 'lo que sea'.",
      "Si hay material util pero mal formulado y las tres piezas estan presentes, reformulalo positivamente y aceptalo; no pidas confirmacion de tu propia reformulacion.",
      "Si falta una pieza real, reformula lo aprovechable y pide solo esa pieza.",
      "La respuesta al usuario debe empezar aprobando o rechazando claramente.",
      "No uses frases genericas, no moralices, no culpes al usuario; corrige el encuadre.",
      "No menciones JSON, formato interno, backend, prompts ni herramientas.",
      "Si la respuesta del usuario significa 'si, usa tu sugerencia', busca en el historial reciente la ultima reformulacion propuesta por el tutor y aceptala si contiene reto interno, externo y filosofico. No vuelvas a pedir los tres campos.",
      `Identidad inicial: ${JSON.stringify(state.profile?.initialIdentity ?? {})}`,
      `Dreamline: ${JSON.stringify(state.profile?.dreamline ?? {})}`,
      `Fear-setting: ${JSON.stringify(state.profile?.fearSetting ?? {})}`,
      `Respuesta: ${text}`,
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Parse deterministic: ${JSON.stringify(parsed)}`,
      'Devuelve solo JSON: {"accepted": false, "message": "...", "villainInternal": "...", "villainExternal": "...", "villainPhilosophical": "..."}',
    ].join("\n"));
    const assessed = obstaclesAssessmentFromJson(reviewed, parsed);
    if (!assessed.accepted && deterministicRescue.accepted) return deterministicRescue;
    if (assessed.message) return assessed;
  }

  if (deterministicRescue.accepted) return deterministicRescue;

  const natural = parseNaturalObstacles(text);
  const merged = { ...parsed, ...natural };
  const philosophicalLow = !merged.villainPhilosophical || isLowSignalAnswer(merged.villainPhilosophical);
  const selfAttack = /\b(de mierda|mierda|perezoso|idiota|imbecil|inutil)\b/i.test(text);
  const blamePeople = /\b(vecinos|gente|ellos|personas)\b/i.test(merged.villainExternal ?? "") && /\b(no me dejan|culpa|odio|enemigos?)\b/i.test(text);

  if (philosophicalLow || selfAttack || blamePeople) {
    const candidateInternal = merged.villainInternal
      ? reframeObstacle(merged.villainInternal)
      : "transformar inercia en una accion pequena sostenida";
    const candidateExternal = merged.villainExternal
      ? reframeObstacle(merged.villainExternal)
      : "redisenar el entorno para proteger atencion";
    return {
      accepted: false,
      message: [
        "Todavia no lo acepto, pero hay material util.",
        `Yo lo reformularia asi: interno: ${candidateInternal}; externo: ${candidateExternal}.`,
        "Lo que falta es el reto filosofico: no una frase al azar, sino el problema amplio que vuelve importante la transformacion.",
        "Ejemplo filosofico: usar tecnologia para cultivar plenitud en vez de fatalismo.",
      ].join("\n"),
    };
  }

  if (merged.villainInternal && merged.villainExternal && merged.villainPhilosophical) {
    return {
      accepted: true,
      message: "Aceptado: los tres retos tienen forma entrenable. Los voy a guardar como mapa de transformacion, no como autoataque.",
      villainInternal: reframeObstacle(merged.villainInternal),
      villainExternal: reframeObstacle(merged.villainExternal),
      villainPhilosophical: reframeObstacle(merged.villainPhilosophical),
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto: me falta al menos uno de los tres retos con sentido claro.",
  };
}

async function assessInitialIdentityAnswer(text: string, state: CruxState): Promise<InitialIdentityAssessment> {
  const fallback = parseInitialIdentityFields(text);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua la identidad inicial para onboarding Quest de Arqueidentidad.",
      "Identidad inicial = nombre breve del patron actual + comportamiento principal + historia o creencia principal que lo sostiene.",
      "No se busca que el usuario se ataque. Si aparece autoinsulto, rescata el patron sin repetir el insulto.",
      "Acepta prosa imperfecta si puedes extraer nombre, comportamiento y creencia/historia.",
      "Si falta una pieza, conserva lo util y pide solo esa pieza.",
      "La respuesta al usuario debe empezar aprobando, rechazando o aceptando parcialmente.",
      "No menciones JSON, backend, prompts, herramientas ni formato interno.",
      `Dreamline: ${JSON.stringify(state.profile?.dreamline ?? {})}`,
      `Fear-setting: ${JSON.stringify(state.profile?.fearSetting ?? {})}`,
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Respuesta: ${text}`,
      `Parse deterministic: ${JSON.stringify(fallback)}`,
      'Devuelve solo JSON: {"accepted": true, "message": "...", "name": "...", "behavior": "...", "belief": "..."}',
    ].join("\n"));
    const assessed = initialIdentityAssessmentFromJson(reviewed, fallback);
    if (assessed.message) return assessed;
  }

  if (fallback.name && fallback.behavior && fallback.belief) {
    return {
      accepted: true,
      message: "Aceptado: ya tenemos la identidad inicial. No la guardo como condena, sino como punto de partida para medir la transformacion.",
      ...fallback,
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto completo: necesito nombre de la identidad inicial, comportamiento principal y creencia o historia que la sostiene.",
  };
}

async function assessDreamlineAnswer(text: string, state: CruxState): Promise<DreamlineAssessment> {
  const fallback = parseDreamlineFields(text);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua la dreamline de onboarding Quest para Arqueidentidad.",
      "La dreamline no es fantasia de consumo: es una imagen de vida que ayuda al usuario a dejar auto-coercion y moverse hacia identidad flow-mistica.",
      "Acepta si hay tres horizontes recuperables: que quiere tener, que quiere hacer y que quiere ser.",
      "Si el usuario escribe en prosa, extrae y normaliza las tres piezas sin decir que corregiste formato.",
      "Si falta una pieza, conserva lo util y pide solo lo faltante.",
      "La respuesta al usuario debe empezar aprobando, rechazando o aceptando parcialmente.",
      "No menciones JSON, backend, prompts, herramientas ni formato interno.",
      `Identidad: ${state.profile?.heroName ?? "sin definir"}`,
      `Por que: ${state.profile?.heroWhy ?? "sin definir"}`,
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Respuesta: ${text}`,
      `Parse deterministic: ${JSON.stringify(fallback)}`,
      'Devuelve solo JSON: {"accepted": true, "message": "...", "have": "...", "do": "...", "be": "..."}',
    ].join("\n"));
    const assessed = dreamlineAssessmentFromJson(reviewed, fallback);
    if (assessed.message) return assessed;
  }

  if (fallback.have && fallback.do && fallback.be) {
    return {
      accepted: true,
      message: "Aceptado: tu dreamline ya tiene horizonte material, accion y forma de ser. La usamos como norte, no como contrato rigido.",
      ...fallback,
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto: veo parte del horizonte, pero necesito tres piezas para que funcione como brujula: que quieres tener, que quieres hacer y que quieres ser.",
  };
}

async function assessFearSettingAnswer(text: string, state: CruxState): Promise<FearSettingAssessment> {
  const fallback = parseFearSettingFields(text);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua el fear-setting de onboarding Quest para Arqueidentidad.",
      "Fear-setting vuelve pensable el miedo: que temo, como lo prevengo, como lo reparo, que beneficio parcial existe y cual es el costo de no actuar en 6 meses, 1 ano y 3 anos.",
      "Acepta prosa imperfecta si puedes extraer esas piezas. No castigues estilo; reconstruye estructura.",
      "Si falta una pieza, conserva lo util y pide solo lo faltante.",
      "Corrige desde responsabilidad del tutor: el problema es que la pregunta necesita mas estructura, no que el usuario fallo.",
      "La respuesta al usuario debe empezar aprobando, rechazando o aceptando parcialmente.",
      "No menciones JSON, backend, prompts, herramientas ni formato interno.",
      `Identidad: ${state.profile?.heroName ?? "sin definir"}`,
      `Dreamline: ${JSON.stringify(state.profile?.dreamline ?? {})}`,
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Respuesta: ${text}`,
      `Parse deterministic: ${JSON.stringify(fallback)}`,
      'Devuelve solo JSON: {"accepted": true, "message": "...", "whatIf": "...", "prevent": "...", "repair": "...", "partialWins": "...", "cost6Months": "...", "cost1Year": "...", "cost3Years": "..."}',
    ].join("\n"));
    const assessed = fearSettingAssessmentFromJson(reviewed, fallback);
    if (assessed.message) return assessed;
  }

  if (isCompleteFearSetting(fallback)) {
    return {
      ...fallback,
      accepted: true,
      message: "Aceptado: el miedo ya tiene forma, prevencion y reparacion. Eso lo vuelve entrenable; deja de ser niebla.",
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto completo. Para que el miedo no mande desde la niebla, necesito: que pasa si..., como lo previenes, como lo reparas, que ganas aunque sea parcialmente y que cuesta no actuar en 6 meses, 1 ano y 3 anos.",
  };
}

async function assessRoutineDaysAnswer(text: string, state: CruxState): Promise<RoutineDaysAssessment> {
  const fallback = parseRoutineDaysFields(text);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua dias de rutina Quest para Arqueidentidad.",
      "Necesitamos dos dias: cheat day y dia vacio. Cheat day suspende notificaciones de habitos. Dia vacio reinicia filosofia y no debe ser el mismo dia.",
      "Acepta frases naturales: 'domingo cheat y lunes vacio', 'descanso sabado, vacio domingo'.",
      "Si solo aparece un dia, no aceptes todavia; explica que falta elegir el dia vacio.",
      "Si ambos dias son iguales, rechaza y pide dos dias distintos.",
      "La respuesta al usuario debe empezar aprobando, rechazando o aceptando parcialmente.",
      "No menciones JSON, backend, prompts, herramientas ni formato interno.",
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Respuesta: ${text}`,
      `Parse deterministic: ${JSON.stringify(fallback)}`,
      'Devuelve solo JSON: {"accepted": true, "message": "...", "cheatDayOfWeek": 0, "emptyDayOfWeek": 1}',
      "Mapa dias: domingo=0, lunes=1, martes=2, miercoles=3, jueves=4, viernes=5, sabado=6.",
    ].join("\n"));
    const assessed = routineDaysAssessmentFromJson(reviewed, fallback);
    if (assessed.message) return assessed;
  }

  if (fallback.cheatDayOfWeek !== undefined && fallback.emptyDayOfWeek !== undefined && fallback.cheatDayOfWeek !== fallback.emptyDayOfWeek) {
    return {
      accepted: true,
      message: `Aceptado: ${weekdayCopy(fallback.cheatDayOfWeek)} queda como cheat day y ${weekdayCopy(fallback.emptyDayOfWeek)} como dia vacio.`,
      ...fallback,
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto completo: necesito dos dias distintos, uno para cheat day y otro para dia vacio.",
  };
}

async function assessExtraHabitsAnswer(text: string, state: CruxState): Promise<ExtraHabitsAssessment> {
  const fallback = parseExtraHabitsFields(text);
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const reviewed = await reviewOnboardingJson(apiKey, [
      "Evalua habitos extra de onboarding Quest para Arqueidentidad.",
      "La base obligatoria ya es Tummo-Identidad. El usuario puede decir que no quiere extras por ahora, o proponer 1 a 3 habitos diarios concretos.",
      "Acepta 'no', 'por ahora no', 'solo tummo' como respuesta valida sin habitos extra.",
      "Acepta habitos si son acciones concretas y sostenibles, no identidades abstractas ni autoexigencia inflada.",
      "Si un habito es demasiado grande, reformulalo en version diaria pequena y aceptalo si conserva la intencion.",
      "La respuesta al usuario debe empezar aprobando, rechazando o aceptando parcialmente.",
      "No menciones JSON, backend, prompts, herramientas ni formato interno.",
      `Identidad: ${state.profile?.heroName ?? "sin definir"}`,
      `Historial reciente:\n${formatRecentMessages(state)}`,
      `Respuesta: ${text}`,
      `Parse deterministic: ${JSON.stringify(fallback)}`,
      'Devuelve solo JSON: {"accepted": true, "message": "...", "habits": [{"title": "...", "description": "..."}]}',
    ].join("\n"));
    const assessed = extraHabitsAssessmentFromJson(reviewed, fallback);
    if (assessed.message) return assessed;
  }

  return {
    accepted: true,
    message: fallback.length > 0
      ? "Aceptado: esos habitos pueden entrar como extensiones pequenas de tu identidad diaria."
      : "Aceptado: dejamos solo Tummo-Identidad por ahora. La rutina empieza liviana y gana cuerpo con evidencia.",
    habits: fallback,
  };
}

function heroAssessmentFromJson(value: Record<string, unknown>, parsed: ReturnType<typeof parseHeroIdentity>): HeroAssessment {
  const accepted = value.accepted === true;
  const message = stringFromJson(value.message);
  const heroName = stringFromJson(value.heroName) ?? parsed.heroName;
  const heroWhy = stringFromJson(value.heroWhy) ?? parsed.heroWhy;
  const result: HeroAssessment = {
    accepted: accepted && Boolean(heroName && heroWhy),
    message: message ?? "",
  };
  if (heroName) result.heroName = heroName;
  if (heroWhy) result.heroWhy = heroWhy;
  return result;
}

function obstaclesAssessmentFromJson(value: Record<string, unknown>, parsed: ReturnType<typeof parseVillains>): ObstaclesAssessment {
  const accepted = value.accepted === true;
  const message = stringFromJson(value.message);
  const villainInternal = stringFromJson(value.villainInternal) ?? parsed.villainInternal;
  const villainExternal = stringFromJson(value.villainExternal) ?? parsed.villainExternal;
  const villainPhilosophical = stringFromJson(value.villainPhilosophical) ?? parsed.villainPhilosophical;
  const result: ObstaclesAssessment = {
    accepted: accepted && Boolean(villainInternal && villainExternal && villainPhilosophical),
    message: message ?? "",
  };
  if (villainInternal) result.villainInternal = villainInternal;
  if (villainExternal) result.villainExternal = villainExternal;
  if (villainPhilosophical) result.villainPhilosophical = villainPhilosophical;
  return result;
}

function dreamlineAssessmentFromJson(value: Record<string, unknown>, parsed: Partial<DreamlineAssessment>): DreamlineAssessment {
  const accepted = value.accepted === true;
  const have = stringFromJson(value.have) ?? parsed.have;
  const doValue = stringFromJson(value.do) ?? parsed.do;
  const be = stringFromJson(value.be) ?? parsed.be;
  const result: DreamlineAssessment = {
    accepted: accepted && Boolean(have && doValue && be),
    message: stringFromJson(value.message) ?? "",
  };
  if (have) result.have = have;
  if (doValue) result.do = doValue;
  if (be) result.be = be;
  return result;
}

function fearSettingAssessmentFromJson(value: Record<string, unknown>, parsed: Partial<FearSettingAssessment>): FearSettingAssessment {
  const result: FearSettingAssessment = {
    accepted: value.accepted === true,
    message: stringFromJson(value.message) ?? "",
  };
  const fields = {
    whatIf: stringFromJson(value.whatIf) ?? parsed.whatIf,
    prevent: stringFromJson(value.prevent) ?? parsed.prevent,
    repair: stringFromJson(value.repair) ?? parsed.repair,
    partialWins: stringFromJson(value.partialWins) ?? parsed.partialWins,
    cost6Months: stringFromJson(value.cost6Months) ?? parsed.cost6Months,
    cost1Year: stringFromJson(value.cost1Year) ?? parsed.cost1Year,
    cost3Years: stringFromJson(value.cost3Years) ?? parsed.cost3Years,
  };
  for (const [key, fieldValue] of Object.entries(fields)) {
    if (fieldValue) Object.assign(result, { [key]: fieldValue });
  }
  result.accepted = result.accepted && isCompleteFearSetting(result);
  return result;
}

function initialIdentityAssessmentFromJson(value: Record<string, unknown>, parsed: Partial<InitialIdentityAssessment>): InitialIdentityAssessment {
  const name = stringFromJson(value.name) ?? parsed.name;
  const behavior = stringFromJson(value.behavior) ?? parsed.behavior;
  const belief = stringFromJson(value.belief) ?? parsed.belief;
  return {
    accepted: value.accepted === true && Boolean(name && behavior && belief),
    message: stringFromJson(value.message) ?? "",
    ...(name ? { name } : {}),
    ...(behavior ? { behavior } : {}),
    ...(belief ? { belief } : {}),
  };
}

function routineDaysAssessmentFromJson(value: Record<string, unknown>, parsed: Partial<RoutineDaysAssessment>): RoutineDaysAssessment {
  const cheat = numberFromJson(value.cheatDayOfWeek) ?? parsed.cheatDayOfWeek;
  const empty = numberFromJson(value.emptyDayOfWeek) ?? parsed.emptyDayOfWeek;
  return {
    accepted: value.accepted === true && isWeekdayNumber(cheat) && isWeekdayNumber(empty) && cheat !== empty,
    message: stringFromJson(value.message) ?? "",
    ...(isWeekdayNumber(cheat) ? { cheatDayOfWeek: cheat } : {}),
    ...(isWeekdayNumber(empty) ? { emptyDayOfWeek: empty } : {}),
  };
}

function extraHabitsAssessmentFromJson(value: Record<string, unknown>, parsed: ExtraHabitsAssessment["habits"]): ExtraHabitsAssessment {
  const habits = Array.isArray(value.habits)
    ? value.habits
      .filter(isRecord)
      .map((item) => {
        const habit: { title: string; description?: string } = { title: stringFromJson(item.title) ?? "" };
        const description = stringFromJson(item.description);
        if (description) habit.description = description;
        return habit;
      })
      .filter((item) => item.title.trim())
      .slice(0, 3)
    : parsed;
  return {
    accepted: value.accepted === true,
    message: stringFromJson(value.message) ?? "",
    habits,
  };
}

function parseDreamlineFields(text: string): Partial<DreamlineAssessment> {
  const result: Partial<DreamlineAssessment> = {};
  const have = extractLabeledValue(text, ["tener", "quiero tener", "tengo"]);
  const doValue = extractLabeledValue(text, ["hacer", "quiero hacer", "hago"]);
  const be = extractLabeledValue(text, ["ser", "quiero ser", "soy"]);
  if (have) result.have = have;
  if (doValue) result.do = doValue;
  if (be) result.be = be;
  return result;
}

function parseFearSettingFields(text: string): Partial<FearSettingAssessment> {
  const result: Partial<FearSettingAssessment> = {};
  const fields = {
    whatIf: extractLabeledValue(text, ["que tal si", "que pasa si", "si intento esto temo que", "temo que", "miedo"]),
    prevent: extractLabeledValue(text, ["prevenir", "prevencion", "como lo prevengo"]),
    repair: extractLabeledValue(text, ["reparar", "reparacion", "como lo reparo"]),
    partialWins: extractLabeledValue(text, ["ganancia parcial", "beneficio parcial", "beneficios parciales"]),
    cost6Months: extractLabeledValue(text, ["costo 6 meses", "6 meses"]),
    cost1Year: extractLabeledValue(text, ["costo 1 ano", "costo 1 año", "1 ano", "1 año"]),
    cost3Years: extractLabeledValue(text, ["costo 3 anos", "costo 3 años", "3 anos", "3 años"]),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value) Object.assign(result, { [key]: value });
  }
  return result;
}

function parseInitialIdentityFields(text: string): Partial<InitialIdentityAssessment> {
  const result: Partial<InitialIdentityAssessment> = {};
  const name = extractLabeledValue(text, ["identidad inicial", "nombre", "identidad actual", "soy"]);
  const behavior = extractLabeledValue(text, ["comportamiento", "habito", "conducta", "principal comportamiento"]);
  const belief = extractLabeledValue(text, ["creencia", "historia", "relato", "principal creencia"]);
  if (name) result.name = name;
  if (behavior) result.behavior = behavior;
  if (belief) result.belief = belief;
  if (!result.name || !result.behavior || !result.belief) {
    const parts = text
      .split(/[;\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!result.name && parts[0]) result.name = parts[0].replace(/^(identidad inicial|nombre|identidad actual)\s*[:=-]?\s*/i, "").trim();
    if (!result.behavior && parts[1]) result.behavior = parts[1].replace(/^(comportamiento|habito|conducta)\s*[:=-]?\s*/i, "").trim();
    if (!result.belief && parts[2]) result.belief = parts[2].replace(/^(creencia|historia|relato)\s*[:=-]?\s*/i, "").trim();
  }
  return result;
}

function parseRoutineDaysFields(text: string): Partial<RoutineDaysAssessment> {
  const normalized = normalizeForMatch(text);
  const weekdayPattern = "(domingo|lunes|martes|miercoles|jueves|viernes|sabado)";
  const cheatMatch = new RegExp(`(?:cheat(?: day)?|dia (?:libre|trampa)|descanso)\\s*[:=\\-]?\\s*${weekdayPattern}|${weekdayPattern}\\s*(?:como|de)?\\s*(?:cheat(?: day)?|dia (?:libre|trampa)|descanso)`).exec(normalized);
  const emptyMatch = new RegExp(`(?:empty day|dia vacio|vacio)\\s*[:=\\-]?\\s*${weekdayPattern}|${weekdayPattern}\\s*(?:como|de)?\\s*(?:empty day|dia vacio|vacio)`).exec(normalized);
  const weekdays = weekdaysFromText(text);
  const cheatDayOfWeek = cheatMatch ? weekdayFromSpanish(cheatMatch[1] ?? cheatMatch[2] ?? "") ?? undefined : emptyMatch ? undefined : weekdays[0];
  const emptyDayOfWeek = emptyMatch ? weekdayFromSpanish(emptyMatch[1] ?? emptyMatch[2] ?? "") ?? undefined : cheatMatch ? undefined : weekdays[1];
  return {
    ...(isWeekdayNumber(cheatDayOfWeek) ? { cheatDayOfWeek } : {}),
    ...(isWeekdayNumber(emptyDayOfWeek) ? { emptyDayOfWeek } : {}),
  };
}

function parseExtraHabitsFields(text: string): ExtraHabitsAssessment["habits"] {
  const normalized = normalizeForMatch(text);
  if (/\b(no|ninguno|ninguna|solo tummo|por ahora no|sin extra|sin extras)\b/.test(normalized)) return [];
  const cleaned = text
    .replace(/^(quiero|agrega|sumaria|sumaria tambien|tambien quiero)\s+/i, "")
    .trim();
  const parts = cleaned
    .split(/(?:\n|;|,|\sy\s)/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
    .slice(0, 3);
  return parts.map((part) => ({
    title: part.length > 80 ? part.slice(0, 80).trim() : part,
    description: "Habito extra elegido durante el onboarding Quest.",
  }));
}

function extractLabeledValue(text: string, labels: string[]): string | undefined {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}\\s*[:=\\-]?\\s*(.+?)(?=\\s+(?:quiero tener|tener|quiero hacer|hacer|quiero ser|ser|que pasa si|temo que|miedo|prevenir|prevencion|reparar|reparacion|ganancia parcial|beneficio parcial|beneficios parciales|costo 6 meses|6 meses|costo 1 ano|costo 1 año|1 ano|1 año|costo 3 anos|costo 3 años|3 anos|3 años)\\s*[:=\\-]?|$)`, "i");
    const match = pattern.exec(normalizedText);
    if (match?.[1]?.trim()) return match[1].trim().replace(/[.;,]$/, "");
  }
  return undefined;
}

function isCompleteFearSetting(value: Partial<FearSettingAssessment>): value is Required<FearSettingAssessment> {
  return Boolean(value.whatIf && value.prevent && value.repair && value.partialWins && value.cost6Months && value.cost1Year && value.cost3Years);
}

function weekdaysFromText(text: string): number[] {
  const normalized = normalizeForMatch(text);
  return ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]
    .map((name, index) => normalized.includes(name) ? index : -1)
    .filter((index) => index >= 0);
}

function weekdayCopy(day: number): string {
  return ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"][day] ?? "dia elegido";
}

function isWeekdayNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function confirmedOrDirectObstacles(text: string, state: CruxState): ObstaclesAssessment {
  const direct = normalizeObstacleFields({ ...parseVillains(text), ...parseNaturalObstacles(text) });
  if (direct.accepted) return direct;

  if (!isConfirmingTutorSuggestion(text)) {
    return { accepted: false, message: "" };
  }

  const messages = (state.recentMessages ?? []).slice().reverse();
  for (const message of messages) {
    if (message.direction !== "outbound") continue;
    const suggested = normalizeObstacleFields(parseVillains(message.text));
    if (suggested.accepted) {
      return {
        ...suggested,
        message: "Aceptado: tomo la estructura que acabamos de construir y la guardo como retos entrenables, no como condenas.",
      };
    }
  }

  return { accepted: false, message: "" };
}

function normalizeObstacleFields(fields: ReturnType<typeof parseVillains>): ObstaclesAssessment {
  const villainInternal = fields.villainInternal?.trim();
  const villainExternal = fields.villainExternal?.trim();
  const villainPhilosophical = fields.villainPhilosophical?.trim();
  if (!villainInternal || !villainExternal || !villainPhilosophical) {
    return { accepted: false, message: "" };
  }
  if ([villainInternal, villainExternal, villainPhilosophical].some(isLowSignalAnswer)) {
    return { accepted: false, message: "" };
  }
  return {
    accepted: true,
    message: "Aceptado: ya hay tres retos suficientes para continuar. Los guardo como mapa de transformacion; si luego encontramos una formulacion mas precisa, la ajustamos con evidencia.",
    villainInternal: reframeObstacle(villainInternal),
    villainExternal: reframeObstacle(villainExternal),
    villainPhilosophical: reframeObstacle(villainPhilosophical),
  };
}

function isConfirmingTutorSuggestion(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(si|ok|dale|de acuerdo|correcto|confirmo|usemos eso|usa eso|pon eso|pon lo que dijiste|lo que dijiste|esa estructura|esa estructura que propones)\b/.test(normalized)
    || /\b(refleja mi realidad|me sirve|esta bien|es correcta|dejemos esa)\b/.test(normalized);
}

function cadenceAssessmentFromJson(value: Record<string, unknown>, parsed: ReturnType<typeof parseCadence>): CadenceAssessment {
  const rawCadence = value.cadence;
  const cadence = rawCadence === "weekly" || rawCadence === "biweekly" ? rawCadence : parsed ?? undefined;
  const message = stringFromJson(value.message);
  const result: CadenceAssessment = {
    accepted: value.accepted === true && Boolean(cadence),
    message: message ?? "",
  };
  if (cadence) result.cadence = cadence;
  return result;
}

async function tutorOnboardingCorrection(
  ctx: ActionCtx,
  step: "hero" | "obstacles",
  text: string,
  state: CruxState,
  fallback: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = geminiModel();
    const instruction = [
      "Eres tutor de Arqueidentidad por Telegram.",
      "Aplica BEST ANSWER: infiere la necesidad real, cada frase debe cambiar conocimiento o accion, termina en el siguiente reto real.",
      "Aplica Michel Thomas: el tutor carga con la claridad; no culpes al usuario; no pidas memorizar; reduce friccion; reconstruye desde componentes simples.",
      "No avances el onboarding ni digas que guardaste nada.",
      "Todo en espanol natural, sin ingles tecnico, sin nombres de herramientas.",
    ].join(" ");
    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: "user",
        parts: [{ text: [
          `Paso actual: ${step === "hero" ? "identidad final con nombre y por que" : "tres retos de transformacion"}.`,
          `Perfil parcial: ${JSON.stringify(state.profile ?? {})}`,
          `Respuesta del usuario: ${text}`,
          "",
          "Explica que falta o que esta confuso en maximo 8 lineas y da una forma valida de respuesta con ejemplo.",
          "",
          fallback,
        ].join("\n") }],
      }] as never,
      config: {
        systemInstruction: instruction,
        temperature: 0.2,
        topP: 0.8,
      } as never,
    } as never);
    return response.text?.trim() || fallback;
  } catch (error) {
    console.warn("Tutor onboarding correction failed", error);
    return fallback;
  }
}

async function reviewOnboardingJson(apiKey: string, prompt: string): Promise<Record<string, unknown>> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = geminiModel();
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }] as never,
      config: {
        systemInstruction: "Devuelve solo JSON valido. No incluyas markdown.",
        temperature: 0,
        topP: 0.5,
        responseMimeType: "application/json",
      } as never,
    } as never);
    return parseJsonObject(response.text ?? "");
  } catch {
    return {};
  }
}

async function executeTool(
  ctx: ActionCtx,
  userId: Id<"users">,
  chatId: string,
  name: string,
  args: Record<string, unknown>,
  state: CruxState,
  route?: RouterDecision,
): Promise<ToolExecution> {
  if (!isAgentToolAuthorized(name, route?.route, route?.intent)) {
    console.warn("Blocked tutor tool outside route contract", { name, route: route?.route, intent: route?.intent });
    return {
      result: { ok: false, error: "tool_not_authorized_for_route" },
      sentDirect: false,
    };
  }
  switch (name) {
    case "get_daily_habit_state": {
      await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
      const result = await ctx.runQuery(internal.habits.getDailyRoutineState, { userId });
      return { result, sentDirect: false };
    }
    case "mark_daily_habits_done": {
      await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
      const markArgs: {
        userId: Id<"users">;
        text: string;
        habitKeys?: string[];
      } = {
        userId,
        text: String(args.text ?? ""),
      };
      if (Array.isArray(args.habitKeys)) markArgs.habitKeys = args.habitKeys.map(String);
      const result = await ctx.runMutation(internal.habits.markDailyHabitsDone, markArgs);
      return { result, sentDirect: false };
    }
    case "render_daily_habit_tui": {
      return { result: { diagram: await renderHabitPanel(ctx, userId) }, sentDirect: false };
    }
    case "set_cheat_day": {
      const weekday = numericArg(args.weekday, -1);
      const emptyDayOfWeek = typeof args.emptyDayOfWeek === "number" ? args.emptyDayOfWeek : undefined;
      const result = await ctx.runMutation(internal.habits.setCheatDay, { userId, weekday, ...(emptyDayOfWeek !== undefined ? { emptyDayOfWeek } : {}) });
      return { result, sentDirect: false };
    }
    case "add_core_routine_habit": {
      const addArgs: {
        userId: Id<"users">;
        title: string;
        description?: string;
      } = {
        userId,
        title: String(args.title ?? ""),
      };
      if (typeof args.description === "string") addArgs.description = args.description;
      const result = await ctx.runMutation(internal.habits.addCoreRoutineHabit, addArgs);
      return { result, sentDirect: false };
    }
    case "get_user_state":
      return { result: await loadCruxState(ctx, userId), sentDirect: false };
    case "update_user_profile": {
      const patch = profilePatchFromArgs(args);
      await ctx.runMutation(internal.store.updateProfile, { userId, ...patch });
      return { result: { ok: true }, sentDirect: false };
    }
    case "start_practice_cycle": {
      const practice = choosePractice(arqueidentidadFase6Content.practices, String(args.cycleId ?? "cycle1_prehypnos_nsdr"));
      const result = await ctx.runMutation(internal.store.startPracticeCycle, {
        userId,
        cycleId: practice.id,
        title: practice.title,
        plan: practice.body,
      });
      return { result: { ...result, practice }, sentDirect: false };
    }
    case "log_practice_event": {
      const eventArgs: {
        userId: Id<"users">;
        eventType: "prep" | "challenge" | "debrief" | "integration" | "recovery";
        evidence: string;
        reward?: string;
      } = {
        userId,
        eventType: eventTypeFrom(args.eventType),
        evidence: String(args.evidence ?? "sin evidencia"),
      };
      const reward = stringArg(args.reward);
      if (reward !== undefined) eventArgs.reward = reward;
      const result = await ctx.runMutation(internal.store.logPracticeEvent, eventArgs);
      return { result, sentDirect: false };
    }
    case "create_debrief": {
      const raw = String(args.rawDebrief ?? "");
      const debrief = buildDebrief(raw);
      await ctx.runMutation(internal.store.logPracticeEvent, {
        userId,
        eventType: "debrief",
        evidence: debrief,
      });
      return { result: { debrief, memoryReview: "scheduled_after_user_turn_accumulation" }, sentDirect: false };
    }
    case "update_memory": {
      const lines = normalizeMemoryLines(Array.isArray(args.lines) ? args.lines as MemoryLine[] : []);
      const result = await ctx.runMutation(internal.store.replaceMemoryLines, { userId, lines });
      return { result, sentDirect: false };
    }
    case "render_progress_diagram":
      return { result: { diagram: renderProgressDiagram(await loadCruxState(ctx, userId)) }, sentDirect: false };
    case "create_bridgecrux_report": {
      const result = await ctx.runMutation(internal.store.createReport, {
        userId,
        severity: severityFrom(args.severity),
        summary: String(args.summary ?? "Reporte creado por el tutor."),
      });
      return { result, sentDirect: false };
    }
    case "send_telegram_message": {
      const message = String(args.text ?? "");
      if (message.trim()) await sendTelegramText(chatId, message);
      return { result: { sent: Boolean(message.trim()) }, sentDirect: true };
    }
    default:
      await ctx.runMutation(internal.store.createReport, {
        userId,
        severity: "tool_error",
      summary: `Herramienta desconocida solicitada por el modelo: ${name}`,
      });
      return { result: { ok: false, error: "unknown_tool" }, sentDirect: false };
  }
}

async function loadCruxState(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<CruxState> {
  const raw = await ctx.runQuery(internal.store.getUserState, { userId });
  return {
    userId,
    telegramUserId: raw.user?.telegramUserId,
    profile: raw.profile ? {
      cadence: raw.profile.cadence,
      timezone: raw.user?.timezone,
      routineStartDate: raw.profile.routineStartDate,
      cheatDayOfWeek: raw.profile.cheatDayOfWeek,
      emptyDayOfWeek: raw.profile.emptyDayOfWeek,
      emptyDayEnabled: raw.profile.emptyDayEnabled,
      dreamline: raw.profile.dreamline ? {
        have: raw.profile.dreamline.have,
        do: raw.profile.dreamline.do,
        be: raw.profile.dreamline.be,
      } : undefined,
      fearSetting: raw.profile.fearSetting ? {
        whatIf: raw.profile.fearSetting.whatIf,
        prevent: raw.profile.fearSetting.prevent,
        repair: raw.profile.fearSetting.repair,
        partialWins: raw.profile.fearSetting.partialWins,
        cost6Months: raw.profile.fearSetting.cost6Months,
        cost1Year: raw.profile.fearSetting.cost1Year,
        cost3Years: raw.profile.fearSetting.cost3Years,
      } : undefined,
      initialIdentity: raw.profile.initialIdentity ? {
        name: raw.profile.initialIdentity.name,
        behavior: raw.profile.initialIdentity.behavior,
        belief: raw.profile.initialIdentity.belief,
      } : undefined,
      heroName: raw.profile.heroName,
      heroWhy: raw.profile.heroWhy,
      villainInternal: raw.profile.villainInternal,
      villainExternal: raw.profile.villainExternal,
      villainPhilosophical: raw.profile.villainPhilosophical,
      limits: raw.profile.limits,
    } : undefined,
    session: raw.session ? {
      status: raw.session.status,
      onboardingStep: raw.session.onboardingStep,
      currentCycleId: raw.session.currentCycleId,
      currentPracticeId: raw.session.currentPracticeId,
    } : undefined,
    memories: raw.memories,
    recentMessages: raw.recentMessages,
    ledgerSummary: raw.ledgerSummary,
    currentPractice: raw.currentPractice ? {
      cycleId: raw.currentPractice.cycleId,
      title: raw.currentPractice.title,
      status: raw.currentPractice.status,
      plan: raw.currentPractice.plan,
    } : null,
    deferredPractices: raw.deferredPractices,
    dailyHabits: raw.dailyHabits,
  } as CruxState;
}

function parseTelegramUpdate(update: unknown): TelegramInbound | null {
  if (!isRecord(update)) return null;
  const message = isRecord(update.message) ? update.message : isRecord(update.edited_message) ? update.edited_message : null;
  if (!message) return null;
  const chat = isRecord(message.chat) ? message.chat : null;
  const from = isRecord(message.from) ? message.from : null;
  const text = typeof message.text === "string" ? message.text : typeof message.caption === "string" ? message.caption : "";
  if (!chat || !text.trim()) return null;

  const chatId = String(chat.id);
  const inbound: TelegramInbound = {
    chatId,
    telegramUserId: from?.id !== undefined ? String(from.id) : chatId,
    text,
  };
  if (typeof update.update_id === "number") inbound.updateId = update.update_id;
  if (typeof message.message_id === "number") inbound.messageId = message.message_id;
  if (typeof from?.username === "string") inbound.username = from.username;
  if (typeof from?.first_name === "string") inbound.firstName = from.first_name;
  return inbound;
}

function renderPrevention(prevention: ReturnType<typeof classifyPracticeRequest>): string {
  return [
    "PREVENCION",
    "--------------------------------",
    ...prevention.warnings.map((warning) => `- ${warning}`),
    ...prevention.blocked.map((blocked) => `- No voy a guiar esto: ${blocked}`),
    prevention.alternative ? `Camino conservador: ${prevention.alternative}` : "",
  ].filter(Boolean).join("\n");
}

function renderSettings(state: CruxState): string {
  return [
    "CONFIGURACION",
    "--------------------------------",
    `Cadencia: ${state.profile?.cadence ?? "sin definir"}`,
    `Zona horaria: ${state.profile?.timezone ?? "America/Bogota"}`,
    `Identidad inicial: ${state.profile?.initialIdentity?.name ?? "sin definir"}`,
    `Identidad final: ${state.profile?.heroName ?? "sin definir"}`,
    state.profile?.heroWhy ? `Por que final: ${state.profile.heroWhy}` : "Por que final: sin definir",
  ].join("\n");
}

function onboardingStepCopy(step: string | undefined): string {
  if (step === "introduction") return "introduccion";
  if (step === "cadence") return "ritmo de trabajo";
  if (step === "dreamline") return "dreamline";
  if (step === "fear_setting") return "fear-setting";
  if (step === "initial_identity") return "identidad inicial";
  if (step === "villains") return "retos";
  if (step === "hero") return "identidad final y por que";
  if (step === "extra_habits") return "habitos extra";
  if (step === "routine_days") return "cheat day y dia vacio";
  if (step === "complete") return "completo";
  return "inicio";
}

function renderAppIntroduction(): string {
  return [
    "Bienvenido a Arqueidentidad Fase VI.",
    "",
    "Esta es una aplicacion agentica para entrenar identidades elegidas: convertir interpretaciones, habitos y experiencias en evidencia de la persona que quieres aprender a ser.",
    "",
    "Puedes usarla de dos formas conectadas:",
    "- aqui en Telegram, hablando con naturalidad; yo entiendo lo que necesitas, te explico, registro cambios y te acompano en las practicas",
    "- en la aplicacion web, donde puedes ver tu rutina, camino, mapa e historial",
    "",
    "El metodo trabaja con la identidad como una red de creencias y comportamientos. Usa interpretaciones elegidas, el ciclo de vacio, microtematicas e hipertematicas para reducir autocoercion y volver practicable una transformacion.",
    "",
    "No necesitas aprender comandos. Puedes preguntarme como funciona, pedirme que abra la aplicacion web o decirme que quieres empezar.",
  ].join("\n");
}

function isIntroductionContinueSignal(text: string): boolean {
  const normalized = normalizeTelegramText(text);
  return /\b(empecemos|empezar|comencemos|comenzar|iniciar|iniciemos|listo|lista|dale|vamos|continuar|continua)\b/.test(normalized);
}

function renderHelp(): string {
  return [
    "PUEDES PEDIRME",
    "--------------------------------",
    "- dame mi estado",
    "- muestrame mi rutina",
    "- quiero que mi dia libre sea domingo",
    "- que hago ahora",
    "- ya hice la rutina",
    "- ya termine la practica",
    "- explicame esta fase",
    "",
    "Si quieres una interfaz directa, /status tambien funciona.",
  ].join("\n");
}

function explainCadenceStep(): string {
  return [
    "1. Elige el ritmo de trabajo: semanal o quincenal.",
    "",
    "Semanal = una practica corta cada semana. Sirve si quieres mantener impulso.",
    "Quincenal = una practica cada dos semanas. Sirve si prefieres mas integracion y menos presion.",
    "",
    "Ejemplo de respuesta: quincenal.",
  ].join("\n");
}

function explainHeroStep(): string {
  return [
    "5. Nombra la identidad final que quieres entrenar y dime por que la eliges.",
    "",
    "Ya vimos tu horizonte, tus miedos, tu identidad inicial y los retos. Ahora necesitamos nombrar hacia donde va la transformacion.",
    "",
    "El nombre funciona como un arquetipo: una forma breve de recordar que tipo de persona estas votando ser cuando aparezca friccion.",
    "El por que evita que sea solo un apodo bonito: cada dia vas a votar por esta identidad recordando por que importa, haciendo habitos que la prueban y prediciendo como la vas a sostener manana.",
    "",
    "Ejemplos:",
    "- nombre: Jedi postplatonico; porque: quiero pensar con claridad y actuar con disciplina sin matar mi curiosidad",
    "- nombre: Monje estratega; porque: quiero unir atencion, cuerpo y decision en una sola practica",
    "- nombre: Atleta de la atencion; porque: quiero entrenar foco como una capacidad fisica, no como culpa",
    "",
    "Responde asi: nombre: ...; porque: ...",
  ].join("\n");
}

function explainInitialIdentityStep(): string {
  return [
    "3. Define tu identidad inicial.",
    "",
    "No es una condena. Es una foto honesta del punto de partida: el conjunto de comportamientos, habitos, historias y creencias que hoy se refuerzan entre si.",
    "",
    "Necesito tres piezas:",
    "- nombre: una forma breve de nombrar ese patron actual",
    "- comportamiento: la conducta principal que lo mantiene",
    "- creencia: la historia o idea que lo justifica",
    "",
    "Ejemplo:",
    "nombre: el estratega agotado; comportamiento: posterga lo importante hasta sentir presion; creencia: si no estoy bajo urgencia no voy a moverme",
  ].join("\n");
}

function explainChallengesStep(): string {
  return [
    "4. Define tres retos que tu identidad final va a superar.",
    "",
    "No estamos buscando que te ataques. Un reto no es una condena: es una interpretacion, habito o condicion que vamos a redisenar.",
    "",
    "Externo = conducta, entorno o presion que necesitas redisenar. Ejemplo: proteger dos bloques diarios de atencion profunda.",
    "Interno = pensamiento que debilita la transformacion. Ejemplo: cambiar \"solo funciono bajo presion\" por \"puedo entrenar energia por ciclos\".",
    "Filosofico = problema amplio que vuelve importante esta identidad. Ejemplo: cultivar plenitud en un mundo que premia ruido y fatalismo.",
    "",
    "Ejemplo:",
    "externo: crear dos bloques diarios de atencion profunda; interno: transformar urgencia en energia entrenable; filosofico: usar tecnologia para plenitud en vez de fatalismo",
  ].join("\n");
}

function explainDreamlineStep(): string {
  return [
    "2. Traza tu dreamline de Arqueidentidad.",
    "",
    "No es una lista de fantasia ni de consumo. Es un horizonte para que tu identidad deje de obedecer auto-coercion y empiece a votar por sus resonancias tentativas.",
    "",
    "Piensalo asi: vamos del egoista-distraido, que reacciona al ruido, hacia el mistico-en-flujo, que mejora sus identidades de forma falible y continua.",
    "",
    "Necesito tres lineas:",
    "- quiero tener: que condiciones, recursos o entornos quieres crear",
    "- quiero hacer: que practicas, proyectos o formas de vivir quieres ejecutar",
    "- quiero ser: que identidad quieres encarnar cuando haya friccion",
    "",
    "Ejemplo:",
    "quiero tener: tiempo profundo y energia estable; quiero hacer: construir proyectos sin traicionar mi curiosidad; quiero ser: una persona plastica, lucida y dificil de coaccionar por ruido",
  ].join("\n");
}

function explainFearSettingStep(): string {
  return [
    "3. Ponle forma al miedo.",
    "",
    "No buscamos negar el miedo. Buscamos volverlo pensable para que no dirija tu identidad desde la niebla.",
    "",
    "Responde estas piezas:",
    "- que tal si: que temes que pueda pasar",
    "- prevenir: como reduces el riesgo",
    "- reparar: que haces si algo sale mal",
    "- ganancia parcial: que mejora aunque no salga perfecto",
    "- costo 6 meses: que pasa si no haces nada",
    "- costo 1 ano: que se consolida si no cambias",
    "- costo 3 anos: que identidad se vuelve mas dificil de abandonar",
    "",
    "Ejemplo corto:",
    "que tal si: pierdo constancia; prevenir: hacerlo pequeno; reparar: volver al dia siguiente; ganancia parcial: mas claridad; costo 6 meses: sigo reaccionando; costo 1 ano: normalizo la auto-coercion; costo 3 anos: mi identidad queda mas lejos de mi flujo",
  ].join("\n");
}

function explainRoutineDaysStep(): string {
  return [
    "7. Elige dos dias para que la rutina no se vuelva presion ciega.",
    "",
    "Cheat day = no hay notificaciones de habitos. Descansas sin romper la racha.",
    "Dia vacio = reinicias la semana desde filosofia: vaciar ruido, elegir interpretacion y volver a la identidad.",
    "",
    "Deben ser dias distintos.",
    "",
    "Ejemplo de respuesta:",
    "cheat day: domingo; dia vacio: lunes",
  ].join("\n");
}

function explainExtraHabitsStep(): string {
  return [
    "6. Define si quieres agregar habitos extra.",
    "",
    "La base diaria ya queda fija: Tummo-Identidad comprimida + puente hacia la practica de Arqueidentidad.",
    "",
    "Puedes empezar solo con esa base, o elegir cuantos extras quieres sumar: 0, 1, 2 o 3. Si eliges extras, que sean habitos pequenos que voten por tu identidad final.",
    "",
    "Ejemplos:",
    "- no por ahora",
    "- 10 minutos de empty space",
    "- escribir una hipertematica diaria",
    "- caminar 15 minutos sin audifonos",
  ].join("\n");
}

function renderIdentityMapSummary(state: CruxState): string {
  const profile = state.profile;
  return [
    "TU MAPA QUEST",
    "--------------------------------",
    "Dreamline:",
    `- tener: ${profile?.dreamline?.have ?? "sin definir"}`,
    `- hacer: ${profile?.dreamline?.do ?? "sin definir"}`,
    `- ser: ${profile?.dreamline?.be ?? "sin definir"}`,
    "",
    "Fear-setting:",
    `- que tal si: ${profile?.fearSetting?.whatIf ?? "sin definir"}`,
    `- prevenir: ${profile?.fearSetting?.prevent ?? "sin definir"}`,
    `- reparar: ${profile?.fearSetting?.repair ?? "sin definir"}`,
    `- ganancia parcial: ${profile?.fearSetting?.partialWins ?? "sin definir"}`,
    `- costo 6 meses: ${profile?.fearSetting?.cost6Months ?? "sin definir"}`,
    `- costo 1 ano: ${profile?.fearSetting?.cost1Year ?? "sin definir"}`,
    `- costo 3 anos: ${profile?.fearSetting?.cost3Years ?? "sin definir"}`,
    "",
    `Identidad inicial: ${profile?.initialIdentity?.name ?? "sin definir"}`,
    profile?.initialIdentity?.behavior ? `Comportamiento actual: ${profile.initialIdentity.behavior}` : "",
    profile?.initialIdentity?.belief ? `Creencia actual: ${profile.initialIdentity.belief}` : "",
    `Reto externo: ${profile?.villainExternal ?? "sin definir"}`,
    `Reto interno: ${profile?.villainInternal ?? "sin definir"}`,
    `Reto filosofico: ${profile?.villainPhilosophical ?? "sin definir"}`,
    `Identidad final: ${profile?.heroName ?? "sin nombre"}`,
    profile?.heroWhy ? `Por que: ${profile.heroWhy}` : "",
  ].filter(Boolean).join("\n");
}

function explainDebrief(): string {
  return [
    "CIERRE DE PRACTICA",
    "--------------------------------",
    "El cierre no es un reporte tecnico. Es la forma de convertir una experiencia en evidencia y ancla para tu identidad.",
    "",
    "No necesitas usar un comando. Cuentame en lenguaje normal:",
    "1. descripcion o narracion de la practica",
    "2. microtematica que aparecio",
    "3. hipertematica que mejor funciono",
    "",
    "Ejemplo:",
    "Hice NSDR 12 minutos. La microtematica fue querer revisar pendientes para no sentir silencio. La hipertematica que funciono fue: mi calma tambien produce accion.",
  ].join("\n");
}

function explainActivePracticeQuestion(text: string, state: CruxState): string | null {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(debrief|cierre)\b/.test(lower) && /\b(como|que es|no entiendo|explica|para que)\b/.test(lower)) {
    return explainDebrief();
  }

  if (!/\b(no entiendo|que debo hacer|que hago|como empiezo|explica)\b/.test(lower)) return null;

  if (state.session?.currentCycleId === "cycle2_social_fear") {
    return [
      "Estamos en la exposicion al miedo social.",
      "",
      "El gesto de referencia es acostarte boca arriba en un lugar publico seguro durante 3 a 5 minutos. La practica no es hacer show: es observar la verguenza y cambiar su interpretacion.",
      "",
      "Haz esto:",
      "1. Elige un lugar legal, amplio y seguro.",
      "2. Prepara una hipertematica: la mirada no toca mi cuerpo; esto es juego; soy libre aunque me miren.",
      "3. Acuestate boca arriba y quedate quieto 3 a 5 minutos.",
      "4. Observa la microtematica: debo explicar, me juzgan, tengo que escapar.",
      "5. Inyecta la hipertematica.",
      "6. Levantate y vete con calma, sin explicar.",
      "7. Vuelve y cuentame que paso para cerrar la practica.",
      "",
      "Si tu contexto hace inseguro acostarte, lo escalamos hacia abajo sin perder la funcion.",
    ].join("\n");
  }

  if (state.session?.currentCycleId === "cycle1_prehypnos_nsdr") return [
    "Estamos en la primera practica: NSDR mistico hardcore.",
    "",
    "Tu siguiente paso es crear un estado vacio para que la identidad aparezca sin forcejeo.",
    "",
    "Haz esto:",
    "1. Reserva 40 a 60 minutos; si empiezas, 10 a 20 tambien sirve.",
    "2. Acuestate en oscuridad, con mascara si tienes.",
    "3. Usa audifonos si tienes; el loop de referencia es Weightless de Marconi Union.",
    "4. Respira por la nariz: inhalacion profunda, segunda inhalacion corta, exhalacion larga.",
    "5. Recorre el cuerpo de pies a cabeza y relaja cada zona al maximo.",
    "6. Interpreta el cuerpo como pesado y hundiendose, o ligero y elevandose.",
    "7. Suelta el control y deja que aparezca el estado proteico.",
    "8. Vuelve lento y escribe el ancla: ruido vaciado, identidad aparecida, hipertematica a conservar.",
    "",
    "Si hay panico fuerte, disociacion, dolor raro o falta severa de sueno, paras y lo adaptamos.",
  ].join("\n");

  return null;
}

function isLowSignalAnswer(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return /^(los que sean|cualquiera|no se|da igual|lo que sea|como quieras|cualquier cosa|x|ok|si|no)$/.test(normalized);
}

function parseNaturalObstacles(text: string): ReturnType<typeof parseVillains> {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed: ReturnType<typeof parseVillains> = {};
  const internal = normalized.match(/(?:villano|obstaculo|reto)?\s*interno\s+(?:es|seria|:)?\s*(.*?)(?=\s+(?:y\s+)?(?:el\s+)?(?:villano|obstaculo|reto)?\s*externo\b|$)/);
  const external = normalized.match(/(?:villano|obstaculo|reto)?\s*externo\s+(?:es|seria|:)?\s*(.*?)(?=\s+(?:y\s+)?(?:el\s+)?(?:filosofico|filosofica|villano filosofico|obstaculo filosofico|reto filosofico)\b|$)/);
  const philosophical = normalized.match(/(?:filosofico|filosofica|villano filosofico|obstaculo filosofico|reto filosofico)\s+(?:es|seria|:)?\s*(.*)$/);
  if (internal?.[1]) parsed.villainInternal = internal[1].trim().replace(/^dejar ser\s+/, "");
  if (external?.[1]) parsed.villainExternal = external[1].trim();
  if (philosophical?.[1]) parsed.villainPhilosophical = philosophical[1].trim();
  return parsed;
}

function reframeObstacle(text: string): string {
  return text
    .replace(/\b(dejar ser|ser)\s+un\s+perezoso\s+de\s+mierda\b/gi, "transformar inercia y autoataque en una accion pequena sostenida")
    .replace(/\bperezoso\s+de\s+mierda\b/gi, "inercia con autoataque")
    .replace(/\besos vecinos que no me dejan concentrarme\b/gi, "redisenar atencion frente a ruido externo")
    .replace(/\bvecinos que no me dejan concentrarme\b/gi, "redisenar atencion frente a ruido externo")
    .trim();
}

function localTutorFallback(text: string, state: CruxState): string {
  const lower = text.toLowerCase();
  if (lower.includes("fase") || lower.includes("aprender")) return renderLearnMap();
  if (lower.includes("memoria")) return renderMemory(state.memories);
  if (lower.includes("estado") || lower.includes("progreso")) return renderProgressDiagram(state);

  return [
    "Interpreto que necesitas convertir esto en el siguiente paso de Fase VI.",
    "Ahora mismo el tutor profundo no esta disponible, asi que usare el camino minimo seguro.",
    "",
    state.session?.status === "onboarding"
      ? "Siguiente paso: seguimos con tu mapa inicial."
      : "Siguiente paso: dime si quieres ver tu estado, tu rutina o continuar la practica activa.",
  ].join("\n");
}

async function createReportTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  summary: string,
  severity: "bug" | "info" | "safety" | "missing_knowledge" | "tool_error" | "capability_gap",
): Promise<string> {
  const result = await ctx.runMutation(internal.store.createReport, {
    userId,
    severity,
    summary,
  });

  return [
    "FALLO REGISTRADO",
    "--------------------------------",
    `ID: ${result.reportId}`,
    `Severidad: ${severity}`,
    `Resumen: ${summary}`,
  ].join("\n");
}

async function handleCapabilityGapTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  text: string,
  state: CruxState,
  route: RouterDecision,
): Promise<string> {
  const gapType = route.capabilityGapType ?? "unknown";
  const capabilityGap = route.capabilityGap;
  if (!capabilityGap) {
    return "No encontre una capacidad pendiente concreta para registrar. Puedo ayudarte a precisar que resultado necesitas.";
  }
  await ctx.runMutation(internal.store.createReport, {
    userId,
    severity: "capability_gap",
    summary: `Capability gap detected: ${capabilityGap}`,
    transcriptExcerpt: text.slice(0, 2000),
    boundary: `capability_gap:${gapType}`,
    errorCause: capabilityGapRootCause(gapType),
    route: route.route,
    intent: route.intent,
    ...(state.session?.currentCycleId ? { currentCycleId: state.session.currentCycleId } : {}),
    ...(route.anticipatedRoute ? { anticipatedRoute: route.anticipatedRoute } : {}),
    capabilityGap,
    capabilityGapType: gapType,
    model: geminiModel(),
  });

  return [
    "Todavia no puedo ejecutar ese cambio desde la aplicacion.",
    "Ya lo deje registrado para conectarlo o desarrollarlo sin fingir que se realizo.",
    "",
    `Lo que falta esta en: ${capabilityGapTypeCopy(gapType)}.`,
    "Mientras se incorpora, si existe una forma segura de continuar con lo que ya esta disponible, te la explicare.",
  ].join("\n");
}

function capabilityGapRootCause(type: CapabilityGapType): string {
  return `Universal router gap: a requested state-changing operation reached the agent without a complete executable contract at the ${type} layer. Questions and supported adaptations must remain conversational and must not emit capability-gap UX.`;
}

function capabilityGapTypeCopy(type: CapabilityGapType): string {
  if (type === "software_capability") return "funcion de la aplicacion";
  if (type === "task_signal") return "ruta del router";
  if (type === "intent_reading") return "lectura de la intencion";
  if (type === "field_extraction") return "extraccion de datos de la solicitud";
  if (type === "state_contract") return "estado o transicion del proceso";
  if (type === "tool_binding") return "conexion entre el agente y una funcion existente";
  if (type === "knowledge_content") return "conocimiento o contenido del crux";
  if (type === "channel_interface") return "interfaz del canal";
  if (type === "external_integration") return "integracion externa";
  return "clasificacion por confirmar";
}

function extractCommand(text: string): string | null {
  const match = text.trim().match(/^\/[a-zA-Z_]+/);
  return match?.[0].toLowerCase() ?? null;
}

function isNaturalPracticeEvidence(text: string, state: CruxState): boolean {
  if (state.session?.status !== "active" || !state.currentPractice) return false;
  return assessPracticeEvidenceSignal(text).kind === "sufficient";
}

function isShortHabitCompletion(text: string, state: CruxState): boolean {
  const normalized = normalizeTelegramText(text);
  const recentHabitPrompt = (state.recentMessages ?? [])
    .slice(-6)
    .some((message) => message.direction === "outbound" && /\b(RUTINA NUCLEO|DIA VACIO|Habitos de hoy|Pendiente:)\b/i.test(message.text));
  const shortCompletion = normalized.length <= 80
    && /\b(hecho|listo|lista|ya lo hice|ya hice|rutina lista|habitos hechos|tummo hecho|dia vacio hecho)\b/.test(normalized);
  const explicitHabit = /\b(rutina|habito|habitos|tummo|dia vacio)\b/.test(normalized)
    && /\b(hecho|hice|listo|lista|complete|termine)\b/.test(normalized);
  return explicitHabit || (recentHabitPrompt && shortCompletion);
}

function isHabitStatusRequest(normalized: string): boolean {
  return /\b(rutina|habitos|habito diario|pendientes de hoy|tummo)\b/.test(normalized)
    && /\b(ver|mostrar|muestrame|estado|como voy|pendiente|que falta|cuales|dame|quiero ver|consultar)\b/.test(normalized);
}

function isAddHabitRequest(normalized: string): boolean {
  const habitNoun = /\b(habito|habitos|rutina diaria)\b/.test(normalized);
  const addAct = /\b(agregar|agrega|anadir|anade|incluir|incluye|sumar|suma|quiero hacer diariamente|quiero hacer todos los dias)\b/.test(normalized);
  return habitNoun && addAct;
}

function habitManagementIntentFromText(normalized: string): "pause_habit" | "resume_habit" | "archive_habit" | "condense_habits" | null {
  const habitObject = /\b(habito|habitos|rutina diaria|rutina nucleo|tummo)\b/.test(normalized);
  const conversational = /[?]|\b(como puedo|puedo|se puede|que pasa si|como funcionaria|quiero saber)\b/.test(normalized);
  if (!habitObject || conversational) return null;
  if (/\b(condensa|condensar|combina|combinar|fusiona|fusionar|une|unir)\b/.test(normalized)) return "condense_habits";
  if (/\b(reactiva|reactivar|reanuda|reanudar|retoma|retomar|vuelve a activar)\b/.test(normalized)) return "resume_habit";
  if (/\b(pausa|pausar|suspende|suspender)\b/.test(normalized)) return "pause_habit";
  if (/\b(elimina|eliminar|borra|borrar|quita|quitar|archiva|archivar)\b/.test(normalized)) return "archive_habit";
  return null;
}

function isRoutineHistoryRequest(normalized: string): boolean {
  const routineObject = /\b(rutina|habitos|racha)\b/.test(normalized);
  const historyAct = /\b(historial|registros|ultimos dias|dias anteriores|como ha ido|como voy en la rutina|racha detallada)\b/.test(normalized);
  return routineObject && historyAct;
}

function isNamedPracticeInstructionsRequest(text: string): boolean {
  const normalized = normalizeTelegramText(text);
  if (!resolvePracticeReference(text)) return false;
  return /\b(instrucciones|como se hace|como hago|que debo hacer|ver practica|ver ciclo|muestrame|mostrar|consultar|revisar)\b/.test(normalized)
    && !/\b(reabrir|postergar|saltar|complete|termine|hice)\b/.test(normalized);
}

function isPhaseSequenceRequest(normalized: string): boolean {
  const phaseObject = /\b(fase|ciclo|practica|subfase|sub-fase)\b/.test(normalized);
  const sequenceAct = /\b(anterior|actual y siguiente|que sigue|cual sigue|secuencia|recorrido|orden)\b/.test(normalized);
  return phaseObject && sequenceAct;
}

function isDeferredPracticeListRequest(normalized: string): boolean {
  const inspectionAct = /\b(ver|mostrar|muestrame|consultar|revisar|cuales|lista|dame)\b/.test(normalized);
  const deferredObject = /\b(practica|practicas|ciclo|ciclos)\b/.test(normalized)
    && /\b(postergada|postergadas|postergado|postergados|diferida|diferidas|pendiente para retomar|pendientes para retomar)\b/.test(normalized);
  return inspectionAct && deferredObject;
}

function isKnowledgeMenuRequest(normalized: string): boolean {
  const menuAct = /\b(menu|mapa de conocimiento|temas disponibles|que puedo aprender|que conceptos|ver conceptos|ver fases|contenido disponible)\b/.test(normalized);
  return menuAct && !/\b(explica|por que|para que|como funciona)\b/.test(normalized);
}

function isReopenPracticeRequest(normalized: string): boolean {
  return /\b(reabrir|reabre|desmarcar|no la termine|no la complete|marcada por error|completada por error|volver a activar)\b/.test(normalized)
    && /\b(practica|ciclo|nsdr|reto social|niacina|ganzfeld|oniro|enteogeno|postliminar)\b/.test(normalized);
}

function isNamedHabitCompletion(text: string, state: CruxState): boolean {
  const normalized = normalizeTelegramText(text);
  if (!/\b(hecho|hecha|hice|complete|termine|listo|lista|realice)\b/.test(normalized)) return false;
  const activeHabits = (state.dailyHabits ?? []).filter((habit) => habit.status === "active");
  return resolveHabitReferences(text, activeHabits, { allowMultiple: true }).kind === "resolved";
}

function hasExplicitHabitCompletion(normalized: string): boolean {
  return /\b(rutina|habito|habitos|tummo|dia vacio)\b/.test(normalized)
    && /\b(hecho|hice|listo|lista|complete|termine|realice)\b/.test(normalized);
}

function isIdentityMapRequest(normalized: string): boolean {
  const mapObject = /\b(mi identidad|mi mapa|mapa inicial|mapa quest|dreamline|fear setting|fear-setting|mis obstaculos|mis retos|identidad inicial|identidad final|mi heroe)\b/.test(normalized);
  const inspectAct = /\b(ver|mostrar|muestrame|consultar|revisar|recordar|recuerdame|como quedo|que guarde|que tienes)\b/.test(normalized);
  return mapObject && inspectAct;
}

function isDeferPracticeRequest(normalized: string): boolean {
  const deferAct = /\b(saltar|saltarme|postergar|posponer|dejar pendiente|pasar por ahora|omitir por ahora|avanzar a la siguiente|pasar a otra practica|pasar al siguiente ciclo)\b/.test(normalized);
  const practiceObject = /\b(practica|ciclo|punto|reto|niacina|nsdr|exposicion|ganzfeld|oniro|protocolo)\b/.test(normalized);
  return deferAct && practiceObject;
}

function isPracticeHistoryRequest(normalized: string): boolean {
  const historyNoun = /\b(registro|registros|reporte|reportes|evidencia|evidencias|historial)\b/.test(normalized);
  const domainObject = /\b(ciclo|ciclos|practica|practicas|nsdr|reto social|niacina|ganzfeld|oniro|arqueidentidad|archeidentity)\b/.test(normalized);
  const inspectionAct = /\b(como|ver|muestrame|mostrar|consultar|revisar|quedo|quedaron|van|guardado|registrado|terminados|complete|termine)\b/.test(normalized);
  return historyNoun && domainObject && inspectionAct;
}

function isExplicitAppProblemReport(normalized: string): boolean {
  const problem = /\b(error|bug|fallo|se rompio|no funciona|funciona mal|problema tecnico|me bloqueo|quedo en bucle)\b/.test(normalized);
  const appObject = /\b(app|aplicacion|bot|sistema|telegram|respuesta|mensaje|registro|progreso|estado)\b/.test(normalized);
  return problem && appObject;
}

function isRoutineDayChangeRequest(normalized: string): boolean {
  const hasWeekday = weekdayFromSpanish(normalized) !== null;
  const namesRoutineDay = /\b(cheat day|dia libre|dia trampa|dia vacio|empty day)\b/.test(normalized);
  const changeSpeechAct = /\b(cambiar|cambio|poner|pongo|quiero|define|definir|actualiza|actualizar|mover|sera|sea)\b/.test(normalized)
    || /\b(cheat day|dia libre|dia trampa|dia vacio|empty day)\s*:/.test(normalized);
  return hasWeekday && namesRoutineDay && changeSpeechAct;
}

function isEmptyDayRequest(normalized: string): boolean {
  return /\b(dia vacio|empty day|ancla de la semana|reinicio filosofico)\b/.test(normalized);
}

function normalizeTelegramText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function profilePatchFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (isRecord(args.initialIdentity)) {
    const name = stringFromJson(args.initialIdentity.name);
    const behavior = stringFromJson(args.initialIdentity.behavior);
    const belief = stringFromJson(args.initialIdentity.belief);
    if (name && behavior && belief) {
      patch.initialIdentity = {
        name,
        behavior,
        belief,
        updatedAt: numberFromJson(args.initialIdentity.updatedAt) ?? Date.now(),
      };
    }
  }
  for (const key of [
    "cadence",
    "heroName",
    "heroWhy",
    "villainInternal",
    "villainExternal",
    "villainPhilosophical",
    "cheatDayOfWeek",
    "emptyDayOfWeek",
    "emptyDayEnabled",
    "dreamline",
    "fearSetting",
    "limits",
  ] as const) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  return patch;
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
}

function formatRecentMessages(state: CruxState, maxMessages = 10): string {
  const messages = (state.recentMessages ?? []).slice(-maxMessages);
  if (messages.length === 0) return "sin historial reciente";
  return messages
    .map((message) => `${message.direction === "inbound" ? "usuario" : "tutor"}: ${message.text.slice(0, 900)}`)
    .join("\n---\n");
}

function buildUnhandledTurnReport(summary: string, state?: CruxState, details?: ExternalErrorDetails): string {
  const session = state?.session;
  const parts = [
    `Unhandled Telegram turn failure: ${summary}`,
    `session=${session?.status ?? "unknown"}`,
    `onboardingStep=${session?.onboardingStep ?? "none"}`,
    `currentCycleId=${session?.currentCycleId ?? "none"}`,
    `practiceCount=${arqueidentidadFase6Content.practices.length}`,
    `model=${geminiModel()}`,
  ];
  if (details?.boundary) parts.push(`boundary=${details.boundary}`);
  if (details?.errorName) parts.push(`errorName=${details.errorName}`);
  if (details?.errorCause) parts.push(`cause=${details.errorCause}`);
  return parts.join(" | ");
}

function describeExternalError(error: unknown, fallbackBoundary = "unknown"): ExternalErrorDetails {
  if (error instanceof TelegramBoundaryError) {
    const original = describeExternalError(error.original, error.boundary);
    return {
      ...original,
      boundary: error.boundary,
      errorMessage: original.errorMessage,
    };
  }

  if (error instanceof ExternalBoundaryError) {
    const original = describeExternalError(error.original, error.boundary);
    return {
      ...original,
      boundary: error.boundary,
      errorMessage: original.errorMessage,
    };
  }

  const record = isRecord(error) ? error : {};
  const cause = isRecord(record.cause) ? record.cause : undefined;
  const causeCode = typeof cause?.code === "string" ? cause.code : undefined;
  const causeMessage = typeof cause?.message === "string" ? cause.message : undefined;
  const status = typeof record.status === "number" ? `status=${record.status}` : undefined;
  const errorName = error instanceof Error ? error.name : typeof record.name === "string" ? record.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCause = [causeCode, causeMessage, status].filter(Boolean).join(" | ") || undefined;

  return {
    boundary: fallbackBoundary,
    errorName,
    errorMessage,
    ...(errorCause !== undefined ? { errorCause } : {}),
  };
}

function isRetryableGeminiError(error: unknown): boolean {
  const details = describeExternalError(error, "gemini:tutor_generate");
  const haystack = [
    details.errorName,
    details.errorMessage,
    details.errorCause ?? "",
  ].join(" ").toLowerCase();

  return haystack.includes("fetch failed")
    || haystack.includes("resource_exhausted")
    || haystack.includes("too many requests")
    || haystack.includes("rate limit")
    || haystack.includes("quota")
    || haystack.includes("overloaded")
    || haystack.includes("unavailable")
    || haystack.includes("503")
    || haystack.includes("502")
    || haystack.includes("429");
}

function stringFromJson(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberFromJson(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function numericArg(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function eventTypeFrom(value: unknown): "prep" | "challenge" | "debrief" | "integration" | "recovery" {
  return value === "prep" || value === "challenge" || value === "debrief" || value === "integration" || value === "recovery"
    ? value
    : "prep";
}

function severityFrom(value: unknown): "info" | "bug" | "safety" | "missing_knowledge" | "tool_error" | "capability_gap" {
  return value === "info" || value === "bug" || value === "safety" || value === "missing_knowledge" || value === "tool_error" || value === "capability_gap"
    ? value
    : "info";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
