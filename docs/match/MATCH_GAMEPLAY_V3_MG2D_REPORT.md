# MATCH & BASKETBALL SIMULATION V3 — MG2D · Completed Match Persistence Bridge

Branch: `match-gameplay-v3-mg2d-completed-match-persistence`
Base: `c3ea885ef4a69c437f81c943a1edc9aa61d5455c` (MG2C-certified `match-gameplay-v3-mg2c-rotation-authority-cleanup`)
Scope: bridge existing Save V3 to the existing match-completion boundary. No Save V3 redesign, no new post-match systems, no Rotation/Coach AI work.

---

## MG1 BUG-5 root cause

MG1 found that `saveCurrentGame`/`GameSaveService`/`TauriGameSaveRepository` were wired only into the legacy `?ui=legacy` UI's manual SAVE button, with zero references anywhere in `src/ui-ng`. The default NG UI could complete a live match — updating `GameWorld` correctly in memory — but had no code path that ever wrote that world to disk. The gap was not in match-result correctness (world commit was already solid, see below); it was that the disk-persistence trigger simply didn't exist on the NG completion path.

## Old NG completion flow

```
NgMatchViewer completion effect (unchanged by MG2D):
  simulation !== null && finished && !resultApplied
    → markResultApplied()  [matchViewerStore, one-shot latch]
    → gameStore.completeMatch(simulation)
        → completeMatch(world, simulation)  [app/game/playUserGame.ts]
            → applyPostMatchInjuries(applyCompletedMatch(world, simulation), gameId)
        → set({ world: <new world> })   [Zustand, in-memory only]
        → liveController = null
  [END — no save call anywhere]
```

The world was already correctly and safely committed in memory (see World update below). Nothing after that point ever touched disk. If the user closed the app (or the process crashed) before switching to the legacy UI and manually saving, the completed match — and any world mutation since the last legacy-mode save — was lost.

## Instant Result comparison

`instantResult(world, tacticalPlan)` (`app/game/playUserGame.ts:131`) calls `completeMatch(world, prepareUserMatch(world, tacticalPlan))` — the exact same `completeMatch` function the live path uses. Instant Result and the live match path already converged on one finalization boundary before MG2D; the difference was only in how the `MatchSimulation` was produced (`prepareUserMatch`'s single-shot `simulateMatchWithRotations` vs. the live `LiveMatchController`'s stepped `stepMatchSession` calls, both already sharing `resolveStartingFive`/rotation/tactics resolution per MG2A-C). Neither path had a save step; MG2D adds one to the live/NG completion effect specifically, since that's the flow MG1 flagged and the one with no manual-save fallback in its own UI.

## Canonical finalization boundary

No new finalization function was created — `completeMatch(world, simulation)` (`app/game/playUserGame.ts:141-143`) is already the single, pure, React-free, Tauri-free boundary both Instant Result and the live path use:

```ts
export function completeMatch(world: GameWorld, simulation: MatchSimulation): GameWorld {
  return applyPostMatchInjuries(applyCompletedMatch(world, simulation), simulation.gameId)
}
```

MG2D did not touch this function. It added a persistence step *after* it, at the store/UI-orchestration layer where async IO already belongs (see Save V3 bridge below).

## World mutations

`applyCompletedMatch` (`engine/match/MatchResultApplication.ts:99-107`) was already comprehensive and already idempotency-guarded before MG2D:

| Consequence | Status |
|---|---|
| Game status → `completed`, result recorded | ALREADY FUNCTIONAL — `applyMatchResult` |
| Canonical `MatchStatLog` (box score) recorded | ALREADY FUNCTIONAL — `createMatchStatLog`, cross-checked against `simulation.finalScore` |
| Standings/season progression | ALREADY FUNCTIONAL — `finalizeCompletedSeason` |
| Eligibility participation | ALREADY FUNCTIONAL — `recordEligibilityParticipation` |
| Morale (win/loss ±4) | ALREADY FUNCTIONAL — `applyMatchMorale` |
| Coach reputation consequences | ALREADY FUNCTIONAL — `applyMatchCoachReputationConsequences` |
| Coach XP (pre-match strength, post-canonical-result) | ALREADY FUNCTIONAL — `applyMatchCoachExperience` |
| News/narrative | ALREADY FUNCTIONAL — `processNarrativeMatch` |
| Media | ALREADY FUNCTIONAL — `processMediaMatch` |
| Post-match injuries | ALREADY FUNCTIONAL — `applyPostMatchInjuries` (composed in `completeMatch`) |
| Duplicate-application guard | ALREADY FUNCTIONAL — `applyCompletedMatch` throws `MatchResultApplicationError` if `matchStatLogsByGameId[gameId]` already exists; `applyMatchResult` independently throws if the game is not `scheduled` |

