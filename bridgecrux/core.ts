export type Cadence = "weekly" | "biweekly";

export interface MemoryLine {
  topic: string;
  line: string;
  confidence?: number;
  updatedAt?: number;
}

export interface LedgerSummary {
  prepCount: number;
  challengeCount: number;
  debriefCount: number;
  integrationCount: number;
  completedPreliminalCount: number;
}

export interface CruxProfile {
  cadence?: Cadence;
  timezone?: string;
  heroName?: string;
  heroWhy?: string;
  villainInternal?: string;
  villainExternal?: string;
  villainPhilosophical?: string;
  limits?: string[];
}

export interface CruxSession {
  status: "onboarding" | "active" | "paused";
  onboardingStep?: "cadence" | "hero" | "villains" | "complete";
  currentCycleId?: string;
  currentPracticeId?: string;
}

export interface CruxState {
  userId?: string;
  telegramUserId?: string;
  profile?: CruxProfile;
  session?: CruxSession;
  memories: MemoryLine[];
  recentMessages?: Array<{
    direction: "inbound" | "outbound";
    text: string;
  }>;
  ledgerSummary: LedgerSummary;
  currentPractice?: {
    cycleId: string;
    title: string;
    status: "planned" | "active" | "completed" | "skipped";
    plan: string;
  } | null;
}

export interface PracticeDefinition {
  id: string;
  title: string;
  when: string;
  tools: string[];
  body: string;
}

export interface CruxContent {
  id: string;
  language: "es";
  systemPrompt: string;
  assistantRouter: string;
  knowledge: string;
  prevention: string;
  practices: PracticeDefinition[];
}

export interface PreventionBoundaryResult {
  allowed: string[];
  blocked: string[];
  warnings: string[];
  alternative?: string;
}

export interface CompiledPrompt {
  systemInstruction: string;
  userContext: string;
}

const RED_PATTERNS = [
  /\b(psilocibina|psilocybin|hongos|dmt|ayahuasca|lsd|mdma)\b/i,
  /\b(dosis|dosificar|microdosis|comprar|conseguir|proveedor|mezclar sustancias)\b/i,
  /\b(psicosis|mania|suicidio|suicida|esquizofrenia|bipolar)\b/i,
  /\b(tirarme|acostarme)\b.*\b(calle|avenida|trafico|transito|via publica)\b/i,
  /\b(aguantar respiracion bajo agua|respirar en piscina|frio extremo solo)\b/i,
];

const PREVENTION_PATTERNS = [
  /\b(niacina|galantamina|keto|cetosis|ayuno|fasting)\b/i,
  /\b(breathwork|hiperventilacion|respiracion intensa|holotropica)\b/i,
  /\b(hielo|frio|cold exposure|ducha fria|inmersion)\b/i,
  /\b(ganzfeld|privacion sensorial|tanque de flotacion|flotacion)\b/i,
  /\b(wbtb|mild|lucidez|sueno lucido|oniro)\b/i,
];

const GREEN_DEFAULTS = [
  "journaling",
  "NSDR suave",
  "dream recall",
  "reality checks",
  "visualizacion",
  "reto social seguro",
  "juego no estructurado",
];

export function classifyPracticeRequest(input: string): PreventionBoundaryResult {
  const text = input.trim();
  const blocked: string[] = [];
  const warnings: string[] = [];

  for (const pattern of RED_PATTERNS) {
    if (pattern.test(text)) {
      blocked.push("No guiar operacion, dosis, adquisicion, combinacion, ilegalidad o riesgo fisico/psiquiatrico.");
    }
  }

  if (blocked.length > 0) {
    return {
      allowed: ["Explicar la funcion buscada: liminalidad, plasticidad, juego y anclaje."],
      blocked,
      warnings: ["Si hay ideacion suicida, mania, psicosis, dolor toracico, desmayo o panico escalando, detener y buscar ayuda profesional/local."],
      alternative: "Sustituir por NSDR mistico, visualizacion con mascara/ruido suave, juego no estructurado y cierre del ciclo emocional.",
    };
  }

  for (const pattern of PREVENTION_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push("Esta practica necesita una version conservadora, contexto seguro y detenerse si aparece una senal fisica o psicologica rara.");
    }
  }

  if (warnings.length > 0) {
    return {
      allowed: ["Preparacion conservadora", "limites claros", "cierre posterior", "sin dosis ni prescripcion medica"],
      blocked: ["No doy dosis, protocolos medicos, combinaciones, adquisicion ni ejecucion riesgosa."],
      warnings,
      alternative: "Mantener una salida conservadora si aparece tension alta.",
    };
  }

  return {
    allowed: GREEN_DEFAULTS,
    blocked: [],
    warnings: [],
  };
}

