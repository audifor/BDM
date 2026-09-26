# ME-NEXT 1 · Ball & Possession

## Status

PASS. The focused automated engine and React debug-view tests pass. The user manually inspected scenarios A–E at `http://127.0.0.1:1420/?matchNextDebug=1` and confirmed all five look correct. The user also confirmed the tests pass; the full repository run in this session was interrupted at the user's request to expedite testing after the parallel run hit unrelated timeouts.

## Base

ME-NEXT 0 certified base: `7a2eea34c5a77314d98157742c067e5e58e2c14b`.

Branch: `matchengine-next-1-ball-possession`
Worktree: `C:\BDM-ME-NEXT-1`

## Ball state machine

One JSON-safe `BallState` union is stored in `MatchState.ball`; no state has more than one ball variant.

| State | Authority and next legal outcomes |
| --- | --- |
| `HELD` | One active owner, matching team and position; explicit pass or shot release. |
| `PASS_IN_FLIGHT` | Continuous chest, bounce, or lob path; intended catch to `HELD`, failed catch to `LOOSE`, or validated defender interception to `HELD`. |
| `SHOT_IN_FLIGHT` | Continuous parabolic path with an outcome supplied at release; make to `DEAD`, miss to `REBOUNDABLE`. |
| `REBOUNDABLE` | Travels to the supplied landing target; a close active player may secure it after `availableAtT`. |
| `LOOSE` | Deterministic decaying motion with court-edge clamping; a close active player may recover it. |
| `DEAD` | No live clock or live-ball command; a reason-checked inbound can restart play. |
| `INBOUND` | Ball waits at the restart spot; inbounder is physically checked before release to `PASS_IN_FLIGHT`. |

Transitions are exposed as pure functions and as plain-data `MatchNextCommand` inputs. Flight `releaseT`, `arrivalT`, possession/event `t`, and rebound availability times use the simulation tick unit: integer 0.1-second ticks. A flight resolves at its exact integer `arrivalT`. An inbound deadline is explicitly `null` because the competition-owned limit is not modeled.

Restart spots are deterministic simplifications: period starts use court center; made baskets use the baseline beside the scored-at basket; shot-clock violations and generic turnover restarts use court center. Full out-of-bounds placement rules are absent.

## Possession state machine

`MatchState.possessions` stores the deterministic monotonic history (`possession-1`, `possession-2`, …); `activePossessionId` identifies at most one open record. Closed records carry both `endReason` and `endedT`.

Phases are `INBOUND`, `ADVANCE`, `SETUP`, `ACTION`, `SHOT`, and `LIVE_REBOUND`. Automatic transitions implemented here are inbound start/receipt, shot release/miss, and rebound acquisition; no action system uses `ACTION` yet.

Possession start reasons: `periodStart`, `madeBasketInbound`, `defensiveRebound`, `steal`, `turnoverInbound`, `shotClockViolation`, `other`.

Possession end reasons: `made`, `defensiveRebound`, `turnover`, `shotClock`, `periodEnd`.

Made baskets, defensive rebounds, explicit interceptions, cross-team loose-ball recoveries, shot-clock violations, and period ends close possession through explicit transitions and events. Offensive rebounds keep the possession open and increment its count.

## Clock semantics

- `clock.gameRunning` and `clock.shotRunning` are explicit state. Both are false during `DEAD` and `INBOUND`.
- A legal inbound catch starts game time and initializes the shot clock from `MatchSetup.clockRules.shotClockSeconds`; that catch tick consumes no game or shot-clock time.
- Live ticks subtract one integer tenth and clamp at zero. A new live possession resets the shot clock from setup.
- A shot clock reaching zero before shot release causes `DEAD(shotClockViolation)`, `possessionEnd(shotClock)`, and an explicit event. A shot released before zero continues after shot-clock zero.
- An offensive-rebound reset uses `offensiveReboundShotClockSeconds` only when that optional setup value is resolved. Null preserves the remaining clock; if it is already zero, the possession ends with a shot-clock violation. No 14-second value is assumed.
- A game-clock horn ends the current possession, deadens any pass, shot, or rebound state, and emits `periodEnd`. A pre-horn shot that has not arrived is temporarily canceled at the horn; score is not awarded. Later rule work can model post-horn shot resolution without letting flights continue silently.
- A non-final period emits its next `periodStart` at the same simulation `t`, with full period time and stopped clocks until a legal inbound catch. Overtime resolution is not added in this milestone.

All clocks are deterministic; there is no wall-clock dependency.

## Physical invariants

