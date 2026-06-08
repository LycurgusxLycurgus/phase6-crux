"use node";

import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import { normalizeMemoryLines, type MemoryLine } from "../bridgecrux/core";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const rewriteAllMemories = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), users: v.number() }),
  handler: async (ctx): Promise<{ ok: boolean; users: number }> => {
    const userIds: Id<"users">[] = await ctx.runQuery(internal.store.listUsersForMemoryRewrite, {});
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const apiKey = process.env.GEMINI_API_KEY;
    let processed = 0;

    for (const userId of userIds) {
      const input: {
        memories: MemoryLine[];
        ledger: Array<{ eventType: string; evidence: string }>;
        messages: Array<{ direction: string; text: string }>;
      } = await ctx.runQuery(internal.store.getMemoryRewriteInput, { userId, since });
      const existing = normalizeMemoryLines(input.memories);
      const userTurns = input.messages
        .filter((item) => item.direction === "inbound")
        .map((item) => item.text.trim())
        .filter(Boolean)
        .slice(-30);

      if (userTurns.length < 30) continue;

      const lines = apiKey
        ? await rewriteMemoryWithGemini(apiKey, existing, userTurns)
        : deterministicMemoryRewrite(existing, userTurns);

      await ctx.runMutation(internal.store.replaceMemoryLines, { userId, lines });
      processed += 1;
    }

    return { ok: true, users: processed };
  },
});

async function rewriteMemoryWithGemini(apiKey: string, existing: MemoryLine[], userTurns: string[]): Promise<MemoryLine[]> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
      contents: [{
        role: "user",
        parts: [{ text: [
          "Reescribe memoria compacta BridgeCrux. No respondas al usuario.",
          "Recibes solo respuestas del usuario, no mensajes del tutor.",
          "Guarda solo informacion estable sobre identidad, preferencias de aprendizaje, correcciones explicitas del usuario, limites importantes o patrones repetidos.",
          "No guardes charla casual, elogios del tutor, eventos aislados sin repeticion, ni inferencias fragiles.",
          "Modifica o mejora memorias existentes cuando el tema ya existe; crea nuevas solo si aparece una memoria realmente nueva.",
          `Memorias existentes:\n${JSON.stringify(existing)}`,
          `Ultimas 30 respuestas del usuario:\n${userTurns.map((turn, index) => `${index + 1}. ${turn}`).join("\n")}`,
          'Devuelve solo JSON: {"lines":[{"topic":"identity.hero","line":"...","confidence":0.8}]}',
        ].join("\n") }],
      }] as never,
      config: {
        systemInstruction: "Eres memoria interna BridgeCrux. Devuelve solo JSON valido; nunca escribas copy para el usuario.",
        temperature: 0.2,
        topP: 0.8,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "low" },
      } as never,
    } as never);
    const parsed = parseJsonObject(response.text ?? "");
    const lines = Array.isArray(parsed.lines) ? parsed.lines as MemoryLine[] : [];
    return normalizeMemoryLines(lines.length > 0 ? lines : existing);
  } catch {
    return deterministicMemoryRewrite(existing, userTurns);
  }
}

function deterministicMemoryRewrite(existing: MemoryLine[], userTurns: string[]): MemoryLine[] {
  const identityTurns = userTurns.filter((turn) => /\b(nombre|identidad|soy|quiero ser|porque|me corrijo|prefiero|no quiero|limite)\b/i.test(turn));
  if (identityTurns.length === 0) return existing;
  return normalizeMemoryLines([
    ...existing,
    {
      topic: "memory.review",
      line: identityTurns.slice(-3).join(" | ").slice(0, 220),
      confidence: 0.45,
    },
  ]);
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
