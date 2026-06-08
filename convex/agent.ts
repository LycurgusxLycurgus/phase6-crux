"use node";

import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import {
  buildDebrief,
  buildMemoryCandidates,
  choosePractice,
  chunkTelegramText,
  classifyPracticeRequest,
  compilePrompt,
  getToolDeclarations,
  normalizeMemoryLines,
  parseCadence,
  parseCycleChoice,
  parseHeroIdentity,
  parseVillains,
  renderLearnMap,
  renderMemory,
  renderPracticePlan,
  renderProgressDiagram,
  type CruxState,
  type MemoryLine,
} from "../bridgecrux/core";
import { arqueidentidadFase6Content } from "../cruxes/arqueidentidad-fase6/content";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";

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

type CruxRoute =
  | "onboarding"
  | "active_practice"
  | "debrief"
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
  | "submit_evidence"
  | "ask_concept"
  | "report_problem"
  | "change_settings"
  | "other";

type RouterDecision = {
  route: CruxRoute;
  intent: CruxIntent;
  confidence: number;
  needsHighThinking: boolean;
  safetyFlag: "none" | "possible" | "urgent";
  stateMutationCandidate: "none" | "profile" | "session" | "practice" | "ledger" | "memory" | "report";
  reason: string;
};

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
        "Para recuperar el hilo, envia /status o vuelve al mapa inicial con /start.",
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
    return await startOnboarding(ctx, userId);
  }

  if (command) {
    return await handleCommand(ctx, userId, text, command, state);
  }

  const route = await routeCruxTurn(text, state);
  await recordRouterDecision(ctx, userId, text, state, route);

  if (shouldAutostartOnboarding(state)) {
    return await startOnboarding(ctx, userId);
  }

  if (state.session?.status === "onboarding") {
    return await handleOnboardingStep(ctx, userId, text, state);
  }

  if (route.route === "progress") {
    return renderProgressDiagram(state);
  }

  if (route.route === "memory") {
    return renderMemory(state.memories);
  }

  if (route.route === "settings") {
    return renderSettings(state);
  }

  if (route.route === "report") {
    return await createReportTurn(ctx, userId, text, "bug");
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

  if (route.route === "debrief" || route.intent === "submit_evidence" || isNaturalPracticeEvidence(text, state)) {
    return await createDebriefTurn(ctx, userId, text);
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
      return await startOnboarding(ctx, userId);
    case "/learn":
      return renderLearnMap();
    case "/practice":
      return await startSelectedPractice(ctx, userId, args || state.session?.currentCycleId || "cycle1_prehypnos_nsdr", state);
    case "/status":
      return renderProgressDiagram(await loadCruxState(ctx, userId));
    case "/memory":
      return renderMemory((await loadCruxState(ctx, userId)).memories);
    case "/debrief":
      if (!args) {
        return explainDebrief();
      }
      return await createDebriefTurn(ctx, userId, args);
    case "/settings":
      return renderSettings(state);
    case "/report":
      return await createReportTurn(ctx, userId, args || "El usuario reporto un fallo desde Telegram.", "bug");
    case "/reset":
      return "REINICIO CONSCIENTE\n--------------------------------\nNo borro tu historia por impulso. Envia CONFIRMAR RESET para volver al mapa inicial.";
    case "/help":
      return renderHelp();
    default:
      return renderHelp();
  }
}