MG2D did not add, remove, or modify any of these — the "world consequences" side of BUG-5 was never broken; only the disk-persistence step downstream of it was missing.

## Save V3 bridge

New `gameStore.saveCompletedMatch(repository, savedAt)` action (`stores/gameStore.ts`):

```ts
saveCompletedMatch: (repository, savedAt) => saveCurrentGame(requireWorld(get().world), repository, savedAt),
```

It is a thin wrapper around the pre-existing `saveCurrentGame(world, repository, savedAt)` (`app/save/GameSaveService.ts`, untouched by MG2D — its diff is empty), which serializes through `serializeGameWorldV3`, self-verifies via `deserializeGameWorldV3`, then calls `repository.save(...)`. The action reads whatever `world` is already in the store — it does not re-derive, re-simulate, or accept a `MatchSimulation` parameter, so it cannot diverge from what `completeMatch` already committed. `NgMatchViewer`'s completion effect calls `completeMatch(simulation)` first (synchronous), then `saveCompletedMatch(tauriGameSaveRepository, new Date().toISOString())` (async, fire-and-forget with an explicit `.catch`):

```
Match runtime (LiveMatchController, MatchSession)
  → simulation.finalScore / events (authoritative, unchanged by MG2D)
  → gameStore.completeMatch(simulation)          [synchronous world commit]
  → gameStore.saveCompletedMatch(repository, ts)  [async — the new bridge]
      → saveCurrentGame(world, repository, savedAt)   [existing Save V3 API, unchanged]
      → repository.save(JSON.stringify(envelope))     [existing Tauri/infra boundary, unchanged]
```

`MatchEngine`/`LiveMatchController`/`RotationPlan` remain completely unaware this exists — no filesystem, Tauri, or save-slot concept was introduced into `src/engine/match`, confirmed by the unchanged Domain/Engine dependency-boundary gate (zero matches for react/zustand/@tauri-apps imports in `src/domain`, `src/engine`).

## Idempotency

Two independent layers, both pre-existing and unmodified by MG2D:
1. **Presentation layer**: `matchViewerStore.markResultApplied()` is a one-shot latch (`resultApplied` flips `false → true` once); the completion effect's dependency array and early-return (`if (!markResultApplied()) return`) mean `completeMatch`/`saveCompletedMatch` fire at most once per completed simulation in the component's lifetime.
2. **Domain layer** (the real guarantee): `applyCompletedMatch` throws `MatchResultApplicationError` if `world.matchStatLogsByGameId[gameId]` already exists, and `applyMatchResult` throws if the target `Game.status !== 'scheduled'`. Calling `completeMatch` twice on a world that already reflects the match's completion throws rather than silently duplicating stats/standings/morale — verified directly in `MatchFinalization.test.ts` (Test E), bypassing the UI latch entirely to prove the domain-level guard holds on its own.