export function renderProgressDiagram(state: CruxState): string {
  const cycleNumber = extractCycleNumber(state.session?.currentCycleId);
  const preliminal = preliminalProgress(state);
  const liminal = preliminal >= 100 ? 0 : 0;
  const postliminal = preliminal >= 100 && liminal >= 100 ? bar(0) : "bloqueado";
  const title = state.currentPractice?.title ?? "mapa inicial";
  const cadence = cadenceCopy(state.profile?.cadence);
  const status = state.session?.status ?? "onboarding";

  return [
    "ARQUEIDENTIDAD - FASE VI",
    "--------------------------------",
    `Estado: ${sessionStatusCopy(status)}`,
    `Ciclo: ${cycleNumber}/7 - ${title}`,
    `Ritmo: ${cadence}`,
    "",
    `Preliminar   ${bar(preliminal)}`,
    `Liminar      ${bar(liminal)}`,
    `Postliminar  ${postliminal}`,
    "",
    "Ahora:",
    nextActionLine(state),
  ].join("\n");
}

export function renderLearnMap(): string {
  return [
    "ARQUEIDENTIDAD",
    "--------------------------------",
    "Fase I - aun no disponible: Arquemetricas",
    "Fase II - aun no disponible: Tummoidentidad I",
    "Fase III - aun no disponible: interpretaciones espontaneas/controladas",
    "Fase IV - aun no disponible: compresion y microtematicas",
    "Fase V - aun no disponible: inmunizacion",
    "Fase VI - activa: Reto Final",
    "",
    "Mapa Fase VI:",
    "1. Preliminar: preparacion, NSDR, miedo social y control del umbral",
    "2. Liminar: ejecucion, homogeneizacion sensorial, onirotecnologia y experiencia proteica",
    "3. Postliminar: revisar toda la fase y programar repeticion trimestral/semestral",
  ].join("\n");
}

export function renderMemory(memory: MemoryLine[]): string {
  if (memory.length === 0) {
    return "MEMORIA COMPACTA\n--------------------------------\nTodavia no tengo una memoria estable de tu heroe. Usa /start y completa el mapa inicial.";
  }

  return [
    "MEMORIA COMPACTA",
    "--------------------------------",
    ...memory.map((line) => `${line.topic}:: ${line.line}`),
  ].join("\n");
}

export function renderPracticePlan(practice: PracticeDefinition): string {
  if (practice.id === "cycle1_prehypnos_nsdr") {
    return renderPreHypnosPractice();
  }

  if (practice.id === "cycle2_social_fear") {
    return renderSocialFearPractice();
  }

  if (practice.id === "cycle3_niacin_primer") {
    return renderNiacinPrimerPractice();
  }

  const lines = [
    `PRACTICA - ${practice.title}`,
    "--------------------------------",
    practice.body,
  ];

  lines.push("", "Siguiente umbral: cuando termines, cuentame que paso y yo hago el cierre contigo.");
  return lines.join("\n");
}

function renderPreHypnosPractice(): string {
  const lines = [
    "PRACTICA 1 - NSDR mistico hardcore",
    "--------------------------------",
    "Para que sirve:",
    "Vas a crear un estado vacio y plastico para que tu identidad elegida pueda aparecer sin forcejeo. No buscamos dormir ni actuar una experiencia mistica; buscamos maxima relajacion y una interpretacion nueva.",
    "",
    "Preparacion:",
    "1. Reserva 40 a 60 minutos. Si estas empezando, puedes hacer 10 a 20 y subir despues.",
    "2. Acuestate en un cuarto oscuro y tranquilo.",
    "3. Usa mascara de sueno si tienes.",
    "4. Usa audifonos con cancelacion si tienes; el loop de referencia es Weightless de Marconi Union.",
    "5. Silencia el telefono y deja tiempo para volver lento.",
    "",
    "Ejecucion:",
    "1. Respira por la nariz con suspiro fisiologico: inhalacion profunda, segunda inhalacion corta y exhalacion larga.",
    "2. Recorre el cuerpo desde los pies hasta la cabeza.",
    "3. En cada zona, imagina que se relaja al maximo.",
    "4. Elige una interpretacion fisica: pesado y hundiendose, o ligero y elevandose.",
    "5. Haz una segunda pasada sintiendo todo el cuerpo: temperatura, relajacion, peso o levedad.",
    "6. Suelta el control de la visualizacion y deja que aparezca el estado proteico.",
    "7. Vuelve lentamente: dedos, pies, ojos, postura.",
    "",
    "Ancla:",
    "Escribe una frase con tres partes: que ruido se vacio, que identidad aparecio y que hipertematica quieres conservar.",
    "",
    "Prevencion breve:",
    "Hazlo en un lugar seguro, nunca manejando, en agua ni donde quedarte dormido sea peligroso. Si aparece panico fuerte, disociacion, dolor raro o urgencia real, paras y adaptamos.",
    "",
    "Cuando termines, cuentame en lenguaje normal que paso, que interpretacion aparecio, que sentiste y que cambio notaste.",
  ];

  return lines.join("\n");
}

