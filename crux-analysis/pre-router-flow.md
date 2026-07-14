# Arqueidentidad Fase VI Pre-Router Flow

This file is a task-surface map, not a design spec. It turns the imagined UI from `context4.txt` into routes and task signals that the Telegram agent should be able to execute conversationally for the user.

## Source Flow

The app has four user surfaces plus an automatic system surface.

The first surface is bootstrap. It behaves like a guided form, but in chat it must feel like a tutor conversation. Rhythm is the only Arqueidentidad-map setup field. Everything after rhythm belongs to Quest setup: dreamline, fear-setting, initial identity, retos, final identity with why, optional extra habits, cheat day, and empty day. The route already exists as `onboarding`, with `answer_current_step`, `ask_clarification`, and `confirm_previous_suggestion`.

The second surface is the general dashboard. It shows the daily Quest routine, the habit streak, cheat day, empty day, current Arqueidentidad phase, current sub-phase, active practice, cadence, what is next, what was previous, and deferred practices. Chat equivalents exist through `progress`, `habit_status`, `active_practice`, and `practice_history`.

The third surface is the specific control area. It lets the user change cadence, cheat day, and empty day; manage habits; correct every named identity-map field; inspect or defer sub-phases; submit evidence; inspect phase knowledge; and review previous, current, next, or deferred practices.

The fourth surface is user-owned history: practice evidence, routine closures, stable memory, and problem reporting. The automatic system surface contains morning and evening routine check-ins, one delayed retry after temporary tutor demand, and periodic stable-memory review. Scheduled behavior is audited even when it has no clickable control.

## Pre-Router Flow Matrix

