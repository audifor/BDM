# MG4F · Player Tendencies Authority

## Previous state and profile transport

The canonical player model already holds 40 enumerable tendency truth keys. `MatchPlayerProfile` previously omitted them, so no MatchEngine decision consumed canonical tendencies. The former 21-key lowercase shape remains a non-enumerable compatibility projection.

`MatchPlayerProfile.tendencies` now uses the existing `PlayerTendencies` type and receives `player.basketball.tendencies` directly. The complete canonical data reaches the engine without a reduced intermediate mapping. Live and instant matches share this construction through `prepareMatchOptions()`.

## Decision authority

The existing shot-zone selector consumes three directly matching tendencies in `calculateShotZoneWeights`:

- `RIM_ATTEMPT_FREQUENCY` modifies rim candidate weight.
- `MIDRANGE_FREQUENCY` modifies midrange candidate weight.
- `THREE_POINT_FREQUENCY` modifies three-point candidate weight.

Each tendency applies the deterministic factor `0.5 + value / 100` using the canonical 1–100 scale. This changes selection propensity while keeping every existing candidate available. Existing ratings-based natural weights are preserved, and team `shotProfile` tactics continue to scale candidate weights afterward. `calculateShotMakeProbability` is unchanged: tendencies do not affect execution; ratings, defense, tactics and fatigue remain its inputs.

## Available but unwired

The remaining 37 canonical tendencies are carried in the profile but have no consumer in this milestone. They include global shot frequency and shot subtypes/context (deep threes, pullups, catch-and-shoot, contested shots, transition attacks); drives, finishes, post/isolation, screens, cuts and relocation; passing style; transition and offensive rebounding; and defensive pressure, gambling, help/rotation, contests, fouls, switching, physicality and pace. The current engine has no sufficiently direct candidate actions for these to affect without adding or reinterpreting mechanics.

## Authority, determinism and verification

Existing ratings-based candidate weights and ratings-driven execution remain unchanged; tendencies are added only as candidate selection modifiers and do not change execution quality. Team tactics retain their contextual authority by scaling those weights after player tendencies. No new random source or draw was added: weighted selection continues to use the session's existing decision RNG. Live and instant use the same MatchEngine path.

Focused tests verify complete profile transport, changed three-point candidate weight with identical ratings, and unchanged shot make probability. No traits, physical/spatial systems, actions, event persistence, replay, UI, or balance tuning were added.
