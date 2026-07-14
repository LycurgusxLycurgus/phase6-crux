import type { DailyHabitDefinition } from "./habits";

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
  routineStartDate?: string;
  cheatDayOfWeek?: number;
  emptyDayOfWeek?: number;
  emptyDayEnabled?: boolean;
  dreamline?: {
    have: string;
    do: string;
    be: string;
  };
  fearSetting?: {
    whatIf: string;
    prevent: string;
    repair: string;
    partialWins: string;
    cost6Months: string;
    cost1Year: string;
    cost3Years: string;
  };
  initialIdentity?: {
    name: string;
    behavior: string;
    belief: string;
  };
  heroName?: string;
  heroWhy?: string;
  villainInternal?: string;
  villainExternal?: string;
  villainPhilosophical?: string;
  limits?: string[];
}

export interface CruxSession {
  status: "onboarding" | "active" | "paused";
  onboardingStep?: "cadence" | "dreamline" | "fear_setting" | "initial_identity" | "villains" | "hero" | "extra_habits" | "routine_days" | "complete";
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
  deferredPractices?: Array<{
    cycleId: string;
    title: string;
    reason?: string;
  }>;
  dailyHabits?: DailyHabitDefinition[];
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

export interface PracticeEvidenceSignal {
  kind: "none" | "announcement" | "partial" | "sufficient";
  reportedCycleId?: string;
  evidenceDimensions: Array<"execution" | "interpretation" | "body" | "result">;
}

export interface IdentityMapPatch {
  dreamline?: {
    have: string;
    do: string;
    be: string;
    updatedAt: number;
  };
  fearSetting?: {
    whatIf: string;
    prevent: string;
    repair: string;
    partialWins: string;
    cost6Months: string;
    cost1Year: string;
    cost3Years: string;
    updatedAt: number;
  };
  heroName?: string;
  heroWhy?: string;
  villainInternal?: string;
  villainExternal?: string;
  villainPhilosophical?: string;
  initialIdentity?: {
    name: string;
    behavior: string;
    belief: string;
    updatedAt: number;
  };
}

export type IdentityMapPatchResult =
  | { kind: "none" }
  | { kind: "needs_field" }
  | { kind: "update"; patch: IdentityMapPatch; message: string };

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
      blocked: [],
      warnings,
      alternative: "Incluir solo una nota breve de prevencion dentro de la explicacion normal.",
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
  const deferred = state.deferredPractices?.length
    ? [
      "",
      "Pendiente para retomar:",
      ...state.deferredPractices.map((practice) =>
        `- ${practice.title} (postergada; no cuenta como completada)`
      ),
    ]
    : [];

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
    ...deferred,
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
    return [
      "MEMORIA ESTABLE",
      "--------------------------------",
      "Todavia no hay recuerdos estables suficientes.",
      "Solo conservo rasgos de identidad, preferencias, limites, correcciones explicitas y patrones que se repiten; la conversacion casual queda fuera.",
    ].join("\n");
  }

  return [
    "MEMORIA ESTABLE",
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

  if (practice.id === "cycle4_ganzfeld") {
    return renderGanzfeldPractice();
  }

  if (practice.id === "cycle5_onirotechnology") {
    return renderOnirotechnologyPractice();
  }

  if (practice.id === "cycle6_enteogenic_reference") {
    return renderEnteogenicReferencePractice();
  }

  if (practice.id === "cycle7_postliminal_retrospective") {
    return renderPostliminalRetrospectivePractice();
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

function renderGanzfeldPractice(): string {
  return [
    "PRACTICA 4 - Homogeneizacion sensorial",
    "--------------------------------",
    "Para que sirve:",
    "Vas a entrar en el primer umbral liminar: reducir informacion visual y auditiva hasta que la mente empiece a generar patrones propios. La practica no consiste en perseguir visiones; consiste en observar que interpretacion intenta imponerse cuando el estimulo externo se vuelve uniforme.",
    "",
    "Preparacion:",
    "1. Reserva hasta 60 minutos. Si es tu primera vez, puedes empezar con menos tiempo y subir despues.",
    "2. Usa un espacio quieto, privado y fisicamente seguro.",
    "3. Prepara un campo visual uniforme. La referencia clasica usa dos mitades limpias de una pelota de ping-pong sobre los ojos.",
    "4. Coloca una luz roja suave frente al rostro para crear un campo visual estable.",
    "5. Usa ruido blanco o rosa a volumen moderado, idealmente con audifonos que aislen bien.",
    "",
    "Ejecucion:",
    "1. Acuestate o sientate sin tener que sostener tension.",
    "2. Deja los ojos abiertos bajo el campo uniforme.",
    "3. Permanece quieto y no busques una experiencia especial.",
    "4. Si aparecen nieve visual, imagenes, formas, impresiones auditivas o asociaciones raras, observalas sin convertirlas en amenaza.",
    "5. Detecta la microtematica: que historia automatica intenta imponer tu mente.",
    "6. Elige una hipertematica: esto es patron naciendo del ruido; esto es plasticidad; esto es orden apareciendo sin fuerza.",
    "7. Al salir, vuelve lento y registra lo visto antes de explicarlo demasiado.",
    "",
    "Prevencion breve:",
    "Evitala si hoy hay panico fuerte, desrealizacion intensa, migraña activa, sensibilidad visual importante, mania, psicosis o una sensacion de inestabilidad. Si la experiencia se vuelve desorganizante, paras y vuelves a orientarte en el cuarto.",
    "",
    "Cierre:",
    "Cuando termines, cuentame que aparecio, que interpretacion intento tomar el control, que hipertematica elegiste y que identidad sostuvo mejor el umbral.",
  ].join("\n");
}

function renderOnirotechnologyPractice(): string {
  return [
    "PRACTICA 5 - Onirotecnologia",
    "--------------------------------",
    "Para que sirve:",
    "Vas a entrenar memoria onirica y lucidez. El objetivo es que tu identidad aprenda a reconocer estados, patrones y signos incluso cuando la experiencia cambia de reglas.",
    "",
    "Preparacion diaria:",
    "1. Apenas despiertes, escribe fragmentos de sueño antes de mirar el telefono o hablar de otra cosa.",
    "2. Durante el dia, elige un disparador que ya ocurra: puertas, revisar la hora, mirar el celular o sentir una emocion fuerte.",
    "3. Cada vez que aparezca el disparador, pregunta: estoy soñando?",
    "4. Compruebalo leyendo un texto dos veces o mirando dos veces un patron.",
    "",
    "Practica nocturna dos veces por semana:",
    "1. Duerme unas 5 horas.",
    "2. Despierta de 10 a 20 minutos. Si lo toleras bien, otro dia puedes probar mas tiempo.",
    "3. Recuerda el ultimo sueño o un signo onirico probable.",
    "4. Visualiza que notas ese signo dentro del sueño.",
    "5. Repite con calma: la proxima vez que este soñando, recordare que estoy soñando.",
    "6. Vuelve a dormir lo mas rapido posible.",
    "",
    "Si aparece lucidez:",
    "1. No te emociones de golpe.",
    "2. Mira tus manos, frota las manos o gira suavemente para estabilizar.",
    "3. Haz una accion elegida antes de dormir: observar, preguntar, crear un simbolo o activar tu identidad.",
    "",
    "Prevencion breve:",
    "No sacrifiques sueño de forma agresiva. Si el metodo te deja irritable, ansioso o agotado, bajamos intensidad y volvemos a recuerdo de sueños + chequeos de realidad.",
    "",
    "Cierre:",
    "Cuentame que recordaste, que signo aparecio, que chequeo hiciste y como cambio tu relacion con el sueño.",
  ].join("\n");
}

function renderEnteogenicReferencePractice(): string {
  return [
    "PRACTICA 6 - Umbral enteogenico de referencia",
    "--------------------------------",
    "Para que sirve:",
    "Esta sub-fase funciona como marco de discernimiento, no como instruccion operativa. La pregunta de Fase VI es si una experiencia intensa se vuelve mas cosmica, ordenadora y creativa, o mas caotica, fragmentada y desestabilizante.",
    "",
    "Trabajo permitido aqui:",
    "1. Revisar intencion, contexto, identidad y limites.",
    "2. Comparar experiencias intensas con practicas conservadoras: NSDR hardcore, homogeneizacion sensorial, onirotecnologia, frio o ayuno cuando aplique.",
    "3. Distinguir expansion proteica de desorganizacion.",
    "4. Preparar integracion: que interpretacion conservar, que habito nace y que evidencia lo sostiene.",
    "",
    "Criterio de decision:",
    "Si una practica vuelve todo mas caotico que cosmico, no se intensifica. Se vuelve a NSDR hardcore, sueño, alimentacion, rutina y practicas seguras hasta recuperar estructura.",
    "",
    "Prevencion breve:",
    "No doy instrucciones de adquisicion, dosis, combinaciones ni uso de sustancias. Tampoco se debe jugar con esto si hay historia personal o familiar de psicosis, esquizofrenia, bipolaridad, mania, desestabilizacion severa o medicacion incompatible. Si hay duda, se consulta con un profesional calificado.",
    "",
    "Cierre:",
    "Cuentame que umbral estas evaluando, que limite necesitas respetar, que practica conservadora puede darte informacion parecida y que identidad debe sostener la integracion.",
  ].join("\n");
}

function renderPostliminalRetrospectivePractice(): string {
  return [
    "PRACTICA 7 - Retrospectiva postliminar",
    "--------------------------------",
    "Para que sirve:",
    "Vas a cerrar Fase VI convirtiendo experiencias en criterio. Aqui no buscamos acumular mas intensidad; buscamos decidir que practicas fueron mas proteicas para ti: cuales aumentaron plasticidad, adaptabilidad, energia, unidad o claridad sin romperte.",
    "",
    "Revision:",
    "1. Mira la fase preliminar: NSDR, miedo social y niacina o su version adaptada.",
    "2. Mira la fase liminar: homogeneizacion sensorial, onirotecnologia y umbral enteogenico como marco de discernimiento.",
    "3. Identifica la practica que mas energia te dio despues, no solo durante.",
    "4. Identifica la practica que mas aumento tu sensacion de unidad, creatividad o flexibilidad.",
    "5. Identifica que microtematica se repitio y que hipertematica funciono mejor.",
    "",
    "Decision:",
    "1. Actualiza tu identidad con evidencia real.",
    "2. Elige que habito o creencia se queda en tu rutina Quest.",
    "3. Decide si quieres repetir Fase VI trimestral o semestralmente.",
    "",
    "Cierre:",
    "Cuentame cual practica fue mas proteica, que identidad quedo mas viva, que habito se queda y cada cuanto quieres repetir la fase.",
  ].join("\n");
}

export function compilePrompt(content: CruxContent, state: CruxState, userMessage: string): CompiledPrompt {
  const practice = content.practices.find((item) => item.id === state.session?.currentCycleId);
  const memories = state.memories.length > 0
    ? state.memories.map((line) => `${line.topic}:: ${line.line}`).join("\n")
    : "memory.empty:: aun no hay memoria estable";
  const profile = JSON.stringify(state.profile ?? {}, null, 2);
  const recentConversation = (state.recentMessages ?? [])
    .slice(-12)
    .map((message) => `${message.direction === "inbound" ? "usuario" : "tutor"}: ${message.text.slice(0, 800)}`)
    .join("\n---\n") || "sin conversacion reciente";

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
    "CONVERSACION RECIENTE",
    recentConversation,
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

export function getToolDeclarations(route?: string, intent?: string): unknown[] {
  const declarations = [
    {
      name: "get_daily_habit_state",
      description: "Cargar rutina diaria, dia local, cheat day, empty day, habitos activos, pendientes y practica de fase activa.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "mark_daily_habits_done",
      description: "Marcar uno o varios habitos diarios como completados para la fecha local actual.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          habitKeys: { type: "array", items: { type: "string" } },
        },
        required: ["text"],
      },
    },
    {
      name: "render_daily_habit_tui",
      description: "Devolver panel de texto Telegram-safe de la rutina nucleo diaria.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "set_cheat_day",
      description: "Configurar el dia semanal sin notificaciones de habitos.",
      parameters: {
        type: "object",
        properties: {
          weekday: { type: "number" },
        },
        required: ["weekday"],
      },
    },
    {
      name: "add_core_routine_habit",
      description: "Agregar un nuevo habito diario al core routine si hay slot desbloqueado, maximo cuatro incluyendo Tummo-Identidad.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title"],
      },
    },
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
      description: "Actualizar cadencia, zona horaria, identidad inicial, identidad final, retos o limites.",
      parameters: {
        type: "object",
        properties: {
          cadence: { type: "string", enum: ["weekly", "biweekly"] },
          initialIdentity: {
            type: "object",
            properties: {
              name: { type: "string" },
              behavior: { type: "string" },
              belief: { type: "string" },
              updatedAt: { type: "number" },
            },
          },
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
  return declarations.filter((declaration) => isAgentToolAuthorized(declaration.name, route, intent));
}

export function isAgentToolAuthorized(name: string, route?: string, intent?: string): boolean {
  if (name === "get_daily_habit_state" || name === "render_daily_habit_tui" || name === "get_user_state"
    || name === "render_progress_diagram" || name === "send_telegram_message") {
    return true;
  }
  if (name === "mark_daily_habits_done") {
    return (route === "daily_habit" && (intent === "confirm_daily_habit" || intent === "partial_daily_habit"))
      || (route === "debrief" && intent === "submit_mixed_evidence");
  }
  if (name === "set_cheat_day") {
    return route === "habit_status" && (intent === "set_cheat_day" || intent === "set_routine_days");
  }
  if (name === "add_core_routine_habit") {
    return route === "daily_habit" && intent === "add_core_habit";
  }
  if (name === "update_user_profile") {
    return route === "settings" && (intent === "edit_identity_map" || intent === "change_settings");
  }
  if (name === "log_practice_event" || name === "create_debrief") {
    return route === "debrief" && (intent === "submit_evidence" || intent === "submit_mixed_evidence");
  }
  if (name === "create_bridgecrux_report") {
    return route === "report" && intent === "report_problem";
  }
  return false;
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
  const internal = findLabeledValue(normalized, ["reto interno", "interno", "internal"]);
  const external = findLabeledValue(normalized, ["reto externo", "externo", "external"]);
  const philosophical = findLabeledValue(normalized, ["reto filosofico", "filosofico", "filosofica", "filosofia", "philosophical"]);

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

const IDENTITY_MAP_LABELS = {
  external: ["reto externo", "externo"],
  internal: ["reto interno", "interno"],
  philosophical: ["reto filosofico", "filosofico", "filosofia"],
  finalIdentity: [
    "nombre de mi identidad final",
    "nombre de la identidad final",
    "nombre de identidad final",
    "nombre identidad final",
    "identidad final",
    "nombre del heroe final",
    "heroe final",
    "heroe",
  ],
  finalWhy: ["por que final", "porque final", "por que", "porque"],
  initialName: ["nombre de mi identidad inicial", "nombre de la identidad inicial", "nombre identidad inicial", "identidad inicial"],
  initialBehavior: ["comportamiento inicial", "comportamiento actual"],
  initialBelief: ["creencia inicial", "historia inicial", "creencia actual", "historia actual"],
  dreamHave: ["dreamline tener", "quiero tener"],
  dreamDo: ["dreamline hacer", "quiero hacer"],
  dreamBe: ["dreamline ser", "quiero ser"],
  fearWhatIf: ["fear setting que tal si", "fear-setting que tal si", "que tal si"],
  fearPrevent: ["fear setting prevenir", "fear-setting prevenir", "prevenir"],
  fearRepair: ["fear setting reparar", "fear-setting reparar", "reparar"],
  fearPartialWins: ["ganancia de exito parcial", "ganancias de exito parcial", "ganancia parcial"],
  fearCost6Months: ["costo de inaccion 6 meses", "costo 6 meses"],
  fearCost1Year: ["costo de inaccion 1 ano", "costo 1 ano"],
  fearCost3Years: ["costo de inaccion 3 anos", "costo 3 anos"],
} as const;

const IDENTITY_MAP_BOUNDARY_LABELS = Object.values(IDENTITY_MAP_LABELS)
  .flat()
  .sort((left, right) => right.length - left.length);

const IDENTITY_MAP_CORRECTION_ACTION = /\b(cambia|cambiar|corrige|corregir|actualiza|actualizar|agrega|agregar|agreguemos|anade|anadir|sumar|suma|modifica|modificar|incluye|incluir)\b/;
const IDENTITY_MAP_SIGNAL_LABELS = [
  "mapa",
  "identidad",
  "reto",
  "dreamline",
  "fear setting",
  "fear-setting",
  ...IDENTITY_MAP_BOUNDARY_LABELS.filter((label) => label !== "porque" && label !== "por que"),
].map(normalizeForParsing);

export function isIdentityMapCorrectionSignal(text: string): boolean {
  const normalized = normalizeForParsing(text);
  return IDENTITY_MAP_CORRECTION_ACTION.test(normalized)
    && IDENTITY_MAP_SIGNAL_LABELS.some((label) => normalized.includes(label));
}

export function parseIdentityMapPatch(text: string, state: CruxState): IdentityMapPatchResult {
  const normalized = normalizeForParsing(text);
  if (!isIdentityMapCorrectionSignal(text)) return { kind: "none" };

  const append = /\b(agrega|agregar|agreguemos|anade|anadir|sumar|suma|incluye|incluir)\b/.test(normalized);
  const patch: IdentityMapPatch = {};
  const changed: string[] = [];

  const external = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.external);
  if (external) {
    patch.villainExternal = mergeIdentityMapValue(state.profile?.villainExternal, external, append);
    changed.push("reto externo");
  }

  const internal = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.internal);
  if (internal) {
    patch.villainInternal = mergeIdentityMapValue(state.profile?.villainInternal, internal, append);
    changed.push("reto interno");
  }

  const philosophical = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.philosophical);
  if (philosophical) {
    patch.villainPhilosophical = mergeIdentityMapValue(state.profile?.villainPhilosophical, philosophical, append);
    changed.push("reto filosofico");
  }

  const explicitFinalIdentity = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.finalIdentity);
  const finalIdentity = explicitFinalIdentity ?? extractNaturalFinalIdentityName(text, normalized);
  const finalWhy = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.finalWhy) ?? extractIdentityMapReason(text);
  if (finalIdentity) {
    const parsed = splitIdentityNameAndWhy(finalIdentity);
    patch.heroName = parsed.name.slice(0, 160);
    if (parsed.why || finalWhy) patch.heroWhy = (parsed.why ?? finalWhy ?? "").slice(0, 500);
    changed.push("identidad final");
  } else if (finalWhy) {
    patch.heroWhy = mergeIdentityMapValue(state.profile?.heroWhy, finalWhy, append);
    changed.push("por que final");
  }

  const initialName = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.initialName);
  const initialBehavior = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.initialBehavior);
  const initialBelief = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.initialBelief);
  if (initialName || initialBehavior || initialBelief) {
    const current = state.profile?.initialIdentity;
    const name = initialName ?? current?.name;
    const behavior = initialBehavior ?? current?.behavior;
    const belief = initialBelief ?? current?.belief;
    if (!name || !behavior || !belief) return { kind: "needs_field" };
    patch.initialIdentity = {
      name: name.slice(0, 160),
      behavior: behavior.slice(0, 500),
      belief: belief.slice(0, 500),
      updatedAt: Date.now(),
    };
    changed.push("identidad inicial");
  }

  const dreamHave = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.dreamHave);
  const dreamDo = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.dreamDo);
  const dreamBe = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.dreamBe);
  if (dreamHave || dreamDo || dreamBe) {
    const current = state.profile?.dreamline;
    const have = dreamHave ?? current?.have;
    const doValue = dreamDo ?? current?.do;
    const be = dreamBe ?? current?.be;
    if (!have || !doValue || !be) return { kind: "needs_field" };
    patch.dreamline = {
      have: have.slice(0, 1000),
      do: doValue.slice(0, 1000),
      be: be.slice(0, 1000),
      updatedAt: Date.now(),
    };
    changed.push("dreamline");
  }

  const fearWhatIf = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.fearWhatIf);
  const fearPrevent = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.fearPrevent);
  const fearRepair = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.fearRepair);
  const fearPartialWins = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.fearPartialWins);
  const fearCost6Months = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.fearCost6Months);
  const fearCost1Year = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.fearCost1Year);
  const fearCost3Years = extractIdentityMapValue(text, IDENTITY_MAP_LABELS.fearCost3Years);
  if (fearWhatIf || fearPrevent || fearRepair || fearPartialWins || fearCost6Months || fearCost1Year || fearCost3Years) {
    const current = state.profile?.fearSetting;
    const whatIf = fearWhatIf ?? current?.whatIf;
    const prevent = fearPrevent ?? current?.prevent;
    const repair = fearRepair ?? current?.repair;
    const partialWins = fearPartialWins ?? current?.partialWins;
    const cost6Months = fearCost6Months ?? current?.cost6Months;
    const cost1Year = fearCost1Year ?? current?.cost1Year;
    const cost3Years = fearCost3Years ?? current?.cost3Years;
    if (!whatIf || !prevent || !repair || !partialWins || !cost6Months || !cost1Year || !cost3Years) return { kind: "needs_field" };
    patch.fearSetting = {
      whatIf: whatIf.slice(0, 1000),
      prevent: prevent.slice(0, 1000),
      repair: repair.slice(0, 1000),
      partialWins: partialWins.slice(0, 1000),
      cost6Months: cost6Months.slice(0, 1000),
      cost1Year: cost1Year.slice(0, 1000),
      cost3Years: cost3Years.slice(0, 1000),
      updatedAt: Date.now(),
    };
    changed.push("fear-setting");
  }

  if (changed.length === 0) return { kind: "needs_field" };
  return {
    kind: "update",
    patch,
    message: `Mapa actualizado: ${Array.from(new Set(changed)).join(", ")}.`,
  };
}

