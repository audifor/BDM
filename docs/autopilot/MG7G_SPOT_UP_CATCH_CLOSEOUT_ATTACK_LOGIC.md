# MG7G Spot-Up, Catch, and Closeout Attack Logic

## Authority and receiver state

Before MG7G, a completed pass changed `SpatialState.ball` to the selected receiver, but the next possession step used only ordinary possession behavior. `SPOT_UP` existed in the offensive action taxonomy without a continuation reader.

`SPOT_UP` is now a validated primary `OffensiveAction` for the current owner when its participants are active teammates present in `SpatialState`, the owner controls the ball inside the court, and the owner is outside the rim shot zone. A catch is separate transient `catchContext` metadata set only after a completed pass. The current canonical ball owner remains the receiver authority; stale markers cannot redirect the read.

The catch marker is consumed by the next action step and is cleared on turnovers, shots, period changes, and substitution of the receiver. Catches during transition are left to transition behavior. A cut receiver uses the same location based shot read; a catch near the rim cannot qualify for a perimeter closeout drive.

## Continuations and execution

The receiver read builds valid options from the current shot location, defender distance, closeout geometry, drive opportunity, tendencies, available teammates, and deterministic decision RNG. It can select `SHOT`, `DRIVE`, `PASS`, or `RESET`.

- Catch and shoot uses existing shot selection and shot resolution. Selection includes `CATCH_AND_SHOOT_FREQUENCY` plus the shot zone tendencies, including deep three.
- Closeout drive requires a defender within 4m who is moving toward the receiver faster than 0.25m/s, sufficient room from the rim, and positive shared `driveOpportunity`. It creates the existing `DriveIntent`, then uses MG6 movement and existing help and resolution paths.
- PASS requires an active teammate in spatial state. It routes through the existing receiver selection, passing lane, pass accuracy, and turnover resolution. The specialized receiver continuation can make a generic follow-up pass available after the initial catch pass; no separate passing system is added.
- RESET clears catch authority and resumes ordinary possession behavior.

Shot and drive tendencies influence selection only. Existing ratings and resolution systems determine execution. No PlayerTruth, tendencies, tactical fields, event types, statistics, or renderer behavior were added.

## Precedence and limits

Valid P&R and handoff continuations take precedence over generic catch reads. A completed pass ends the prior primary action when the receiver becomes owner. Isolation and post-up pass-outs therefore hand control to the receiver read. A cutter may receive and shoot from the current shot location, but is not required to become a perimeter spot-up.

The defender comes from the current defensive assignment used by MatchEngine. While a screen is active, existing coverage assignments remain authoritative. As previously documented in MG7C, switched assignments are not persisted after screen coverage ends; a later catch uses the current base assignment. MG7G does not add defensive closeout intelligence or persist matchups.

All continuation choices use the injected decision RNG. Live and Instant execution share MatchEngine. The only added runtime state is the one-step catch marker.

## Tests and result

Focused tests cover catch-to-shot, closeout drive through `DriveIntent` and MG6, catch-to-pass, reset, explicit `SPOT_UP`, and handoff precedence.

- `vitest run src/engine/match/MatchSession.test.ts -t 'catch|SPOT_UP|closeout|handoff receiver as a generic catch'` — 7 passed, 54 skipped.
- `npm run typecheck` — passed.
- Build, full suite, and Rust checks — skipped per MG7G scope.

**MG7G result: PASS.**
