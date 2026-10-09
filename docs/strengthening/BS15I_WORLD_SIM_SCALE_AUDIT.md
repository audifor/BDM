# BS15I world simulation scale audit

Worktree: `C:/BDM-BS15I`. Source checkpoint: `C:/Temp/BS15I-long-y6-save-v4.json` (2038-10-01). Existing production fixes, logs and checkpoints are preserved. No long simulation process was active at inspection. No merge, reset, clean, push or commit was performed.

## A. Proven production route and why the old path was slow

`BS15ILongHorizon.test.ts -> runTalentLongHorizonCertification -> simulateUntilDate -> tickSimulateUntilDate -> advanceGameDay -> advanceGameDayWithResult -> simulateRemainingGamesToday -> simulateAndApplyGame -> prepareMatchOptions -> simulateMatchWithRotations -> createMatchSession / applyDueRotations / stepMatchSession -> completeMatch -> applyCompletedMatch -> applyPlayerMatchConsequences -> applyPostMatchInjuries -> CalendarEngine.advanceDayWithTrace`.

The original `simulateRemainingGamesToday` reduced all scheduled games through the same detailed resolver. There was no detail selector. Even remote AI games generated play calls, spatial movement, screen/drive/cut/transition intents and spatial contexts that no viewer consumed. Completed results still ran the correct canonical consequences.

Runtime evidence: the mature-world profiling fixture wraps production `simulateAndApplyGame`, counts policy decisions and measures day phase timings. The before run used this old source before task edits, from certified Y6 with seed 15015 advanced by the number of completed games. Subsequent forced-FULL replay reproduced all 13 semantic fingerprints from that run. Adaptive runs classify all eight matches in this seven-day fixture as BACKGROUND through ordinary context, without test-ID branches.

Match detail was only part of the problem. The original profiled week spent 4.195 s in MATCH_RESOLUTION out of 22.971 s wall time. TRAINING took 3.862 s, SCOUTING_ASSIGNMENTS 1.843 s, SCOUTING_INTAKE 1.727 s, STAFF_HUMAN_STATE 1.673 s and DRAFT 1.362 s. Repeated history reconstruction/validation and repeated per-person historical queries dominated the remaining cost.

## B. Existing infrastructure and integration status

The worktree is owned by `C:/BDM-BS11C1/.git/worktrees/BDM-BS15I`, not the main repository owning `C:/BDM`. The current main checkout contains WSR and Match Next; this BS15I checkout does not contain `src/app/worldSim`, `src/app/game/matchResolution.ts`, `src/engine/world-sim/background` or `src/engine/match-next` at task start. Its production preparation and completion contracts belong to the spatial MatchEngine V3. No WSR-named integration commit was found in this worktree's reachable history.

| Existing component | Before in BS15I | After |
|---|---|---|
| WSR SimulationResolutionPolicy in current main | Not integrated; main defaults also retain a conservative exact budget of 24 | Same authority concept adapted to BS15I inputs; one production selector |
| WSR BackgroundMatchModel / BackgroundMatchCompletion | Main-only calibrated model depends on Match Next setup and consequence contracts | Not copied or merged; common V3 action execution provides nonspatial preparation |
| Match Next FAST execution | Main-only; not a callable engine in this worktree | Not claimed as recovered; V3 FULL remains canonical here |
| prepareDayGames / simulation runner / worker pool | Main-only Match Next setup boundary | No worker dependency or parallel engine introduced |
| WSR daily result batching / single validation | Main-only interfaces | Atomic daily validation adapted to current immutable update boundary; match evidence appended once per day |
| Existing updateGameWorldBatch | Reachable in accepted training batching; per-subsystem publication | Preserved and participates in nested daily transaction |
| Scheduled training date index / schedule batching | Reachable accepted BS15I implementation | Preserved; targeted validation avoids irrelevant historical collision buckets |
| Accepted incremental history / knowledge validation | Reachable, but stimulus and source changes still trigger broad scans | Scalar operation-local stimulus append lineage; source-aware injury validation |