async function startOnboarding(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<string> {
  await ctx.runMutation(internal.store.updateSession, {
    userId,
    status: "onboarding",
    onboardingStep: "cadence",
  });

  return [
    "Bienvenido a Arqueidentidad Fase VI.",
    "Esta version trabaja solo Fase VI. Las otras fases apareceran despues.",
    "",
    "Antes de empezar, quiero conocerte un poco para proponerte practicas que tengan sentido para ti.",
    "",
    explainCadenceStep(),
  ].join("\n");
}

function shouldAutostartOnboarding(state: CruxState): boolean {
  if (state.session?.status !== "onboarding") return false;
  if (state.session.onboardingStep !== "cadence") return false;
  if (state.profile?.cadence) return false;
  const messages = state.recentMessages ?? [];
  const inboundCount = messages.filter((message) => message.direction === "inbound").length;
  const outboundCount = messages.filter((message) => message.direction === "outbound").length;
  return inboundCount === 1 && outboundCount === 0;
}

async function handleOnboardingStep(
  ctx: ActionCtx,
  userId: Id<"users">,
  text: string,
  state: CruxState,
): Promise<string> {
  const step = state.session?.onboardingStep ?? "cadence";

  if (step === "cadence") {
    const assessment = await assessCadenceAnswer(text, state);
    if (!assessment.accepted || !assessment.cadence) {
      return assessment.message || explainCadenceStep();
    }
    await ctx.runMutation(internal.store.updateProfile, { userId, cadence: assessment.cadence });
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
    await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "villains" });
    return [
      assessment.message,
      "",
      explainObstaclesStep(),
    ].join("\n");
  }

  if (step === "villains") {
    const assessment = await assessObstaclesAnswer(text, state);
    if (!assessment.accepted || !assessment.villainInternal || !assessment.villainExternal || !assessment.villainPhilosophical) {
      return assessment.message || explainObstaclesStep();
    }

    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      villainInternal: assessment.villainInternal,
      villainExternal: assessment.villainExternal,
      villainPhilosophical: assessment.villainPhilosophical,
    });

    const fresh = await loadCruxState(ctx, userId);
    await ctx.runMutation(internal.store.replaceMemoryLines, {
      userId,
      lines: buildMemoryCandidates(fresh, "onboarding completado"),
    });

    return [
      assessment.message,
      "",
      "Ya tengo tu primer mapa.",
      "",
      renderIdentityMapSummary(fresh),
      "",
      "Ahora empezamos por la primera practica segura. Antes de intensificar cualquier cosa, revisamos senales del cuerpo y adaptamos.",
      "",
      await startSelectedPractice(ctx, userId, "cycle1_prehypnos_nsdr", fresh),
    ].join("\n");
  }

  await ctx.runMutation(internal.store.updateSession, { userId, onboardingStep: "hero" });
  return explainHeroStep();
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
): Promise<string> {
  const state = await loadCruxState(ctx, userId);
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

function nextPracticeAfter(cycleId?: string): string | null {
  if (cycleId === "cycle1_prehypnos_nsdr") return "cycle2_social_fear";
  if (cycleId === "cycle2_social_fear") return "cycle3_niacin_primer";
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
          "Extrae o infiere con humildad: que paso, que interpretacion aparecio, que sintio en cuerpo/emocion, que accion salio y que resultado vio.",
          "Si falta un dato, escribe 'por precisar' en vez de reganar.",
          "No preguntes por resonancia ni disonancia. No pidas calificaciones numericas.",
          "Incluye un ancla: microtematica detectada, hipertematica a conservar o identidad que queda mas disponible.",
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
      "Aplica BEST ANSWER como router: inferir necesidad real, distinguir si el usuario responde un formulario, pregunta, reporta un fallo, pide progreso, envia evidencia o necesita cuidado.",
      "El router de baja reflexion nunca produce copia visible ni ejecuta acciones; solo clasifica para que el tutor de alta reflexion responda.",
      "Prioridad: seguridad > onboarding activo > evidencia de practica > comandos implicitos > tutor libre.",
      "Si el usuario confirma una sugerencia previa, marca intent confirm_previous_suggestion.",
      "Si cuenta que hizo una practica, noto cambios, energia, calma, pendientes o resultados, route=debrief intent=submit_evidence.",
      "Si pide explicacion conceptual, route=knowledge_question intent=ask_concept.",
      "Si reporta fallo o algo roto, route=report intent=report_problem.",
      "Si pide estado/progreso, route=progress. Si pide memoria, route=memory. Si pide configuracion, route=settings.",
      `Estado: ${state.session?.status ?? "unknown"}`,
      `Paso onboarding: ${state.session?.onboardingStep ?? "none"}`,
      `Practica activa: ${state.currentPractice?.title ?? "none"}`,
      `Historial reciente:\n${formatRecentMessages(state, 8)}`,
      `Mensaje: ${text}`,
      'Devuelve solo JSON: {"route":"free_tutor","intent":"other","confidence":0.7,"needsHighThinking":true,"safetyFlag":"none","stateMutationCandidate":"none","reason":"..."}',
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

    return routerDecisionFromJson(parseJsonObject(response.text ?? ""), fallback);
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
  await ctx.runMutation(internal.store.recordRouterDecision, args);
}

function deterministicRouteDecision(text: string, state: CruxState): RouterDecision {
  const normalized = normalizeTelegramText(text);
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
  if (/\b(memoria|recuerdas|recuerda)\b/.test(normalized)) {
    return baseRoute("memory", "ask_concept", 0.75, "none", "none", "memory request");
  }
  if (/\b(estado|status|progreso|avance|como voy)\b/.test(normalized)) {
    return baseRoute("progress", "ask_concept", 0.8, "none", "none", "progress request");
  }
  if (/\b(configuracion|settings|cadencia|ritmo)\b/.test(normalized)) {
    return baseRoute("settings", "change_settings", 0.7, "none", "none", "settings request");
  }
  if (/\b(fallo|error|bug|se rompio|no funciona|problema)\b/.test(normalized)) {
    return baseRoute("report", "report_problem", 0.8, "none", "report", "reported problem");
  }
  if (isNaturalPracticeEvidence(text, state)) {
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
  return {
    route,
    intent,
    confidence,
    needsHighThinking: value.needsHighThinking !== false,
    safetyFlag,
    stateMutationCandidate,
    reason,
  };
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
  return value === "onboarding" || value === "active_practice" || value === "debrief" || value === "knowledge_question"
    || value === "safety" || value === "settings" || value === "progress" || value === "memory" || value === "report"
    || value === "free_tutor" || value === "unknown"
    ? value
    : undefined;
}

function intentFromValue(value: unknown): CruxIntent | undefined {
  return value === "answer_current_step" || value === "ask_clarification" || value === "confirm_previous_suggestion"
    || value === "revise_previous_answer" || value === "start_or_continue" || value === "adapt_practice"
    || value === "submit_evidence" || value === "ask_concept" || value === "report_problem"
    || value === "change_settings" || value === "other"
    ? value
    : undefined;
}

function mutationCandidateFromValue(value: unknown): RouterDecision["stateMutationCandidate"] | undefined {
  return value === "none" || value === "profile" || value === "session" || value === "practice" || value === "ledger"
    || value === "memory" || value === "report"
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
  const toolConfig = { functionDeclarations: getToolDeclarations() as never[] };
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
    const execution = await executeTool(ctx, userId, chatId, call.name, call.args ?? {}, state);
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
      "Evalua una respuesta de identidad para onboarding de Arqueidentidad.",
      "Acepta solo si hay un nombre de identidad y un por que basado en una buena interpretacion.",
      "Buena interpretacion: reduce ruido, no se auto-coacciona, no se autoinsulta, no nace de 'todo sale mal', no intenta arreglar la vida desde desprecio por si mismo.",
      "Rechaza identidades genericas como 'mejor version de mi mismo' si el por que es autoataque, fatalismo, vergueenza o desesperanza.",
      "Si rechazas, explica pedagogicamente por que todo proceso debe empezar desde una buena interpretacion: la identidad que nace de autoataque entrena obediencia al ruido, no transformacion.",
      "Usa estilo tutor Michel Thomas: el problema es de encuadre, no culpa del usuario; da una reformulacion posible.",
      "Si el formato esta mal pero el sentido es claro, normaliza sin mencionarlo al usuario.",
      "La respuesta al usuario debe empezar aprobando, rechazando o aceptando parcialmente claramente.",
      "No uses frases genericas como 'Bienvenido', 'registrado con exito', 'estamos listos' ni celebracion vacia.",
      "No menciones JSON, formato interno, backend, prompts ni herramientas.",
      "Si la respuesta confirma una sugerencia previa, usa el historial reciente para resolverla.",
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
      "Evalua una respuesta de obstaculos para onboarding de Arqueidentidad.",
      "Acepta si hay obstaculo interno, externo y filosofico aunque esten escritos de forma imperfecta, siempre que puedas convertirlos en mapa entrenable.",
      "Rechaza si el usuario se insulta, convierte personas en enemigos a odiar, o deja un campo como 'no se', 'cualquier cosa', 'lo que sea'.",
      "Si hay material util pero mal formulado y las tres piezas estan presentes, reformulalo positivamente y aceptalo; no pidas confirmacion de tu propia reformulacion.",
      "Si falta una pieza real, reformula lo aprovechable y pide solo esa pieza.",
      "La respuesta al usuario debe empezar aprobando o rechazando claramente.",
      "No uses frases genericas, no moralices, no culpes al usuario; corrige el encuadre.",
      "No menciones JSON, formato interno, backend, prompts ni herramientas.",
      "Si la respuesta del usuario significa 'si, usa tu sugerencia', busca en el historial reciente la ultima reformulacion propuesta por el tutor y aceptala si contiene interno, externo y filosofico. No vuelvas a pedir los tres campos.",
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
        "Lo que falta es el filosofico: no una frase al azar, sino el problema amplio que vuelve importante tu identidad.",
        "Ejemplo filosofico: usar tecnologia para cultivar plenitud en vez de fatalismo.",
      ].join("\n"),
    };
  }

  if (merged.villainInternal && merged.villainExternal && merged.villainPhilosophical) {
    return {
      accepted: true,
      message: "Aceptado: los tres obstaculos tienen forma entrenable. Los voy a guardar como mapa de transformacion, no como autoataque.",
      villainInternal: reframeObstacle(merged.villainInternal),
      villainExternal: reframeObstacle(merged.villainExternal),
      villainPhilosophical: reframeObstacle(merged.villainPhilosophical),
    };
  }

  return {
    accepted: false,
    message: "Todavia no lo acepto: me falta al menos uno de los tres obstaculos con sentido claro.",
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
        message: "Aceptado: tomo la estructura que acabamos de construir y la guardo como tu mapa inicial. Queda formulada como obstaculos entrenables, no como condenas.",
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
    message: "Aceptado: ya hay tres obstaculos suficientes para empezar. Los guardo como mapa de practica; si luego encontramos una formulacion mas precisa, la ajustamos con evidencia.",
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
      "Aplica BEST ANSWER: infiere la necesidad real, cada frase debe cambiar conocimiento o accion, termina en el siguiente obstaculo real.",
      "Aplica Michel Thomas: el tutor carga con la claridad; no culpes al usuario; no pidas memorizar; reduce friccion; reconstruye desde componentes simples.",
      "No avances el onboarding ni digas que guardaste nada.",
      "Todo en espanol natural, sin ingles tecnico, sin nombres de herramientas.",
    ].join(" ");
    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: "user",
        parts: [{ text: [
          `Paso actual: ${step === "hero" ? "identidad con nombre y por que" : "tres obstaculos de transformacion"}.`,
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
): Promise<ToolExecution> {
  switch (name) {
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

async function sendTelegramText(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN missing; outgoing Telegram message suppressed.");
    console.log(text);
    return;
  }

  for (const chunk of chunkTelegramText(text)) {
    const formatted = formatTelegramHtml(chunk);
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatted,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
    } catch (error) {
      throw new ExternalBoundaryError("telegram:sendMessage", error);
    }

    if (!response.ok) {
      let fallback: Response;
      try {
        fallback = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            disable_web_page_preview: true,
          }),
        });
      } catch (error) {
        throw new ExternalBoundaryError("telegram:sendMessage_plain_fallback", error);
      }
      if (!fallback.ok) {
        const body = await fallback.text();
        throw new Error(`Telegram sendMessage failed: ${fallback.status} ${body}`);
      }
    }
  }
}

