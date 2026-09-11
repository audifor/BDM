# MATCH & BASKETBALL SIMULATION V3 — MG1 · Canonical Match Audit

Branch: `match-gameplay-v3-mg1-canonical-match-audit` (based on `origin/main` @ `964fccd41ab9c881d49704ea2454ce0cb91bca27`)
Scope: audit only. No feature code, no refactors, no UI changes.

---

## A. Executive Summary

BDM has a real, deterministic, seeded possession-simulation engine (`src/engine/match/MatchEngine.ts`) that is genuinely wired end-to-end from a "Play match" button to a persisted post-match result. It is not a mock. However, three load-bearing parts of the advertised design are currently broken or unimplemented:

1. **User-selected starters are silently discarded.** The Tactics board writes to `world.lineupsByTeamId` (`TeamLineup`), but the match-construction path (`src/app/game/playUserGame.ts`) never reads it — it always recomputes a "best five" algorithmically via `selectStartingFive`. This is the known bug named in the brief, and it is confirmed with an exact file:line root cause (Section G, BUG-1).
2. **Live coaching (tactics/substitutions during a live match) is deliberately disabled** in `LiveMatchController.ts`, but the NG UI (`NgMatchViewer.tsx`) still renders controls that call into those disabled no-ops — a silent dead-UI defect.
3. **The foul/officiating system is a placeholder.** Only shooting fouls exist, at a flat 10% probability with flat 75% free throws; there is no offensive/technical/team foul, no bonus, no foul-out, and no officials/referee model anywhere in the codebase.

Outside of these three areas, the engine's core possession math (shots, rebounds, turnovers, assists, blocks, steals, fatigue) is a legitimate, contextual, ratings-driven simulation with good separation between simulation and presentation, a canonical deterministic event stream, and a box score that is provably derived from that stream (not independently tracked). Save V3 persistence of match data is minimal and correctly ephemeral (only completed games + stat-log snapshots persist; live session state does not).

**Verdict:** the architecture is suitable for incremental evolution to Match V3 with restructuring — see Section J. It is not a rewrite candidate, but BUG-1 and the live-coaching dead-UI must be fixed, and the ratings/foul/officials gaps must be explicitly scoped before MG2 begins.

---

## B. Architecture Map

```
DOMAIN            src/domain/player, src/domain/tactics (TeamLineup, TacticalPlanning),
                  src/domain/competition (CompetitionRules/GameFormatRules), src/domain/stats (MatchStatLog),
                  src/domain/training (Training, TrainingLoad, TeamCohesion), src/domain/staff*, src/domain/coach*

ENGINE            src/engine/match/ (MatchEngine, ShotResolution, ReboundResolution, TurnoverResolution,
                  AssistResolution, DefensiveAttribution, Matchups, Fatigue, WeightedChoice, PlayerMatchStats,
                  MatchPlayerProfile, MatchResultApplication)
                  src/engine/match/coaching/ (MatchCoachingState, ManualSubstitutions)
                  src/engine/match/rotation/ (RotationPlan, RotationController, MatchRotationRunner)
                  src/engine/match/tactics/ (MatchTacticalPlan, TacticalEffects)
                  src/engine/team/TeamEvaluation.ts (selectStartingFive, calculatePlayerImpact, calculateTeamStrength)
                  src/engine/random/RandomSource.ts (SeededRandomSource, Mulberry32)
                  src/engine/injury/PostMatchInjuries.ts

RUNTIME/APP       src/app/game/playUserGame.ts (match construction/orchestration)
                  src/app/game/LiveMatchController.ts (live session controller; owns MatchSession)
                  src/stores/gameStore.ts (startLiveMatch, completeMatch, module-level liveController singleton)
                  src/stores/matchViewerStore.ts (ephemeral Zustand viewer snapshot)

STATE             MatchSession (engine-internal, source of truth during a live match)
                  matchViewerStore (Zustand snapshot copy, manually synced via replaceSimulation)
                  React local state in NgMatchViewer.tsx (presentation progress)
                  CourtAnimationState (per-frame lerp/interpolation, presentation-only)

UI (legacy)       src/ui/App.tsx, src/ui/screens/MatchViewerScreen.tsx, src/ui/matchViewer.ts
                  reachable only via ?ui=legacy query param

UI (NG, default)  src/ui-ng/applications/match/MatchWorkspace.tsx, NgMatchViewer.tsx,
                  engine/LiveCourtStage.tsx, LiveStage.tsx, MatchScoreboard.tsx, TacticalPanel.tsx, TeamBoxScore.tsx

PRESENTATION      src/ui/match/MatchCourt.tsx, CourtPresentation.ts, MatchPresentationSegment.ts
                  src/ui/match/court/ (CourtDynamicRenderer, CourtBallRenderer, CourtPlayerRenderer,
                  CourtAnimationState, CourtGeometry, CourtProjection, rules/FibaCourtRuleset, arena/, basket/, floor/)

PERSISTENCE       src/save/GameWorldSaveV3.ts (extends V1/V2; adds only staffCareerRuntime)
                  src/save/GameWorldSaveV1.ts (games, matchStatLogs — unchanged since V1)

RULES             src/domain/competition/CompetitionRules.ts (NCAA_MEN/WOMEN, NBA, WNBA, FIBA game formats)

TESTS             src/engine/match/*.test.ts, src/engine/match/rotation/*.test.ts, src/engine/match/tactics/*.test.ts,
                  src/domain/tactics/*.test.ts, src/ui/match/**/*.test.ts, src/ui-ng/applications/match/*.test.tsx,
                  src/app/game/{GameApplication,LiveMatchController}.test.ts,
                  src/ui/pcb-migrated/{plantilla,tactics}/*.test.ts (legacy PCB lineup/tactics UI, still active)

LEGACY            src/ui/App.tsx + legacy MatchViewerScreen path (reachable, not default)
                  src/ui/pcb-migrated/tactics, plantilla (older tactics/lineup board UI, still wired and tested)
                  Root-level dev artifacts: court-preview.html, court-preview-captures/*.png (tracked in git, unrelated to runtime)
```

