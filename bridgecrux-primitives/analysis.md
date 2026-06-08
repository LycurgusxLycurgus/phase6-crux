# BridgeCrux Primitives Analysis

## Working Status

This document is a working note, not an extraction target yet. The primitives described here should not be turned into an SDK, library, CLI, or generic framework until the Arqueidentidad Fase VI crux works cleanly in production. The purpose of the document is to preserve the architectural reasoning we are discovering inside this app, so that later we can abstract from a working system instead of designing primitives from theory.

The current priority remains app-first: fix the tutor experience, stabilize the quest flow, prove the Convex runtime shape, and only then distill the repeated mechanisms into BridgeCrux primitives. In other words, this file should guide local implementation judgment, but it should not pull the project into premature framework work.

## Route And Evidence

BRIDGECODE_ROUTE: crux runtime architecture and primitive standardization -> [GENERAL, LIRA] | MODE: Lira | WHY: the task defines reusable runtime architecture, but the reusable form must be proven by the current app before extraction.

This analysis comes from the current repo and from the previous research pass. The key files are `context.txt`, `chatgpt-sys-prompt.txt`, `AGENTS.md`, `bridgecrux/core.ts`, `convex/agent.ts`, `convex/store.ts`, `convex/schema.ts`, `cruxes/arqueidentidad-fase6/system.prompt.md`, `cruxes/arqueidentidad-fase6/assistants.md`, and the canonical markdown under `cruxes/arqueidentidad-fase6/specific-functions/`. The Gemini notes in `context/gemini/gemini-skills.txt` and the official Gemini documentation shaped the model boundary: Interactions API is attractive for agentic state, but the app should not migrate wholesale until the local runtime has stable semantics and a model adapter boundary.

The important lesson from `context.txt` is that Bridgecode is not only a prompt. It is a task-signal router, correction memory, artifact policy, execution stance, and Best-Answer discipline. BridgeCrux needs the same kind of control layer, but for end-user applications instead of Codex work. A crux cannot be just "a chatbot with tools." It needs an explicit turn controller that decides what kind of user event happened, which state transitions are allowed, which agent can reason, which code can mutate state, what counts as memory, and what can be shown to the user.

## The Central Boundary

The most important primitive is the boundary between internal classification and user-facing tutoring. Small models can be useful, but only when their output is internal. A low-thinking model can classify a turn, extract fields, propose a route, estimate confidence, or suggest a memory operation. It cannot answer the user. If the low-thinking path writes even one sentence of user-facing copy, quality collapses exactly where the crux needs the most trust: correction, teaching, emotional interpretation, practice guidance, and debrief.

The runtime therefore needs a hard rule:

```text
user message
-> low-thinking router may produce internal JSON
-> code validates route, state, safety, and operation
-> high-thinking tutor or authored deterministic copy produces user-visible text
-> code persists the approved operations
```

This is stricter than ordinary tool-calling. A router output is not a draft response. It is closer to a compiler classification. It may decide that the next step is onboarding, debrief, safety, active practice, knowledge question, report, settings, or memory, but it cannot express that decision to the user. The user only sees either canonical authored copy or the high-thinking tutor's response.

This boundary should eventually become enforceable in code. A `UserCopyGate` should reject any response whose source is `router`, `low_thinking`, or `internal_json`. That sounds heavy now, but it prevents the most likely failure mode when we start optimizing cost: accidentally letting the cheap classifier become the teacher.

## Deterministic Convex Entities

Every crux should share a deterministic persistence core. These entities are not domain-specific; they are runtime truth. They let a crux know who is speaking, what state the interaction is in, what has already happened, what memory is stable, what evidence exists, and what failed.

