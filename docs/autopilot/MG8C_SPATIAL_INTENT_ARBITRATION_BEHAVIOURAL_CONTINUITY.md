# MG8C · Spatial Intent Arbitration and Behavioural Continuity

## Observed problem and root cause

The source audit classifies the issue as **MIXED**, with confirmed target/authority conflict and an underspecified transition lifecycle. Movement systems calculated plausible individual targets, but MatchEngine assembled anonymous `{ playerId, position }` overrides and `stepPlayersTowardBaseSpacing` wrote them into a map in order. If several systems named the same player, the last array entry silently owned movement. The selected source, rejected targets, and continuity were not represented.

Transition movement took a second path: it bypassed those overrides and moved every player for that step. The persisted `transitionIntent` was reconstructed only when possession flipped, so its scope was implicit and short-lived. These are concrete architectural conflicts; the baseline had no authority trace or per-possession churn metric, so no numerical baseline rate is claimed.

## Previous movement ownership map

| System | File | Claim point and target writer | Release condition |
| --- | --- | --- | --- |
| Base offense/defense spacing | `BaseSpacing.ts` | Role-based target for each active player; `MatchEngine` added overrides before the final MG6 step | Always present as the fallback target |
| Transition | `TransitionSpatial.ts` | Derived targets for all ten players; `MatchEngine` bypassed the override list while transition was active | `transitionIntent` was only rebuilt on possession flip and not otherwise retained |
| Drive | `DribbleDrives.ts` | Handler target appended by `MatchEngine` | Drive validity/handler/defender checks and `advanceDriveIntent` |
| Screen approach/set/post-screen | `ScreenInteractions.ts` | Screener target appended by `MatchEngine`; set phase held the screener at current location | Screen phase progression, participant validity, and action checks |
| Cut | `OffBallMovement.ts` | Cutter target appended by `MatchEngine` | Cut update, target reached, participant/action/possession validity |
| Handoff approach | `HandoffOffense.ts` | Giver and receiver targets appended by `MatchEngine` | Transfer or handoff continuation ends |
| Post-up | `PostUpMovement.ts` | Back-down target appended by `MatchEngine` | Post-up continuation ends or target returns to current position |
| On-ball containment | `OnBallDefense.ts` | Effective defender target appended by `MatchEngine` | Ball owner/effective defender invalid, or a stronger defensive responsibility claims it |
| Screen coverage | `DefensiveCoverages.ts` | Coverage defender targets appended by `MatchEngine` | Coverage phase or screen/participant validity ends |
| Help/recovery reaction | `DefensiveReactions.ts` | Reaction target appended by `MatchEngine` | Threat lifecycle and helper/rotation recovery checks |
| Locomotion execution | `SpatialState.ts` | `advancePlayerTowardTarget` applies MG6 acceleration, speed, braking, and bounds | One resolved target per step |

No audited gameplay system directly wrote final player position or velocity. The movement boundary remains MG6.

## New intent contract and arbiter

`MovementIntentProposal` carries a stable key, player, source, target, and semantic priority. MatchEngine creates one proposal per active player from all currently valid movement responsibilities and one `baseSpacing` fallback. `arbitrateMovementIntentSet` resolves independently per player, deterministically, without RNG. Stable lexical keys break otherwise equal proposal ordering.

The active intent is retained only while its key remains among the current valid proposals. A same-key proposal may update its target without restarting the intent. A strictly stronger valid semantic proposal interrupts it. Equal-priority competition retains the current valid intent. If the old intent is no longer proposed, the next valid proposal starts; a base-spacing proposal cannot keep an invalid action alive.

Priorities make observed precedence explicit: transition > screen coverage > drive > post-up/help reaction > screen > handoff/on-ball containment > cut > base spacing. Offense and defense proposals target different teams in a possession. Existing basketball systems still decide whether actions, drives, coverage, or reactions are valid; the arbiter only chooses among those valid proposals.

The resolved target list goes through `stepPlayersTowardBaseSpacing` into MG6 for all ten players. Transition no longer bypasses arbitration. MG6 kinematics, MG7 `OffensiveAction`, MG8A `DefensiveAuthority`, MG8B containment calculations, `SpatialState.ball`, and seeded RNG streams are unchanged.

## Lifecycle and interruption

The active map is transient `MatchSessionState`; it is not copied into `GameWorld` or saves. `startedAtStep` is keyed from the match event sequence. Set `debugMovementTrace` on `SimulateMatchOptions` to retain the latest `movementIntentTrace`; it reports the active proposal, target, start step, lifecycle (`START`, `ACTIVE`, `INTERRUPTED`, `COMPLETE`), why it remains active or ended, and rejected proposals with continuity/priority reasons. Trace retention is off by default and it writes no console logs.

- Possession flips clear every active locomotor intent before the next possession.
- A changed ball owner changes the on-ball containment key, invalidating responsibility for the old handler while allowing the current effective defender to propose against the new handler.
- Substitutions clear the transient intent and trace maps so no removed participant remains referenced.
- Period completion and match completion clear active intents.
- Transition is proposed for the existing transition movement step only; the following step returns to other valid semantic proposals or base spacing. No new timeout or gameplay cooldown was added.
- Screen phases share one screener key so approach, set, and post-screen target updates retain locomotor continuity while the current screen lifecycle remains valid.
- Drive remains the handler authority while the existing `DriveIntent` remains valid.
- Coverage outranks generic on-ball containment; on-ball containment target updates preserve the same key for the same defender/handler pair.
- Base spacing is a true fallback with priority zero.

## Diagnostics

`movementIntentMetrics` is a test/debug helper; call it with frames from one possession to calculate intent switches, source-authority switches, A-B-A reversals, and target jumps. A target jump counts even if the semantic intent key remains unchanged. The diagnostic large-jump cutoff is `LARGE_MOVEMENT_TARGET_JUMP_METERS = 5`; it is not a gameplay rule or a maximum-good-basketball threshold. No values are persisted.

## Before/after evidence

Before: the code audit found at least three ways an individual player could receive competing targets in one step (multiple anonymous overrides, transition bypass, and a fallback target), with last-writer order deciding among overrides. There was no source trace and therefore no valid baseline churn count.

After: the multi-step MatchSession test records the active authority for all ten players during one possession, verifies a single keyed authority per player, checks the latest per-step trace, and verifies possession-flip invalidation. Focused arbiter tests cover fallback continuity for cut/drive/screen, same-intent target updates, coverage over containment, ball-owner change, deterministic resolution, interruption, and the diagnostic oscillation/jump calculations. The deterministic end-to-end fixture now resolves to home 34–away 43 over 209 events (previous baseline: home 26–away 50 over 216 events); the wrapper and stepped execution remain identical. These outcome changes follow changed player locations and are recorded as a spatial-simulation regression update, not as a new scoring rule.

## Validation and limitations

- Focused test impact plan: `Get-MGTestPlan.ps1 -Since 617712dee5e48363320d5ec47ed9d3e1ef14525d` (T2; ten suites, typecheck required).
- Typecheck: pass.
- Focused test plan: 10/10 suites and 145/145 tests pass; `npm run typecheck` passes.
- Full suite/build/Rust: skipped as requested for MG8C.
- Visual validation: pending. The Tauri dev command built and launched, but the available computer-use surface exposed no apps or browsers for screenshot inspection. Technical checks do not certify that the ten-player movement reads clearly in the MatchViewer.
- Known limitation: MG8C keeps existing transition timing and existing defensive help/recovery decisions. It does not add help defense, rotations, closeouts, or new basketball rules.
