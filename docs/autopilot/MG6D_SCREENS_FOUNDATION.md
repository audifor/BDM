# MG6D — Screens Foundation

`MatchSessionState.screenIntent` stores one transient on-ball screen action; it
is not persisted. The handler is the actual `SpatialState` ball controller. The
screen's defender is taken from the existing deterministic matchup assignment,
including any configured matchup override.

## Eligibility and precedence

The screener is selected from the active offensive lineup, excluding the current
handler and cutter. MG6C's cut and MG6D's screen cannot be active together: an
existing cut continues first, while a screen prevents a new cut from starting.
The canonical `ON_BALL_SCREENING_FREQUENCY` tendency gates the screen chance and
weights the eligible screener selection. When no action is active, a failed screen
selection may fall through to MG6C's cut selection.

## Target and lifecycle

The target derives from the handler's position, the assigned defender, the
attacking basket, and court geometry. It lies 0.9 m along the handler's
basketward route and 0.8 m toward the defender's side of that route, clamped to
court bounds with a 0.6 m margin. The screener approaches with their own MG6B
kinematics. At 0.45 m or closer the intent becomes `set`. Approach expires after
two movement steps; a set screen lasts two further movement steps. While set,
the screener holds their current point and brakes with the ordinary movement
primitive.

## Spatial effect

Only the assigned defender can be affected. Before each movement step, the
engine checks the segment from the defender's current position to their existing
BaseSpacing target. If that route comes within 1.25 m of the set screener,
maximum speed and acceleration for that movement step are multiplied by 0.65.
Braking is unchanged. Outside that zone, the defender receives no penalty. This
is a bounded spatial delay, not a collision or pathfinding system. Screen geometry
and its effect consume no RNG.

The `decisionRandom` stream handles screen selection: one tendency chance draw
and, on a successful chance, one weighted screener draw. If the screen chance
fails, MG6C's cut fallback can consume its own chance draw and, if it succeeds,
one weighted cutter draw. No new RNG stream is added.

Possession flips, a changed ball handler, or substitution of the screener,
handler, or assigned defender cancels the intent. Live and Instant Result share
MatchEngine; the renderer only displays the resulting player snapshots.

## Boundaries and validation

No screen success roll, automatic drive or pass, roll, pop, P&R decision, coverage,
switch, hedge, blitz, collision, physical contact, strength/weight modifier,
pathfinding, tactical UI, or special animation is included. Player `SCREENING`
and `SCREEN_USAGE` ratings, `SCREEN_NAVIGATION_DEFENSE`, and
`OFF_BALL_SCREEN_USAGE` are not consumed.

- `npm test -- --run src/engine/match/ScreenInteractions.test.ts`: 3 focused tests
- `npm run typecheck`: see milestone result
- Full test suite and build were skipped by milestone scope.