The deterministic core should include `users`, `sessions`, `messages`, `memories`, `ledger`, `reports`, `routerDecisions`, and some form of `jobs` or `queues`. `users` stores external channel identity, locale, timezone, and timestamps. `sessions` stores the current crux, mode, step, active deterministic process, and possibly the last model interaction id. `messages` stores the transcript: inbound and outbound channel messages used for context, recovery, and debugging. When this document says "recent transcript," it means a bounded slice of `messages`, not a separate primitive. `memories` stores compact correction and personalization memory. `ledger` is the durable event log: it records that something happened in the crux runtime, such as an accepted onboarding milestone, task completion, evidence submission, state transition, or domain-specific event. It is not the user profile and it is not the chat transcript; it is an append-only operational history for progress, audit, and later reflection. `reports` stores runtime errors, safety flags, missing knowledge, and bad UX reports. `routerDecisions` stores internal route/intent classifications so routing can be audited. `jobs` or `queues` later handles deferred memory runs, report repair, scheduled follow-ups, and background evaluations.

This deterministic core should remain boring and predictable. It is what lets the crux recover from model drift, stale context, webhook retries, and user confusion. It should not be reshaped for every domain.

Specific cruxes can then add domain entities. Arqueidentidad may need quests, habits, beliefs, phases, identity maps, practices, thresholds, and postliminal closes. A finance crux might need accounts, transactions, budgets, and goals. A writing crux might need drafts, claims, sources, revisions, and style memories. A generic `profile` table can exist as an app convenience, but it is not automatically a BridgeCrux primitive because many apps will need different durable domain records. Project-specific entities should come from the crux's `specific-functions` and from the actual user problem the crux solves.

The rule is simple: deterministic entities carry runtime truth; crux-specific entities carry the domain solution.

## Current Architecture Assessment

The current Arqueidentidad bot already contains several pieces of the future BridgeCrux runtime, but they are still fused together. Convex stores users, sessions, messages, profiles, memories, practices, ledger events, and reports. The onboarding flow already uses a hybrid pattern where the model assesses and normalizes while code owns persistence and step advancement. Reports are stored with transcript excerpts. Tool declarations exist. The crux content already has a canonical markdown folder, even though the runtime still imports a manually mirrored TypeScript file.

Those are strong foundations. The weakness is not that the bot lacks intelligence; the weakness is that intelligence is not yet routed through explicit primitives. `convex/agent.ts` currently handles Telegram parsing, command routing, onboarding, practice start, Gemini calls, tool execution, debrief, memory writes, and reporting in one large module. That is acceptable while the app is still discovering its shape, but it explains why UX bugs recur: route selection is implicit, memory timing is too coarse, deterministic copy leaks into conversational turns, and prompt patches are doing work that should belong to runtime contracts.

The current architecture should therefore be treated as a working vertical slice, not as the final primitive. We should improve it locally until the behavior is good, then extract the parts that have proven stable.

## Runtime Shape

BridgeCrux should become a Convex-backed turn controller. The key primitive is not the model. The key primitive is the orchestration boundary around the model.

The ideal turn looks like this:

```text
channel event
-> normalize input
-> load Convex state bundle
-> classify task signal
-> validate route against session and crux rules
-> run the correct handler
-> execute deterministic operations
-> ask high-thinking tutor for user copy when needed
-> persist message/event/report/profile changes
-> optionally schedule memory after threshold
```

The current Arqueidentidad bot already approximates this in places. Onboarding uses structured assessment and code-owned mutation. Practice start is deterministic. Reports are persisted. Messages are stored. But routing is still scattered across command parsing, session status, regex helpers, safety checks, and general Gemini tool loops. That is workable for an MVP, but it is not yet a primitive.

The next mature version should make route selection explicit. A user saying "ya lo hice y me senti con mas energia" should route to natural-language debrief, not general tutor chat. A user saying "importa la hora?" should route to active-practice clarification, not mutate anything. A user saying "usa esa estructura" inside onboarding should route to confirmation of prior tutor suggestion. These are task signals. The app should not rely on accidental prompt behavior to infer them.

## Router Primitive

The router should use an adapted BridgeCrux version of the Best-Answer prompt. The original Bridgecode form asks the agent to infer the real task signal, surface the assumption that would make the direct answer wrong, choose the route that protects the highest-cost failure, and apply the correction the user would likely request after a shallow first answer. BridgeCrux needs the same process, but the output must be structured JSON.

