# MATCH & BASKETBALL SIMULATION V3 — MG3 · Canonical Pre-Match → Match Contract

Branch: `match-gameplay-v3-mg3-prematch-match-contract`
Base: `f936d1a06f8fd3219853c1697adcf5484ac7aa16` (MG2D-certified `match-gameplay-v3-mg2d-completed-match-persistence`)
Scope: consolidate pre-match resolution into a single boundary. No 80-rating mapping, no Rotation/Tactical/Coach AI V2, no Training/Officials, no engine-internals rewrite.

---

## Diagram

```
                 GAMEWORLD
                    │
                    ▼
          PRE-MATCH RESOLVER
        (resolveCanonicalMatchInput)
                    │
                    ▼
          CANONICAL MATCH INPUT
              /           \
             /             \
            ▼               ▼
      LIVE SESSION     INSTANT SIM
  (LiveMatchController) (simulateMatchWithRotations)
            │               │
            └───────┬───────┘
                    ▼
              MATCH RESULT
                    │
                    ▼
               GAMEWORLD
             (completeMatch)
                    │
                    ▼
                 SAVE V3
```

---

## Old pre-match architecture

Before MG3, `src/app/game/playUserGame.ts` contained two independent, structurally near-identical but not-quite-identical resolution paths:

- `createLiveUserMatch(world, userTacticalPlan?)` — resolved squads, MG2A starters, `MatchPlayerProfile`s, team strength, MG2C-aware rotation plans, and the three RNG streams inline, then constructed `LiveMatchController` directly. It **never** called `getEffectiveTacticalPlan` — it always used whatever `userTacticalPlan` was passed for the user's side (defaulting the parameter to `createDefaultTacticalPlan()` when omitted) and always forced `createDefaultTacticalPlan()` for the opponent, regardless of any persisted `TeamTacticalInstructions`/`TeamGamePlan.tacticalOverride`. It also never threaded `defensiveMatchups` into `LiveMatchController` at all — any configured `TeamGamePlan.matchups` were silently dropped for live matches.
- `prepareMatch(world, game, tacticalPlans?)` — resolved the identical squads/starters/profiles/strength/rotation-plan/RNG logic (duplicated verbatim), but tactics came from `getEffectiveTacticalPlan` (reading persisted config) *unless* an explicit `tacticalPlans` object was passed — which is exactly what `prepareUserMatch` did, again defaulting the user's side to whatever was passed (or a fresh `createDefaultTacticalPlan()`) and the opponent's side to a flat default, bypassing `getEffectiveTacticalPlan` for both sides whenever called through the user-match path.

Net effect: **Live Match and Instant Result could silently disagree** on a user's own persisted tactical configuration, and Live Match additionally ignored configured defensive matchups outright. This was invisible in existing tests because `createNewGame()` worlds never configure non-default tactics, so the divergence never manifested — it was a latent bug MG1's audit implied but did not name explicitly, surfaced by MG3's Section 3/24 audit.

## Canonical input architecture

`src/app/game/resolveCanonicalMatchInput.ts` (new) defines:

```ts
export interface CanonicalMatchInput {
  gameId; homeTeamId; awayTeamId
  squads: MatchSquads
  lineups: MatchLineups                    // MG2A-authoritative starters
  playerProfiles: MatchPlayerProfiles
  homeStrength; awayStrength: TeamStrength
  homeRotationPlan; awayRotationPlan: TeamRotationPlan   // MG2C bench priority
  tacticalPlans: { home; away: MatchTacticalPlan }
  defensiveMatchups: { home; away: readonly DefensiveMatchupAssignment[] }
  random; decisionRandom; actorRandom: SeededRandomSource
}
```

and one function, `resolveCanonicalMatchInput(world, game, options?)`, that produces it. It does not hand the caller (or the runtime) `GameWorld` beyond what was already required by the engine — it resolves everything up front into plain, `PlayerId`/`TeamId`-keyed, engine-consumable data.

## Resolver flow

