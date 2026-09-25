# PRE-MG8B Playback & Movement Time-Scale Audit

Branch: `matchengine-v3-pre-mg8b-playback-timescale`
Base: `matchengine-v3-mg8a-defensive-authority-foundation` @ `715efd33316e9727de17210ec08e97f522ac90b3`

## Reported symptom

At 1x playback the match looked clearly too slow, at 2x still slow, and only at 4x did it look
roughly like natural basketball speed.

## Root cause classification

`PRESENTATION_TIME_SCALE_BUG`. The simulation and spatial-movement layers are correct and were
not changed. The bug was that "1x" was wired to real time (1 wall-clock second per game-clock
second), which is accurate but far too slow to watch: a 40-minute match (2,400 game-seconds)
took a full 2,400 real seconds (40 real minutes) at 1x. 2x and 4x were exact fractions of that
same too-slow baseline, so 4x only "looked about right" because it happened to land near a
normal watchable match length by accident of the /4 division, not because the speed semantics
were correct.

## Simulation time (unchanged, verified correct)

- `MatchEngine.ts` clock rules: `periodSeconds: 600` (4 × 10 min = 2,400 game-seconds total).
- Each `stepMatchSession` call charges `actionDurationSeconds` of match clock: a full
  pace-adjusted possession interval (6-30s, via `applyPaceToPossessionDuration`) on the first
  action step of a possession, then `ceil(interval / 6)` (1-5s) on subsequent steps in the same
  possession (`MatchEngine.ts:553-563`). This possession-pacing model was already audited and
  certified correct by PRE-MG8 (`PRE_MG8_MATCH_PACE_AND_CERTIFICATION_PERFORMANCE.md`; average
  possession ~22.9s post-fix).
- Player displacement (`SpatialState.ts` `advancePlayerTowardTarget`, trapezoidal integration
  `displacement = avg(velocity) * deltaTimeSeconds`) receives `actionDurationSeconds` directly as
  `deltaTimeSeconds`, in real match-clock seconds, applied exactly once. No scaling artifact
  found in this layer.
- Not modified in this milestone.

## Presentation time (root cause, fixed)

- `MatchPresentationSegment.createPresentationSegment` converts one resolved engine step into a
  `gameSeconds` value (the same match-clock delta from the simulation layer) — unchanged.
- `presentationDurationMs(gameSeconds, speed)` converts that into a wall-clock animation
  duration. Previously: `gameSeconds * 1000 / speed`, i.e. speed=1 meant real time.
- The RAF playback loops in `MatchViewerScreen.tsx` and `NgMatchViewer.tsx` use this duration to
  drive `interpolateVisualMatchSnapshot` progress — this is the only interpolation actually
  driving visible motion in live segment playback (`snapshotInterpolated` is always true there).
- A second, independent tween system (`CourtAnimationState.interpolationDurationMs`, used by
  `CourtDynamicRenderer.syncFrame`) exists but is bypassed whenever `snapshotInterpolated` is
  true, which is always the case in the live-match RAF path described above. No double
  application of the speed divisor was found on the active playback path. This second system is
  unchanged and out of scope (it only matters for a token/replay fallback path, not reported as
  slow here).

## 1x / 2x / 4x / 8x semantics after fix

Introduced `PRESENTATION_BASE_COMPRESSION = 4` in `MatchPresentationSegment.ts`:

```ts
presentationDurationMs(gameSeconds, speed) = gameSeconds * 1000 / (speed * PRESENTATION_BASE_COMPRESSION)
```

At the confirmed target baseline, 1x now compresses match time 4x relative to real time: a full
40-minute (2,400 game-second) match plays in 600 real seconds (10 real minutes) at 1x, 5 minutes
at 2x, 2.5 minutes at 4x, 1.25 minutes at 8x. This is a pure constant-factor change to the
presentation layer; the ratios between speeds are exactly preserved (2x is still exactly half of
1x wall time, 4x exactly a quarter, 8x exactly an eighth) — verified in
`MatchPresentationSegment.test.ts`.

The `PRESENTATION_BASE_COMPRESSION` value (4x real time as the 1x baseline) was a product
calibration decision explicitly confirmed by the user for this milestone, since the base rate is
not otherwise specified anywhere in the repository.

