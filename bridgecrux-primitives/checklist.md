# BridgeCrux Primitives Checklist

This is a working checklist for the Arqueidentidad Fase VI crux. It is not an extraction plan yet. A primitive becomes abstractable only after it is implemented, tested in this app, and repeated by a second crux or by enough stable runtime evidence.

## Implemented And Under Test

- [x] TaskSignalRouter: internal JSON router with `gemini-3.1-flash-lite`, low thinking, temperature 0.2.
- [x] HighThinkingTutorBoundary: user-visible copy comes from high-thinking tutor flow or authored fixed process text, not the low-thinking router.
- [x] RouterDecisionLog: non-command turns persist route, intent, confidence, mutation candidate, model, session status, cycle, and message excerpt in Convex.
- [x] DeterministicProcessController, onboarding slice: LLM assesses answers; code owns state transition and persistence.
- [x] FirstContactBootstrap: first user message starts onboarding from state, even when the user does not send `/start`.
- [x] NaturalPracticeDebrief: user can close practice with normal Spanish, without `/debrief`.
- [x] ReportTable: runtime failures and user reports persist in Convex.

## Implemented But Not Ready To Abstract

- [ ] SpecificFunctionController, Arqueidentidad slice: starts and completes current MVP practices, but Fase VI sub-phases and quest semantics are still being corrected.
- [ ] ProgressModel: deterministic preliminar progress now exists, but liminar and postliminar need their final quest model before abstraction.
- [ ] MemoryController: delayed memory review exists after 30 inbound user turns, but operation-level memory (`merge`, `correct`, `archive`) is not implemented yet.
- [ ] TelegramCopyAdapter: Telegram formatting exists, but it needs more transcript testing before becoming a general channel adapter.

## Not Implemented Yet

- [ ] UserCopyGate: no hard runtime validator rejects low-thinking/internal text before send.
- [ ] ContentBuilder: markdown still has a manual TypeScript mirror.
- [ ] ModelClientAdapter: Gemini calls are direct `generateContent` calls.
- [ ] TurnController: `convex/agent.ts` still contains route, handlers, tools, Telegram, and reports in one vertical slice.
- [ ] OperationLog: state mutations are not represented as explicit operation objects.
- [ ] RepairQueue: reports are not sent to a repair crux or Bridgeclaw API.
- [ ] MultiCruxMetaRouter: this app has only one crux.

## Vocabulary Corrections

`PracticeController` is an Arqueidentidad-specific name, so the primitive name is `SpecificFunctionController`. `FormController` is also too narrow, so the primitive name is `DeterministicProcessController`: it covers any step-based process that appears inside a hybrid chat UX. `CruxContent` should stay limited to parsed markdown, prompts, routes, and specific-function declarations. `CruxState` should stay limited to runtime state: user, session, memories, bounded message transcript, ledger summary, router history, and loaded domain state when a specific function needs it.

## Current Test Focus

Use Telegram and Convex together. Telegram tests the user experience; Convex `routerDecisions`, `ledger`, `practices`, and `reports` show whether the runtime made the right internal decisions.
