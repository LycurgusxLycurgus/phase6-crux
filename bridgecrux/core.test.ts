import { describe, expect, it } from "vitest";
import {
  buildDebrief,
  chunkTelegramText,
  classifyPracticeRequest,
  normalizeMemoryLines,
  parseCadence,
  parseCycleChoice,
  parseHeroIdentity,
  parseVillains,
  renderProgressDiagram,
} from "./core";

describe("BridgeCrux core", () => {
  it("blocks substance operation requests", () => {
    const gate = classifyPracticeRequest("quiero dosis de psilocibina para fase 6");
    expect(gate.blocked.length).toBeGreaterThan(0);
    expect(gate.alternative).toContain("NSDR");
  });

  it("adds prevention boundaries to sensitive practice requests", () => {
    const gate = classifyPracticeRequest("quiero hacer breathwork intenso y frio");
    expect(gate.warnings.length).toBeGreaterThan(0);
    expect(gate.alternative).toContain("conservadora");
  });

  it("parses onboarding answers", () => {
    expect(parseCadence("prefiero quincenal")).toBe("biweekly");
    expect(parseCycleChoice("B social")).toBe("cycle2_social_fear");
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
});