| UI panel | User action | Existing route/intent | Backend/tool support | Gap status |
|---|---|---|---|---|
| Bootstrap | Start onboarding from first message | `onboarding/start_or_continue` | `updateSession`, onboarding assessments | Covered |
| Bootstrap | Choose rhythm | `onboarding/answer_current_step` | `updateProfile` | Covered |
| Bootstrap | Answer dreamline: tener, hacer, ser | `onboarding/answer_current_step` | `updateProfile.dreamline` | Covered |
| Bootstrap | Answer fear-setting | `onboarding/answer_current_step` | `updateProfile.fearSetting` | Covered |
| Bootstrap | Define initial identity | `onboarding/answer_current_step` | `updateProfile.initialIdentity` | Covered; runtime verification pending |
| Bootstrap | Define external, internal, and philosophical retos | `onboarding/answer_current_step` | Existing challenge-compatible profile fields | Covered with copy change |
| Bootstrap | Define final identity and why | `onboarding/answer_current_step` | `updateProfile.heroName`, `updateProfile.heroWhy` | Covered with order change |
| Bootstrap | Choose 0 to 3 extra habits | `onboarding/answer_current_step` | `addCoreRoutineHabit` | Covered, UI now explicit |
| Bootstrap | Choose cheat day and empty day | `onboarding/answer_current_step` | `setCheatDay` / profile days | Covered, moved to final setup step |
| Bootstrap | Ask what a question means | `onboarding/ask_clarification` | Tutor only | Covered |
| Daily routine | Show today's habits | `habit_status/ask_pending_habits` | `getDailyRoutineState` | Covered |
| Daily routine | Mark all pending habits done | `daily_habit/confirm_daily_habit` | `markDailyHabitsDone` | Covered |
| Daily routine | Close the day with identity vote, habits completed, and tomorrow's prediction | `daily_habit/confirm_daily_habit` | Raw three-part evidence + `markDailyHabitsDone` | Covered; structured-field persistence is not required by the current contract |
| Daily routine | Mark one named habit done | `daily_habit/partial_daily_habit` | Title-to-key resolution + `markDailyHabitsDone` | Covered; runtime verification pending |
| Daily routine | Add a new habit | `daily_habit/add_core_habit` | `addCoreRoutineHabit` | Covered, needs more transcript testing |
| Daily routine | Pause, reactivate, or archive an extra habit | `daily_habit/pause_habit`, `resume_habit`, `archive_habit` | `setDailyHabitStatus`; base habit protected; history preserved | Covered; runtime verification pending |
| Daily routine | Condense several habits into one routine | `daily_habit/condense_habits` | `condenseDailyHabits`; sources archived and replacement created | Covered; runtime verification pending |
| Daily routine | Inspect routine streak/history | `habit_status/inspect_routine_history` | `getDailyRoutineHistory` + title-aware renderer | Covered; runtime verification pending |
| Routine days | Change cheat day | `habit_status/set_routine_days` | `setCheatDay` | Covered |
| Routine days | Change empty day | `habit_status/set_routine_days` | `setCheatDay` stores both days | Covered |
| Routine days | Explain empty day behavior | `empty_day/start_empty_day` or `knowledge_question/ask_concept` | TUI renderer + tutor | Covered |
| Phase status | Show full status | `progress/ask_concept` | `renderFullStatus`, progress diagram | Covered |
| Phase status | Show current practice only | `active_practice/ask_clarification` | Tutor + current practice state | Covered |
| Phase status | Show saved reports for a cycle | `practice_history/inspect_practice_history` | `getPracticeHistory` | Covered |
| Phase status | Show only practices postponed for later | `practice_history/inspect_deferred_practices` | Persisted deferred practices from user state | Covered; runtime verification pending |
| Phase status | Show previous/current/next sub-phase | `progress/inspect_phase_sequence` | Persisted current cycle + canonical content sequence | Covered; runtime verification pending |
| Sub-phase controls | Start next canonical sub-phase | `debrief/submit_evidence` or `active_practice/defer_practice` | `startPracticeCycle`, deferral | Covered through progression |
| Sub-phase controls | View a named sub-phase | `active_practice/inspect_named_practice` | Canonical content renderer; read-only and no state transition | Covered; runtime verification pending |
| Sub-phase controls | Jump arbitrarily to a named future sub-phase | None | Progression remains completion or explicit canonical deferral only | Intentionally unavailable |
| Sub-phase controls | Complete checklist without evidence | Should not exist | Evidence gate requires practice narration, microthematic, and hyperthematic or equivalent evidence | Rejected |
| Sub-phase controls | Reopen a named practice marked by error | `active_practice/reopen_practice` | `reopenPracticeByCycle`; preserves evidence and active-cycle scope | Covered with restrictions |
| Sub-phase controls | Postpone current practice | `active_practice/defer_practice` | `deferCurrentPracticeAndStartNext` | Covered |
| Knowledge | Ask about phase concepts | `knowledge_question/ask_concept` | Canonical markdown + tutor | Covered |
| Knowledge | Browse phase/sub-phase content as a menu | `knowledge_question/browse_knowledge` | Deterministic knowledge menu + tutor expansion | Covered; runtime verification pending |
| Knowledge | Open concepts base, preliminar, liminar, or postliminar directly | `knowledge_question/ask_concept` | Canonical markdown + high-thinking tutor | Covered |
| Settings | Inspect identity map | `settings/inspect_identity_map` | `renderIdentityMapSummary` | Covered |
| Settings | Change cadence | `settings/change_settings` | `updateProfile` | Covered |
| Settings | Edit identity, retos, dreamline, or fear-setting after onboarding | `settings/edit_identity_map` | Shared field aliases -> preservation validation -> `updateProfile` -> refreshed map | Covered for named corrections; broad rewrites ask clarification |
| History | Inspect stable memory | `memory/ask_concept` | `renderMemory`; read-only | Covered |
| Shortcut audit | `/start` after activation | command alias | Renders current status; does not restart onboarding | Covered |
| Shortcut audit | `/practice` with another cycle | command alias | Renders named instructions read-only; does not jump progression | Covered |
| Shortcut audit | `/debrief` with insufficient text | command alias | Uses the same evidence gate as natural-language evidence; no premature completion | Covered; runtime verification pending |
| Shortcut audit | `/reset` or reset confirmation | command alias | No mutation until a coherent reset contract exists | Intentionally unavailable |
| Reports | Report app failure | `report/report_problem` | `createReport` | Covered |
| Internal execution | Authorize high-thinking tutor tools | route/intent-scoped tool set | Post-router authorization gate; progression and memory stay controller-owned | Covered; regression verification pending |
| Automatic system | Morning routine check-in | scheduled job | `sendMorningHabitCheckins` -> Telegram -> check-in audit | Covered |
| Automatic system | Evening routine check-in | scheduled job | `sendEveningHabitCheckins` -> Telegram -> check-in audit | Covered |
| Automatic system | Retry after temporary tutor demand | scheduled action | `retryTutorAnswer` after 30 seconds -> Telegram/report | Covered |
| Automatic system | Review stable memory after accumulation | scheduled action | user-only memory input -> `replaceMemoryLines` | Covered; internal-only |
| Internal audit | Inspect router decisions | Internal only | `routerDecisions` table | Deliberately not user-facing |