Directly importing the calibrated WSR model would require a second engine-specific setup/completion system or a Match Next migration. Neither was necessary or authorized. The adapted route shares existing basketball rules rather than installing a separate fitted basketball truth.

## C. Simulation tiers

- FULL: user games and explicitly observed games, including active LIVE_GAME scouting. Existing spatial preparation and action execution remain unchanged. Viewer preparation and instant user results keep FULL as the default.
- STANDARD: user's competition and explicitly followed competitions/teams. Player-level execution uses canonical rotations, clock, shot/pass/turnover/foul/rebound authorities and completion without spatial play calling/movement.
- BACKGROUND: other remote AI games. Currently uses the same nonspatial sporting execution as STANDARD; a separate aggregate statistical model is unnecessary for this scope.

`resolveSimulationDetail(world, game, context)` is the only selection authority. Explicit certification/debug override is command scoped. No tier or derived decision is saved. No hardware-dependent decision or BS15I-specific game classification exists.

Both lower tiers use `executeMatchAction`, shared with FULL. Shot zones come from existing player/tactical weights; unobserved geometric contexts are omitted. Shooting fouls, free throws, shot execution, turnovers, passes, assists, defensive attribution, rebounds, overtime, fatigue, rotation and canonical consequences remain shared. Lightweight spatial state retains existing ball/substitution compatibility but does not run movement or action intents. Transient sporting events remain because canonical stats/development/fatigue consumers need them; presentation frames are never generated.

## D. Certification contracts

Focused selector and resolver tests cover deterministic execution within each tier, legal non-tied completion, bounded score, participation, score/stat agreement enforced at the canonical boundary, derived standings, unchanged roster and identity, duplicate-result rejection and Save V4/reload. NCAA-specific tests compare FULL and BACKGROUND participation IDs and canonical season closure. The original FULL route's mature-week fingerprints certify that batching and indexes preserve existing behavior.

Daily transactions preserve every update's append/immutable guards, validate the final world before publication and roll back to the original world on failure. Nested transactions and exception cleanup have focused tests. New injury overlaps revalidate the entire affected player's history, including an earlier new injury overlapping a later unchanged injury. Historical completed sessions still revalidate nonempty assigned staff when employment/assignments change, preserving existing Save-load semantics.

## E. Daily lifecycle cadence and scaling audit

No subsystem cadence or gameplay rule was changed. Classes below describe existing production semantics, not proposed new gameplay frequencies.

| Subsystem | Existing semantic cadence | Scaling treatment |
|---|---|---|
| Date / season pointer | DAILY_REQUIRED | Existing date authority retained |
| Match resolution / result / history | EVENT_DRIVEN, fixture date | Adaptive detail; shared sporting rules; daily stimulus evidence batch |
| Training execution | DATED, scheduled session date | Existing schedule batch retained; append only new evidence |
| AI training planning | WEEKLY, ISO Monday | Unchanged |
| Training participation | DAILY_REQUIRED query | Scheduled-games index per collection; fatigue remains date/player specific |
| Scouting intake | DAILY_REQUIRED active/due work; planning days 1/8/15/22/29 | Cadences unchanged; atomic daily validation |
| Scouting assignments / reports | DATED and event-driven active work | Existing progression retained |
| Recruiting / arrivals / walk-ons | DATED cycles/deadlines and roster boundaries | Accepted canonical intake/self-healing preserved |
| Talent supply / development | ANNUAL boundary, July 1 | Preserved; no year-end fabricated aggregate state |
| College eligibility / portal | DAILY_REQUIRED date guards; EVENT_DRIVEN participation and membership | Preserved; active enrollment lookup indexed for training transfer authorization |
| Academics | TERM_BOUNDARY, Jan 1 / July 1 | Preserved |
| NIL expiry | DATED | Existing daily due checking retained |
| NIL / boosters autonomy | MONTHLY, first day | Preserved |
| Draft opening / picks / advisories | DATED and EVENT_DRIVEN | Eligibility facts indexed by PlayerId; due draft authority unchanged |
| Contracts / retention / offers | DATED expiry/responses; contextual negotiation decisions | Cadence unchanged; roster and player-contract query indexes |
| Professional pathways | MONTHLY and new draft rights | Preserved |
| Career ending / retirement | ANNUAL, July 1 | Accepted cleanup preserved |
| Career fatigue / medical / rehabilitation | DAILY_REQUIRED / dated reviews | Per-player injury lookup; recurrence uses same records and rules |
| Coach finance | MONTHLY | Preserved |
| Club finance V2 | Explicit EVENT_DRIVEN authorities; no global calendar processor | Preserved; not silently disabled |
| Facilities condition | MONTHLY, elapsed-history semantics | Preserved |
| Governance | Explicit DATED / EVENT_DRIVEN commands; no automatic calendar resolver | Preserved |
| Staff human state / conflicts / culture / politics / autonomy | DAILY_REQUIRED projections/checks, with internal dated/weekly gates | Weekly workload history scanned once; responsibility queries indexed |
| Knowledge decay | DERIVABLE / LAZY freshness at query | Organization/player lookup indexed by immutable knowledge collection; first-entry semantics and query-date freshness preserved |
| World repair / planning review | EVENT_DRIVEN roster/eligibility boundaries and scheduled teams | Accepted repair preserved; roster/contract queries indexed |
| Historical validation | Changed records and their dependencies | Atomic publication; immutable history reuse; conservative fallback on arbitrary replacements |

