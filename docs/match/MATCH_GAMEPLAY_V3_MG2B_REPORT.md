# MATCH & BASKETBALL SIMULATION V3 — MG2B · Live Coaching Contract

Branch: `match-gameplay-v3-mg2b-live-coaching-contract`
Base: `5b2d3bce733562708a0a767175b796dfe4efa7c4` (MG2A-certified `match-gameplay-v3-mg2a-lineup-authority`)
Scope: fix BUG-2 only — establish an explicit, truthful live-coaching command boundary. No Rotation Engine V2, no Coach AI V2, no full Tactical Model, no Training/Staff/Officials integration, no balance changes.

---

## Old live coaching architecture

`LiveMatchController` (`src/app/game/LiveMatchController.ts`) owned a live `MatchSession` and exposed `applyTactics`/`applyManualSubstitutions`/`applySubstitution`/`replacementCandidates`. All four were stubs:

```ts
/** Live coaching is intentionally disabled until the interaction model is reintroduced safely. */
public applyTactics(_teamId, _tacticalPlan): MatchSimulation { return this.snapshot() }
/** Manual substitutions are intentionally disabled until the interaction model is reintroduced safely. */
public applyManualSubstitutions(_teamId, _substitutions): MatchSimulation { return this.snapshot() }
public applySubstitution(...): MatchSimulation { return this.applyManualSubstitutions(...) }
public replacementCandidates(...): readonly PlayerId[] { return [] }
```

This was a deliberate rollback: commit `3f775c5` ("fix: temporarily disable live coaching and substitutions") introduced these stubs on top of previously-working code. `NgMatchViewer.tsx`'s `TacticalPanel` (tactics sliders + `ManualSubstitutionsPanel`) and the legacy `MatchViewerScreen.tsx`'s `CoachingPanel` + stats-table click-to-substitute flow all still called into these methods, unconditionally applying whatever `MatchSimulation` came back (always the unchanged snapshot) and always treating the call as successful — closing the panel, clearing the draft, with no way to tell the user nothing happened.

## Root cause of BUG-2

The rollback was one layer too high. The actual engine primitives it was disabling were never broken:

- `src/engine/match/coaching/ManualSubstitutions.ts` (`applyManualSubstitutions`) validates team membership, batch size (≤5), distinct players, on-court/on-bench membership, then calls `substitutePlayer` (`MatchEngine.ts:292`), which mutates `MatchSession.state.activeLineups` and appends a `substitution` `MatchEvent`. Genuinely real.
- `src/engine/match/coaching/MatchCoachingState.ts` (`applyTacticalPlanChange`) validates the plan (`validateTacticalPlan`), then updates `MatchSession.state.coachingState` and appends a `tacticalChange` event. `stepMatchSession` (`MatchEngine.ts:316,357`) reads `state.coachingState.{home,away}.currentTacticalPlan` on **every single possession** for both the attacking team's pace/shot-profile and the defending team's tactics — confirmed by direct inspection, not assumption. This is real, live-affecting runtime, not a placeholder.

Both primitives already had this real effect before MG2B. `LiveMatchController` simply never called them — it returned `this.snapshot()` unconditionally instead. There was no "interaction model" missing; the interaction model existed and worked. The gap was purely that the application-layer controller was short-circuited above it, and the UI trusted the controller's return value as proof of success.

## New command boundary

`src/app/game/LiveCoachingCommand.ts` (new) defines the canonical contract:

```ts
type LiveCoachingCommand =
  | { type: 'SUBSTITUTION'; teamId; substitutions: readonly ManualSubstitution[] }
  | { type: 'TACTICAL_CHANGE'; teamId; tacticalPlan: MatchTacticalPlan }

type LiveCoachingCommandResult =
  | { status: 'applied' }
  | { status: 'rejected'; reason: LiveCoachingRejectionReason; message: string }
  | { status: 'unsupported'; message: string }
```