function formatTelegramHtml(text: string): string {
  return escapeTelegramHtml(text)
    .replace(/^\s*#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<b>$2</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
    `Heroe: ${state.profile?.heroName ?? "sin definir"}`,
    state.profile?.heroWhy ? `Por que: ${state.profile.heroWhy}` : "Por que: sin definir",
  ].join("\n");
}

function renderHelp(): string {
  return [
    "COMANDOS",
    "--------------------------------",
    "/start - crear mapa inicial",
    "/learn - mapa de Arqueidentidad",
    "/practice - iniciar o continuar practica",
    "/status - progreso textual",
    "/memory - memoria compacta",
    "/debrief - cerrar practica si prefieres comando",
    "/settings - configuracion",
    "/report - reportar un fallo",
    "/reset - reinicio consciente",
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
    "2. Nombra la identidad que quieres entrenar y dime por que la eliges.",
    "",
    "Una identidad es una red de ideas que se refuerzan. Cuando una idea se repite y junta evidencia, se vuelve creencia; cuando esa creencia toca el cuerpo, se vuelve habito o comportamiento.",
    "",
    "El nombre funciona como un arquetipo: una forma breve de recordar que tipo de persona estas votando ser cuando aparezca friccion.",
    "El por que evita que sea solo un apodo bonito: muestra que transformacion estas eligiendo y por que vale la pena.",
    "",
    "Ejemplos:",
    "- nombre: Jedi postplatonico; porque: quiero pensar con claridad y actuar con disciplina sin matar mi curiosidad",
    "- nombre: Monje estratega; porque: quiero unir atencion, cuerpo y decision en una sola practica",
    "- nombre: Atleta de la atencion; porque: quiero entrenar foco como una capacidad fisica, no como culpa",
    "",
    "Responde asi: nombre: ...; porque: ...",
  ].join("\n");
}