Both `createLiveUserMatch` and `prepareMatch` (`src/app/game/playUserGame.ts`, now 82 lines, down from 158) call `resolveCanonicalMatchInput` and spread its result directly into `LiveMatchController`'s constructor options / `simulateMatchWithRotations`'s options respectively:

```ts
export function createLiveUserMatch(world, userTacticalPlan?) {
  ...
  const input = resolveCanonicalMatchInput(world, game, tacticalPlanOverrideFor(userTeam, game, userTacticalPlan))
  return new LiveMatchController({ world, ...input })
}

export function prepareMatch(world, game, options?) {
  const input = resolveCanonicalMatchInput(world, game, { tacticalPlanOverrides: options?.tacticalPlanOverrides })
  return simulateMatchWithRotations({ world, ...input })
}
```

Neither function duplicates a single line of resolution logic anymore — the only difference between them is which runtime consumes the resolved input.

## Match participant resolution

`resolveAvailableSquads(world, game)` (private to the resolver, unchanged logic, moved verbatim from `playUserGame.ts`'s old `availableSquads`) resolves `MatchSquads` via `getAvailablePlayersForCompetition` (eligibility + availability for this specific game/date), throwing `PlayUserGameError('INSUFFICIENT_AVAILABLE_PLAYERS')` if either side has fewer than `MINIMUM_MATCH_SQUAD_SIZE`. This is the one and only squad-resolution call site now; both Live Match and Instant Result inherit it identically.

## Starter resolution

Unchanged from MG2A, now living in the resolver rather than duplicated in two functions: `resolveStartingFive` reads the team's configured `TeamLineup` and uses it when it names exactly 5 distinct starters all present in the available squad; otherwise falls back to `selectStartingFive` (the AI/fallback path). Both Live Match and Instant Result call this exactly once, through the resolver — Test B verifies both consume identical results for the same configured lineup.

## Bench resolution

Unchanged from MG2C, also moved into the resolver: `resolveBenchPriorityOrder` reads the team's configured `TeamLineup` bench slots (B1..B7) in priority order and threads it into `createDefaultRotationPlan`'s `benchPriorityOrder` option. Test C proves reversing a configured bench order changes the resolved rotation plan, and that this never depends on `calculatePlayerImpact` (the resolver imports no such function).

## Tactical resolution

This is where MG3 made a real, deliberate behavior fix, not just a refactor. `resolveCanonicalMatchInput` always resolves both sides' tactical plans via `getEffectiveTacticalPlan(world, game.id, teamId)` (persisted `TeamTacticalInstructions` + any `TeamGamePlan.tacticalOverride`) **unless** an explicit `tacticalPlanOverrides.home`/`.away` is supplied. `playUserGame.ts`'s `prepareUserMatch`/`createLiveUserMatch` now default `userTacticalPlan` to `undefined` (not `createDefaultTacticalPlan()`), so calling either with no argument correctly falls through to the persisted configuration for **both** sides — closing the Live-vs-Instant divergence described above. Test D verifies a configured tactical plan is honored as the real initial `MatchCoachingState`; Test E verifies the no-configuration fallback is identical across repeated resolutions.

`defensiveMatchups` is now resolved and threaded into `createLiveUserMatch` for the first time — previously silently dropped for live matches (see Old pre-match architecture above).

## Ruleset resolution

**Not changed in MG3** — deliberately, per the "known architectural debt" section below. `MatchEngine.createMatchSession` still resolves `ResolvedGameClockRules` internally via `resolveGameClockRulesForGame(options.world, game)`, requiring `SimulateMatchOptions.world: GameWorld` as an engine-level input. This is a pre-existing, narrow (2 read-sites) dependency, not new duplication introduced by app-layer resolution — see below for why MG3 did not touch it.

## Seed ownership

`createPrototypeGameRandom(gameId)` and the two `hashStringToSeed('match-decisions-v1:'/'match-actors-v1:', gameId)`-derived streams now live only in `resolveCanonicalMatchInput.ts`; `playUserGame.ts` no longer constructs any RNG stream itself. `CanonicalMatchInput.random`/`.decisionRandom`/`.actorRandom` are the sole seed-derived streams both runtimes consume. Test I confirms the same resolved input plus the same command sequence produces byte-identical final results across two independent runs.

## Snapshot policy

Unchanged from the pre-MG3 architecture (already correct, confirmed by audit, not modified): `MatchSquads`/`MatchLineups` are plain `readonly PlayerId[]` — never live `Player` object references. `MatchPlayerProfile` (`createMatchPlayerProfile`) is a frozen, derived snapshot of ratings-derived signals computed once at resolution time; the match runtime never re-reads `Player.basketball.ratings` from `GameWorld` mid-match. This means a `GameWorld` mutation elsewhere (e.g. player development, injuries applied to a *different* game) cannot silently alter an in-progress match's player behavior.

## Runtime mutability boundary

| INPUT (`CanonicalMatchInput`, frozen at resolution) | RUNTIME (`MatchSession.state`, mutates after tip-off) |
|---|---|
| `lineups` (initial starters) | `activeLineups` (current on-court five) |
| `tacticalPlans` (initial plan) | `coachingState` (current plan, MG2B live changes) |
| `homeRotationPlan`/`awayRotationPlan` | rotation-controller progress, applied substitution events |
| `squads`, `playerProfiles`, `homeStrength`/`awayStrength` | `fatigueByPlayerId`, `homeScore`/`awayScore`, `clockSecondsRemaining`, `period`, `events` |
| `random`/`decisionRandom`/`actorRandom` (seed identity) | the RNG streams' internal cursor position (advances, but the seed itself never changes) |
| `gameId`, `homeTeamId`, `awayTeamId` | (never change — match identity is immutable for the session's lifetime) |

This mirrors `MatchSimulation.lineups` (the historical initial-five snapshot, per pre-existing `ARCHITECTURE.md` documentation) vs. `MatchSession.state.activeLineups` (current), which MG3 did not need to change — it only ensured the *input side* of this boundary is resolved once, consistently, rather than duplicated.

## Live vs Instant convergence

Test A and its integration variant directly assert `resolveCanonicalMatchInput` returns identical `lineups`/`squads`/`tacticalPlans`/rotation plans for the same `(world, game)`, and that `createLiveUserMatch`/`prepareUserMatch` produce identical starting fives for the same configured lineup. AI-vs-AI (`simulateAndApplyGame` → `prepareMatch(world, game)`, no overrides) uses the exact same resolver with no special-casing — verified by a dedicated test constructing a non-user `Game` and resolving it directly.

## Legacy adapters

None newly introduced. The pre-existing legacy adapter this wave deliberately left untouched (per its own Section 7/28 instruction) is `legacyRatingSignals()` (`src/domain/player/Player.ts`), which `createMatchPlayerProfile` and `calculatePlayerImpact` both depend on to collapse the 80 canonical ratings into 7 legacy signals before any match-relevant derivation happens. `CanonicalMatchInput.playerProfiles` transports the *already-adapted* `MatchPlayerProfile` (built once, at resolution time, via the existing `createMatchPlayerProfile`) — MG3 did not touch this adapter, did not introduce a second one, and did not move the 80-rating mapping problem anywhere new. Future removal wave: whichever wave finally maps the 80 canonical ratings directly into match-resolution formulas (explicitly out of scope here, per MG1 Section 8 and this brief's Section 7/33).

## Known architectural debt

1. **`SimulateMatchOptions.world: GameWorld` remains an engine-level input.** `MatchEngine.createMatchSession` calls `getGame(options.world, options.gameId)` and `resolveGameClockRulesForGame(options.world, game)` internally — the only two read-sites of `options.world` in the entire engine (confirmed by direct audit). Removing this would mean changing `SimulateMatchOptions` to accept a pre-resolved `Game`/`ResolvedGameClockRules` instead, which would require updating ~7 existing engine test files (`MatchEngine.test.ts`, `MatchSession.test.ts`, `DetailedMatchSimulation.test.ts`, `FreeThrowSimulation.test.ts`, `MatchRotationRunner.test.ts`, `CalendarEngine.test.ts`, `Standings.test.ts`) that construct raw `SimulateMatchOptions` fixtures. This was evaluated and explicitly deferred (user-confirmed) as out of MG3's scope: it is real engine-internals surgery, not app-layer duplication, and the brief repeatedly warns against scope expansion into engine rewrites. Recorded here as the precise, actionable follow-up for a future wave that wants full Section 2 compliance at the engine boundary.
2. **The UI-level tactics draft (`tacticalPlanStore`) is never seeded from persisted configuration.** `MatchWorkspace.tsx`/`App.tsx` both read `useTacticalPlanStore().plan` (a plain Zustand store defaulting to `createDefaultTacticalPlan()`) and pass it unconditionally (never `undefined`) to `startLiveMatch`/`instantResult`. MG3's fix to `playUserGame.ts` (defaulting `userTacticalPlan` to `undefined` so the resolver falls through to persisted config) is necessary but not sufficient on its own to fix the *live UI's* actual behavior, because the UI always supplies a concrete override. Fixing this fully requires the Tactics/Match screen to seed `tacticalPlanStore` from `getEffectiveTacticalPlan` when it mounts — a UI-state change, not a pre-match resolver change, and therefore left for a follow-up wave (or a UI-focused fix) rather than expanded into MG3.
3. **`calculatePlayerImpact` remains used by `selectStartingFive`/`calculateTeamStrength`** (unchanged from MG2C, not expanded). The resolver's `resolveStartingFive` still falls back to `selectStartingFive` when no valid configured lineup exists — this dependency was neither removed nor introduced anywhere new by MG3.

## MG4 prerequisites

- MG4 (or whichever wave next touches the engine) can now safely build on a single `CanonicalMatchInput` type when it needs to extend pre-match resolution (e.g. Officials, Training/preparation signals, Coach/Staff context) — extend `ResolveCanonicalMatchInputOptions` and `CanonicalMatchInput` rather than adding new resolution logic to `playUserGame.ts` or duplicating it again in a new caller.
- If a future wave wants full Section 2 compliance at the engine boundary, the precise, scoped change is: replace `SimulateMatchOptions.world`/`.gameId` with a pre-resolved `game: Game` and `clockRules: ResolvedGameClockRules`, update `createMatchSession`'s two read-sites, and update the 7 listed test files' fixtures.
- The UI-level tactics-draft-seeding gap (item 2 above) should be resolved before any wave that depends on live-match tactics genuinely reflecting a user's saved configuration by default.

---

## Files changed

| File | Change |
|---|---|
| `src/app/game/resolveCanonicalMatchInput.ts` | New. `CanonicalMatchInput`, `resolveCanonicalMatchInput`, and the moved-verbatim `resolveStartingFive`/`resolveBenchPriorityOrder`/`resolveAvailableSquads`/`createPrototypeGameRandom` helpers. |
| `src/app/game/PlayUserGameError.ts` | New. `PlayUserGameError` extracted to its own file to avoid a circular import between `playUserGame.ts` and the new resolver (both need to throw/import it). |
| `src/app/game/playUserGame.ts` | Rewritten to call `resolveCanonicalMatchInput` instead of duplicating resolution logic (158 → 82 lines). `prepareUserMatch`/`createLiveUserMatch`'s `userTacticalPlan` parameter now defaults to `undefined` instead of eagerly materializing `createDefaultTacticalPlan()`, closing the Live-vs-Instant tactical divergence. `prepareMatch`'s third parameter changed from a fully-resolved `{home, away}` tactical-plans pair to `{tacticalPlanOverrides?}` (backward compatible — no existing caller passed the old third argument). |
| `src/app/game/index.ts` | Re-exports `createPrototypeGameRandom`/`resolveCanonicalMatchInput`/`CanonicalMatchInput`/`ResolveCanonicalMatchInputOptions` from the new resolver module instead of from `playUserGame`. |
| `src/app/game/CanonicalMatchInput.test.ts` | New. Tests A-L per the MG3 brief plus an AI-vs-AI convergence test and a static architectural guard. |

No engine files (`src/engine/match/**`), no UI files, no Save V3 files were touched.

---

## Tests

All in `src/app/game/CanonicalMatchInput.test.ts` unless noted:

- **Test A** (×2) — `resolveCanonicalMatchInput` produces identical output across calls for the same `(world, game)`; `createLiveUserMatch`/`prepareUserMatch` produce identical starting fives for the same configured lineup.
- **Test B** — a configured `TeamLineup` starting five (deliberately the five *lowest*-rated roster players, proving no rating-based override) appears identically in the resolver's output, Live Match's snapshot, and Instant Result's simulation.
- **Test C** — reversing a configured bench priority (B1..B7) produces a different resolved rotation plan, proving the resolver preserves configured order rather than re-deriving it from ratings.
- **Test D** — a configured `TeamTacticalInstructions` plan appears as the real initial `MatchCoachingState.currentTacticalPlan` in a live match.
- **Test E** — with no configured tactics, two independent resolutions produce byte-identical fallback plans.
- **Test F** — the resolved input's `gameId`/`homeTeamId`/`awayTeamId` match the source `Game` exactly (identity resolved once).
- **Test G** — a live manual substitution changes only the runtime lineup (verified via the presentation-derived active lineup); a fresh resolution of the same `(world, game)` afterward still returns the original configured starters, unaffected.
- **Test H** — a live tactical change updates runtime coaching state; a fresh resolution of the same `(world, game)` afterward still returns the original initial tactical plan.
- **Test I** — the same resolved input plus the same command sequence (deterministic `skipToEnd()`, no manual intervention) produces the identical final `MatchSimulation` across two independent runs from the same world.
- **Test J** — Instant Result still completes with a valid, non-tied final score and a `gameEnd` event (regression).
- **Test K** — Live Match still runs start-to-finish through the resolver-backed `LiveMatchController` (regression).
- **Test L** — an unconfigured/missing lineup still falls back deterministically to `selectStartingFive`, resolved once inside the resolver boundary (not inside `MatchEngine`), and the resulting simulation completes normally.
- **AI vs AI test** — `resolveCanonicalMatchInput` resolves a non-user `Game` with the same 5-player-lineup guarantee, and `simulateAndApplyGame` (AI-vs-AI) still completes correctly through the same boundary.
- **Architectural guard** — a static source-text check (following the repository's existing `NoIndexBasedLineup.test.ts` pattern) asserting `MatchEngine.ts`, `RotationPlan.ts`, `RotationController.ts`, `MatchRotationRunner.ts`, `MatchCoachingState.ts`, `ManualSubstitutions.ts`, `MatchTacticalPlan.ts`, and `LiveMatchController.ts` never call `getTeamLineup`/`getEffectiveTacticalPlan` directly — confirming the runtime never re-resolves pre-match decisions on its own.

Focused suite (`src/app/game`, `src/engine/match`, `src/engine/eligibility`, `src/engine/team`, `src/engine/tactics`, `src/app/save`, `src/app/entityActions`): **41 test files, 292 tests, all passed.** Broader suite (`src/stores`, `src/ui`, `src/ui-ng`): **112 test files, 657 tests, all passed**, confirming the resolver consolidation and the tactical-plan-default fix caused zero regressions anywhere the UI or stores integrate with match construction.

---

## Validation

- `npm run typecheck`: **PASS**, zero errors.
- `npm run build`: **PASS**.
- Focused suites: **41 + 112 = 153 test files, 949 tests, all passed** (combined from the two runs above).
- Full repository suite (`npm test`): **324 test files, 2388 tests, all passed, exit code 0** (up from MG2D's 323/2373 baseline by exactly 15 new tests — no regressions anywhere).
- Determinism boundary (`Math.random(` in `src/`): **zero matches** — clean.
- Domain/Engine dependency boundary (react/zustand/@tauri-apps import in `src/domain`, `src/engine`): **zero matches** — clean.
- `git diff --check`: clean (only a benign LF/CRLF normalization notice).
- Scope check: only `src/app/game/` files (2 new, 2 modified) plus one new test file were touched — no engine, UI, or Save V3 files.
