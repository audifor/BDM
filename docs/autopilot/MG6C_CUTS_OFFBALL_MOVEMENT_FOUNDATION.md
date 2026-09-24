# MG6C — Cuts and Off-Ball Movement Foundation

`MatchSessionState.offBallCut` holds at most one transient cut intent. It is not
part of `GameWorld` or save data. The cutter comes from the current offensive
lineup and cannot be the ball handler; bench players and defenders are excluded.

## Selection and targets

The canonical `CUT_FREQUENCY` tendency supplies the chance to start a cut and
weights selection among eligible teammates. The existing `decisionRandom` stream
consumes one chance draw for propensity, then one weighted draw when a cut starts.
No new random stream is created.

The target is derived from the attacking basket and court geometry. A player
farther than 20% of court length from the basket receives a rim-cut target 1.5 m
inside the court and offset 1 m laterally from the basket. A closer player gets a
space-cut target 4.5 m from the basket at the opposite court-side margin.

## Movement and lifecycle

The active cut target overrides BaseSpacing for its cutter only. MG6A's canonical
movement primitive advances the player using the same elapsed possession time;
MG6B's `PlayerKinematicProfile` supplies their speed, acceleration and braking.
Arrival within 0.35 m completes the cut. A cut also expires after at most three
movement steps. BaseSpacing then regains target authority on the next movement
step, and kinematics return the player without teleportation.

An intent is cancelled if possession changes, the cutter becomes the ball handler,
or a substitution removes the cutter. The transition movement after a possession
flip therefore has authority. Live and Instant Result continue through the same
MatchEngine path.

## Boundaries

Cuts do not cause automatic passes or shots, and active cutters do not receive
special priority in pass selection. Defender reactions, help defense, screens,
pick-and-roll, handoffs, collisions, pathfinding, playbook execution, ball physics
and special animations are not implemented. The renderer only consumes the
resulting spatial snapshots.

## Validation

- `npm test -- --run src/engine/match/OffBallMovement.test.ts`: 2 focused tests
- `npm run typecheck`: see milestone result
- Full test suite and build were skipped by milestone scope.