The router should run with a small or fast model only because the output is internal. Its temperature should be `0.2`: not fully brittle, but still stable enough for routing. Thinking should be low, never minimal. Minimal thinking is too weak for the kind of pragmatic ambiguity users create in chat: confirmations, corrections, partial evidence, jokes, doubts, and mixed questions.

The router should decide both route and intent. Route names the system area; intent names what the user is doing inside that area. For example, `onboarding` plus `confirm_previous_suggestion` is different from `onboarding` plus `ask_clarification`. `active_practice` plus `submit_evidence` is different from `active_practice` plus `ask_concept`. This distinction matters because code can safely mutate state only after intent is clear.

Suggested shape:

```ts
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
  extracted: Record<string, string | number | boolean | null>;
};
```

The router does not own final truth. Code should reject impossible transitions. A router can say the user submitted evidence, but the handler must check that there is an active practice. A router can say the user is confirming a previous suggestion, but the handler must verify that the recent transcript contains a valid suggestion. A router can say a message is safe, but the safety gate still blocks known unsafe practice requests.

## Handler Primitive

A handler is a state-safe operation boundary. It receives the route decision, current state, normalized message, and crux content. It returns operations and a response plan. It does not directly improvise user copy unless the copy is a stable deterministic block already authored in the crux.

```ts
type HandlerInput = {
  routeDecision: RouterDecision;
  state: CruxState;
  message: NormalizedUserMessage;
  content: CruxContent;
};

type HandlerResult = {
  operations: CruxOperation[];
  responsePlan: "deterministic_copy" | "high_thinking_tutor" | "no_response";
  deterministicCopyId?: string;
  tutorPrompt?: TutorPrompt;
};
```

This gives the app a reliable place to enforce contracts. Deterministic process handlers can accept, reject, partially accept, clarify, or advance. Specific function handlers can start, adapt, block, complete, or repair whatever domain operation belongs to the crux. Report handlers can write reports and decide whether to send a user-facing fallback. Memory handlers can schedule a future memory run without pretending the current model has already rewritten memory.

The handler is the layer that turns agentic interpretation into software behavior. Without this layer, the crux becomes a chat prompt with database side effects.

## User-Copy Primitive

User-visible language has two legitimate sources. The first is deterministic Spanish copy authored in canonical crux content. The second is high-thinking tutor output. Nothing else should reach the user.

Deterministic copy should be rare, because most user messages are not deterministic. It fits places where the user is not really in open conversation but interacting with a stable system surface. Examples include first-contact onboarding, the first display of a deterministic process step, the next fixed step after an accepted answer, command help, status diagrams, known empty states, explicit app UI labels, and boundary text that must remain stable.

The pre-principle for deterministic copy is: use it when the user is inside a deterministic process or consulting a stable app state, not when the user is asking, resisting, misunderstanding, reporting evidence, or changing meaning. If the user is in a conversational turn, the high-thinking tutor should respond first. If the answer is accepted and the flow advances, deterministic copy may follow as the next process step.

This corrects a specific UX failure from the app. When onboarding rejects or partially accepts an answer, it should not paste the full fixed question again. That feels like the bot ignored the user. The right shape is: tutor correction only. The deterministic question returns only if it is the first time the field is asked, if the user asks to see the format again, or after the previous answer was accepted and the next form field begins.

## Memory Primitive

Memory should not run after every "meaningful" turn. That would make the app noisy, expensive, and too vulnerable to transient phrasing. For this app class, undeterministic memory should run after approximately 30 user turns or at major deterministic milestones. Deterministic milestone writes are still allowed, but they should be explicit: onboarding completed, identity changed, obstacles accepted, practice completed, debrief submitted, or the user states a limit/contraindication/correction that affects future behavior.