function renderSocialFearPractice(): string {
  const lines = [
    "PRACTICA 2 - Exposicion al miedo social",
    "--------------------------------",
    "Para que sirve:",
    "Vas a entrenar una interpretacion nueva bajo la mirada social. El objetivo no es humillarte ni impresionar a nadie: es descubrir que la mirada de otros no tiene que poseer tu identidad.",
    "",
    "Ejecucion de referencia:",
    "1. Elige un lugar publico, poblado y seguro: parque, zona amplia o espacio donde no bloquees a nadie.",
    "2. Define antes tu hipertematica. Ejemplo: la mirada no toca mi cuerpo; esto es juego; soy libre aunque me miren.",
    "3. Acuestate boca arriba en el suelo.",
    "4. Permanece quieto de 3 a 5 minutos.",
    "5. Cuando suba la verguenza, observa la microtematica: necesito explicar, me estan juzgando, debo escapar.",
    "6. Inyecta la hipertematica hasta que la mirada social cambie de amenaza a material de libertad.",
    "7. Levantate y sal del lugar con calma, sin dar explicaciones a los demas.",
    "",
    "Prevencion breve:",
    "El lugar debe ser legal y fisicamente seguro. Evita vias, entradas, pasillos estrechos, propiedad privada, zonas sensibles, grabar terceros, bloquear personas o crear una escena que obligue a otros a intervenir.",
    "",
    "Si tu contexto no permite acostarte en publico, lo escalamos hacia abajo sin perder la funcion: exposicion directa a la mirada social + hipertematica.",
    "",
    "Cierre:",
    "Cuando termines, cuentame que hiciste, que microtematica aparecio, que hipertematica elegiste y que identidad salio mas libre.",
  ];

  return lines.join("\n");
}

function renderNiacinPrimerPractice(): string {
  return [
    "PRACTICA 3 - Niacina e interpretacion del calor",
    "--------------------------------",
    "Para que sirve:",
    "Vas a entrenar la interpretacion de una senal corporal intensa. El punto no es la niacina por si misma; el punto es ver como el cuerpo intenta imponer la historia de amenaza y transformarla en energia.",
    "",
    "Ejecucion:",
    "1. Confirma primero que no hay una razon medica, alergica o de medicacion para evitar niacina.",
    "2. Prepara una hipertematica antes de cualquier senal corporal: esto es activacion, esto es plasticidad, esto es energia del heroe.",
    "3. Cuando aparezca calor, rubor, cosquilleo o activacion, no lo pelees.",
    "4. Observa la primera etiqueta automatica: peligro, incomodidad, verguenza, impaciencia o panico.",
    "5. Intercepta esa etiqueta con la hipertematica.",
    "6. Inclinate hacia la interpretacion elegida hasta que la sensacion se vuelva activacion y no amenaza.",
    "7. Cierra escribiendo: senal corporal, microtematica, hipertematica y accion que se volvio mas facil.",
    "",
    "Prevencion breve:",
    "No personalizo dosis, marcas, combinaciones ni decisiones medicas. Si no estas usando niacina con criterio claro, hacemos la version sin suplemento: calor despues de caminar, rubor natural, tension leve o activacion corporal.",
    "",
    "Cierre:",
    "Cuando termines, cuentame que senal aparecio, que historia queria imponer, que hipertematica elegiste y que accion nacio.",
  ].join("\n");
}

