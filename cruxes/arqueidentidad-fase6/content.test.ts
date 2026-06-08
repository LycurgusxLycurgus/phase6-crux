import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { arqueidentidadFase6Content, knowledgeBaseSource, subPhasesSource } from "./content";

const root = "cruxes/arqueidentidad-fase6";

describe("Arqueidentidad crux content", () => {
  it("keeps runtime content synced with specific-functions markdown", () => {
    expect(knowledgeBaseSource.trim()).toBe(readFileSync(join(root, "specific-functions/knowledge-base.md"), "utf8").trim());
    expect(subPhasesSource.trim()).toBe(readFileSync(join(root, "specific-functions/sub-phases.md"), "utf8").trim());
  });

  it("loads all MVP sub-phases from the canonical file", () => {
    expect(arqueidentidadFase6Content.practices.map((practice) => practice.id)).toEqual([
      "cycle0_intake",
      "cycle1_prehypnos_nsdr",
      "cycle2_social_fear",
      "cycle3_niacin_primer",
      "cycle4_ganzfeld",
      "cycle5_onirotechnology",
      "cycle6_enteogenic_reference",
      "cycle7_postliminal_retrospective",
    ]);
  });
});