`LiveCoachingRejectionReason` is a closed union: `MATCH_NOT_ACTIVE`, `INVALID_TEAM`, `PLAYER_NOT_ON_COURT`, `PLAYER_NOT_ON_BENCH`, `DUPLICATE_OR_SAME_PLAYER`, `TOO_MANY_SUBSTITUTIONS`, `INVALID_TACTICAL_PLAN`. Both command categories in this file have a real, tested runtime effect — `'unsupported'` exists in the type for future command categories (the brief's requirement to be extensible) but is never produced by SUBSTITUTION or TACTICAL_CHANGE today, and must never be faked for them.

`validateSubstitutionCommand(session, teamId, substitutions)` re-implements the same invariants `ManualSubstitutions.applyManualSubstitutions` enforces, but against the live `MatchSession` directly and *before* the engine call, so a rejection carries a precise, stable reason (e.g. distinguishing `PLAYER_NOT_ON_COURT` from `PLAYER_NOT_ON_BENCH`) instead of parsing a thrown error message. The engine call is still the actual mutation path; the pre-check is purely for a better-typed rejection.

## Substitution flow

```
command (teamId, substitutions)
  → LiveMatchController.applyManualSubstitutions
      → validateSubstitutionCommand(session, teamId, substitutions)   [precise rejection, no engine call yet]
          rejection found → return { status: 'rejected', reason, message }   [session untouched]
          no rejection, empty batch → return { status: 'applied' }            [session untouched, genuine no-op]
      → applyManualSubstitutions(session, { teamId, substitutions })  [engine boundary — real mutation]
          success → this.session = <new session>; return { status: 'applied' }
          unexpected throw → classifySubstitutionError(error) → { status: 'rejected', ... }   [safety net]
  → canonical MatchSession.state.activeLineups now reflects the change
  → presentation (NgMatchViewer / MatchViewerScreen) re-reads controller.snapshot() and
    resolveActiveMatchLineups(snapshot, snapshot.events) — it never held its own lineup copy
```

## Tactical-change status

Real, not a placeholder. `LiveMatchController.applyTactics` now: rejects if the match is complete or the team doesn't belong to this game; calls `validateTacticalPlan` (rejects with `INVALID_TACTICAL_PLAN` on a bad plan, e.g. an out-of-range level or an unsupported defense preset); on success calls `applyTacticalPlanChange`, which updates `MatchSession.state.coachingState` and is read every possession by `stepMatchSession`. No `UNSUPPORTED` path was needed for tactical changes — MG1's assumption that this category might lack real runtime turned out to be wrong on inspection; MG2B did not have to invent a fake tactical state to make anything pass, it just had to stop discarding the real one.

## Runtime ownership

Unchanged from MG1's map, reaffirmed: `MatchSession` inside `LiveMatchController` remains the sole source of truth for the on-court lineup and coaching state. `NgMatchViewer`/`MatchViewerScreen` never own or independently compute the active lineup — they call `controller.snapshot()` (added `currentLiveMatchSnapshot` store action for this) and derive the current five via the existing `resolveActiveMatchLineups(simulation, revealedEvents)` helper, which replays `MatchEvent`s (including the new `substitution` events a command produces) over the historical initial five. No UI file was made an owner of lineup state; `LiveMatchController` and the engine boundary remain fully usable and testable with no UI present (proven by `LiveMatchController.test.ts`, which never imports React).

## Application moment

Commands are applied **immediately and synchronously** when the caller invokes them — not deferred to a "between possessions" queue. This is safe because:
- `substitutePlayer` only mutates `state.activeLineups` (forward-looking) and appends an event; it never rewrites already-resolved events/stats.
- `applyTacticalPlanChange` only mutates `state.coachingState` (forward-looking) the same way.
- Both already require the caller to hold the sole `LiveMatchController` instance for a session (a module-level singleton in `gameStore.ts`), so there is no concurrent-mutation risk within a single session.
- The existing UI already pauses playback before opening the substitution/tactics panels (`openSubs`/`openTactics` call `pause()`), so in practice a command is issued while the possession loop (`advanceOneStep`) is not running — but the controller does not *require* this; it is safe to call between any two `stepMatchSession` calls, which is exactly what "immediately" means here. No new queuing/dead-ball/paused-state mechanism was introduced, because none was needed — the existing pause-before-edit UX pattern already provides the safe window, and the engine boundary itself has no notion of "mid-possession" to violate.

## UI behavior

- `NgMatchViewer.tsx`: `onApplySubs` throws (matching `ManualSubstitutionsPanel`'s existing try/catch, which already renders `substitutions-error`) when the result is not `applied`; `onApplyTactics` sets a new `tacticalError` state (surfaced via a new `TacticalPanel`/`TacticalSettings` `error` prop, styled with a new minimal `.me-settings__error` rule) instead of silently returning. Both only call `replaceSimulation` on `applied`.
- Legacy `MatchViewerScreen.tsx`: `CoachingPanel` gained an `error` prop rendered next to its apply button; the stats-table click-to-substitute flow (`pendingSubstitution` effect) now surfaces `quickSubstitutionError` instead of calling `onApplyManualSubstitutions` and discarding the result; `ManualSubstitutionsPanel`'s `onApply` now throws on rejection, unchanged from its own perspective (it already had a try/catch for exactly this).
- `EntityActionExecutor.ts`'s `player.substitute` command (the entity-context-menu substitution path) now checks `LiveCoachingCommandResult.status` explicitly and returns `{ kind: 'rejected', reason }` on rejection, `{ kind: 'sessionUpdated', simulation: session.snapshot() }` on success — no behavior change to its own contract (`EntityActionExecution`), only to how it gets there.
- No control was hidden. Every coaching control that was visible before MG2B is still visible and now genuinely functional — none needed to become `UNSUPPORTED`, so no "disabled" UI state was required for SUBSTITUTION or TACTICAL_CHANGE.

## Files changed

| File | Change |
|---|---|
| `src/app/game/LiveCoachingCommand.ts` | New. Command/result contract, substitution pre-validation, error classifiers. |
| `src/app/game/LiveMatchController.ts` | `applyTactics`/`applyManualSubstitutions`/`applySubstitution` now call the real engine boundary and return `LiveCoachingCommandResult`; `replacementCandidates` now returns the real bench instead of `[]`. |
| `src/app/game/LiveMatchController.test.ts` | Replaced the two "keeps ... disabled for now" tests with 10 behavioral tests (Tests A/B/C/D/G, tactical-change apply/reject, match-not-active rejection, replacementCandidates, determinism). |
| `src/stores/gameStore.ts` | `applyLiveTactics`/`applyManualSubstitutions` return type changed to `LiveCoachingCommandResult`; added `currentLiveMatchSnapshot()` action. |
| `src/ui-ng/applications/match/NgMatchViewer.tsx` | `onApplySubs`/`onApplyTactics` check the result before mutating viewer state; added `tacticalError` state. |
| `src/ui-ng/applications/match/engine/TacticalPanel.tsx` | Added `tacticalError` prop, threaded to `TacticalSettings`, rendered as an alert. |
| `src/ui-ng/applications/match/engine/match-engine.css` | Added `.me-settings__error` rule. |
| `src/ui/App.tsx` | `onApplyCoaching`/`onApplyManualSubstitutions` now return the result and only call `replaceSimulation` on success. |
| `src/ui/screens/MatchViewerScreen.tsx` | `onApplyCoaching`/`onApplyManualSubstitutions` prop types changed to return `LiveCoachingCommandResult`; `CoachingPanel` gained an `error` prop; added `quickSubstitutionError`/`coachingError` state and surfaced them. |
| `src/ui/screens/MatchViewerScreen.test.ts` | Updated stub callbacks to return `{ status: 'applied' }`. |
| `src/app/entityActions/ActionAvailability.ts` | `EntityActionEnvironment.activeMatchSession.applySubstitution` return type updated; added `snapshot()` to the structural type. |
| `src/app/entityActions/EntityActionExecutor.ts` | `substituteExecutor` checks the result explicitly instead of relying on a thrown error; `EntityActionExecutionContext.activeMatchSession` type updated. |
| `src/app/entityActions/EntityActionExecutor.test.ts` | Replaced the "does not expose live substitution candidates while disabled" test with three tests proving real candidates, a real applied substitution, and a real rejection through this boundary. |

No UI redesign: every changed `.tsx` file kept its existing layout/visual structure; only new error-surfacing states and one small CSS rule were added.

## Tests

All in `src/app/game/LiveMatchController.test.ts` unless noted:

- **Test A** — a valid substitution replaces the outgoing player with the incoming player in the real on-court lineup.
- **Test B** — the presentation-derived active lineup (`resolveActiveMatchLineups`, the same helper the real UI uses) reflects the runtime substitution; presentation never separately simulates it.
- **Test C** — substituting in a player already on court is rejected; lineup unchanged.
- **Test D** — substituting out a player not on court is rejected with reason `PLAYER_NOT_ON_COURT`; lineup unchanged.
- **Test G** — the full lifecycle (advance, skip-to-end-of-period, skip-to-end, completion) still works unchanged alongside the new command boundary.
- Plus: a valid tactical change is applied and genuinely visible in `controller.currentPlans`; an invalid-team tactical change is rejected with `INVALID_TEAM`; a substitution attempted after match completion is rejected with `MATCH_NOT_ACTIVE`; `replacementCandidates` returns the real bench for an on-court player and `[]` for a non-existent case; a determinism test (Test E-equivalent from the brief's Section 17) proving the same seed + same command sequence/timing produces byte-identical results across two independent runs.
- `src/app/entityActions/EntityActionExecutor.test.ts` — three tests replacing the old "disabled" assertion: real replacement candidates exposed, a real substitution applied through the entity-action boundary (`sessionUpdated`), and a real rejection through the same boundary (`rejected`) for substituting in a player already on court.
- Test E (unsupported tactical change) and Test F (no-op elimination) from the brief were not added as separate tests because neither condition exists to test: no tactical-change scenario in this codebase is `UNSUPPORTED` (see Tactical-change status above), and the static audit (grep for TODO/stub/noop/not-implemented across every changed file) found zero silent-success no-ops remaining — see Static audit below.

Full repository suite: **320 test files, 2353 tests, all passed, exit code 0** (up from MG2A's 320/2343 baseline by exactly the 10 new tests — no regressions anywhere).

## Static audit

`grep -i "TODO|stub|noop|no-op|not implemented"` across every file touched by MG2B: the only hit is a doc-comment on `LiveMatchController.applyManualSubstitutions` reading "an empty batch is a no-op 'applied'" — an explicitly documented, intentional no-op case (calling with zero substitutions correctly does nothing and reports success), not a silent placeholder. No other TODO/stub/no-op/not-implemented markers remain on the live-coaching path.

## Remaining limitations (explicitly out of MG2B scope)

- **No Rotation Engine V2.** `RotationPlan.ts`, `RotationController.ts`, and `calculatePlayerImpact` were not touched. Automatic substitutions remain scripted by clock threshold, unrelated to the new manual command boundary.
- **`calculatePlayerImpact` (MG1 BUG-4) was not touched or expanded.** MG2B's substitution validation ranks nothing — it only checks membership/distinctness, never player quality.
- **Timeouts remain minimal.** The scoreboard's "TO" button already only pauses playback (`onTimeout={() => pause()}`), which is honest about what it does — MG2B did not need to change it, since it never claimed more than that.
- **Command application timing is "immediately," not queued to a dead-ball/paused boundary.** This was a deliberate choice (see Application moment above) based on what the existing engine state actually supports; a future wave introducing continuous/unpaused live play might need an explicit queue, but nothing today calls commands while a possession is mid-flight.
- **The `UNSUPPORTED` result status is unused today.** It exists in the type for a future command category (e.g., a timeout command with real game-clock effects, or a full play-call) that genuinely lacks runtime — MG2B did not invent such a category to exercise the code path, per the brief's explicit instruction not to fabricate scope.

## MG2C implications

- MG2C (per MG1's BUG-4 note) can now consider `calculatePlayerImpact`'s role in `RotationPlan.ts`'s bench-substitution ranking without needing to first worry about live-coaching correctness — that boundary is now real and independently tested.
- Any future live-coaching command category (timeouts with real effects, play calls, defensive matchup changes) should extend `LiveCoachingCommand`/`LiveCoachingCommandResult` in `src/app/game/LiveCoachingCommand.ts` rather than inventing a parallel contract — the extensibility point already exists.
- The `resolveActiveMatchLineups`-from-events pattern (rather than a stored "current lineup" field) is confirmed as the correct and only way presentation should read live lineup state; MG2C/V3 UI work should keep using it rather than caching lineups locally.

## Validation

- `npm run typecheck`: **PASS**, zero errors.
- `npm run build`: **PASS**.
- Focused suite (match engine, app/game, ui/match, ui/screens, ui-ng match app, entityActions, entityContextMenu, gameStore): **55 test files, 379 tests, all passed**.
- Full repository suite (`npm test`): **320 test files, 2353 tests, all passed, exit code 0** (MG2A baseline 320/2343 + 10 new tests, 0 regressions).
- Determinism boundary (`Math.random(` in `src/`): **zero matches** — clean.
- Domain/Engine dependency boundary (react/zustand/@tauri-apps import in `src/domain`, `src/engine`): **zero matches** — clean. (`LiveCoachingCommand.ts` lives in `src/app/game/`, outside this boundary, and imports only engine types.)
- Marker audit (TODO/stub/noop/no-op/not-implemented) on every MG2B-changed file: only one documented, intentional no-op comment — no silent placeholders.
- `git diff --check`: clean (only benign LF/CRLF normalization notices).