export function compilePrompt(content: CruxContent, state: CruxState, userMessage: string): CompiledPrompt {
  const practice = content.practices.find((item) => item.id === state.session?.currentCycleId);
  const memories = state.memories.length > 0
    ? state.memories.map((line) => `${line.topic}:: ${line.line}`).join("\n")
    : "memory.empty:: aun no hay memoria estable";
  const profile = JSON.stringify(state.profile ?? {}, null, 2);

  const userContext = [
    "RUTAS DEL TUTOR",
    content.assistantRouter,
    "",
    "CONOCIMIENTO COMPACTO",
    content.knowledge,
    "",
    "PREVENCION",
    content.prevention,
    "",
    "PRACTICA ACTIVA",
    practice ? `${practice.title}\n${practice.body}` : "No hay practica activa. Llevar al usuario al mapa inicial o a la primera practica segura.",
    "",
    "MEMORIA DEL USUARIO",
    memories,
    "",
    "PERFIL",
    profile,
    "",
    "PROGRESO",
    renderProgressDiagram(state),
    "",
    "MENSAJE DEL USUARIO",
    userMessage,
  ].join("\n");

  return {
    systemInstruction: content.systemPrompt,
    userContext,
  };
}

export function getToolDeclarations(): unknown[] {
  return [
    {
      name: "get_user_state",
      description: "Cargar perfil, sesion, memoria compacta, practica actual y resumen de progreso del usuario.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "update_user_profile",
      description: "Actualizar cadencia, zona horaria, identidad del heroe, villanos o limites.",
      parameters: {
        type: "object",
        properties: {
          cadence: { type: "string", enum: ["weekly", "biweekly"] },
          heroName: { type: "string" },
          heroWhy: { type: "string" },
          villainInternal: { type: "string" },
          villainExternal: { type: "string" },
          villainPhilosophical: { type: "string" },
          limits: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "start_practice_cycle",
      description: "Crear o reanudar un ciclo de practica de Fase VI.",
      parameters: {
        type: "object",
        properties: {
          cycleId: { type: "string", enum: ["cycle0_intake", "cycle1_prehypnos_nsdr", "cycle2_social_fear", "cycle3_niacin_primer", "cycle4_ganzfeld", "cycle5_onirotechnology", "cycle6_enteogenic_reference", "cycle7_postliminal_retrospective"] },
          cadence: { type: "string", enum: ["weekly", "biweekly"] },
        },
        required: ["cycleId"],
      },
    },
    {
      name: "log_practice_event",
      description: "Guardar evidencia de practica, tipo de evento y recompensa.",
      parameters: {
        type: "object",
        properties: {
          eventType: { type: "string", enum: ["prep", "challenge", "debrief", "integration", "recovery"] },
          evidence: { type: "string" },
          reward: { type: "string" },
        },
        required: ["eventType", "evidence"],
      },
    },
    {
      name: "create_debrief",
      description: "Transformar evidencia cruda en cierre por ciclo emocional.",
      parameters: {
        type: "object",
        properties: {
          rawDebrief: { type: "string" },
        },
        required: ["rawDebrief"],
      },
    },
    {
      name: "update_memory",
      description: "Reescribir memorias compactas de una linea. Reemplazar lineas viejas o debiles.",
      parameters: {
        type: "object",
        properties: {
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                topic: { type: "string" },
                line: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["topic", "line"],
            },
          },
        },
        required: ["lines"],
      },
    },
    {
      name: "render_progress_diagram",
      description: "Devolver un diagrama de texto seguro para Telegram con el progreso de Fase VI.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "create_bridgecrux_report",
      description: "Crear un reporte interno por errores, conocimiento faltante, seguridad o fallos reportados.",
      parameters: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["info", "bug", "safety", "missing_knowledge", "tool_error"] },
          summary: { type: "string" },
        },
        required: ["severity", "summary"],
      },
    },
    {
      name: "send_telegram_message",
      description: "Enviar un mensaje de texto plano seguro para Telegram. Usar solo cuando haga falta.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
      },
    },
  ];
}

export function choosePractice(practices: PracticeDefinition[], cycleId?: string): PracticeDefinition {
  const id = cycleId ?? "cycle1_prehypnos_nsdr";
  return practices.find((item) => item.id === id) ?? practices[0] ?? fallbackPractice(id);
}