The memory critic should receive only user responses plus minimal state labels. It should not ingest the tutor's own prose as evidence, because that creates self-confirming memory. If the tutor suggests "Diosa de la sabiduria interpreta la fatiga como gestion de energia," that should not become memory unless the user accepts, repeats, corrects, or acts from it. The user is the evidence source; the tutor is not.

The memory critic should look for stable identity claims, explicit user corrections, repeated preferences or limits, durable constraints that affect future tutoring, and specific user-requested memory updates. It should leave out one-time emotions, generic praise or complaints, transient task details, tutor-generated formulations not accepted by the user, secrets, private third-party data, and medical/legal conclusions.

The operation shape should be corrective, not append-only:

```ts
type MemoryOperation =
  | { type: "noop"; reason: string }
  | { type: "upsert"; topic: string; line: string; evidence: string; confidence: number }
  | { type: "merge"; topics: string[]; topic: string; line: string; evidence: string; confidence: number }
  | { type: "correct"; topic: string; line: string; replaces: string; reason: string; confidence: number }
  | { type: "archive"; topic: string; reason: string };
```

Prefer `merge` or `correct` over `upsert`. A new memory topic is justified only when it changes future routing or tutoring and cannot be represented by improving an existing line. This is the Bridgecode correction-memory principle applied to users: memory is a living prevention and personalization layer, not an accumulation log.

The current `replaceMemoryLines` mutation is acceptable as MVP scaffolding, but it is too coarse for mature memory. Eventually memories need source, evidence, confidence, last evidence timestamp, and archive behavior. For now, the app should at least stop pretending that every debrief rewrites memory immediately. Debrief creates evidence; memory should be revised by accumulation.

## Report Primitive

The current reports table is one of the strongest parts of the MVP. Reports make failures visible and preserve transcript excerpts. The next step is not to make the user-facing bot self-repair. The next step is to make reports structured enough that another BridgeCrux or Bridgeclaw can consume them later.

A mature report should separate the user-facing fallback, the internal report, and the repair queue event. The user-facing fallback should be calm and non-technical. The internal report should include route, handler, state snapshot, model, transcript excerpt, and failure summary. The repair queue event can later call an API where a repair crux classifies the root cause, proposes a patch and tests, and waits for human or CI approval.

```ts
type CruxReport = {
  severity: "info" | "bug" | "safety" | "missing_knowledge" | "tool_error";
  route: string;
  handler: string;
  summary: string;
  transcriptExcerpt: string;
  stateSnapshot: {
    sessionStatus: string;
    onboardingStep: string;
    currentCycleId: string;
    practiceCount: number;
    model: string;
  };
  repairStatus: "queued" | "sent" | "resolved" | "ignored";
};
```

This keeps repair out of the tutoring surface. The crux should fail gracefully, report accurately, and allow another system to help fix the defect.

## Content And Markdown Build Primitive

The current manual `content.ts` mirror is not the right long-term shape. Humans should edit markdown; Convex should import static TypeScript. Those are compatible if the project has a build step that parses markdown into generated TypeScript.

The desired structure is:

```text
cruxes/<id>/
  system.prompt.md
  assistants.md
  specific-functions/
    knowledge-base.md
    cycles.md
    onboarding.md
  generated/
    content.generated.ts
```

A future `scripts/build-crux-content.ts` should read the markdown files, parse frontmatter blocks, validate required ids/titles/risks/routes/body blocks, generate `content.generated.ts`, and fail the build if canonical markdown cannot parse. It can also emit a manifest for health checks.

The important point is that the generated TypeScript is not canon. It is a deployment artifact. The canonical crux lives in `specific-functions/*.md`, `system.prompt.md`, and `assistants.md`.

This should not be implemented as a general abstraction yet. The Arqueidentidad app should first prove which files actually need to exist. Once the content shape stabilizes, the build script is a good next local improvement because it solves a real current pain: manual markdown mirroring.

## Gemini Interactions API Decision

The Interactions API is relevant because it offers model-native conversation continuity and agentic state. It should be taken seriously, but not treated as the immediate solution to the current UX problems. The current failures are not caused by `generateContent` alone. They are caused by missing runtime boundaries: routing, handler contracts, memory criteria, copy gates, and form semantics.