## Units audited

- Match clock / `actionDurationSeconds` / `gameSeconds`: seconds (match-clock).
- Player speed/acceleration/braking (`MatchPlayerProfile.ts`): meters, m/s, m/s².
- `presentationDurationMs`: milliseconds (wall-clock), derived from `gameSeconds`.
- No unit mismatches (seconds vs ms, missing ×1000, etc.) found; the only defect was the
  calibration constant on the seconds→ms conversion, not a unit error.

## MG6 speed / acceleration changed

NO. No file under the simulation/spatial layer was touched. `git status --short` for this
worktree shows only `src/ui/match/MatchPresentationSegment.ts` and its test modified.

## MatchEngine clock changed

NO. `MatchEngine.ts` was not touched.

## Presentation timing changed

YES. `presentationDurationMs` in `MatchPresentationSegment.ts` now divides by
`speed * PRESENTATION_BASE_COMPRESSION` instead of `speed` alone. This only affects how long the
viewer waits to see a given segment; it does not change `gameSeconds`, event order, event
content, or the underlying `MatchSimulation`.

## Playback rate logic changed

NO structural change beyond the constant above. `PLAYBACK_SPEEDS = [1, 2, 4, 8]` in
`matchViewerStore.ts` is unchanged; the multiplier semantics (speed divides presentation
duration) are unchanged, only the base reference point they divide from.

## Sporting results changed

NO. No RNG draw, event, possession outcome, score, turnover, or shot-selection logic was
touched. Only wall-clock rendering duration changes.

## Files changed

- `src/ui/match/MatchPresentationSegment.ts` — added `PRESENTATION_BASE_COMPRESSION` constant,
  applied it in `presentationDurationMs`.
- `src/ui/match/MatchPresentationSegment.test.ts` — updated expected millisecond values for the
  new base rate; added explicit proportionality assertions (2x/4x/8x are exact fractions of 1x).

## Test impact level

T1 (per `Get-MGTestPlan.ps1 -Since 715efd33316e9727de17210ec08e97f522ac90b3`).

## Tests executed

- `npx vitest run src/ui/match/MatchPresentationSegment.test.ts` — 3/3 pass.
- `npx vitest run src/engine/match/MatchSession.test.ts src/ui/match/MatchPresentationSegment.test.ts src/ui/match/SpatialVisualBridge.test.ts` (test-impact-tool recommended plan) — 3 files, 73/73 tests pass.

## Tests consciously skipped

- Full MatchEngine suite / full project suite: not run; only presentation-layer files changed,
  no simulation contract touched, test-impact tool classified this as T1 and named the exact
  files needed.
- Controlled-distance kinematics test (task §12): not added. No simulation/movement file was
  modified in this milestone (`git status --short` confirms), so there is nothing new to
  demonstrate about movement-per-match-second; that invariant was already covered and is
  unaffected.
- Typecheck: skipped — no type/contract changes; `presentationDurationMs`'s signature
  (`(gameSeconds: number, speed: number) => number`) is unchanged, only its internal constant.
- Build: skipped — no bundling/config concern in scope.
- Rust: skipped — no Rust code touched.

## Result

Reclassified and fixed as a presentation-layer calibration bug. The simulation and spatial
movement models were confirmed correct (and already certified by PRE-MG8) and were not changed.
`presentationDurationMs` now uses `PRESENTATION_BASE_COMPRESSION = 4` so that 1x plays a 40-minute
match in 10 real minutes instead of 40; 2x/4x/8x remain exact linear fractions of that new 1x
baseline. No sporting result, RNG sequence, event, or spatial-simulation output was altered.

## Known remaining visual limitations

- Movement smoothness/interpolation easing polish is explicitly deferred to MG13 per the task
  scope; this milestone only corrects the time-scale calibration, not animation quality.
- The secondary `CourtAnimationState`/`CourtDynamicRenderer` tween path (used only when
  `snapshotInterpolated` is false, i.e. non-live-segment rendering) still uses its own fixed
  220-280ms baselines independent of `PRESENTATION_BASE_COMPRESSION`; it was not in the reported
  symptom's active code path and was left untouched, per scope.