function extractIdentityMapValue(text: string, labels: readonly string[]): string | undefined {
  const boundaries = IDENTITY_MAP_BOUNDARY_LABELS.map(escapeIdentityMapRegExp).join("|");
  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|[;\\n]|\\b(?:al|a la|el|la|mi|mis|del|de|de la)\\s+|\\b(?:cambia|cambiar|actualiza|actualizar|corrige|corregir|modifica|modificar|agrega|agregar)(?:\\s+(?:el|la|mi|mis|al|a la|del|de|de la))?\\s+)${escapeIdentityMapRegExp(label)}\\s*(?::|=|\\ba\\b)?\\s*([\\s\\S]*?)(?=\\s*(?:[;\\n]|\\b(?:${boundaries})\\b\\s*(?::|=|\\ba\\b))|$)`,
      "i",
    );
    const match = text.match(pattern);
    const value = match?.[1]?.trim().replace(/^[,:=-]+/, "").trim().replace(/[.]+$/g, "").trim();
    if (value) return value;
  }
  return undefined;
}

function extractNaturalFinalIdentityName(text: string, normalized: string): string | undefined {
  const changesIdentityName = /\b(cambia|cambiar|actualiza|actualizar|modifica|modificar)\b/.test(normalized)
    && /\b(identidad|su nombre|mi nombre|nombre)\b/.test(normalized);
  if (!changesIdentityName) return undefined;

  const match = text.match(/\b(?:me gusta|quiero que se llame|quiero llamarl[ao]|llamemosl[ao]|el nuevo nombre (?:es|seria))\s+["']?([^.;,\n"']+)/i);
  return match?.[1]?.trim();
}

function extractIdentityMapReason(text: string): string | undefined {
  const otherBoundaries = IDENTITY_MAP_BOUNDARY_LABELS
    .filter((label) => !IDENTITY_MAP_LABELS.finalWhy.includes(label as typeof IDENTITY_MAP_LABELS.finalWhy[number]))
    .map(escapeIdentityMapRegExp)
    .join("|");
  const pattern = new RegExp(
    `\\b(?:por que final|porque final|por que|porque)\\b\\s*(?::|=)?\\s*([\\s\\S]*?)(?=\\s*(?:[;\\n]|\\b(?:${otherBoundaries})\\b\\s*(?::|=|\\ba\\b))|$)`,
    "i",
  );
  return text.match(pattern)?.[1]?.trim().replace(/[.]+$/g, "").trim();
}

function splitIdentityNameAndWhy(value: string): { name: string; why?: string } {
  const match = value.match(/^(.+?)\s+(?:porque|por que|ya que)\s+(.+)$/i);
  if (!match?.[1] || !match[2]) return { name: value.trim() };
  return { name: match[1].trim(), why: match[2].trim() };
}

function mergeIdentityMapValue(existing: string | undefined, next: string, append: boolean): string {
  const cleanNext = next.trim();
  if (!append || !existing?.trim()) return cleanNext.slice(0, 500);
  if (normalizeForParsing(existing).includes(normalizeForParsing(cleanNext))) return existing.slice(0, 500);
  return `${existing.trim()}; ${cleanNext}`.slice(0, 500);
}

function escapeIdentityMapRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildDebrief(raw: string): string {
  return [
    "CIERRE DE PRACTICA",
    "--------------------------------",
    `Evidencia: ${raw.trim()}`,
    "",
    "Cierre:",
    "- descripcion o narracion de la practica",
    "- microtematica que aparecio",
    "- hipertematica que mejor funciono",
  ].join("\n");
}

export function assessPracticeEvidenceSignal(input: string): PracticeEvidenceSignal {
  const normalized = normalizeForSignal(input);
  const reportedCycleId = resolvePracticeReference(normalized);
  const result: PracticeEvidenceSignal = {
    kind: "none",
    evidenceDimensions: [],
  };
  if (reportedCycleId) result.reportedCycleId = reportedCycleId;

  const announcementVerb = "(?:enviar|mandar|pasar|contar)(?:te|telo|tela|telos|telas|lo|la|los|las)?";
  const announcement = new RegExp(`\\b(quiero|quisiera|me gustaria|voy a|ire a|estoy por|estoy a punto de|debo)\\b.{0,45}\\b${announcementVerb}\\b.{0,30}\\b(reporte|informe|debrief|evidencia|practica)\\b`).test(normalized)
    || new RegExp(`\\b(te puedo|puedo|se puede)\\b.{0,35}\\b${announcementVerb}\\b`).test(normalized);
  if (announcement) {
    result.kind = "announcement";
    return result;
  }

  const completion = /\b(ya hice|lo hice|hice|realice|complete|termine|finalice|acabe|estuve|practique)\b/.test(normalized);
  const structuredFields = [
    /\b(descripcion|narracion|practica)\s*:/,
    /\bmicrotematica\s*:/,
    /\bhipertematica\s*:/,
    /\bque paso\s*:/,
    /\binterpretacion\s*:/,
    /\b(cuerpo|emocion|cuerpo\/emocion)\s*:/,
    /\baccion\s*:/,
    /\bresultado\s*:/,
  ].filter((pattern) => pattern.test(normalized)).length;

  const dimensions: PracticeEvidenceSignal["evidenceDimensions"] = [];
  if (completion && (/\b(minuto|minutos|hora|horas|respir|antifaz|musica|weightless|suelo|calor|rubor|cosquilleo|sueno|sueño)\b/.test(normalized) || normalized.length >= 100)) {
    dimensions.push("execution");
  }
  if (/\b(interprete|interpretacion|pense|pensaba|me dije|significo|microtematica|hipertematica|identidad)\b/.test(normalized)) {
    dimensions.push("interpretation");
  }
  if (/\b(senti|sentia|cuerpo|emocion|angustia|calma|relajad|miedo|valor|energia|dolor|tension)\b/.test(normalized)) {
    dimensions.push("body");
  }
  if (/\b(resultado|al final|despues|cambio|logre|pude|me ayudo|desee|aprendi|quedo)\b/.test(normalized)) {
    dimensions.push("result");
  }
  if (/\bhipertematica\b/.test(normalized) && !dimensions.includes("result")) {
    dimensions.push("result");
  }
  result.evidenceDimensions = dimensions;

  if (!completion && structuredFields < 2) return result;
  if (structuredFields >= 3 || (normalized.length >= 120 && dimensions.length >= 2)) {
    result.kind = "sufficient";
    return result;
  }
  result.kind = "partial";
  return result;
}

export function resolvePracticeReference(text: string): string | undefined {
  const normalized = normalizeForSignal(text);
  if (/\b(nsdr|pre[- ]?hypnos|practica 1|practica uno|ciclo 1|ciclo uno)\b/.test(normalized)) return "cycle1_prehypnos_nsdr";
  if (/\b(reto social|miedo social|exposicion social|practica 2|practica dos|ciclo 2|ciclo dos)\b/.test(normalized)) return "cycle2_social_fear";
  if (/\b(niacina|interpretacion del calor|practica 3|practica tres|ciclo 3|ciclo tres)\b/.test(normalized)) return "cycle3_niacin_primer";
  if (/\b(ganzfeld|homogeneizacion sensorial|practica 4|practica cuatro|ciclo 4|ciclo cuatro)\b/.test(normalized)) return "cycle4_ganzfeld";
  if (/\b(oniro|sueno lucido|sueño lucido|practica 5|practica cinco|ciclo 5|ciclo cinco)\b/.test(normalized)) return "cycle5_onirotechnology";
  if (/\b(enteogen|psilocib|dmt|practica 6|practica seis|ciclo 6|ciclo seis)\b/.test(normalized)) return "cycle6_enteogenic_reference";
  if (/\b(postliminar|retrospectiva|repeticion trimestral|repeticion semestral|practica 7|practica siete|ciclo 7|ciclo siete)\b/.test(normalized)) return "cycle7_postliminal_retrospective";
  return undefined;
}

function normalizeForSignal(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

  if (state.profile?.initialIdentity?.name) {
    next.push({
      topic: "identity.initial",
      line: `Parte desde "${state.profile.initialIdentity.name}": conducta ${state.profile.initialIdentity.behavior}; creencia ${state.profile.initialIdentity.belief}.`,
      confidence: 0.7,
    });
  }

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
  if (state.session?.currentCycleId === "cycle1_prehypnos_nsdr") {
    return "1. preparar oscuridad y tiempo; 2. respiracion y escaneo corporal; 3. registrar ruido vaciado, identidad e hipertematica.";
  }
  if (state.session?.currentCycleId === "cycle2_social_fear") {
    return "1. elegir exposicion social segura; 2. observar la interpretacion automatica; 3. aplicar la hipertematica y registrar el cambio.";
  }
  if (state.session?.currentCycleId === "cycle3_niacin_primer") {
    return "1. revisar contraindicaciones; 2. preparar la hipertematica; 3. observar senal, interpretacion y resultado corporal.";
  }
  if (state.session?.currentCycleId === "cycle4_ganzfeld") {
    return "1. preparar campo visual y sonido uniforme; 2. observar patrones generados; 3. registrar interpretacion e hipertematica.";
  }
  if (state.session?.currentCycleId === "cycle5_onirotechnology") {
    return "1. registrar suenos al despertar; 2. practicar chequeos de realidad; 3. preparar la siguiente sesion WBTB + MILD.";
  }
  if (state.session?.currentCycleId === "cycle6_enteogenic_reference") {
    return "1. completar filtros de prevencion; 2. definir identidad e hipertematica; 3. usar la ruta permitida o su alternativa estructurada.";
  }
  if (state.session?.currentCycleId === "cycle7_postliminal_retrospective") {
    return "1. revisar evidencias; 2. elegir practica mas proteica e hipertematicas; 3. definir repeticion y siguiente identidad.";
  }
  return "Revisa la practica activa y completa su siguiente accion concreta.";
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
      `(?:^|[;\\n]|\\by\\s+)\\s*${label}\\s*[:=-]\\s*([\\s\\S]*?)(?=\\s*(?:[;\\n]|\\by\\s+)?(?:nombre|heroe|identidad|porque|por que|why|razon|reto interno|interno|internal|reto externo|externo|external|reto filosofico|filosofico|filosofica|filosofia|philosophical)\\s*[:=-]|$)`,
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