The right move is to introduce a model adapter later:

```ts
interface ModelClient {
  structured<T>(request: StructuredModelRequest<T>): Promise<T>;
  tutor(request: TutorModelRequest): Promise<string>;
  toolLoop(request: ToolLoopRequest): Promise<ToolLoopResult>;
}
```

That adapter lets the app keep using `generateContent` for stable production behavior while making Interactions an implementation detail that can be enabled behind a flag. If Interactions is introduced, Convex remains the source of truth. `previous_interaction_id` can help with continuity, but it cannot replace stored session, profile, messages, memory, ledger, or reports. Tools, system instructions, and generation config must still be re-specified each turn.

The practical recommendation is: stabilize the crux behavior with `generateContent`, extract a model adapter only when the call sites are clean, then experiment with Interactions for high-thinking tutor continuity. Do not let router state depend only on Gemini retention.

## System Prompt Primitive

`chatgpt-sys-prompt.txt` shows that a serious harness prompt is layered. It defines role, safety, tool rules, autonomy, browsing, citations, modality, user context, and channel discipline. BridgeCrux needs a similar layered prompt system, but aimed at end-user tutor apps.

There should be an app meta-router prompt when an app contains multiple cruxes. Its job is to route the user to the correct crux, global app function, or cross-crux mode. It may use low-thinking only for internal JSON. It never writes user-facing copy. The best moment to "crux-ify" an app is after the backend functions already exist or at least have explicit contracts. The router becomes powerful when it can see the real operation surface: what can be read, written, started, stopped, scheduled, reported, or repaired. If the backend is vague, the router becomes a chatbot guessing at imaginary affordances.

Each crux then has its own system prompt. The crux prompt defines what the crux does in code and with agents: domain scope, tools, state mutations, safety boundaries, pedagogy, routes, memory rules, known errors, and user-copy style. This prompt belongs to the high-thinking tutor and to handlers that need domain reasoning.

This distinction matters because "the app" and "the crux" are not always the same thing. A future app may contain several cruxes. The app meta-router decides where the user belongs. The crux prompt decides how that specific crux thinks, teaches, acts, and mutates state.

## Proposed Primitive Set

The current candidate primitive set is still useful, but it should be treated as a map, not a build plan. The minimum reusable ideas are `CruxContent`, `CruxState`, `TaskSignalRouter`, `TurnController`, `DeterministicProcessController`, `SpecificFunctionController`, `MemoryController`, `ReportController`, `ModelClient`, `ContentBuilder`, and `UserCopyGate`.

`CruxContent` is parsed markdown, prompts, and route definitions. It can reference specific functions, but it should not hard-code domain categories like practices, forms, or safety rules as universal concepts. Those are Arqueidentidad names; another crux might expose budgets, drafts, workouts, cases, documents, claims, courses, invoices, or game turns. The universal content primitive should say: here is the crux prompt surface, here are the route names, and here are the specific functions/tools this crux makes available.

`CruxState` is the runtime bundle needed for a turn: user, session, memories, bounded recent transcript from `messages`, ledger summary, router history when useful, and the active deterministic process if one exists. Domain records such as Arqueidentidad profile, active practice, identity map, quest state, or phase state are not universal state primitives. They are specific-function state loaded into the turn bundle when the router or handler needs them.

`TaskSignalRouter` is the internal structured classifier. It should adapt to the available backend and frontend operation surface, not to an imagined chatbot persona. `TurnController` orchestrates route, handler, operations, response plan, persistence, and channel delivery. `DeterministicProcessController` replaces the narrower `FormController`: it handles any deterministic process presented through a hybrid chat UX, including onboarding, checkout-like flows, setup wizards, diagnostics, structured reviews, approval flows, and step-based domain tasks. The LLM can assess, normalize, clarify, or tutor, while code owns progression and mutation.