---

## C. Runtime Flow (verified, file:function cited)

```
1. UI entry           src/ui-ng/applications/match/MatchWorkspace.tsx:86
                       onClick → startMatch(startLiveMatch(tacticalPlan))

2. Match construction  src/stores/gameStore.ts:136 startLiveMatch()
                       → src/app/game/playUserGame.ts:58 createLiveUserMatch()

3. Roster resolution   playUserGame.ts:93 availableSquads()
                       → src/engine/eligibility getAvailablePlayersForCompetition

4. Lineup resolution   playUserGame.ts:64/71 selectStartingFive(world, teamId, date, squad)
                       (src/engine/team/TeamEvaluation.ts:9) — BUG-1: ignores user TeamLineup, see Section G

5. Tactical resolution playUserGame.ts:73 getEffectiveTacticalPlan (TacticalPlanning.ts:12)
                       → MatchTacticalPlan passed into engine — functions correctly (Section G, verified REAL)

6. Rotation plan       playUserGame.ts:83-84 createDefaultRotationPlan(..., initialLineup: lineups.home, ...)
                       (src/engine/match/rotation/RotationPlan.ts:31) — seeded from the wrong lineup (BUG-1 cascade)

7. Engine init         src/app/game/LiveMatchController.ts:9 constructor → createMatchSession()
                       (src/engine/match/MatchEngine.ts:270)

8. Possession loop     NgMatchViewer.tsx:81 advanceLiveMatchPresentation()
                       → gameStore.ts:138 → LiveMatchController.advanceOneStepWithSnapshots() (LiveMatchController.ts:20)
                       → stepMatchSession() (MatchEngine.ts:312-390)

9. Presentation        src/ui/match/MatchPresentationSegment.ts createPresentationSegment()
                       → NgMatchViewer.tsx requestAnimationFrame loop → replaceSimulation()
                       (matchViewerStore.ts:32) → LiveCourtStage / MatchScoreboard / TeamBoxScore / TacticalPanel

10. Completion         NgMatchViewer.tsx:110-113 isMatchComplete() + markResultApplied() (idempotency guard)
                       → gameStore.ts completeMatch() → playUserGame.ts:102 completeMatch()

11. Result application src/engine/match/MatchResultApplication.ts:99 applyCompletedMatch()
                       — builds MatchStatLog (score-reconciliation checked), applies result, records eligibility,
                       finalizes season. In-memory GameWorld mutation only.

12. Persistence        NOT PART OF THIS PATH. src/app/save/GameSaveService.ts (saveCurrentGame) and
                       src/tauri/TauriGameSaveRepository.ts exist but are wired only into the legacy
                       src/ui/App.tsx SAVE button. Zero references to saveCurrentGame/GameSaveService anywhere
                       in src/ui-ng. The default NG UI has no save action on the match-completion path or
                       elsewhere in the traced flow.
```