function fallbackPractice(requestedCycleId: string): PracticeDefinition {
  return {
    id: "cycle1_prehypnos_nsdr",
    title: "Ciclo 1 - Preliminar: descanso profundo sin sueno",
    when: `Fallback runtime; requested cycle ${requestedCycleId}.`,
    tools: ["start_practice_cycle", "log_practice_event", "create_debrief"],
    body: [
      "PROPOSITO:: bajar ruido antes de elegir una interpretacion.",
      "HACER:: 10-20 min sentado o acostado en un lugar seguro | respiracion nasal suave | recorrido corporal pies a cabeza | cierre escrito breve.",
      "NO_HACER:: respiracion intensa, sustancias, frio, agua, conduccion o privacion extrema durante la practica.",
      "PREPARAR:: telefono en silencio | postura comoda | salida clara si aparece ansiedad alta.",
      "CIERRE:: evento | interpretacion | accion | resultado.",
    ].join("\n"),
  };
}

export function parseCycleChoice(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\b(0|intake|contenedor)\b/.test(lower)) return "cycle0_intake";
  if (/\b(1|a|pre|hypnos|hipnos|nsdr)\b/.test(lower)) return "cycle1_prehypnos_nsdr";
  if (/\b(2|b|social|miedo|descuento|speech)\b/.test(lower)) return "cycle2_social_fear";
  if (/\b(3|niacina|calor|flush)\b/.test(lower)) return "cycle3_niacin_primer";
  if (/\b(4|ganzfeld|homogeneizacion)\b/.test(lower)) return "cycle4_ganzfeld";
  if (/\b(5|oniro|sueno|lucido|mild|wbtb)\b/.test(lower)) return "cycle5_onirotechnology";
  if (/\b(6|enteogeno|psilocibina|dmt)\b/.test(lower)) return "cycle6_enteogenic_reference";
  if (/\b(7|postliminar|retrospectiva|cierre final)\b/.test(lower)) return "cycle7_postliminal_retrospective";
  return null;
}

export function parseCadence(text: string): Cadence | null {
  const lower = normalizeForParsing(text);
  if (/\b(bi|quincenal|14|dos semanas)\b/.test(lower)) return "biweekly";
  if (/\b(semanal|weekly|7|semana)\b/.test(lower)) return "weekly";
  return null;
}

export function isClarificationRequest(text: string): boolean {
  const lower = normalizeForParsing(text);
  return /[?]/.test(text)
    || /\b(como asi|que significa|no entiendo|explica|explicame|no se|que es|cual es la diferencia|por que|para que)\b/.test(lower);
}

export function parseVillains(text: string): Pick<CruxProfile, "villainInternal" | "villainExternal" | "villainPhilosophical"> {
  const normalized = normalizeForParsing(text);
  const internal = findLabeledValue(normalized, ["interno", "internal"]);
  const external = findLabeledValue(normalized, ["externo", "external"]);
  const philosophical = findLabeledValue(normalized, ["filosofico", "filosofica", "filosofia", "philosophical"]);

  if (internal || external || philosophical) {
    const parsed: Pick<CruxProfile, "villainInternal" | "villainExternal" | "villainPhilosophical"> = {};
    if (internal) parsed.villainInternal = internal;
    if (external) parsed.villainExternal = external;
    if (philosophical) parsed.villainPhilosophical = cleanTutorInstructionTail(philosophical);
    return parsed;
  }

  const parts = text.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean);
  const parsed: Pick<CruxProfile, "villainInternal" | "villainExternal" | "villainPhilosophical"> = {};
  if (parts[0]) parsed.villainInternal = parts[0];
  if (parts[1]) parsed.villainExternal = parts[1];
  if (parts[2]) parsed.villainPhilosophical = parts[2];
  return parsed;
}

export function cleanTutorInstructionTail(text: string): string {
  return text
    .replace(/\s+(por favor|confirma|ajusta|responde|usa esta estructura)\b[\s\S]*$/i, "")
    .trim()
    .replace(/[;,.]+$/g, "")
    .trim();
}

export function parseHeroIdentity(text: string): Pick<CruxProfile, "heroName" | "heroWhy"> {
  const normalized = normalizeForParsing(text);
  const name = findLabeledValue(normalized, ["nombre", "heroe", "identidad"]);
  const why = findLabeledValue(normalized, ["porque", "por que", "why", "razon"]);

  if (name || why) {
    const parsed: Pick<CruxProfile, "heroName" | "heroWhy"> = {};
    if (name) parsed.heroName = name;
    if (why) parsed.heroWhy = why;
    return parsed;
  }

  const becauseMatch = normalized.match(/^(.+?)\s+(?:porque|por que|para|ya que)\s+(.+)$/);
  if (becauseMatch?.[1] && becauseMatch[2]) {
    return {
      heroName: becauseMatch[1].trim(),
      heroWhy: becauseMatch[2].trim(),
    };
  }

  return {};
}