Reference-keyed WeakMaps contain derived record indexes, not worlds or previous-map chains. Operation-local stimulus lineage is collapsed into scalar revisions and new evidence only. Every output remains an ordinary JSON-safe GameWorld; Save V4 remains the persistence authority.

The Y7 deep reload exposed a separate existing compatibility defect: current V4 reading delegated to V3 staff-contract enrichment and invented 58 renewal/backfill contracts. V4 now preserves its persisted ledger; direct legacy V3 enrichment remains enabled, and migration carries the enriched runtime into V4. Every saved Y7 payload field was checked exactly without rerunning the year. No differing field was excluded. However, Y6 itself persists 348 staff contracts and its original load already added 58 before the annual run; a Save-only check cannot certify that year from the corrected start state. Final status is PARTIAL. The corrected route passed new 7/30-day gates, but the explicitly authorized single annual run was not repeated.

## F?I. Benchmark ladder, memory, integrity and result

See `BS15I_WORLD_SIM_SCALE_RESULTS.json` and `BS15I_WORLD_SIM_SCALE_CLOSURE.md` for final measurements and the exact gate reached. Baseline/profiling logs and diagnostics remain in C:/Temp. The 30-day and annual runs are permitted only after their preceding measured and semantic gates pass. No Y1?Y6, Y8/Y10/Y20/Y30 replay is authorized or performed by this task.


## Subsequent authorized final closure

The earlier PARTIAL result above describes the previous uncertified annual run. The follow-up explicitly authorized one additional clean Y7 after real-Y6 idempotency proof and recruiting-active 7/30-day gates. That run now passes exact Save/reload and integrity, with 348 staff contracts preserved, but remains PARTIAL solely because its 339.241 s canonical annual runtime exceeds 300 s by 39.241 s. Recruiting improves 2.60x and training 1.82x in the comparable active 30-day window. The current closure report and finalClosure JSON section are authoritative for the follow-up. No Y8+ was run.


## Final authorized daily-validation closure

The subsequent focused validation request is now PASS: one new clean Y7 completes365days in273.383s, with4.370s of daily final validation. Paired7/30day saves match all211payload fields; new final Y7 Save is byte-identical to the accepted prior Y7. Full creation/load/audit/checkpoint validation remains available. Dependency receipts and operation-scoped scalar mutation lineage eliminate unrelated historical scans without retaining previous worlds. See `BS15I_DAILY_VALIDATION_CLOSURE.md` and results JSON `dailyValidationClosure` for current evidence.151focused tests/typecheck/build/diff pass. No commit, push, merge or Y8+.