Two parallel UI stacks exist: legacy (`src/ui/App.tsx`, reachable only via `?ui=legacy`) and NG (`src/ui-ng/BdmOsNg.tsx` → `MatchWorkspace.tsx` → `NgMatchViewer.tsx`, the default/live path per `src/ui/startup/BootstrapApp.tsx:31`). Both share underlying engine/domain code; they diverge only in UI/store wiring and the save action.

---

## D. Source-of-Truth Map

| Concern | Source of truth | Notes |
|---|---|---|
| Player ratings | `Player.basketball.ratings` (80 canonical keys, `src/domain/player/Player.ts:8`) | Full fidelity at rest. |
| Match-time player signals | `MatchPlayerProfile` (`src/engine/match/MatchPlayerProfile.ts`) | Derived, per-match; see Section G rating-collapse finding. |
| Roster/eligibility | `world.teams[id].rosterPlayerIds` + `src/engine/eligibility` | Correct, single source. |
| Starting lineup (user intent) | `world.lineupsByTeamId` (`TeamLineup`, `src/domain/tactics/TeamLineup.ts`) | **Not consulted by match construction** — see BUG-1. |
| Starting lineup (match-actual) | Recomputed via `selectStartingFive` every match | Diverges from user intent. |
| Tactics | `MatchTacticalPlan` (`src/engine/match/tactics/MatchTacticalPlan.ts`), sourced from `TacticalPlanning.getEffectiveTacticalPlan` | Correctly threaded; transient by design (not persisted, per `ARCHITECTURE.md`). |
| Live match state | `MatchSession` inside `LiveMatchController` (module-level singleton in `gameStore.ts:131`, outside Zustand) | Authoritative during play. |
| Viewer snapshot | `matchViewerStore.simulation` | A manually-synced copy of `MatchSession` output (`replaceSimulation`), not authoritative — fragile if a sync call is missed. |
| Presentation/animation | `CourtAnimationState`, `NgMatchViewer` local React state | Purely cosmetic; verified never to feed back into stats/score. |
| Statistics | `calculateMatchPlayerStats` derived from `MatchEvent[]` (`PlayerMatchStats.ts:31`) | Derived, not independently tracked — no drift possible by construction. |
| Post-match persistence | `world.games[id]`, `world.matchStatLogsByGameId[id]` via `MatchResultApplication.ts` | In-memory only until a legacy-UI save; NG UI has no save path (Section C, step 12). |

---

## E. Feature Reality Matrix