export function buildDebrief(raw: string): string {
  return [
    "CIERRE DE PRACTICA",
    "--------------------------------",
    `Evidencia: ${raw.trim()}`,
    "",
    "Ciclo emocional:",
    "evento -> interpretacion -> deseo -> accion -> emocion -> resultado/restart",
    "",
    "Ancla:",
    "Que microtematica apareció y que hipertematica quieres conservar?",
  ].join("\n");
}

export function normalizeMemoryLines(lines: MemoryLine[], maxLines = 12): MemoryLine[] {
  const byTopic = new Map<string, MemoryLine>();

  for (const line of lines) {
    const topic = normalizeTopic(line.topic);
    const content = line.line.trim().replace(/\s+/g, " ");
    if (!topic || !content) continue;
    const normalized: MemoryLine = {
      topic,
      line: content.slice(0, 220),
      confidence: line.confidence ?? 0.7,
    };
    if (line.updatedAt !== undefined) normalized.updatedAt = line.updatedAt;
    byTopic.set(topic, normalized);
  }

  return Array.from(byTopic.values()).slice(0, maxLines);
}

export function buildMemoryCandidates(state: CruxState, observation: string): MemoryLine[] {
  const current = normalizeMemoryLines(state.memories);
  const next = [...current];
  const trimmed = observation.trim().replace(/\s+/g, " ");

  if (state.profile?.heroName) {
    next.push({
      topic: "identity.hero",
      line: `Se nombra como "${state.profile.heroName}"${state.profile.heroWhy ? ` porque ${state.profile.heroWhy}` : ""}; entrena control lucido sin rigidez y libertad sin caos.`,
      confidence: 0.75,
    });
  }

  if (state.session?.currentCycleId) {
    next.push({
      topic: "phase6.current",
      line: `Trabaja ${state.session.currentCycleId}; ultima evidencia: ${trimmed.slice(0, 120) || "pendiente"}.`,
      confidence: 0.65,
    });
  }

  return normalizeMemoryLines(next);
}

export function chunkTelegramText(text: string, maxLength = 3900): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength);
    const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const safeBreak = breakAt > 500 ? breakAt : maxLength;
    chunks.push(remaining.slice(0, safeBreak).trim());
    remaining = remaining.slice(safeBreak).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function bar(percent: number): string {
  const filled = Math.round(clampPercent(percent) / 10);
  return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}] ${clampPercent(percent)}%`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function boundedScore(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function extractCycleNumber(cycleId?: string): number {
  const match = cycleId?.match(/cycle(\d+)/);
  return match ? Number(match[1]) : 0;
}

function preliminalProgress(state: CruxState): number {
  if (state.session?.status === "onboarding") return 0;
  const completedPreliminal = Math.min(3, state.ledgerSummary.completedPreliminalCount);
  return Math.round((completedPreliminal / 3) * 100);
}

function nextActionLine(state: CruxState): string {
  if (state.session?.status === "onboarding") {
    return "Completa tu mapa inicial con /start.";
  }
  if (!state.currentPractice) {
    return "Elige una practica con /practice.";
  }
  if (state.session?.currentCycleId === "cycle2_social_fear") {
    return "1. reto social seguro; 2. observar interpretacion automatica; 3. contar que paso.";
  }
  if (state.ledgerSummary.prepCount === 0) {
    return "1. NSDR mistico; 2. ancla breve; 3. contar que paso para cerrar.";
  }
  return "Cierra el ciclo contando que paso y que cambio observaste.";
}

function cadenceCopy(cadence?: Cadence): string {
  if (cadence === "weekly") return "semanal";
  if (cadence === "biweekly") return "quincenal";
  return "sin definir";
}

function sessionStatusCopy(status: string): string {
  if (status === "onboarding") return "creando mapa inicial";
  if (status === "active") return "en practica";
  if (status === "paused") return "en pausa";
  return status;
}

function findLabeledValue(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|[;\\n]|\\by\\s+)\\s*${label}\\s*[:=-]\\s*([\\s\\S]*?)(?=\\s*(?:[;\\n]|\\by\\s+)?(?:nombre|heroe|identidad|porque|por que|why|razon|interno|internal|externo|external|filosofico|filosofica|filosofia|philosophical)\\s*[:=-]|$)`,
      "i",
    );
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[;,.]+$/g, "").trim();
  }
  return undefined;
}

function normalizeForParsing(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "");
}
