# BridgeCrux Primitives Checklist

This is a working checklist for the Arqueidentidad Fase VI crux. It is not an extraction plan yet. A primitive becomes abstractable only after it is implemented, tested in this app, and repeated by a second crux or by enough stable runtime evidence.

## Implemented And Under Test

- [x] TaskSignalRouter: internal JSON router with `gemini-3.1-flash-lite`, low thinking, temperature 0.2.
- [x] HighThinkingTutorBoundary: user-visible copy comes from high-thinking tutor flow or authored fixed process text, not the low-thinking router.
- [x] RouterDecisionLog: non-command turns persist route, intent, confidence, mutation candidate, model, session status, cycle, and message excerpt in Convex.
- [x] RouteAnticipationAudit, local MVP: the validated `anticipate-crux-routes` skill inventories operations and router coverage, then classifies bounded route candidates without mutating runtime state.
- [x] CapabilityGapReport: unsupported high-confidence needs are written to both `routerDecisions` and open `reports` with a typed gap layer, while the user receives a truthful Spanish notice that the capability is queued.
- [x] CapabilityGapFluidityGate: only explicit unsupported execution requests produce user-visible gaps; questions, alternatives, placeholders, stale metadata, and supported routes remain conversational.
- [x] DeferredDeterministicStep: an active sequential item can be persisted as pending, excluded from completion, exposed in status/history, and completed later by explicit named-item evidence.
- [x] ReferenceFirstEvidence: named current or prior items control evidence prompts and persistence before the active-item default is considered.
- [x] DeterministicProcessController, onboarding slice: LLM assesses answers; code owns state transition and persistence.
- [x] DeterministicProcessController, Quest setup slice: onboarding now collects rhythm, identity, obstacles, dreamline, fear-setting, cheat day, empty day, and optional extra habits before routine activation.
- [x] FirstContactBootstrap: first user message starts onboarding from state, even when the user does not send `/start`.
- [x] NaturalPracticeDebrief: user can close practice with normal Spanish, without `/debrief`.
- [x] DailyRoutineQuestController, Arqueidentidad slice: routine status, check-ins, cheat day, empty day, base Tummo-Identidad habit, optional extra habits, and daily evidence/prediction loop are implemented.
- [x] ContentBuilder, local MVP: `scripts/build-crux-content.mjs` turns canonical markdown under `cruxes/<id>/` into Convex-importable TypeScript before dev, codegen, and build.
- [x] ReportTable: runtime failures and user reports persist in Convex.
- [x] GeminiDemandFallback: tutor-generation demand failures create a report, tell the user in Spanish that the server is under demand, wait, and retry.

## Implemented But Not Ready To Abstract

- [ ] SpecificFunctionController, Arqueidentidad slice: starts and completes current MVP practices and routine functions, but it is still too domain-shaped to extract directly.
- [ ] ProgressModel: deterministic preliminar/liminar/postliminar display exists, but the full quest dashboard model needs more Telegram and future UI evidence before abstraction.
- [ ] MemoryController: delayed memory review exists after 30 inbound user turns, but operation-level memory (`merge`, `correct`, `archive`) is not implemented yet.
- [ ] TelegramCopyAdapter: Telegram formatting and TUI copy are usable, but the adapter is not separated from domain copy and needs more transcript testing before becoming a general channel adapter.
- [ ] ConvexEntityCore: users, sessions, messages, memories, ledger, reports, and routerDecisions exist, but they are not packaged as a reusable schema/component boundary.
- [ ] MarkdownContentContract: markdown is canonical and generated TypeScript is deployment output, but validation is still light and not yet a framework-grade manifest.

## Not Implemented Yet

- [ ] UserCopyGate: no hard runtime validator rejects low-thinking/internal text before send.
- [ ] ModelClientAdapter: Gemini calls are direct `generateContent` calls.
- [ ] TurnController: `convex/agent.ts` still contains route, handlers, tools, Telegram, and reports in one vertical slice.
- [ ] OperationLog: state mutations are not represented as explicit operation objects.
- [ ] RepairQueue: reports are not sent to a repair crux or Bridgeclaw API.
- [ ] MultiCruxMetaRouter: this app has only one crux.
- [ ] PackageBoundary: no reusable npm package, Convex component, CLI, or installable repo exists yet.
- [ ] SecondCruxProof: no second crux has validated which runtime pieces are truly universal.

## Vocabulary Corrections

`PracticeController` is an Arqueidentidad-specific name, so the primitive name is `SpecificFunctionController`. `FormController` is also too narrow, so the primitive name is `DeterministicProcessController`: it covers any step-based process that appears inside a hybrid chat UX. `CruxContent` should stay limited to parsed markdown, prompts, routes, and specific-function declarations. `CruxState` should stay limited to runtime state: user, session, memories, bounded message transcript, ledger summary, router history, and loaded domain state when a specific function needs it.

## Current Test Focus

Use Telegram and Convex together. Telegram tests the user experience; Convex `routerDecisions`, `ledger`, `practices`, `dailyHabits`, `dailyHabitCompletions`, and `reports` show whether the runtime made the right internal decisions.

The next abstraction pass should not start by building a CLI. It should start by extracting a written contract from this app: which Convex entities are runtime primitives, which handlers are deterministic process controllers, which specific functions are domain-owned, which copy can be deterministic, and where the high-thinking tutor boundary is enforced.