`SpecificFunctionController` replaces the narrower `PracticeController`. It is the runtime boundary for domain tools/functions: in Arqueidentidad that means practices and quest sub-phases; in other apps it may mean invoice review, study planning, CRM updates, content revision, habit tracking, or code repair. `MemoryController` handles deterministic writes and delayed critic operations. `ReportController` creates reports and later repair queue events. `ModelClient` hides the difference between `generateContent` and Interactions. `ContentBuilder` turns markdown into Convex-importable TypeScript. `UserCopyGate` prevents low-thinking or internal JSON from reaching the user.

These names should not harden yet. They are a vocabulary for seeing repeated behavior while the app matures.

## Implementation Order, Deferred

The implementation order should remain app-first. The current Arqueidentidad crux should fix concrete behavior before primitive extraction: no repeated form blocks after correction, no `/debrief` requirement for natural evidence, compressed safety, preliminar/liminar/postliminar phase language, richer quest flow for habits and beliefs, and more accurate Fase VI practice knowledge.

Once those are stable, the likely extraction order is:

1. Local content build script for markdown-to-TypeScript.
2. Explicit internal task-signal router over the real backend operation surface.
3. Refactor `handleTurn` into a turn controller and route handlers.
4. Deterministic process controller for onboarding and other step-based UX.
5. Specific function controller for Arqueidentidad quest/practice operations.
6. User-copy source gate.
7. Operation-based memory after 30 user turns or milestones.
8. Structured report repair queue.
9. Model adapter around current Gemini calls.
10. Experimental Interactions adapter behind an env flag.
11. Second crux to prove generalization.
12. Only then consider package or CLI.

The CLI is last, not first. A CLI before two working cruxes would freeze the wrong abstractions. The first reusable artifact should be contracts discovered from production behavior, not scaffolding convenience.

## SDK, Library, Or CLI Decision

The best immediate form is not an SDK and not a CLI. The best immediate form is a working app with a clear internal vocabulary. A library becomes useful when multiple cruxes repeat the same runtime contracts. A CLI becomes useful only after the library shape is stable enough to scaffold correct projects instead of spreading immature assumptions.

The sequence should be conservative. First, make Arqueidentidad work. Second, extract local helper boundaries only when they reduce real complexity inside this app. Third, build a second crux and observe which boundaries repeat. Fourth, promote those repeated boundaries into a local package. Fifth, create a CLI that can generate `cruxes/<id>/system.prompt.md`, `assistants.md`, `specific-functions/*.md`, Convex schema slices, content build config, and channel adapters.

The CLI should not generate personality or domain wisdom. It should generate the boring runtime envelope: files, contracts, validators, build scripts, and placeholders that force the next crux to define its own specific functions. The creative and pedagogical content belongs to the crux, not the CLI.

## Open Decisions To Resolve In The App

Some questions should stay open until the current crux produces more evidence. We still need to decide whether every accepted internal route should trigger a high-thinking tutor call, or whether some accepted form transitions can use authored copy only. We need to decide whether the memory critic can always run low-thinking internal JSON, or whether identity-sensitive corrections require high-thinking review. We need to decide whether Gemini `previous_interaction_id` is useful only for free tutor turns or also for form tutoring. We need to decide how much sanitized transcript belongs in reports. We also need to decide whether onboarding should remain embedded in `cycles.md` or move into a dedicated `specific-functions/onboarding.md` once the quest flow becomes richer.

These are not abstract design questions. They should be answered by watching the app fail or succeed with real users.

## Immediate App-First Rule

The next implementation work should improve the current app directly. The primitives should stay as working notes while the Arqueidentidad crux proves the runtime. The most important live behaviors are now clear: corrections should not repeat the fixed onboarding prompt; active-practice evidence should be accepted in normal Spanish; the agent should create the postliminal debrief instead of making the user use a command; safety should be brief and situated; progress language should use preliminar, liminar, and postliminar; and the quest system should become a real habit-and-belief creation flow before we abstract it.

The primitives become real only after the app demonstrates them.
