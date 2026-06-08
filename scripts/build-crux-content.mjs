import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const cruxesDir = join(root, "cruxes");

for (const entry of readdirSync(cruxesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const cruxDir = join(cruxesDir, entry.name);
  const specificDir = join(cruxDir, "specific-functions");
  const systemPrompt = readRequired(join(cruxDir, "system.prompt.md"));
  const assistantRouter = readRequired(join(cruxDir, "assistants.md"));
  const knowledge = readRequired(join(specificDir, "knowledge-base.md"));
  const subPhasesPath = existsSync(join(specificDir, "sub-phases.md"))
    ? join(specificDir, "sub-phases.md")
    : join(specificDir, "cycles.md");
  const subPhases = readRequired(subPhasesPath);

  const source = `import type { CruxContent, PracticeDefinition } from "../../bridgecrux/core";

export const knowledgeBaseSource = ${JSON.stringify(knowledge)};

export const subPhasesSource = ${JSON.stringify(subPhases)};

const systemPrompt = ${JSON.stringify(systemPrompt)};

const assistantRouter = ${JSON.stringify(assistantRouter)};

export const arqueidentidadFase6Content: CruxContent = {
  id: ${JSON.stringify(entry.name)},
  language: "es",
  systemPrompt,
  assistantRouter,
  knowledge: knowledgeBaseSource,
  prevention: extractPrevention(knowledgeBaseSource),
  practices: parsePractices(subPhasesSource),
};

function extractPrevention(knowledge: string): string {
  return knowledge.split("\\n").filter((line) => /^(PREVENCION|PREVENCION_SIMPLE)::/.test(line)).join("\\n");
}

function parsePractices(source: string): PracticeDefinition[] {
  const blocks = source.split(/^---\\s*$/m).map((block) => block.trim()).filter(Boolean);
  const practices: PracticeDefinition[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const meta = parseFrontmatter(blocks[i] ?? "");
    const body = blocks[i + 1] ?? "";
    const id = meta.id;
    const title = meta.title;
    if (!id || !title) continue;
    practices.push({
      id,
      title,
      when: meta.when ?? "",
      tools: (meta.tools ?? "").split(",").map((tool) => tool.trim()).filter(Boolean),
      body,
    });
  }

  return practices;
}

function parseFrontmatter(source: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of source.split("\\n")) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\\s*(.*)$/);
    if (match?.[1]) fields[match[1]] = match[2]?.trim() ?? "";
  }
  return fields;
}
`;

  writeFileSync(join(cruxDir, "content.ts"), source);
  console.log(`generated ${entry.name}/content.ts`);
}

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`Missing required crux file: ${path}`);
  return readFileSync(path, "utf8").trimEnd();
}
