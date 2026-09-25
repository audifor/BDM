# MG7E Cuts + Off-Ball Offensive Logic

## Previous off-ball state

MG7A already defined `CUT_FREQUENCY`, the transient `offBallCut` intent, two existing cut targets, and MG6 target-override movement. MatchEngine only selected that intent as a primary `CUT`; it did not make cuts coexist with a primary P&R, isolation, or post-up action, and selection did not check whether a cut was spatially available.

## Primary and secondary authority

The possession still has one `OffensiveAction`. `CUT` remains valid as a primary action when selected during ordinary offense. A cut selected alongside `PICK_AND_ROLL`, `ISOLATION`, or `POST_UP` is a secondary transient `offBallCut`; it does not replace the primary action or create another possession. The existing runtime intent stores the cutter and target; no persistent fields or event types were added.

Secondary selection excludes every participant in the primary action. The ball handler and P&R screener therefore cannot receive a contradictory cut. A post initiator and any other declared participant are excluded the same way.

## Candidate and opportunity rules

The selector builds spatially viable candidates before reading cut propensity. A candidate must be in the active attacking lineup, have a profile and spatial position on the attacking team, not be the current handler or ball owner, and have an assigned spatial defender. The existing MG7A target must be inside the court and advance toward the basket by at least 0.75 metres. The target must have 1.25 metres of defender clearance and the path must have 0.75 metres of clearance from defenders.

Only after those checks does the selector use `CUT_FREQUENCY` and the canonical decision RNG. It selects at most one new cut per decision step. No ratings, overall, defensive switching, help decision, or new tendency was added.

## Movement, action preservation, and lifecycle

The selected player uses the existing MG7A target and MG6 movement. The existing precedence remains: transition movement, drive, screen or post-screen, cut, then BaseSpacing. A specialized target only overrides BaseSpacing for its player; other players retain ordinary spacing.

The primary action remains in `offensiveAction` while its existing runtime intent remains valid. A completed P&R keeps its action while the screen intent continues, even if the cutter reaches the target. ISO and POST_UP remain the active primary action during their current resolution step. CUT does not directly transfer the ball.

The existing cut lifecycle clears an intent on arrival or bounded timeout, handler change, invalid lineup/spatial player, possession change, transition, or substitution. No cut events, stats, or renderer behavior were added.

## Receiver and pass integration

When a cutter reaches its target during a step, it becomes the preferred receiver for a generic pass attempt. An explicit P&R pass to the roller/popper keeps its existing target priority. The ball handler still decides whether to pass, and the existing pass lane, completion, turnover, event, and ball-control logic remains authoritative. A completed pass to the cutter ends the cut intent through the existing ball-owner check. No catch-and-finish engine was added.

## Determinism and shared engine

Cut decisions use the injected decision RNG and stable active-lineup order. Live and Instant both use the shared MatchEngine. PlayerTruth, tactics, movement physics, shot resolution, event streams, stats, and visualization are unchanged.

## Limitations

- Only the existing generic rim-cut and space-cut target types are used.
- Opportunity checks are simple court, target-space, and path-space bounds; there is no advanced backdoor, help-read, or defensive reaction model.
- No off-ball relocation, screening actions, post splits, cut analytics, team cut frequency, or playcalling was added.
- The existing model does not add a catch-and-finish action after a cutter receives the ball.

## Validation

- `npx vitest run src/engine/match/OffBallMovement.test.ts src/engine/match/MatchSession.test.ts -t "selects only an active off-ball player|rejects a cut when defenders|selects a valid off-ball cutter|keeps P&R primary|leaves BaseSpacing in control|canonical isolation action|valid post-up back-down"` — 7 passed, 44 skipped.
- `npm run typecheck` — passed.
- Build and broader suites skipped per MG7E scope.

**MG7E result: PASS.**