function explainObstaclesStep(): string {
  return [
    "3. Define tres obstaculos que esa identidad quiere aprender a superar.",
    "",
    "No estamos buscando que te ataques. Un obstaculo no es una condena: es una interpretacion, habito o condicion que vamos a redisenar.",
    "",
    "Interno = el pensamiento que debilita la transformacion. Ejemplo: cambiar \"no puedo sostener foco\" por \"puedo entrenarlo por ciclos\".",
    "Externo = la conducta, entorno o presion que necesitas redisenar para que la identidad exista. Ejemplo: crear bloques diarios de estudio profundo en vez de vivir reaccionando al ruido.",
    "Filosofico = el problema amplio que vuelve importante esta identidad. Ejemplo: quiero aportar sabiduria objetiva en un mundo que premia ruido y reaccion.",
    "",
    "Ejemplo:",
    "interno: transformar duda dispersa en confianza entrenable; externo: crear dos bloques diarios de atencion profunda; filosofico: buscar sabiduria objetiva en un mundo saturado de ruido",
  ].join("\n");
}

function renderIdentityMapSummary(state: CruxState): string {
  const profile = state.profile;
  return [
    "TU PRIMER MAPA",
    "--------------------------------",
    `Identidad: ${profile?.heroName ?? "sin nombre"}`,
    profile?.heroWhy ? `Por que: ${profile.heroWhy}` : "",
    `Obstaculo interno: ${profile?.villainInternal ?? "sin definir"}`,
    `Obstaculo externo: ${profile?.villainExternal ?? "sin definir"}`,
    `Obstaculo filosofico: ${profile?.villainPhilosophical ?? "sin definir"}`,
  ].filter(Boolean).join("\n");
}

