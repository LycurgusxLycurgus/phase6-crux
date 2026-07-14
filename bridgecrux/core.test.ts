import { describe, expect, it } from "vitest";
import {
  assessPracticeEvidenceSignal,
  buildDebrief,
  chunkTelegramText,
  classifyPracticeRequest,
  compilePrompt,
  isAgentToolAuthorized,
  isNaturalWebAccessRequest,
  normalizeMemoryLines,
  parseCadence,
  parseCycleChoice,
  parseHeroIdentity,
  parseIdentityMapPatch,
  parseVillains,
  renderProgressDiagram,
  resolvePracticeReference,
} from "./core";

describe("BridgeCrux core", () => {
  it("authorizes tutor mutations only inside their routed contracts", () => {
    expect(isAgentToolAuthorized("add_core_routine_habit", "daily_habit", "add_core_habit")).toBe(true);
    expect(isAgentToolAuthorized("add_core_routine_habit", "free_tutor", "other")).toBe(false);
    expect(isAgentToolAuthorized("start_practice_cycle", "active_practice", "ask_clarification")).toBe(false);
    expect(isAgentToolAuthorized("update_memory", "memory", "ask_concept")).toBe(false);
    expect(isAgentToolAuthorized("create_debrief", "debrief", "submit_evidence")).toBe(true);
    expect(isAgentToolAuthorized("create_debrief", "active_practice", "announce_evidence")).toBe(false);
  });

  it("blocks substance operation requests", () => {
    const gate = classifyPracticeRequest("quiero dosis de psilocibina para fase 6");
    expect(gate.blocked.length).toBeGreaterThan(0);
    expect(gate.alternative).toContain("NSDR");
  });

  it("adds prevention boundaries to sensitive practice requests", () => {
    const gate = classifyPracticeRequest("quiero hacer breathwork intenso y frio");
    expect(gate.warnings.length).toBeGreaterThan(0);
    expect(gate.blocked).toEqual([]);
    expect(gate.alternative).toContain("nota breve");
  });

  it("parses onboarding answers", () => {
    expect(parseCadence("prefiero quincenal")).toBe("biweekly");
    expect(parseCycleChoice("B social")).toBe("cycle2_social_fear");
  });

  it("recognizes natural requests to enter the web interface", () => {
    expect(isNaturalWebAccessRequest("quiero abrir la app")).toBe(true);
    expect(isNaturalWebAccessRequest("llévame al panel web")).toBe(true);
    expect(isNaturalWebAccessRequest("muéstrame la interfaz")).toBe(true);
    expect(isNaturalWebAccessRequest("explícame cómo funciona la aplicación")).toBe(false);
    expect(isNaturalWebAccessRequest("cierra mis sesiones web")).toBe(false);
  });

  it("parses villain labels with accents and natural separators", () => {
    const villains = parseVillains("interno: gen egoísta; externo: abundancia financiera y filosófico: dominar el postplatonismo");
    expect(villains.villainInternal).toBe("gen egoista");
    expect(villains.villainExternal).toBe("abundancia financiera");
    expect(villains.villainPhilosophical).toBe("dominar el postplatonismo");
  });

  it("parses hero identity name and reason", () => {
    const hero = parseHeroIdentity("nombre: Jedi postplatónico; porque: quiero pensar con claridad y actuar con disciplina");
    expect(hero.heroName).toBe("jedi postplatonico");
    expect(hero.heroWhy).toBe("quiero pensar con claridad y actuar con disciplina");
  });

  it("updates a specifically named final identity field without replacing its existing reason", () => {
    const result = parseIdentityMapPatch("Cambia el nombre de identidad final a Yushi Huang", {
      profile: { heroName: "Sarasvati", heroWhy: "Representa claridad y creatividad" },
      session: { status: "active" },
      memories: [],
      ledgerSummary: {
        prepCount: 0,
        challengeCount: 0,
        debriefCount: 0,
        integrationCount: 0,
        completedPreliminalCount: 0,
      },
      currentPractice: null,
    });

    expect(result).toMatchObject({
      kind: "update",
      patch: { heroName: "Yushi Huang" },
    });
    if (result.kind === "update") expect(result.patch.heroWhy).toBeUndefined();
  });

  it("recovers a natural final-identity name change from conversational phrasing", () => {
    const result = parseIdentityMapPatch(
      "Antes me gustaria hablar sobre mi identidad. Quiero cambiar su nombre, me gusta Yushi Huang. Ella representa calma y fortaleza.",
      {
        profile: { heroName: "Sarasvati" },
        session: { status: "active" },
        memories: [],
        ledgerSummary: {
          prepCount: 0,
          challengeCount: 0,
          debriefCount: 0,
          integrationCount: 0,
          completedPreliminalCount: 0,
        },
        currentPractice: null,
      },
    );

    expect(result).toMatchObject({ kind: "update", patch: { heroName: "Yushi Huang" } });
  });

  it("updates the final identity reason only when the same correction states one", () => {
    const result = parseIdentityMapPatch(
      "Cambia mi identidad final a Yushi Huang porque representa calma y fortaleza",
      {
        profile: { heroName: "Sarasvati", heroWhy: "Razon anterior" },
        session: { status: "active" },
        memories: [],
        ledgerSummary: {
          prepCount: 0,
          challengeCount: 0,
          debriefCount: 0,
          integrationCount: 0,
          completedPreliminalCount: 0,
        },
        currentPractice: null,
      },
    );

    expect(result).toMatchObject({
      kind: "update",
      patch: {
        heroName: "Yushi Huang",
        heroWhy: "representa calma y fortaleza",
      },
    });
  });

  it("updates one dreamline or fear-setting field while preserving the rest", () => {
    const baseState = {
      profile: {
        dreamline: { have: "tiempo", do: "crear", be: "lucido" },
        fearSetting: {
          whatIf: "fallo",
          prevent: "empezar pequeno",
          repair: "volver manana",
          partialWins: "aprender",
          cost6Months: "seguir igual",
          cost1Year: "normalizarlo",
          cost3Years: "alejarme",
        },
      },
      session: { status: "active" as const },
      memories: [],
      ledgerSummary: {
        prepCount: 0,
        challengeCount: 0,
        debriefCount: 0,
        integrationCount: 0,
        completedPreliminalCount: 0,
      },
      currentPractice: null,
    };

    expect(parseIdentityMapPatch("Cambia quiero hacer a escribir cada manana", baseState)).toMatchObject({
      kind: "update",
      patch: { dreamline: { have: "tiempo", do: "escribir cada manana", be: "lucido" } },
    });
    expect(parseIdentityMapPatch("Actualiza prevenir a reservar una hora", baseState)).toMatchObject({
      kind: "update",
      patch: { fearSetting: { prevent: "reservar una hora", repair: "volver manana" } },
    });
  });

  it.each([
    ["Actualiza reto interno a curiosidad dispersa", { villainInternal: "curiosidad dispersa" }],
    ["Actualiza reto externo a interrupciones constantes", { villainExternal: "interrupciones constantes" }],
    ["Actualiza reto filosofico a convertir limites en diseno", { villainPhilosophical: "convertir limites en diseno" }],
    ["Actualiza por que final a crear con serenidad", { heroWhy: "crear con serenidad" }],
    ["Actualiza identidad inicial a Explorador reactivo", { initialIdentity: { name: "Explorador reactivo", behavior: "posponer", belief: "necesito urgencia" } }],
    ["Actualiza comportamiento actual a empezar sin plan", { initialIdentity: { name: "Estratega cansado", behavior: "empezar sin plan", belief: "necesito urgencia" } }],
    ["Actualiza creencia actual a puedo aprender sin urgencia", { initialIdentity: { name: "Estratega cansado", behavior: "posponer", belief: "puedo aprender sin urgencia" } }],
    ["Actualiza quiero tener a tiempo protegido", { dreamline: { have: "tiempo protegido", do: "crear", be: "lucido" } }],
    ["Actualiza quiero hacer a publicar cada semana", { dreamline: { have: "tiempo", do: "publicar cada semana", be: "lucido" } }],
    ["Actualiza quiero ser a sereno y preciso", { dreamline: { have: "tiempo", do: "crear", be: "sereno y preciso" } }],
    ["Actualiza que tal si a el proyecto falla", { fearSetting: { whatIf: "el proyecto falla", prevent: "empezar pequeno" } }],
    ["Actualiza prevenir a reservar una hora", { fearSetting: { prevent: "reservar una hora", repair: "volver manana" } }],
    ["Actualiza reparar a pedir retroalimentacion", { fearSetting: { repair: "pedir retroalimentacion", partialWins: "aprender" } }],
    ["Actualiza ganancia parcial a obtener evidencia", { fearSetting: { partialWins: "obtener evidencia", cost6Months: "seguir igual" } }],
    ["Actualiza costo 6 meses a perder impulso", { fearSetting: { cost6Months: "perder impulso", cost1Year: "normalizarlo" } }],
    ["Actualiza costo 1 ano a volverlo costumbre", { fearSetting: { cost1Year: "volverlo costumbre", cost3Years: "alejarme" } }],
    ["Actualiza costo 3 anos a abandonar la vision", { fearSetting: { cost3Years: "abandonar la vision", whatIf: "fallo" } }],
  ])("updates every named identity-map field through the shared correction contract: %s", (message, expectedPatch) => {
    const result = parseIdentityMapPatch(message, {
      profile: {
        heroName: "Sarasvati",
        heroWhy: "razon anterior",
        villainInternal: "interno anterior",
        villainExternal: "externo anterior",
        villainPhilosophical: "filosofico anterior",
        initialIdentity: { name: "Estratega cansado", behavior: "posponer", belief: "necesito urgencia" },
        dreamline: { have: "tiempo", do: "crear", be: "lucido" },
        fearSetting: {
          whatIf: "fallo",
          prevent: "empezar pequeno",
          repair: "volver manana",
          partialWins: "aprender",
          cost6Months: "seguir igual",
          cost1Year: "normalizarlo",
          cost3Years: "alejarme",
        },
      },
      session: { status: "active" },
      memories: [],
      ledgerSummary: {
        prepCount: 0,
        challengeCount: 0,
        debriefCount: 0,
        integrationCount: 0,
        completedPreliminalCount: 0,
      },
      currentPractice: null,
    });

    expect(result).toMatchObject({ kind: "update", patch: expectedPatch });
  });

  it("resolves named practice references across the complete phase", () => {
    expect(resolvePracticeReference("quiero ver las instrucciones de Ganzfeld")).toBe("cycle4_ganzfeld");
    expect(resolvePracticeReference("muestrame el ciclo 7")).toBe("cycle7_postliminal_retrospective");
  });

  it("parses tutor-confirmed obstacle suggestions without saving tutor instructions", () => {
    const villains = parseVillains("Interno: creatividad bloqueada; Externo: sobrecarga de tareas; Filosofia: el mundo es hostil. Por favor, confirma si esta estructura es correcta.");
    expect(villains.villainInternal).toBe("creatividad bloqueada");
    expect(villains.villainExternal).toBe("sobrecarga de tareas");
    expect(villains.villainPhilosophical).toBe("el mundo es hostil");
  });

  it("renders progress without markdown-sensitive formatting", () => {
    const diagram = renderProgressDiagram({
      profile: { cadence: "weekly" },
      session: { status: "active", currentCycleId: "cycle2_social_fear" },
      memories: [],
      ledgerSummary: {
        prepCount: 1,
        challengeCount: 1,
        debriefCount: 1,
        integrationCount: 0,
        completedPreliminalCount: 1,
      },
      currentPractice: {
        cycleId: "cycle2_social_fear",
        title: "Reto social seguro",
        status: "active",
        plan: "pedir descuento sin presion",
      },
    });

    expect(diagram).toContain("FASE VI");
    expect(diagram).toContain("[");
  });

  it("renders next actions from the active cycle instead of stale first-cycle copy", () => {
    const diagram = renderProgressDiagram({
      profile: { cadence: "biweekly" },
      session: { status: "active", currentCycleId: "cycle3_niacin_primer" },
      memories: [],
      ledgerSummary: {
        prepCount: 0,
        challengeCount: 0,
        debriefCount: 2,
        integrationCount: 0,
        completedPreliminalCount: 2,
      },
      currentPractice: {
        cycleId: "cycle3_niacin_primer",
        title: "Ciclo 3 - Niacina e interpretacion del calor",
        status: "active",
        plan: "observar senal corporal",
      },
    });

    expect(diagram).toContain("revisar contraindicaciones");
    expect(diagram).not.toContain("NSDR mistico");
  });

  it("shows deferred practices without counting them as completed", () => {
    const diagram = renderProgressDiagram({
      profile: { cadence: "weekly" },
      session: { status: "active", currentCycleId: "cycle4_ganzfeld" },
      memories: [],
      ledgerSummary: {
        prepCount: 0,
        challengeCount: 0,
        debriefCount: 2,
        integrationCount: 0,
        completedPreliminalCount: 2,
      },
      currentPractice: {
        cycleId: "cycle4_ganzfeld",
        title: "Ciclo 4 - Liminar: homogeneizacion sensorial",
        status: "active",
        plan: "preparar campo uniforme",
      },
      deferredPractices: [{
        cycleId: "cycle3_niacin_primer",
        title: "Ciclo 3 - Preliminar: niacina e interpretacion del calor",
        reason: "restriccion temporal",
      }],
    });

    expect(diagram).toContain("67%");
    expect(diagram).toContain("Pendiente para retomar");
    expect(diagram).toContain("no cuenta como completada");
  });

  it("provides the same bounded recent conversation to the tutor prompt", () => {
    const recentMessages = Array.from({ length: 14 }, (_, index) => ({
      direction: index % 2 === 0 ? "inbound" as const : "outbound" as const,
      text: `mensaje-${index}`,
    }));
    const prompt = compilePrompt({
      id: "test",
      language: "es",
      systemPrompt: "system",
      assistantRouter: "router",
      knowledge: "knowledge",
      prevention: "prevention",
      practices: [],
    }, {
      session: { status: "active" },
      memories: [],
      recentMessages,
      ledgerSummary: {
        prepCount: 0,
        challengeCount: 0,
        debriefCount: 0,
        integrationCount: 0,
        completedPreliminalCount: 0,
      },
      currentPractice: null,
    }, "consulta");

    expect(prompt.userContext).not.toContain("usuario: mensaje-0\n");
    expect(prompt.userContext).not.toContain("tutor: mensaje-1\n");
    expect(prompt.userContext).toContain("usuario: mensaje-2\n");
    expect(prompt.userContext).toContain("tutor: mensaje-13\n");
  });

  it("rewrites memory by topic instead of appending duplicates", () => {
    const memory = normalizeMemoryLines([
      { topic: "identity.hero", line: "vieja" },
      { topic: "identity.hero", line: "nueva" },
    ]);

    expect(memory).toHaveLength(1);
    expect(memory[0]?.line).toBe("nueva");
  });

  it("chunks Telegram text below transport limit", () => {
    const chunks = chunkTelegramText("a ".repeat(5000), 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
  });

  it("builds debrief without per-practice scoring", () => {
    const debrief = buildDebrief("hice la practica");
    expect(debrief).toContain("hice la practica");
    expect(debrief).not.toContain("/10");
  });

  it("distinguishes evidence announcements from completed reports", () => {
    expect(assessPracticeEvidenceSignal("He realizado NSDR y quiero pasarte el reporte")).toMatchObject({
      kind: "announcement",
      reportedCycleId: "cycle1_prehypnos_nsdr",
    });

    expect(assessPracticeEvidenceSignal(
      "Realice NSDR durante 20 minutos con respiracion y antifaz. Pense que no podria relajarme, pero senti calma en el cuerpo y al final pude dormir mejor.",
    )).toMatchObject({
      kind: "sufficient",
      reportedCycleId: "cycle1_prehypnos_nsdr",
    });
  });

  it("keeps incomplete practice mentions from becoming debriefs", () => {
    expect(assessPracticeEvidenceSignal("Hice NSDR")).toMatchObject({
      kind: "partial",
      reportedCycleId: "cycle1_prehypnos_nsdr",
    });
    expect(assessPracticeEvidenceSignal("Por que NSDR es una buena herramienta?").kind).toBe("none");
  });
});
