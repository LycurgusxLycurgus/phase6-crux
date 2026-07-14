import { v } from "convex/values";
import { arqueidentidadFase6Content } from "../cruxes/arqueidentidad-fase6/content";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const seedPreviewAccess = internalAction({
  args: { label: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; url: string; expiresAt: number }> => {
    if (process.env.ALLOW_PREVIEW_SEED !== "true") {
      throw new Error("Preview seeding is disabled for this deployment");
    }

    const label = normalizeLabel(args.label ?? "persona-demo");
    const now = Date.now();
    const ensured: { userId: Id<"users"> } = await ctx.runMutation(internal.store.ensureTelegramUser, {
      telegramUserId: `preview:${label}`,
      chatId: `preview:${label}`,
      username: `preview_${label}`,
      firstName: "Persona demo",
      language: "es",
      timezone: "America/Bogota",
    });
    const userId = ensured.userId;

    await ctx.runMutation(internal.store.updateProfile, {
      userId,
      cadence: "weekly",
      routineStartedAt: now - 42 * 24 * 60 * 60 * 1000,
      routineStartDate: new Date(now - 42 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      cheatDayOfWeek: 0,
      emptyDayOfWeek: 1,
      emptyDayEnabled: true,
      dreamline: {
        have: "Un ritmo que deje espacio para elegir",
        do: "Convertir cada practica en una accion cotidiana",
        be: "Una presencia clara bajo friccion",
        updatedAt: now,
      },
      fearSetting: {
        whatIf: "Perder continuidad cuando cambie la semana",
        prevent: "Volver a una practica pequena y visible",
        repair: "Retomar sin reescribir la historia",
        partialWins: "Reconocer una interpretacion antes de actuar",
        cost6Months: "Seguir reaccionando por inercia",
        cost1Year: "Confundir intensidad con direccion",
        cost3Years: "Dejar que otros nombren la identidad",
        updatedAt: now,
      },
      initialIdentity: {
        name: "El observador intermitente",
        behavior: "Comprende el patron, pero lo practica solo cuando hay urgencia",
        belief: "Necesito sentirme listo antes de actuar",
        updatedAt: now,
      },
      heroName: "El arquitecto sereno",
      heroWhy: "Elige estructura sin perder plasticidad",
      villainInternal: "Esperar claridad perfecta",
      villainExternal: "Una agenda que fragmenta la atencion",
      villainPhilosophical: "Vivir reaccionando en lugar de interpretar",
      limits: [],
    });

    const practice = arqueidentidadFase6Content.practices.find((item) => item.id === "cycle1_prehypnos_nsdr");
    if (!practice) throw new Error("Preview practice definition not found");
    await ctx.runMutation(internal.store.startPracticeCycle, {
      userId,
      cycleId: practice.id,
      title: practice.title,
      plan: practice.body,
    });
    await ctx.runMutation(internal.habits.ensureBaseDailyHabit, { userId });
    const access: { url: string; expiresAt: number } = await ctx.runAction(internal.webAuth.issueWebLoginLink, { userId });
    return { userId, ...access };
  },
});

function normalizeLabel(value: string): string {
  const label = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  if (!label) throw new Error("Preview label is invalid");
  return label;
}