function explainDebrief(): string {
  return [
    "CIERRE DE PRACTICA",
    "--------------------------------",
    "El cierre no es un reporte tecnico. Es la forma de convertir una experiencia en evidencia y ancla para tu identidad.",
    "",
    "No necesitas usar un comando. Cuentame en lenguaje normal:",
    "1. que hiciste",
    "2. que interpretacion aparecio",
    "3. que sentiste en el cuerpo o emocion",
    "4. que accion elegiste",
    "5. que resultado viste",
    "6. que microtematica o hipertematica quedo",
    "",
    "Ejemplo:",
    "Hice NSDR 12 minutos. Al principio pense que no iba a poder parar, pero despues senti mas calma. Anote mis pendientes y me quedo mas energia.",
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

  return [
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
  const internal = normalized.match(/(?:villano|obstaculo)?\s*interno\s+(?:es|seria|:)?\s*(.*?)(?=\s+(?:y\s+)?(?:el\s+)?(?:villano|obstaculo)?\s*externo\b|$)/);
  const external = normalized.match(/(?:villano|obstaculo)?\s*externo\s+(?:es|seria|:)?\s*(.*?)(?=\s+(?:y\s+)?(?:el\s+)?(?:filosofico|filosofica|villano filosofico|obstaculo filosofico)\b|$)/);
  const philosophical = normalized.match(/(?:filosofico|filosofica|villano filosofico|obstaculo filosofico)\s+(?:es|seria|:)?\s*(.*)$/);
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
      ? "Siguiente paso: continua /start y completa el mapa inicial."
      : "Siguiente paso: usa /practice para iniciar un ciclo o cuentame que paso para cerrar evidencia.",
  ].join("\n");
}

async function createReportTurn(
  ctx: ActionCtx,
  userId: Id<"users">,
  summary: string,
  severity: "bug" | "info" | "safety" | "missing_knowledge" | "tool_error",
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

function extractCommand(text: string): string | null {
  const match = text.trim().match(/^\/[a-zA-Z_]+/);
  return match?.[0].toLowerCase() ?? null;
}

function isNaturalPracticeEvidence(text: string, state: CruxState): boolean {
  if (state.session?.status !== "active" || !state.currentPractice) return false;
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/[?]/.test(text) || /\b(como|cuando|donde|por que|para que|puedo|debo|sirve|importa)\b/.test(normalized)) {
    return false;
  }

  const completionSignal = /\b(ya hice|lo hice|hice la practica|termine|termine la practica|complete|realice|acabe)\b/.test(normalized);
  const evidenceSignal = /\b(me ayudo|me senti|senti|observe|note|salio|resultado|me motivo|descanse|energia|calma|pendientes|agradecido|relajado)\b/.test(normalized);
  return completionSignal || (normalized.length > 80 && evidenceSignal);
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
  for (const key of ["cadence", "heroName", "heroWhy", "villainInternal", "villainExternal", "villainPhilosophical", "limits"] as const) {
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

function severityFrom(value: unknown): "info" | "bug" | "safety" | "missing_knowledge" | "tool_error" {
  return value === "info" || value === "bug" || value === "safety" || value === "missing_knowledge" || value === "tool_error"
    ? value
    : "info";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
