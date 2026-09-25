# MG7B Pick & Roll Offensive Logic

## Previous behavior and lifecycle

MG7A made `OffensiveAction.kind === 'PICK_AND_ROLL'` gate the existing screen intent. Screen and roll/pop geometry already belonged to MG6, while `createPostScreenIntent` still chose roll or pop inside the movement module. The possession pipeline resolved a generic drive, pass, shot, or turnover without a P&R handler read.

MG7B keeps the canonical action and its runtime handler/screener participants. The existing phases cover approach, set, and post-screen continuation. A set screen is used when its geometry crosses the assigned defender's route; otherwise it is rejected and the action returns to normal offense. A completed handler continuation, participant invalidation, possession change, or period boundary clears the existing action context.

## Offensive decisions

The P&R decision module owns choice while `ScreenInteractions` owns geometry. The screener's `PICK_AND_ROLL_ROLL_FREQUENCY` and `PICK_AND_POP_FREQUENCY` select roll or pop; MG6 continues to generate targets and move the screener.

After a usable screen, the handler can select an available drive, shot, pass to the roller/popper, or reset. Options are filtered for active participants and the existing one-pass-per-possession limit before preference is considered. A selected screener pass sets the canonical participant as the pass target and uses existing lane evaluation, pass accuracy, and turnover outcomes. A handler shot uses existing shot-location and shot-make resolution. A selected drive reuses the existing `DriveIntent` and MG6 movement.

## Coverage, truth, and determinism

The handler read consumes the current MG6 coverage. A blitz removes the handler-drive option; pass and shot choices remain subject to participant availability and existing resolution. MG7B does not choose defensive coverage.

Choices use existing tendencies: on-ball screening, roll, pop, drive, pull-up, and advantage passing. No tendency or rating was added. PlayerTruth remains unchanged; ratings continue to affect execution in existing movement, passing, and shot resolution. All probabilistic selection uses the canonical decision RNG.

Live and Instant continue to share `stepMatchSession`. Event types, statistics, and renderer behavior are unchanged.

## Remaining limitations

- Screen rejection currently uses only set-screen route geometry.
- Handler continuation covers drive, shot, roller/popper pass, and reset; kick-outs and broader sequencing are deferred.
- Coverage is a coarse read: blitz currently removes the drive option, while existing coverage geometry and passing lanes continue to resolve execution.
- P&R progression remains bounded by the MatchEngine's existing one-action-per-step and one-pass-per-possession behavior.
- No playcalling, detailed reads, balance tuning, or P&R analytics are included.

## Validation

- `npx vitest run src/engine/match/ScreenInteractions.test.ts` — 8 passed.
- `npx vitest run src/engine/match/MatchSession.test.ts -t "produces the same complete simulation through stepping as through the wrapper|clears screen, coverage, drive, cut, and help together|continues a completed pass with the receiver holding the ball|P&R pass|handler drive|pick-and-roll action"` — 6 passed.
- `npm run typecheck` — passed.
- Build and unrelated regression suites were skipped per MG7B validation policy.

**MG7B result: PASS.**
