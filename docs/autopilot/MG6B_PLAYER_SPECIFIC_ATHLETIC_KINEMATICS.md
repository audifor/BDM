# MG6B Player-Specific Athletic Kinematics

## Canonical sources

`Player.basketball.ratings` is the Player Truth source. Its exact keys include
`SPEED`, `ACCELERATION`, and `AGILITY`; the Player factory currently validates
each rating from 1 to 100. MG6B uses those keys directly for maximum speed,
acceleration, and braking / direction changes. No composite athletic or movement
overall is created.

Height, weight, wingspan, and standing reach are not used. Primary position is
not used as a shortcut. Stamina and endurance do not affect the profile.

## Derived profile and mapping

`createMatchPlayerProfile` derives a transient `PlayerKinematicProfile` with:

- Maximum speed: `SPEED`, baseline 6 m/s, bounds 5.4–6.6 m/s.
- Acceleration: `ACCELERATION`, baseline 3 m/s², bounds 2.4–3.6 m/s².
- Braking / redirection: `AGILITY`, baseline 4 m/s², bounds 3.2–4.8 m/s².

Each rating maps linearly from the minimum bound at rating 1 to the baseline at
rating 50, then from the baseline to the maximum bound at rating 100. This keeps
the MG6A values exact for a neutral 50-rated player while keeping extreme
ratings within narrow, explicit limits.

The profile is reconstructed from Player Truth for each match profile. It is not
persisted and is not copied into `SpatialState`, which continues to hold only
canonical position and velocity. The same profile applies on offense and defense,
with or without the ball. Substitutions retain zero incoming velocity and use the
incoming player's own profile on the next movement step.

## Movement and boundaries

The existing MG6A movement primitive consumes the individual profile for maximum
speed, acceleration, braking-distance calculation, and braking while redirecting
against current velocity. BaseSpacing and TransitionSpatial continue to select
targets. Live and Instant Result share the same MatchEngine path. No RNG is used;
the renderer sees only canonical spatial snapshots and remains outside gameplay
authority.

Fatigue speed degradation, stamina, dribble penalties, physical-dimension
modifiers, collisions, pathfinding, screens, cuts, pick-and-roll actions,
defensive slides, and animations remain deferred.

## Validation

- `npm test -- --run src/engine/match/PlayerKinematics.test.ts src/engine/match/MatchSession.test.ts`: 33 tests passed.
- `npm run typecheck`: passed.
- Full test suite and build: skipped per MG6B test policy.
- Visual check: no browser or app window was available.
