# Route Anticipation Audit: Arqueidentidad Fase VI

This audit applies `anticipate-crux-routes` to the current Telegram and Convex runtime. It derives candidates from existing domain operations, state transitions, tool bindings, and observed interaction patterns. It does not propose arbitrary chatbot features.

## Coverage Summary

The runtime has explicit routes for onboarding, daily habits, routine status, empty day, active practice guidance, debriefs, practice history, knowledge questions, prevention boundaries, settings, progress, memory, reports, and free tutoring. Convex already provides mutations for routine-day configuration, adding habits, profile changes, starting and completing practices, reopening the current practice, recording evidence, and creating reports.

The audit found four supported operations whose router or dispatch coverage was incomplete:

1. A single message could contain both daily-routine completion and valid Phase VI evidence, but dispatch could persist only one track.
2. `add_core_habit` existed as an intent and `add_core_routine_habit` existed as a tool, but the routine-status branch could intercept the turn before the tutor executed the tool.
3. A cadence change could route to settings, but settings rendered a panel without persisting the requested change.
4. The identity map had a renderer but no explicit natural-language inspection intent.

## Candidate Matrix

| User need | Evidence | Previous handling | Primary gap | Disposition | Mutation | Priority | Confidence |
|---|---|---|---|---|---|---|---|
| Report routine completion and Phase VI evidence in one message | Two live tracks and existing handlers for both | Routine priority discarded practice closeout | `intent_reading` | `strengthen_existing_intent` with `submit_mixed_evidence` | habit + ledger/practice | P1 | High |
| Add a named daily habit conversationally | Existing intent, tool, and mutation | Could be reduced to a read-only routine panel | `tool_binding` | Bind `add_core_habit` to the high-thinking tool loop | habit | P1 | High |
| Change cadence conversationally | Existing profile mutation and cadence parser | Settings panel rendered without mutation | `tool_binding` | Persist parsed cadence, then render refreshed settings | profile | P2 | High |
| Inspect identity map, dreamline, fear-setting, or obstacles | Existing persisted fields and renderer | Generic memory/settings answer | `task_signal` | Add `inspect_identity_map` intent under settings | none | P2 | High |
| Mark one arbitrary extra habit by its title | Backend accepts habit keys, but natural-language title resolution is absent | Usually marks all pending habits | `field_extraction` | Build validated title-to-key extraction before binding | habit | P2 | Medium |
| Change reminder hour | Profile fields exist, but cron delivery remains fixed and timezone ownership is inconsistent | May appear configurable without changing delivery | `software_capability` | Build scheduler contract first | profile + scheduler | P2 | High |
| Pause or resume the program | Session and habit schemas contain paused states, but transition semantics are incomplete | Tutor-only discussion | `state_contract` | Define effects on reminders, streaks, practices, and resumption first | session + habits | P2 | Medium |
| Correct or remove historical evidence | Evidence can be appended and practices reopened, but destructive correction rules are absent | No safe operation | `state_contract` | Define append, supersede, and audit rules before exposing | ledger/practice | P2 | High |
| Automatically repair a reported capability gap | Open reports exist, but no repair service is connected | Report remains open | `external_integration` | Build RepairQueue/Bridgeclaw integration first | report lifecycle | P3 | High |

## Implemented From This Audit

`submit_mixed_evidence` now persists the daily-routine completion and then closes or appends the Phase VI evidence through the existing evidence gate. `add_core_habit` is allowed to reach the high-thinking tutor and its existing tool binding. Concrete cadence changes persist before the refreshed settings panel is shown. `inspect_identity_map` returns the saved domain map rather than compact memory.

Runtime capability gaps are accepted only when confidence is at least 0.75, an anticipated route is named, and the router selected `free_tutor` or `unknown`. Accepted gaps are non-mutating and are stored as typed open reports. Low-confidence or overlapping gap claims are discarded so the tutor can use an existing route.

## Deferred Candidates

Named extra-habit completion needs field extraction against active habit definitions. Reminder scheduling needs a real scheduler configuration contract. Pause/resume and historical evidence correction need explicit state machines. Automated repair needs an external repair worker. These are valid capabilities, but adding router labels before their software contracts exist would create false affordances.

## Regression Targets

- One message that explicitly completes a daily habit and provides sufficient practice evidence changes both tracks once.
- A request to add a named habit reaches `add_core_routine_habit` instead of only rendering routine status.
- “Cambia mi ritmo a semanal” persists `weekly` and then shows the refreshed setting.
- “Muéstrame mi mapa inicial” returns persisted identity-map fields.
- A low-confidence capability-gap guess does not create a report or block the tutor.
- A high-confidence unsupported request creates one typed `capability_gap` report and performs no state mutation.

## Second Audit: Deferral, Reference Targeting, And Gap Fluidity

Production traces exposed a broader failure family. A supported request to postpone a blocked practice was classified as a missing capability; validation changed the route but retained stale gap metadata; placeholder text such as `none` was then persisted as a real gap; and the recovery sentence invited the user to ask for an alternative, which re-entered the same gap. Separately, a partial report naming a prior cycle was evaluated against the active cycle because reference targeting happened only after the evidence became sufficient.

The universal correction is:

- sequential domain items need an explicit deferred state when temporary constraints are legitimate;
- named-item references must control every evidence stage, not only final persistence;
- capability-gap UX applies only to explicit unsupported execution requests;
- placeholder and stale anticipation metadata must be removed before dispatch;
- recovery copy must not ask the user to repeat a phrase that triggers the same failure;
- router and tutor require the same bounded conversational window, while persisted state remains authoritative.

Implemented coverage:

- `defer_practice` uses the existing `skipped` practice status as pending work, records the reason, advances to the next canonical cycle, and leaves progress unchanged.
- Status and practice history expose deferred work.
- Later sufficient evidence can complete a deferred named cycle without changing the active cycle.
- Partial and announced evidence use the explicitly named cycle for their prompts.
- The router and tutor now receive the latest 12 messages; previously Convex loaded 16, the router saw 8, and the tutor prompt saw none.
- Capability-gap reports now preserve a generalized missing-contract cause in addition to the specific request.