## Route Implementation Checklist

This checklist is the executable coverage contract for the task surface. A checked row has end-to-end evidence across task signal, route, dispatch, operation, persisted result, user copy, and audit output. `implemented_unverified` means the code path exists but still needs a complete Telegram-plus-Convex regression. Update this section whenever the UI, backend operations, deterministic processes, or router surface changes.

| Done | Path | User goal | Route and intent | Backend-agent communication path | Verification evidence | Status |
|---|---|---|---|---|---|---|
| [x] | `BOOT-01` | Start from any first message | `onboarding/start_or_continue` | first-contact state gate -> `startOnboarding` -> session/profile persistence -> opening copy -> message/router audit | Production first-contact traces | `verified` |
| [x] | `BOOT-02` | Choose rhythm | `onboarding/answer_current_step` | assessment -> cadence normalization -> `updateProfile`/`updateSession` -> next step copy | Production onboarding traces | `verified` |
| [ ] | `BOOT-03` | Save dreamline | `onboarding/answer_current_step` | assessment -> structured extraction -> `updateProfile.dreamline` -> next step copy | Full Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `BOOT-04` | Save fear-setting | `onboarding/answer_current_step` | assessment -> structured extraction -> `updateProfile.fearSetting` -> next step copy | Full Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `BOOT-05` | Save initial identity | `onboarding/answer_current_step` | assessment -> structured extraction -> `updateProfile.initialIdentity` -> next step copy | Full Telegram-plus-Convex regression required | `implemented_unverified` |
| [x] | `BOOT-06` | Save three retos | `onboarding/answer_current_step` | tutor assessment -> normalized fields -> `updateProfile` -> next step copy | Production onboarding traces | `verified` |
| [x] | `BOOT-07` | Save final identity and why | `onboarding/answer_current_step` | tutor assessment -> normalized identity -> `updateProfile` -> next step copy | Production onboarding traces | `verified` |
| [ ] | `BOOT-08` | Add optional habits | `onboarding/answer_current_step` | assessment -> `addCoreRoutineHabit` -> routine state -> next step copy | Full Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `BOOT-09` | Set cheat and empty days | `onboarding/answer_current_step` | assessment -> day validation -> `setCheatDay`/profile update -> routine activation copy | Full Telegram-plus-Convex regression required | `implemented_unverified` |
| [x] | `BOOT-10` | Ask for clarification without advancing | `onboarding/ask_clarification` | task-signal gate -> tutor explanation -> no mutation -> message audit | Production clarification traces | `verified` |
| [x] | `MAP-01` | Inspect identity map | `settings/inspect_identity_map` | router -> settings dispatch -> `renderIdentityMapSummary` -> outbound copy -> router audit | Production inspection traces | `verified` |
| [ ] | `MAP-02` | Correct internal reto | `settings/edit_identity_map` | internal-field alias -> preserve omitted profile -> `updateProfile` -> refreshed map/audit | Parser coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-02E` | Correct external reto | `settings/edit_identity_map` | external-field alias -> preserve omitted profile -> `updateProfile` -> refreshed map/audit | Parser coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-02P` | Correct philosophical reto | `settings/edit_identity_map` | philosophical-field alias -> preserve omitted profile -> `updateProfile` -> refreshed map/audit | Parser coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-03` | Change final identity name | `settings/edit_identity_map` | explicit or conversational name extraction -> preserve why -> `updateProfile` -> refreshed map/audit | Regression tests cover explicit and conversational names; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-03W` | Change final identity why | `settings/edit_identity_map` | why-field extraction -> preserve name -> `updateProfile` -> refreshed map/audit | Parser coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04` | Correct dreamline: tener | `settings/edit_identity_map` | `dreamline.have` alias -> preserve hacer/ser -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04D` | Correct dreamline: hacer | `settings/edit_identity_map` | `dreamline.do` alias -> preserve tener/ser -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04B` | Correct dreamline: ser | `settings/edit_identity_map` | `dreamline.be` alias -> preserve tener/hacer -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04F1` | Correct fear-setting: what-if | `settings/edit_identity_map` | `fearSetting.whatIf` alias -> preserve six omitted fields -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04F2` | Correct fear-setting: prevention | `settings/edit_identity_map` | `fearSetting.prevent` alias -> preserve six omitted fields -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04F3` | Correct fear-setting: repair | `settings/edit_identity_map` | `fearSetting.repair` alias -> preserve six omitted fields -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04F4` | Correct fear-setting: partial wins | `settings/edit_identity_map` | `fearSetting.partialWins` alias -> preserve six omitted fields -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04F5` | Correct fear-setting: six-month cost | `settings/edit_identity_map` | `fearSetting.cost6Months` alias -> preserve six omitted fields -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04F6` | Correct fear-setting: one-year cost | `settings/edit_identity_map` | `fearSetting.cost1Year` alias -> preserve six omitted fields -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04F7` | Correct fear-setting: three-year cost | `settings/edit_identity_map` | `fearSetting.cost3Years` alias -> preserve six omitted fields -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04I1` | Correct initial identity name | `settings/edit_identity_map` | `initialIdentity.name` alias -> preserve behavior/belief -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04I2` | Correct initial identity behavior | `settings/edit_identity_map` | `initialIdentity.behavior` alias -> preserve name/belief -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `MAP-04I3` | Correct initial identity belief | `settings/edit_identity_map` | `initialIdentity.belief` alias -> preserve name/behavior -> `updateProfile` -> refreshed map/audit | Field-preservation unit coverage; Telegram regression required | `implemented_unverified` |
| [ ] | `SETTINGS-01` | Change cadence after onboarding | `settings/change_settings` | cadence extraction -> `updateProfile` -> refreshed settings -> router/message audit | Code path exists; Telegram regression required | `implemented_unverified` |
| [x] | `ROUTINE-01` | Show today's routine | `habit_status/ask_pending_habits` | router -> `getDailyRoutineState` -> TUI renderer -> outbound audit | Production routine traces | `verified` |
| [x] | `ROUTINE-02` | Complete all pending habits | `daily_habit/confirm_daily_habit` | router -> habit parser -> `markDailyHabitsDone` -> refreshed routine copy/audit | Production completion traces | `verified` |
| [ ] | `ROUTINE-02R` | Close routine with vote, completed habits, and tomorrow prediction | `daily_habit/confirm_daily_habit` | natural report -> completion extraction -> raw evidence persistence + habit completion -> refreshed routine | Existing completion path; full three-part Telegram regression required | `implemented_unverified` |
| [ ] | `ROUTINE-03` | Complete one habit by title | `daily_habit/partial_daily_habit` | title-to-key resolution -> ambiguity gate -> `markDailyHabitsDone` -> refreshed routine | Unit tests cover unique and ambiguous references; Telegram regression required | `implemented_unverified` |
| [ ] | `ROUTINE-04` | Add a habit | `daily_habit/add_core_habit` | router -> high-thinking tool loop -> `addCoreRoutineHabit` -> refreshed routine | Full Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `ROUTINE-05` | Pause an extra habit | `daily_habit/pause_habit` | named reference -> base-habit guard -> `setDailyHabitStatus(paused)` -> refreshed routine/audit | Code path implemented; Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `ROUTINE-05R` | Reactivate a paused habit | `daily_habit/resume_habit` | named reference -> capacity/slot guards -> `setDailyHabitStatus(active)` -> refreshed routine/audit | Code path implemented; Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `ROUTINE-05A` | Remove or archive an extra habit | `daily_habit/archive_habit` | named reference -> base-habit guard -> archival mutation -> preserve historical keys -> refreshed routine/audit | Code path implemented; Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `ROUTINE-06` | Condense active extra habits | `daily_habit/condense_habits` | multi-reference gate -> archive sources -> create one replacement -> preserve old completions -> refreshed routine/audit | Code path implemented; Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `ROUTINE-07` | Inspect routine history and streak | `habit_status/inspect_routine_history` | query completions + habit catalog -> title-aware history renderer -> outbound audit | Renderer unit test passes; Telegram regression required | `implemented_unverified` |
| [x] | `DAYS-01` | Change cheat day | `habit_status/set_routine_days` | day extraction -> distinct-day validation -> persistence -> refreshed routine | Production setting traces | `verified` |
| [x] | `DAYS-02` | Change empty day | `habit_status/set_routine_days` | day extraction -> distinct-day validation -> persistence -> refreshed routine | Production setting traces | `verified` |
| [ ] | `DAYS-03` | Explain empty-day behavior | `empty_day` or `knowledge_question/ask_concept` | router -> routine state/tutor -> explanation -> no mutation | Telegram regression required | `implemented_unverified` |
| [x] | `PHASE-01` | Show full phase status | `progress` | router -> persisted phase/routine state -> progress renderers -> outbound audit | Production progress traces | `verified` |
| [x] | `PHASE-02` | Show active practice instructions | `active_practice/ask_clarification` | current-cycle reference -> canonical content -> tutor/deterministic copy -> no mutation | Production practice traces | `verified` |
| [x] | `PHASE-03` | Submit natural practice evidence | `debrief/submit_evidence` | evidence gate -> target resolution -> ledger/practice mutation -> next canonical practice -> outbound audit | Production closeout traces plus unit tests | `verified` |
| [x] | `PHASE-04` | Submit routine and practice evidence together | `debrief/submit_mixed_evidence` | evidence split -> habit mutation + targeted practice mutation -> combined truthful copy/audit | Production mixed-track behavior observed | `verified` |
| [x] | `PHASE-05` | Inspect saved practice evidence | `practice_history/inspect_practice_history` | target resolution -> `getPracticeHistory` -> persisted evidence renderer -> outbound audit | Production history traces | `verified` |
| [ ] | `PHASE-05D` | Inspect only deferred practices | `practice_history/inspect_deferred_practices` | deferred-list signal -> persisted deferred state -> read-only renderer -> outbound audit | Code path implemented; Telegram regression required | `implemented_unverified` |
| [x] | `PHASE-06` | Postpone active practice | `active_practice/defer_practice` | explicit deferral -> `deferCurrentPracticeAndStartNext` -> pending history/status -> next practice copy | Production deferral traces | `verified` |
| [ ] | `PHASE-07` | Complete a deferred named practice later | `debrief/submit_evidence` | reference-first target -> `completePracticeById` -> preserve active cycle -> refreshed history/status | Code and unit coverage exist; Telegram regression required | `implemented_unverified` |
| [ ] | `PHASE-08` | Reopen a named practice marked complete by error | `active_practice/reopen_practice` | named reference -> `reopenPracticeByCycle` -> active or deferred recovery -> preserve evidence/current cycle -> refreshed status/audit | Code path implemented; Telegram-plus-Convex regression required | `implemented_unverified` |
| [ ] | `PHASE-09` | Inspect previous/current/next sub-phase | `progress/inspect_phase_sequence` | canonical sequence + persisted state -> sequence renderer -> no mutation | Code path implemented; Telegram regression required | `implemented_unverified` |
| [ ] | `PHASE-10` | View instructions for a named sub-phase | `active_practice/inspect_named_practice` | named reference -> canonical content renderer -> explicit no-mutation copy | Code path implemented; Telegram regression required | `implemented_unverified` |
| [-] | `PHASE-10J` | Jump arbitrarily to a future named sub-phase | no supported route | command and natural-language guards preserve canonical progression; use completion or one-step deferral | Arbitrary jump deliberately excluded | `intentionally_unavailable` |
| [-] | `PHASE-11` | Complete a practice without evidence | no supported route | evidence gate preserves state and requests missing experiential evidence | Rejection is intentional and tested | `intentionally_unavailable` |
| [x] | `KNOW-01` | Ask a Phase VI concept question | `knowledge_question/ask_concept` | router -> canonical markdown + state -> high-thinking tutor -> outbound audit | Production tutor traces | `verified` |
| [ ] | `KNOW-02` | Browse phase/sub-phase content as a menu | `knowledge_question/browse_knowledge` | menu signal -> deterministic content map -> tutor expansion on selection | Code path implemented; Telegram regression required | `implemented_unverified` |
| [x] | `KNOW-03` | Open concepts base or a named phase section | `knowledge_question/ask_concept` | named topic -> canonical markdown -> high-thinking tutor -> no mutation -> outbound audit | Existing concept-answer production traces | `verified` |
| [ ] | `MEMORY-01` | Inspect stable memory | `memory/ask_concept` | state query -> read-only memory renderer -> outbound audit | Code path exists; Telegram regression required | `implemented_unverified` |
| [x] | `REPORT-01` | Report an app failure | `report/report_problem` | router -> `createReport` -> calm user copy -> report/message audit | Production reports exist | `verified` |
| [x] | `REPORT-02` | Record a true unsupported execution gap | `free_tutor`/`unknown` + capability metadata | validation gate -> non-mutating `capability_gap` report -> truthful copy | Production gap traces and audit rules | `verified` |
| [ ] | `SHORTCUT-01` | Use `/start` after activation | command alias | state guard -> current status render -> no onboarding mutation | Code path implemented; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-02` | Use `/practice` to inspect another cycle | command alias | named reference -> read-only instructions -> preserve active cycle | Code path implemented; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-02D` | Use `/debrief` without sufficient evidence | command alias | shared evidence assessment -> invitation or missing-detail copy -> no practice mutation | Guard implemented; Telegram-plus-Convex regression required | `implemented_unverified` |
| [-] | `SHORTCUT-03` | Reset all durable state | command alias | truthful no-op until profile, routine, practices, history, and audit have one reset contract | Deliberately unavailable | `intentionally_unavailable` |
| [ ] | `SHORTCUT-04` | Use `/learn` | command alias for knowledge surface | canonical phase map renderer -> no mutation | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-05` | Use `/habits` or `/routine` | command alias for `ROUTINE-01` | routine query -> routine renderer -> no direct mutation except base-habit ensure | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-06` | Use `/cheatday` | command alias for `DAYS-01/02` | shared routine-day parser/validation -> persistence or clarification | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-07` | Use `/emptyday` | command alias for `DAYS-03` | empty-day state -> read-only anchor renderer | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-08` | Use `/status` | command alias for `PHASE-01` | persisted routine + phase state -> combined renderer | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-09` | Use `/memory` | command alias for `MEMORY-01` | stable memory state -> read-only renderer | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-10` | Use `/settings` | command alias for settings surface | current profile -> read-only settings renderer | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-11` | Use `/report` | command alias for `REPORT-01` | explicit report text -> report mutation -> acknowledgement | Code path exists; Telegram regression required | `implemented_unverified` |
| [ ] | `SHORTCUT-12` | Use `/help` | command alias for full task surface | natural-language capability menu -> no mutation | Code path exists; Telegram regression required | `implemented_unverified` |
| [x] | `SCHEDULE-01` | Receive morning routine check-in | scheduled internal action | cron -> eligible-user query -> Telegram send -> check-in persistence | Production cron notifications observed | `verified` |
| [x] | `SCHEDULE-02` | Receive evening routine check-in | scheduled internal action | cron -> eligible-user query -> Telegram send -> check-in persistence | Production cron notifications observed | `verified` |
| [x] | `RECOVERY-01` | Receive delayed answer after temporary Gemini demand | scheduled internal action | demand classification -> wait copy -> 30-second scheduler -> one tutor retry -> answer or report | Production fallback previously tested | `verified` |
| [ ] | `MEMORY-02` | Review stable memory after accumulated user turns | scheduled internal action | user-only transcript threshold -> memory assessment -> replace-by-topic mutation -> no automatic user copy | Code/cron inspection; production threshold regression required | `implemented_unverified` |
| [ ] | `TOOL-01` | Keep tutor mutations inside the selected route contract | internal execution guard | route-specific declarations -> post-call authorization -> allowed mutation or non-mutating denial | Unit authorization matrix added; full agent regression required | `implemented_unverified` |
| [-] | `AUDIT-01` | Inspect internal router decisions | internal-only | Convex `routerDecisions` inspection outside user-facing agent | Deliberately internal | `intentionally_unavailable` |

Checklist maintenance rule: preserve stable path IDs; add rows when the task surface or backend grows; mark changed paths `implemented_unverified` until re-proven; mark production failures `regressed`; and close a row only when the complete backend-agent path is observable. A route decision alone never closes a row.

## Missing Or Weak Router Paths

The visible task surface now has executable paths for named map corrections, named habit completion, habit pause/reactivation/archival, habit condensation, routine history, named-practice inspection and reopening, phase-sequence inspection, and knowledge browsing. Those paths remain `implemented_unverified` until Telegram and Convex together prove routing, extraction, persistence, copy, and audit output.

The remaining gaps are bounded product contracts rather than accidental missing handlers. A full durable reset is unavailable because profile, routine, practices, evidence, memory, and audit history do not yet share one reset policy. Arbitrary jumps to future sub-phases are unavailable because Phase VI progression is canonical; a user may inspect a named sub-phase, defer the active one, or reopen prior completed work without silently changing progression.

Reminder-hour scheduling and whole-program pause/resume are not represented in the current product state. They should be added only after their timezone, notification, backlog, and reactivation semantics are defined. Historical evidence is append-preserving: corrections may update current map or routine state, while destructive rewriting of completed evidence remains unavailable.

Broad requests such as changing the whole identity map still require one clarification turn when the target fields cannot be determined safely. This is a precision boundary inside an implemented route, not a capability gap.

## Route Candidates From UI Equivalence

| Candidate | Recommendation | Primary gap | Priority | Confidence |
|---|---|---|---|---|
| Full durable reset | Define deletion versus archival for every user-owned entity before exposing execution | `state_contract` | P3 | High |
| Jump to an arbitrary future sub-phase | Keep unavailable; canonical completion or one-step deferral protects progression | `intentional_boundary` | P3 | High |
| Schedule reminder hour | Define timezone, delivery, retry, and opt-out semantics before adding a route | `state_contract` | P3 | Medium |
| Pause or resume the whole program | Define effects on cron prompts, streaks, active practice, and deferred work | `state_contract` | P3 | Medium |
| Rewrite historical evidence | Preserve append-only history; design a correction event if the need recurs | `data_contract` | P3 | Medium |
| Broad identity-map rewrite | Keep the settings route and request the smallest field clarification | `field_extraction` | P2 | High |

## Universal Rule Captured By This Pass

Every crux should run a bidirectional task-surface reconciliation before route anticipation. First, turn every reasonable screen, menu, field, selector, checklist item, and settings action into a conversational route contract. Then inspect runtime commands, shortcuts, tools, jobs, and mutations and represent each one on the task surface. This prevents visible controls without executable paths and hidden paths that bypass state guards.

Composite controls must be decomposed. A panel called "edit profile" does not prove that each editable field can be inspected, changed, validated, persisted, and rendered while omitted fields remain unchanged. Each independently meaningful child action needs its own stable checklist row and verification state. Read-only selectors must state that they do not mutate progression.

A recognized route is not enough. The dispatch layer must prove that the route reaches the operation that the task signal implied. If the router says "profile mutation" but the handler only renders settings, the fix is `add_handler_binding`, not `capabilityGap`. Capability gaps are reserved for unsupported execution after existing routes, intents, tools, and state contracts have been checked.