`saveCompletedMatch` itself needs no separate idempotency mechanism: it always serializes the *current* store world and overwrites the single save slot — calling it twice in a row simply re-saves the same (or a newer) world, which is safe by construction (Save V3's `repository.save` is a full-overwrite, not an append).

## Failure behavior

`saveCompletedMatch`/`saveCurrentGame` reject on failure — they are never swallowed into a false-success state. `NgMatchViewer`'s completion effect attaches `.catch(error => setMatchSaveError(...))`, following the exact pattern the legacy `App.tsx`'s manual `saveGame()` already uses (`try { await saveCurrentGame(...) } catch (error) { setSaveMessage(...) }`), so MG2D introduces no new error-handling paradigm. `matchSaveError` is surfaced in the scoreboard's meta region as a `role="alert"` banner once the match is finished, replacing the "live events" counter (which is meaningless post-completion). Critically, **`completeMatch` (the world commit) is synchronous and always runs before the save is even attempted** — so a save failure never leaves `GameWorld` in an inconsistent state; it only means the already-correct in-memory world hasn't reached disk yet, exactly the distinction the brief requires ("`MATCH COMMITTED TO WORLD`" vs. "`SAVE FAILED`").

## NG flow

`NgMatchViewer.tsx`'s completion `useEffect` (the only change to this file beyond the new import and state) now reads:

```ts
useEffect(() => {
  if (simulation === null || !finished || resultApplied) return
  if (!markResultApplied()) return
  completeMatch(simulation)
  setMatchSaveError(null)
  saveCompletedMatch(tauriGameSaveRepository, new Date().toISOString()).catch((error) => {
    setMatchSaveError(error instanceof Error ? error.message : 'Unable to save the completed match')
  })
}, [completeMatch, finished, markResultApplied, resultApplied, saveCompletedMatch, simulation])
```

No domain logic was added to the component — it only calls two store actions and a UI-local error state, exactly the delegation pattern the rest of the file already uses for every other action (`applyLiveTactics`, `applyManualSubstitutions`, etc., per MG2B). No visual redesign: the only new UI is the conditional `matchSaveError` banner replacing the existing "live events" counter slot when (and only when) the match is finished and a save has actually failed.

## Legacy flow

`src/ui/App.tsx`'s manual SAVE button (`saveGame()`, calling `saveCurrentGame(world, tauriGameSaveRepository, ...)` on click) was **not modified**. It remains a correct, working, independent save trigger for the legacy UI's own workflow (any world state, not just match completion) and was not duplicated or altered. `MatchViewerScreen`'s own `onApplyResult` callback (calling the same `completeMatch` store action) was also left untouched — the legacy path already has its own manual save affordance as a safety net, so it did not need the same automatic bridge MG2D added to NG. This is a deliberate asymmetry, not an oversight: MG1 identified the *NG* path specifically as having zero persistence story, while legacy already had one (manual, but present).

## Files changed

| File | Change |
|---|---|
| `src/stores/gameStore.ts` | Added `saveCompletedMatch(repository, savedAt)` action — a thin wrapper around the existing `saveCurrentGame`. |
| `src/stores/gameStore.test.ts` | Two new tests: `saveCompletedMatch` persists the world already committed by `completeMatch`; a disk-save failure propagates rather than reporting false success. |
| `src/ui-ng/applications/match/NgMatchViewer.tsx` | Completion effect now calls `saveCompletedMatch` after `completeMatch`; added `matchSaveError` state and a conditional error banner in the scoreboard meta region. |
| `src/app/game/MatchFinalization.test.ts` | New. Tests A, B, E, G (regression), H (regression), I (regression) — live-match finalization through the store, idempotent rejection on double-completion, command-boundary rejection post-completion, MG2A/MG2C regressions through the same live-match path. |
| `src/app/save/GameSaveService.test.ts` | New. Tests D (Save V3 round-trip for a completed live match), J (save failure surfaces, not swallowed), F (Instant Result round-trip regression), C (no second simulation — the committed world is fully determined by the passed-in `MatchSimulation`, not re-derived). |
| `docs/match/MATCH_GAMEPLAY_V3_MG1_AUDIT.md` | BUG-5 marked RESOLVED (scoped to match-completion persistence) with evidence and an explicit scope note. |
| `docs/match/MATCH_GAMEPLAY_V3_MG2D_REPORT.md` | New (this file). |

`src/app/save/GameSaveService.ts` was edited during development (a composing function was tried, then removed in favor of the simpler store-level wrapper) and ends with **zero net diff** — the existing `saveCurrentGame`/`loadSavedGame` API was reused entirely as-is.

---

## Tests

- **Test A / B** (`MatchFinalization.test.ts`) — a live user match run to completion through the store (`startLiveMatch` → `skipLiveMatch` → `completeMatch`) produces a `GameWorld` where the game is `completed` with a result matching the simulation's `finalScore`, and a `MatchStatLog` matching it.
- **Test C** (`GameSaveService.test.ts`) — the same authoritative `MatchSimulation` applied to the same starting world via `completeMatch` twice (independently, not through the idempotency-guarded single-application path) produces byte-identical committed results, proving `completeMatch` derives everything from the passed-in simulation with no hidden re-simulation or presentation-state read.
- **Test D** (`GameSaveService.test.ts`) — a completed live match, serialized via `saveCurrentGame` and deserialized via `loadSavedGame` against an in-memory `GameSaveRepository` double, preserves the game's `completed` status, result, and `MatchStatLog`.
- **Test E** (`MatchFinalization.test.ts`) — calling `completeMatch` twice with the same final simulation throws (the domain-level idempotency guard), and the store's world is unchanged after the rejected second call.
- **Test F** (`GameSaveService.test.ts`) — Instant Result (`instantResult`) still round-trips through Save V3 unchanged.
- **Test G** (`MatchFinalization.test.ts`) — configuring the five lowest-`calculatePlayerImpact` roster players as starters still produces exactly those starters through the full live-match-to-finalization path (MG2A regression).
- **Test H** (`MatchFinalization.test.ts`) — `applyLiveTactics`/`applyManualSubstitutions` both throw once the match session has been finalized (the store's `requireLiveController()` throws `'No live match'` after `completeMatch` nulls `liveController`), confirming MG2B's command boundary correctly rejects post-completion commands.
- **Test I** (`MatchFinalization.test.ts`) — `replacementCandidates` for a live match never returns anything outside real squad-minus-active-lineup membership (MG2C regression).
- **Test J** (`GameSaveService.test.ts` and `gameStore.test.ts`) — a failing `GameSaveRepository.save` causes `saveCurrentGame`/`saveCompletedMatch` to reject with the underlying error message, never resolving successfully.

Focused suite (`src/engine/match`, `src/app/game`, `src/app/save`, `src/save`, `src/stores`, `src/ui-ng/applications/match`, `src/ui/screens`): **57 test files, 402 tests, all passed.**

## Remaining persistence limitations

- **No general NG save/load UI.** MG2D wires persistence specifically to match completion. A user who mutates world state through NG in other ways (training, roster, recruiting, etc.) and never plays/finishes a match still has no way to persist those changes without falling back to legacy mode — this was explicitly out of MG2D's scope (bridging *match* completion, not building NG's save/load UI in general) and remains open.
- **No load-on-startup / auto-resume story was touched.** MG2D does not change how or whether a saved game is loaded when the app starts; it only ensures a completed match's world reaches the existing save slot.
- **Single save slot.** `GameSaveRepository`/`TauriGameSaveRepository` already model exactly one save slot (`save_game_v1`/`load_game_v1`/`get_save_info_v1`); MG2D does not introduce multiple slots, autosave history, or versioned match-by-match snapshots — every match completion overwrites the same single save, consistent with existing Save V3 semantics.
- **The save is fire-and-forget from the effect's perspective.** If the user navigates away or closes the app in the brief window between `completeMatch` and the save promise resolving, the world is safely committed in memory (and will be captured by any subsequent save) but the specific auto-save for *that* match may not have completed. This is an inherent property of async IO triggered from a `useEffect` and was not deemed in-scope to solve with a blocking/must-complete-before-navigation guarantee, since no such guarantee exists anywhere else in the app today (including the legacy manual save button).

---

## Validation

- `npm run typecheck`: **PASS**, zero errors.
- `npm run build`: **PASS**.
- Focused suite: **57 test files, 402 tests, all passed.**
- Full repository suite (`npm test`): **323 test files, 2373 tests, all passed, exit code 0** (up from MG2C's 321/2362 baseline by exactly 11 new tests — no regressions anywhere).
- Determinism boundary (`Math.random(` in `src/`): **zero matches** — clean.
- Domain/Engine dependency boundary (react/zustand/@tauri-apps import in `src/domain`, `src/engine`): **zero matches** — clean. No filesystem/Tauri/save-slot concept was introduced into `MatchEngine`/`LiveMatchController`/`RotationPlan`.
- `git diff --check`: clean.
- Scope check: only `gameStore.ts`, `NgMatchViewer.tsx`, plus new test/doc files were touched (`GameSaveService.ts` ends with zero net diff) — no Save V3 schema/version change, no new post-match system, no Rotation/Coach AI work.
