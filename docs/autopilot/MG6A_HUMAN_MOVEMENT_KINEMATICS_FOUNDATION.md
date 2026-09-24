# MG6A Human Movement & Kinematics Foundation

## Movement model

MG5 moved each player a fixed maximum of two metres toward a target for every
possession action. `SpatialState` now carries canonical position in metres and
velocity in metres per second. Acceleration is derived during a step and is not
stored.

## Time and motion limits

The time authority is the existing possession duration after tactical pace
adjustment, in match-clock seconds. The same duration is passed to BaseSpacing
and TransitionSpatial movement. The generic limits are 6 m/s maximum speed,
3 m/s² acceleration and 4 m/s² deceleration. These are provisional movement
constants and do not depend on ratings or physical attributes.

The movement primitive changes velocity by a bounded vector delta, reduces the
desired speed based on remaining stopping distance, and snaps safely to a target
if a step would pass it. Court bounds remain enforced. The operation is pure and
deterministic and consumes no RNG.

## Targets and integration

BaseSpacing continues to determine regular possession targets. TransitionSpatial
continues to determine targets after a possession flip. Both use the same
kinematics primitive. A controlled ball follows its holder after movement.
Substitutions keep the outgoing player's position and initialize incoming
velocity to zero. MatchEngine remains the shared core for Live and Instant
Result; the visual bridge consumes its canonical snapshots without movement
authority or write-back.

## Validation

- `npm test -- --run src/engine/match/MatchSession.test.ts`: 30 tests passed.
- `npm run typecheck`: passed.
- Full test suite and build: skipped per MG6A test policy.
- Visual Live-match smoke check: unavailable; no browser or app window was
  available in the current computer-use session.

No stamina, ratings-based speed, body physics, collisions, pathfinding, screens,
cuts, dribbling movement, defensive slides, or animation were added.
