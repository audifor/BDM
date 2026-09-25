# MG7D Post-Up Offensive Logic

## Previous state and authority

`POST_UP` existed in `OffensiveActionKind` but did not affect MatchEngine behavior. MG7D keeps it as the canonical possession action. A valid post player must be the attacking team's current spatial ball owner, active in the lineup, near the attacking basket, and have the current assigned defender present. Invalid post context clears the action and lets ordinary possession behavior proceed.

## Spatial context and back-down

Post context uses the existing player and basket positions; the simple validity bound is 6.5 metres from the attacking basket. Back-down is available when the assigned defender is spatially close and the player can advance without crossing the minimum rim distance. The small MG6 movement support creates a bounded target toward the basket; `stepPlayersTowardBaseSpacing` applies it and keeps the other four attackers on their normal spacing behavior.

Back-down choice uses `POST_UP_FREQUENCY`, defender distance, and the post player's relative `weightKg`. The physical comparison only changes option preference; it does not determine success. No post overall, new rating, or mismatch system was added.

## Continuations and resolution

Post shot uses the existing shot-location, contest, and shot-resolution path at the player's actual spatial position. The current shot model does not distinguish hooks, fades, or post-specific finishing; `POST_FINISHING` is not wired into a separate execution path.

Pass out is available only with an active teammate present in SpatialState and remaining pass capacity. The existing teammate selection, lane evaluation, accuracy, and turnover resolution are reused. No post-specific pass hierarchy was added. If no weighted continuation is available, or the action becomes invalid, reset clears the action and ordinary possession resolution continues.

## Truth, RNG, and lifecycle

The canonical tendencies used are `POST_UP_FREQUENCY`, `RIM_ATTEMPT_FREQUENCY` / `SHOT_FREQUENCY`, and `ADVANTAGE_PASS_FREQUENCY`; no tendency was added. Relative player weight is the only additional physical context used; it comes from existing MatchPlayerProfile bio data. Shot and pass execution continue to use existing PlayerTruth-backed profiles and resolution. All choices use the canonical decision RNG. Live and Instant share MatchEngine.

Post-up ends when its shot or pass resolves, possession changes, the initiator loses the ball, a substitution removes the participant, the post position becomes invalid, or reset occurs. MG7D does not add post-up persistence or a new event stream.

## Limits

- Macro selection of `POST_UP` and post entry passes remain out of scope.
- No specific low block, elbow, or short-corner zones are modeled.
- Back-down is a short straight-line displacement; contact resistance, seals, and post defense reads are not modeled.
- There is no dedicated back-down or post-shot tendency; the closest existing tendencies are reused.
- Post-specific shot types, post doubles, kick-out hierarchy, and post analytics are deferred.

## Validation

- `npx vitest run src/engine/match/MatchSession.test.ts -t "valid post-up back-down|post shot into existing|post pass-out|invalid court location|canonical isolation action|selected handler drive activate MG6 drive movement"` — 6 passed, 39 skipped.
- Full suites, build, Rust, and global typecheck were skipped per MG7D scope; no shared TypeScript contract changed.

**MG7D result: PASS.**