- `BALL_ACQUISITION_RADIUS_METERS` is 1.0. Catch, rebound, recovery, interception, and inbound association validate the active player's distance before changing ownership.
- `HELD.position` is copied from the owner position and checked to 0.001 m.
- Pass and shot x/y positions are interpolated from their stored start, target, and times on each tick. Rebound motion is interpolated to its landing point. Loose motion advances by velocity × 0.1 seconds with deterministic drag.
- The only allowed end-of-tick acquisition snap is at most 1.0 m and is recorded in the acquisition event. Dead-ball restart placement is a separate stopped-ball transition.
- Players are static. If nobody is close to a rebound or loose ball, it remains there; no player or ball is teleported to enable a catch.

## Events

The internal event stream covers `periodStart`, `periodEnd`, `gameEnd`, `possessionStart`, `possessionPhaseChanged`, `possessionEnd`, `inboundStarted`, `inboundReleased`, `passReleased`, `passReceived`, `passBecameLoose`, `passIntercepted`, `shotReleased`, `shotMade`, `shotMissed`, `reboundBecameAvailable`, `reboundSecured`, `looseBallCreated`, `looseBallRecovered`, `shotClockViolation`, and `ballDead`.

Events receive a monotonic sequence, simulation tick, period, and game-clock tenths. Transition-specific IDs, phases, reasons, points, and acquisition distance are attached where relevant. No legacy `MatchEvent`, box score, assist, steal attribution, or other stat projection is produced.

## Serialization

Focused tests JSON round-trip and resume during `INBOUND`, pass flight, shot flight, `REBOUNDABLE`, and `LOOSE`, then compare against uninterrupted ticks. Canonical state contains plain arrays and objects, with no `Map`, `Set`, class instances, closures, promises, dates, or mutable RNG object.

## Determinism

Ball trajectories and explicit transition commands use no RNG. Planned shot outcomes and rebound targets are plain command/setup data. A repeat command stream produces deep-equal final state and events; possession IDs and event sequences are deterministic. The existing independent RNG streams remain unchanged and are not consumed by this milestone.

## Behavioural report

Three scripted seeds (`11`, `123456`, `4294967295`) were checked through the frame observer. Reported values for each: ball teleports `0`, illegal acquisitions `0`, invalid possessions `0`, clock violations `0`. Player continuity, ball state, possession, and clock violation arrays were empty. Focused tests also reject distant catch, rebound, recovery, and interception commands.

## Visual pass

PASS. The user confirmed scenarios A–E look correct in the browser. The React test also verifies the court, static players, state panel, Scenario A inbound, and Scenario C shot → made dead ball → opponent inbound. The seeded view is `matchNextDebug=1`, seed `20260926`; scenarios A–E are selectable and step/play controls advance in 0.1-second increments.

## Verification

The focused Match Next engine and debug UI tests passed: 22 tests across two files. The user confirmed their test run also passes. The full repository run here was interrupted to expedite testing after the parallel run showed unrelated timeouts under load. `npm run typecheck`, `npm run build`, `cargo fmt --check --manifest-path src-tauri/Cargo.toml`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `git diff --check` passed. The production engine scan found no `Math.random`, wall-clock calls, UI imports, or `GameWorld` dependency; the legacy `src/engine/match/` diff is empty.

## Performance

On this machine, the focused clock-only four-period 24,000-tick run measured a 3.0 ms mean across three samples (about 7.89 million ticks/s). During the parallel repository run under load, the same check measured 8.2 ms mean. ME-NEXT 0's recorded foundation mean was about 0.9 ms; both results remain under the existing 200 ms smoke ceiling.

The focused synthetic ball-heavy script measured 2,410 ticks, 907 events, and 2.9 ms (about 825,000 ticks/s). The parallel repository run under load measured 3.4 ms. It included 100 passes, 100 shots, and 100 offensive rebound transitions. Measurements are an initial baseline, not a final AI budget.

## Rule authority

`CompetitionRules`, ecosystem, season, and game-clock resolvers contain no shot-clock or offensive-rebound shot-clock rule. The application adapter retains its existing `shotClockSeconds: 24` as a documented inert compatibility placeholder; it is not canonical competition truth. The kernel consumes setup-provided values and never defines a universal shot-clock value. Offensive-rebound reset remains explicitly unresolved as `null`. No Domain or save schema was changed.

## Deliberately absent

Player movement, offensive structure, defense, basketball decisions, statistical resolution/calibration, rebound selection, fouls, timeouts, overtime resolution, competition shot-clock schema, full inbound deadline/out-of-bounds rules, and legacy event projection.
