# MG6J MatchEngine V3 final certification

## Seed lifecycle

- Each newly prepared match run receives one fresh unsigned 32-bit seed from
  `crypto.getRandomValues` at the Application boundary.
- That seed is retained in the prepared run options and by `LiveMatchController`;
  transient `MatchSessionState` and `MatchSimulation` carry it for debug/replay.
  It is not regenerated during possessions, periods, pauses, resumes, or rendering.
- One shared derivation creates the sporting, decision, and actor streams. The
  actor stream is limited to assist and block attribution; it cannot change the
  canonical sporting result. Decision choices that affect spatial state, such as
  rebounder and steal selection, use the decision stream.
- `prepareMatchOptions`, `prepareMatch`, `prepareUserMatch`,
  `createLiveUserMatch`, `instantResult`, and `simulateAndApplyGame` accept an
  explicit seed for deterministic tests, debug, or replay. An injectable seed
  factory is available at `prepareMatchOptions` for boundary tests.
- There is no persisted MatchSession save/resume contract. A completed `Game`
  stores its canonical score only; it does not retain its seed or event stream.
  Replay after save/load remains deferred rather than widening Save V1 here.

## MG6 feature matrix

| Milestone | Certified behavior | Focused evidence |
| --- | --- | --- |
| MG6A | Time based movement, acceleration, braking, court bounds, no teleport | `MatchSession.test.ts` |
| MG6B | Player sourced speed, acceleration, agility and change of direction | `PlayerKinematics.test.ts`, `MatchSession.test.ts` |
| MG6C | Cuts, targets, cancellation and possession lifecycle | `OffBallMovement.test.ts`, `MatchSession.test.ts` |
| MG6D | Screen selection, set window, route interaction and lifecycle | `ScreenInteractions.test.ts` |
| MG6E | Roll/pop selection, targets and post screen movement | `ScreenInteractions.test.ts` |
| MG6F | Ball handler drives, profile based movement, ball follows owner | `DribbleDrives.test.ts` |
| MG6G | Defensive threat, help, rotation and recovery | `MatchSession.test.ts`, `Matchups.test.ts`, `ScreenInteractions.test.ts` |
| MG6H | Switch, drop, hedge and blitz coverage movement | `ScreenInteractions.test.ts`, `MatchSession.test.ts` |
| MG6I | Intent integration, transition step, possession cleanup and visual snapshots | `MatchSession.test.ts`, `SpatialVisualBridge.test.ts`, `MatchPresentationSegment.test.ts` |

## Certified authority and flow

- Offense movement: transition > handler drive > screen/post screen > cut >
  BaseSpacing. Intents can coexist for distinct players; the screener, cutter,
  handler, and coverage participants retain their documented participant rules.
- Defense movement: transition > P&R coverage > help/rotation/recovery >
  BaseSpacing. Coverage participants are excluded from unrelated help targets.
- One movement step assigns at most one canonical target to each active player.
  All movement goes through the MG6A/B kinematic primitive and remains court
  bounded.
- Possession resolution owns the ball: a controlled ball follows its owner;
  successful passes transfer ownership; turnover/steal and rebound outcomes set
  the next possession and owner; a made basket releases the ball for canonical
  inbound setup. A possession flip clears stale intents and grants one transition
  movement step before half court settles back to BaseSpacing.
- Live and Instant use the same match preparation and MatchEngine. With equal
  inputs, seed, and commands they produce equal sporting output. Live-only user
  commands remain part of the canonical command sequence.
- Visual Bridge copies IDs, ownership, and spatial snapshots, projects the court,
  and interpolates presentation state. The renderer does not select actions,
  assignments, canonical positions, score, or possession.

## Visual and test certification

- Manual Live visual check: **UNAVAILABLE**. The local Vite server started, but
  the computer-use environment returned no available browser surface and could
  not open the local app. Render-level and Visual Bridge tests were run instead.
- MatchEngine, seed lifecycle, Live controller, MatchViewer, visual bridge, and
  court projection focused suite: **32 files, 234 tests passed**.
- `npm run typecheck`: **passed**.
- Full repository validation is run after the final branch is merged into the
  integration worktree, once as required by MG6J.

## Known deferrals

- Zone defense and full playbook execution.
- Advanced dribble move catalog.
- General foul and foul-out systems; the existing prototype shooting foul and
  free throw path remains in place.
- Contact physics, advanced ball trajectories/physics, and human animation.
- Persistent match seed/event history and mid-match save/resume.

## Integration and cleanup record

Integration branch/SHA, `main` and `origin/main` SHAs, push result, and the
worktree cleanup inventory are recorded here after the final integration run.

```text
MG6J_BRANCH: matchengine-v3-mg6j-final-certification
MG6J_BASE: 85a4cf54f68da204daeeaa53e63f94b09e2e9bde
MG6I_SHA: 85a4cf54f68da204daeeaa53e63f94b09e2e9bde
FOCUSED_TESTS: 32 files / 234 tests passed
TYPECHECK: passed
BUILD: pending after integration
DIFF_CHECK: pending
MAIN_BEFORE: 9539eafd1613d1daace8392921a5d38541f0c176
MAIN_AFTER: pending
ORIGIN_MAIN: pending
PUSH: pending
WORKTREE_CLEANUP: pending
MG6_FINAL_CERTIFICATION: pending
```