| FEATURE | UI | DOMAIN | RUNTIME | ENGINE EFFECT | PERSISTENCE | TESTS | STATUS |
|---|---|---|---|---|---|---|---|
| Pre-match starters selection | Tactics board (`pcb-migrated`) writes `TeamLineup` | `TeamLineup.ts` | Written to `world.lineupsByTeamId` | **Never read** by `playUserGame.ts` | `world.lineupsByTeamId` persists | `TeamLineup.test.ts` (structure only, no integration test) | **UI_ONLY / broken integration** |
| Pre-match rotation (bench order/timing) | Tactics board | `RotationPlan`, `TeamGamePlan.rotationOverride` | Honored at runtime once seeded | Correct once seeded, but seeded from wrong starting five | not persisted (transient) | `RotationPlan.test.ts`, `MatchRotationRunner.test.ts` | **PARTIAL** (correct mechanism, wrong input) |
| Pre-match tactics (pace/shot profile/defense/featured player) | Tactics board | `TacticalPlanning.ts` | `getEffectiveTacticalPlan` → engine | Genuinely affects possession math (`TacticalEffects.ts`) | transient by design | `TacticalPlanning.test.ts`, `TacticalEffects.test.ts` | **FUNCTIONAL** |
| Live tactical changes mid-match | `TacticalPanel` renders controls | `MatchCoachingState.applyTacticalPlanChange` exists | `LiveMatchController.applyTactics` is a **disabled stub** returning input unchanged | No effect | n/a | none exercise the disabled path meaningfully | **STUB / dead UI** |
| Live manual substitutions | UI wires `onApplySubs` | `ManualSubstitutions.ts` exists and works standalone | `LiveMatchController.applyManualSubstitutions` is a **disabled stub** | No effect | n/a | `ManualSubstitutionsPanel.test.ts` | **STUB / dead UI** |
| Automatic rotations/substitutions | none (automatic) | `RotationPlan`, `RotationController` | `applyDueRotations` fires on scripted clock thresholds | Real, but not fatigue-driven | transient | `RotationController` covered via `MatchRotationRunner.test.ts` | **FUNCTIONAL** (scripted, not adaptive) |
| Possession simulation (shots/rebounds/turnovers/assists/blocks/steals) | N/A (engine) | `Player` ratings | `MatchEngine.stepMatchSession` | Real, contextual, ratings-driven | derived, not persisted | extensive (`MatchEngine.test.ts`, `*Resolution.test.ts`) | **FUNCTIONAL** |
| Fatigue | Live boxscore | `Fatigue.ts` | Applied to shot%, defense, turnovers | Real | transient | `Fatigue.test.ts` | **FUNCTIONAL** (but not read by substitution logic) |
| Fouls (shooting only) | Event log | flat constants in `MatchEngine.ts` | 10% foul chance, 75% FT flat | Prototype-level | derived | `FreeThrowSimulation.test.ts` | **STUB** (explicitly commented "Prototype value") |
| Fouls (offensive/technical/team/bonus/foul-out) | — | — | — | — | — | none | **MISSING** |
| Officials/referees | — | — | — | — | — | none | **MISSING** |
| Rulesets (period/OT structure) | via `CompetitionRules` | `CompetitionRules.ts` | `resolveGameClockRulesForGame` | Real, switchable (NCAA/NBA/WNBA/FIBA) | via competition config | covered indirectly | **FUNCTIONAL** (structure only; no foul/shot-clock rule differences, because those systems don't exist) |
| Staff → Match integration | none | STAFF is a deep domain elsewhere | **zero references** in `src/engine/match/` | none | n/a | n/a | **MISSING** (by design gap, not yet scoped) |
| Training → Match integration | none | `TeamCohesion`, `TrainingLoad` exist | **zero references** in `src/engine/match/` | none | n/a | n/a | **MISSING** |
| Live court visualization | `LiveCourtStage`, `CourtDynamicRenderer` | n/a | interpolates between discrete engine events | presentation-only, verified not to leak into stats | n/a | `CourtDynamic.test.ts`, `CourtProjection.test.ts` | **FUNCTIONAL** |
| Statistics/box score | `TeamBoxScore` | `PlayerMatchStats.ts` | derived from event stream | correct, structurally guaranteed OREB+DREB=REB and FGM≤FGA (by construction, no explicit runtime assertion) | `MatchStatLog` persisted | `PlayerMatchStats.test.ts` | **FUNCTIONAL** |
| Post-match: game/competition state | n/a | n/a | `applyMatchResult` | correct | persisted | covered | **FUNCTIONAL** |
| Post-match: morale, coach reputation/XP, news/media | n/a | respective domains | `MatchResultApplication.ts` | correct | persisted | covered | **FUNCTIONAL** |
| Post-match: injuries | n/a | `PostMatchInjuries.ts` | called separately in `playUserGame.ts:completeMatch`, not inside `MatchResultApplication.ts` | present | persisted | not directly traced in this pass | **PARTIAL** (present but outside the main result-application module — recommend confirming ordering/atomicity in MG2) |
| Post-match: player development, fatigue carryover | n/a | n/a | not found in `MatchResultApplication.ts` | none found | n/a | none found | **MISSING/UNKNOWN** (needs follow-up grep in MG2) |
| Disk save (NG UI) | none | n/a | `GameSaveService`/`TauriGameSaveRepository` exist but unreferenced from `src/ui-ng` | n/a | would persist via Save V3 if wired | untested for NG path | **MISSING** (legacy-only) |
| Save V3 match fields | n/a | `GameWorldSaveV3.ts` | inherits V1 `games`/`matchStatLogs` unchanged | n/a | correct minimal footprint; live session correctly not persisted | `GameWorldSaveV3.test.ts` | **FUNCTIONAL** |

---

## F. Legacy Inventory

| Item | Classification | Note |
|---|---|---|
| `src/ui/App.tsx` + legacy match viewer path | LEGACY_REFERENCED | Reachable only via `?ui=legacy`; still the only path with a working SAVE button. |
| `src/ui/pcb-migrated/tactics/*`, `plantilla/*` | ACTIVE | Older "PCB" tactics/lineup board; still wired, still tested (`CanonicalLineup.integration.test.ts`, `NoIndexBasedLineup.test.ts`), and is the actual UI writing `TeamLineup` today. Not dead — but its output is the thing BUG-1 discards. |
| `src/save/GameWorldSaveV1.ts`, `V2.ts` | LEGACY_REFERENCED | Kept for migration/read compatibility; V3 is the only write format per its own header comment. |
| `LiveMatchController.applyTactics` / `applyManualSubstitutions` | LEGACY_REFERENCED / STUB | Explicitly commented "intentionally disabled until the interaction model is reintroduced safely" (commit `3f775c5 fix: temporarily disable live coaching and substitutions`). Not dead code — still called by live UI, just inert. |
| `LiveMatchController.replacementCandidates` | STUB | Always returns `[]`. |
| `calculateFatigueAdjustedTeamStrength` (`Fatigue.ts`) | LEGACY_DEAD (in production) | No production caller found; only referenced in tests. |
| `MatchEngine.simulateMatch` / `simulateMatchDetailed` | TEST_ONLY / secondary | App layer uses `simulateMatchWithRotations`; the non-rotation entry points appear to be lower-level/test-oriented. |
| Non-canvas DOM fallback rendering in `MatchCourt.tsx` (~lines 296-339) | ACTIVE (secondary path) | Used when `configuration === null` or `canvasPlayers` false; not dead, but a secondary rendering mode worth consolidating in V3. |
| `court-preview.html`, `court-preview-captures/*.png` (repo root) | UNKNOWN / clutter | Tracked in git; appear to be manual dev/debug capture artifacts unrelated to the runtime app. Not part of the match architecture; flagged for cleanup consideration outside MG1 scope. |
| `SecondaryActionResolution.test.ts`, `PlayerDrivenOffense.test.ts` | TEST_ONLY, misleadingly named | No corresponding source files — they re-test existing Assist/Rebound/Turnover/Shot resolution modules under aspirational names, not evidence of a play-type action engine. |
| `src/features/` | DEAD (placeholder) | Contains only a `README.md`; no code. |
| `docs/ARCHITECTURE.md` match sections | STALE | Last touched 2026-08-23 (`b675f6c`); documents "Live coaching v1" as functional, predating the `3f775c5` disable commit. Documentation/code drift — not code debt, but should be corrected before MG2 so it doesn't mislead. |

---

## G. Critical Bugs (severity-ordered)

**BUG-1 (P1 — feature central rota).** Pre-match user-selected starters are discarded and silently replaced by an algorithmic pick.
- Root cause: `src/app/game/playUserGame.ts:64` and `:71` call `selectStartingFive(world, teamId, date, squad)` (`src/engine/team/TeamEvaluation.ts:9`) instead of reading `getTeamLineup(world, teamId)` (`src/domain/world/queries.ts:139`, exported but never called from `src/app/game/` or `src/engine/match/`).
- `selectStartingFive` picks, per position, the highest-`calculatePlayerImpact` available player — a pure re-ranking with zero reference to the user's `TeamLineup`.
- Cascading effect: `createDefaultRotationPlan`'s `initialLineup` (`playUserGame.ts:83-84`) is seeded from this wrong lineup, so even correctly-configured substitution timing operates on the wrong starting five/bench mapping.
- Confirmed not caught by tests: `GameApplication.test.ts:83-91` explicitly documents the current (buggy) behavior as intentional, describing the lineups as "transient" and asserting only validity/uniqueness, never equality with `world.lineupsByTeamId`.
- Fix location for MG2: `playUserGame.ts` (`prepareMatch`/`prepareUserMatch`/`createLiveUserMatch`) should resolve lineups from `getTeamLineup(world, teamId)` first, falling back to `selectStartingFive` only when no valid user lineup exists.
- **RESOLVED in MG2A** (`match-gameplay-v3-mg2a-lineup-authority`). See `docs/match/MATCH_GAMEPLAY_V3_MG2A_REPORT.md` for the fix, fallback policy, and regression tests (`src/app/game/LineupAuthority.test.ts`).

**BUG-2 (P2 — feature partially incorrect / dead UI).** Live in-match tactical changes and manual substitutions are non-functional but the UI does not reflect this.
- `LiveMatchController.applyTactics` / `applyManualSubstitutions` (`src/app/game/LiveMatchController.ts:27-29`) are stubs returning the unchanged snapshot, per commit `3f775c5`.
- `NgMatchViewer.tsx:350-358` still wires `TacticalPanel`'s `onApplySubs`/`onApplyTactics` to these no-ops. A user clicking these controls during a live match sees no error and no effect — silent failure, not a visible "coming soon" state.
- Recommendation for MG2/UI follow-up: either hide/disable these controls until the interaction model is reintroduced, or surface an explicit "temporarily disabled" state.
- **RESOLVED in MG2B** (`match-gameplay-v3-mg2b-live-coaching-contract`). Both substitutions and tactical changes turned out to have a genuine, tested engine boundary (`ManualSubstitutions.applyManualSubstitutions`, `MatchCoachingState.applyTacticalPlanChange`) that already fed real possession math — the defect was only that `LiveMatchController` short-circuited to a no-op instead of calling them. MG2B wires the real boundary behind an explicit `LiveCoachingCommandResult` (`applied`/`rejected`/`unsupported`) so no control can silently pretend to succeed. See `docs/match/MATCH_GAMEPLAY_V3_MG2B_REPORT.md`.

**BUG-3 (P2 — architectural gap, not a regression).** Foul system is a flat-probability placeholder with no officiating model.
- `SHOOTING_FOUL_PROBABILITY = 0.1` and `FREE_THROW_MADE_PROBABILITY = 0.75` are hardcoded constants explicitly commented "Prototype value" (`MatchEngine.ts:40,42`).
- No offensive fouls, technical fouls, team fouls, bonus, foul trouble, or foul-out logic exists anywhere in `src/engine/match/`.
- No OFFICIAL/referee domain or abstraction exists anywhere in `src/`.
- This is a known/scoped gap per the MG1 brief (OFFICIAL is explicitly out of scope for this wave) but is flagged here as a precondition MG2+ must account for before claiming rules fidelity.

**BUG-4 (P3 — architectural debt).** `calculatePlayerImpact` is a de facto hidden overall that changes match outcomes.
- The 80 canonical `Player` ratings are collapsed via `legacyRatingSignals()` into 7 unweighted averages (`Player.ts:44`), which is the *only* input every match-resolution formula ultimately consumes (via `MatchPlayerProfile`). This is a real, if currently-tolerated, information-loss step ahead of the possession math.
- Separately, `calculatePlayerImpact` (`TeamEvaluation.ts:8`) — itself built on those same 7 legacy signals — is used in `RotationPlan.ts:72-74` to rank and select which bench player substitutes in. Unlike `TeamStrength` (which is explicitly fenced off from play-by-play resolution and verified by a dedicated test), this scalar directly decides who plays, i.e., it is a genuine hidden-overall influencing outcomes, contrary to the "no OVERALL" canonical principle.
- This does not corrupt results but is a real conflict with the stated PLAYER design principle and should be resolved (either replace with a scoped/contextual bench-ranking heuristic, or explicitly document `calculatePlayerImpact` as an approved exception) before Match V3 expands rotation logic.
- **PARTIALLY RESOLVED in MG2C** (`match-gameplay-v3-mg2c-rotation-authority-cleanup`). The rotation/bench-ranking use is eliminated: `RotationPlan.ts`'s `bestPlayer` (renamed `preferredCandidate`) no longer calls `calculatePlayerImpact` at all — it prefers the team's configured bench priority (`TeamLineup` B1..B7 order) when one exists, falling back to stable squad order otherwise. `LiveMatchController.replacementCandidates` (MG2B) never used it either. Eligibility (who can replace whom) and ordering (which eligible candidate is picked first) are now architecturally separated, with ordering never reducing to a single quality scalar. **Not fully resolved**: `calculatePlayerImpact` still exists and is still used by `selectStartingFive`/`calculateTeamStrength` (`TeamEvaluation.ts:9-10`) — the AI/fallback starter-selection path and the coach-XP-fairness team-strength scalar. MG2C deliberately left these untouched (per its brief, this would require Coach AI-adjacent work and risks breaking MG2A's AI-path contract). The separate 80→7-rating collapse (`legacyRatingSignals`) that feeds `calculatePlayerImpact` is unrelated to rotation authority and remains fully unresolved — a distinct, broader PLAYER-ratings-pipeline concern for a future wave, not something MG2C was scoped to touch. See `docs/match/MATCH_GAMEPLAY_V3_MG2C_REPORT.md` for the full call-site inventory.

**BUG-5 (P3).** No disk-persistence path exists on the default (NG) match-completion flow.
- `saveCurrentGame`/`GameSaveService`/`TauriGameSaveRepository` are wired only into the legacy `?ui=legacy` UI's manual SAVE button. Zero references found anywhere in `src/ui-ng`.
- A user playing exclusively through the default NG UI has no way to persist a completed match (or any world state) to disk short of falling back to legacy mode. This is likely a known gap in ongoing NG migration work rather than a match-specific defect, but it directly affects "does the match result survive," so it is recorded here.
- **RESOLVED in MG2D** (`match-gameplay-v3-mg2d-completed-match-persistence`), specifically for the match-completion moment: `NgMatchViewer`'s completion effect now calls the existing Save V3 boundary (`saveCurrentGame`, via a new `gameStore.saveCompletedMatch` action) immediately after committing the match to `GameWorld`, so a completed NG match is written to disk without any manual action. Save failures are surfaced (not swallowed) via a new `matchSaveError` UI state. **Scope note**: this resolves the match-completion persistence gap specifically; it does not add a general NG save/load UI for other world mutations outside match completion — that remains a broader, unaddressed NG-migration gap. See `docs/match/MATCH_GAMEPLAY_V3_MG2D_REPORT.md`.

---

## H. Architectural Risks

1. **Dual match-state copies** (`LiveMatchController`'s `MatchSession` vs. `matchViewerStore.simulation`) are kept in sync only by manual `replaceSimulation()` calls at each call site. No automatic reconciliation exists; a future code path that mutates the controller without calling `replaceSimulation` would silently desync the UI from the actual session. (P2 risk, no confirmed live occurrence found in this audit.)
2. **Module-level singleton (`liveController` in `gameStore.ts:131`)** lives outside Zustand state, is not serializable, and is nulled only inside `completeMatch`. Any early-return/error path elsewhere risks a stale live controller surviving across matches. Worth a defensive audit in MG2.
3. **Two parallel tactics/lineup UIs** (`src/ui/pcb-migrated/tactics` writing `TeamLineup`, vs. whatever NG-era lineup UI exists or is planned) increase the surface for another BUG-1-style silent divergence if not consolidated before V3 rotation/lineup work expands.
4. **Documentation drift**: `docs/ARCHITECTURE.md`'s match sections predate the live-coaching disable commit and describe behavior (live tactical changes, manual substitutions) as functioning v1 features. Anyone reading architecture docs without checking `LiveMatchController.ts` would be misled.
5. **No explicit runtime assertion for FGM≤FGA** — it is structurally guaranteed by single-code-path increment logic today, but nothing would catch a future refactor that violated it, unlike the team/player score reconciliation in `MatchResultApplication.ts:92-94`, which does throw on mismatch.

---

## I. MG2 Preconditions

Before MG2 (or any Match V3 feature work) begins, the following must be resolved or explicitly and consciously deferred with a written decision:

1. **Fix BUG-1** (starters/lineup respect) — this is the single most important precondition; it is the exact bug named in the brief and has a confirmed one-file root cause.
2. **Decide the fate of live coaching/substitutions** (BUG-2): either restore the disabled interaction model or strip the dead UI controls so users aren't shown broken affordances.
3. **Scope the foul/officiating rebuild** (BUG-3) as its own explicit milestone — do not let it get implicitly bundled into possession-engine work.
4. **Resolve or formally except `calculatePlayerImpact`** (BUG-4) as a hidden-overall usage in rotation logic before expanding rotation/substitution intelligence in V3.
5. **Consolidate the lineup-authoring UI** — confirm whether `src/ui/pcb-migrated/tactics` is the canonical, ongoing lineup editor or a migration artifact, before building new starters/rotation UX on top of it.
6. **Refresh `docs/ARCHITECTURE.md`** match sections to reflect the disabled live-coaching state (documentation task, not code).
7. **Confirm NG-path save story** (BUG-5) — Match V3 result persistence is meaningless if the surrounding app has no save path in its default UI.

If these are not resolved, MG2 can still *begin* on isolated engine-internals work (e.g., possession/action-model enhancements that don't touch lineup construction or live coaching), but any MG2 work touching starters, rotations, or live in-match coaching must not proceed until preconditions 1–2 and 5 are addressed, or it will build on top of the same broken wiring.

---

## J. Proposed Match V3 Boundaries (not implemented)

These are proposed conceptual boundaries only, for future milestone scoping — no code changes:

- **MatchEngine** stays framework-independent (pure TypeScript, seeded RNG, no React/Zustand/Tauri imports) — already true today and should remain a hard boundary.
- **Match construction** (roster/lineup/tactics/rotation resolution) should become a single, testable "match preparation" module that is the *only* place allowed to read `TeamLineup`, `TacticalPlanning`, and `RotationPlan` and translate them into engine inputs — currently this logic is spread across `playUserGame.ts` with the BUG-1 gap as a direct symptom of that diffusion.
- **STAFF/OFFICIAL/TRAINING integration** should be added as explicit adapter interfaces consumed by MatchEngine (e.g., a `MatchOfficiatingProfile`, a `MatchPreparationSignals` derived from Training/Staff), not by merging those domains into match code — consistent with AGENTS.md's Domain/Engine separation and the brief's explicit prohibition on building parallel simplified systems.
- **Foul/officiating system** deserves its own engine module (analogous to `ShotResolution.ts`/`ReboundResolution.ts`) rather than inline constants in `MatchEngine.ts`.
- **Live coaching** should be reintroduced behind the same `MatchCoachingState`/`ManualSubstitutions` primitives already built (they work standalone per their tests) — the disabled wrapper in `LiveMatchController` is the only piece that needs revisiting, not a redesign.
- **Rating usage** for any new contextual signal must remain scoped (task-specific blends, as today's `ShotResolution`/`ReboundResolution`/`TurnoverResolution`/`AssistResolution` already do) — `calculatePlayerImpact` should not be the template for future contextual formulas.

---

## Decision

**Is the current Match architecture suitable for incremental evolution to Match V3?**
**YES WITH RESTRUCTURING.**
Justification: the possession-resolution core (shots/rebounds/turnovers/assists/fatigue/tactics) is genuinely deterministic, contextual, and well-separated from presentation, with a provably-derived stat/event stream. But match *construction* (roster/lineup/rotation wiring) has a confirmed, silent, outcome-affecting defect (BUG-1), live coaching is dead UI (BUG-2), and the foul/officiating layer is a placeholder (BUG-3) that must be built as new architecture, not extended from what exists. None of these require discarding the engine — they require fixing wiring and adding new modules behind existing seams.

**Can MG2 begin safely?**
**NO, not unrestricted.** MG2 may begin on isolated engine-internals work that does not touch lineup/rotation/live-coaching wiring. Any MG2 work on starters, rotations, or live coaching is blocked until BUG-1 and BUG-2 are resolved, because building new features on top of the current broken lineup-resolution path would compound the defect rather than fix it.

---

## Test/Build Evidence

- Focused suite (match engine, tactics domain, match UI, ui-ng match app, LiveMatchController, GameApplication, pcb-migrated tactics/plantilla): **42 test files, 279 tests, all passed.**
- Full repository suite (`npm test`): **319 test files, 2337 tests, all passed, exit code 0.** (Duration 554s; pre-existing jsdom canvas warnings only, no failures.)
- `npm run typecheck`: **PASS**, zero errors.
- `npm run build`: **PASS**.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: **PASS**.
- `cargo check --manifest-path src-tauri/Cargo.toml`: **PASS**.
- Determinism boundary (`Math.random(` in match/tactics code): **zero matches** — clean.
- Domain/Engine dependency boundary (react/zustand/@tauri-apps import in `src/domain/tactics`, `src/engine/match`): **zero matches** — clean.
- Marker audit (`.only`, `.skip`, `debugger`, `console.log/debug`, `TODO`, `FIXME`) in match/tactics/coaching code: **zero matches** — clean.
- No MG1-induced changes to production or test code were required — this audit produced documentation only.

---

## Addendum (MG3): Live vs Instant Result tactical divergence

MG3's pre-match consolidation audit (`docs/match/MATCH_GAMEPLAY_V3_MG3_REPORT.md`) surfaced a latent bug this original MG1 audit did not name explicitly: `createLiveUserMatch` never called `getEffectiveTacticalPlan` and always forced a flat default tactical plan for the opponent, while `prepareMatch`/Instant Result read the persisted `TeamTacticalInstructions`/`TeamGamePlan.tacticalOverride` configuration. Live Match and Instant Result could therefore silently disagree on a user's own saved tactics. This was invisible in prior test coverage because `createNewGame()` worlds never configure non-default tactics. **RESOLVED in MG3** by consolidating both paths onto a single `resolveCanonicalMatchInput` resolver; `createLiveUserMatch` also now threads `defensiveMatchups` into live matches for the first time (previously silently dropped). A related, still-open gap — the UI's `tacticalPlanStore` draft is never seeded from persisted configuration, so the live UI still always supplies an override in practice — is documented as known debt in the MG3 report, not fixed there (it is a UI-state change, not a pre-match resolver change).
