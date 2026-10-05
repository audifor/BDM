# ME-NEXT 0 · Foundation

## Status

PASS. Focused tests (9), typecheck, production build, Rust formatting, and Rust check passed. The default parallel repository run completed with 3,334 passed, 1 skipped, 53 timeouts across 27 existing test files, and one worker-startup timeout. All affected test files were rerun serially (28 files including the separately resolved `.ts`/`.tsx` paths): 482 passed, including every timed-out case. No existing test or expected output was changed.

## Architecture created

- `src/engine/match-next/setup.ts`: serializable `MatchSetup`, explicit profile and tactical-plan data, precise setup invariants, and neutral debug positions.
- `src/engine/match-next/rng.ts`: three explicit serializable deterministic streams.
- `src/engine/match-next/state.ts`: JSON-safe `MatchState`, player/ball/possession placeholders, and internal boundary events.
- `src/engine/match-next/kernel.ts`: pure `createMatchState`, `tick(state)` and `runUntil(state, predicate)` APIs.
- `src/engine/match-next/frame.ts`: pure presentation snapshot projection.
- `src/engine/match-next/observer.ts`: movement continuity and ball transition/displacement report.
- `src/app/matchNext/prepareMatchSetup.ts`: canonical app preparation adapter.
- `src/ui-ng/applications/matchNextDebug/`: local-state DEV debug view, selected in `main.tsx` only with `import.meta.env.DEV` and `?matchNextDebug=1`.

The engine imports only court/identity types and the existing deterministic string hash. It has no GameWorld, React, Zustand, Tauri, browser, time, or mutable RNG dependency. `MatchState` carries resolved clock rules so ticks and replay continuation need no app-layer setup argument. `prepareMatchSetup` calls the existing `prepareMatchOptions` and maps its prepared squads, lineups, profiles, tactical plans, matchups, and seed; no preparation algorithm was duplicated and legacy preparation remains unchanged.

The application currently supplies a 24-second shot-clock setting because canonical competition rules do not yet expose shot-clock configuration. It is an inert setup placeholder in this milestone: the foundation state keeps `shotClockTenths: null` and does not count it down. The next rules milestone should decide the competition-owned source before shot-clock behavior is implemented.

## What exists

- Self-contained validated setup with competition clock and canonical court geometry resolved before the kernel.
- Minimal Match Next player profiles derived from `createMatchPlayerProfile`; there is no Overall or Player/GameWorld entity in the kernel.
- JSON-safe MatchState with integer tenths, three RNG stream counters, ten static initial players, `HELD`/`DEAD` ball variants and `FOUNDATION_UNASSIGNED` possession.
- Pure 0.1 second ticks, period-boundary events, `toFrame`, and a plain-data observer.
- A DEV-only debug view displaying court markers, ball, period, game clock, shot-clock placeholder, score, tick, play/pause, one-tick, and local history scrubber.

Starting positions are a neutral foundation/debug placement inside the court. They do not represent an offensive formation. Real inbound and initial-positioning behavior begins in ME-NEXT 1/2.

## Clock and completion semantics

The first period begins at `t = 0` with its full configured clock. Each running tick decrements the clock by one tenth and increments `t` by one. The tick that reaches zero emits `periodEnd` at that exact `t`; if regulation remains, it immediately emits the next `periodStart` at the same `t` with a full period clock. FIBA regulation therefore ends after exactly `4 × 600 × 10 = 24,000` ticks.

No scoring or overtime behavior exists. The all-zero foundation score is tied, so regulation ends with `periodEnd` followed by `foundationEnd`, `isComplete: true`, and `foundationOnly: true`. This is explicitly not a valid basketball result; no `gameEnd` event is emitted and no consumer is integrated outside the debug surface.

## Deliberately absent

Ball physics, inbound behavior, pass/shot flight, loose balls, rebounds, movement, responsibilities, decisions, offensive structure, defense, tactic effects, fatigue, fouls, substitutions, MatchEvent projection, LiveMatchController integration, AI game integration, and old-engine deletion.

## Determinism evidence

Focused tests verify identical seeds, independent outcome/decision stream sequences, full RNG serialization continuation, identical independent replays, and exact serialized MatchState resume from 12,000 regulation ticks. `Math.random`, `Date.now`, and `performance.now` are not used in the new engine or adapter.

## Serialization evidence

Generated-world setup, MatchState, RNG state, and MatchFrame all survive JSON round-trip. The resumed foundation state deeply equals uninterrupted execution at completion.

## Performance

The focused performance smoke test runs three full 24,000-tick regulation simulations and enforces a 200 ms mean ceiling per simulation. Across four focused runs on this machine, samples ranged from 0.6 to 1.2 ms per game; the twelve-sample mean was approximately 0.9 ms (about 26.7 million ticks/second). This is a foundation smoke baseline, not the production AI/background budget.

## Dependency boundaries

The engine source guard rejects React/Zustand/Tauri imports, GameWorld references, clock/random APIs, and Map/Set in the canonical state module. The legacy `src/engine/match/` tree and save/domain schemas are unchanged. `main.tsx` mounts the debug component only for a development URL with `matchNextDebug=1`; production rendering retains the existing app bootstrap.

## Canonical rules recorded

- Time: movement integration must use the fixed kernel tick; movement `dt > 0.25 s` is architecturally suspicious.
- Ball: ownership may change only through explicit Ball State Machine transitions; no helper may give the ball directly to a distant player.
- Movement: after ME-NEXT 2, player positions may only be written by the kinematics layer.
- Provenance: movement targets must eventually trace `responsibility → decision → movement intent → kinematics`.
- Defense: positioning must derive from assignment, ball, basket, and defensive scheme, never mirrored offense-role coordinates.
- Structure: offense positioning must derive from ball, basket, strong/weak side, and spacing slots, never an absolute five-point role table.
- Events: no fabricated statistics; derived assists, steals, blocks, and other statistics must follow actual play.
- Validation: future milestones need Technical, Behavioural, and Visual passes; unit tests alone are insufficient.

## Open questions

- The committed MatchEngine Restart Audit named in the request was not found. The existing `MG4A_MATCHENGINE_V3_CANON_AUTHORITY_AUDIT.md` was reviewed; no legacy documents were changed.
- MG4A describes the legacy MatchEngine core as architecturally sound, which conflicts with this milestone's explicit decision that the old engine is frozen and unsuitable for future development. ME-NEXT instructions govern this implementation; the older audit remains untouched.
- Competition-owned shot-clock configuration has no canonical source in the current domain. The inert 24-second setup placeholder must not be treated as a decided rule.
- Runtime calibration of the production AI/background simulation budget remains open; the 200 ms smoke ceiling is only a broad foundation guard.
