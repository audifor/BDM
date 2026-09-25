# MG7C Isolation and Drive Decision Logic

## Previous state and action semantics

`ISOLATION` existed in the `OffensiveAction` taxonomy but did not affect MatchEngine behavior. `DRIVE` also exists in that taxonomy, but current runtime consumers use `DriveIntent` for movement; no possession branch relies on `OffensiveAction.kind === 'DRIVE'`. MG7C retains that taxonomy value for compatibility and treats drive as an execution continuation that may be selected by isolation or P&R.

## Isolation authority and lifecycle

An active isolation requires the canonical action's team and initiator to match the current attacking team and spatial ball owner. Its participants must remain in the active lineup. MG7C does not select isolation as a macro action; callers/tests can provide the canonical action while playcalling remains out of scope. Teammates continue through existing BaseSpacing behavior.

The handler's current defender comes from the MatchEngine's effective assignment for the step: current defensive matchup overrides, or active coverage assignments where that runtime provides them. MG7C observes the defender and spatial positions; it does not assign or move defenders.

## Continuations and shared execution

The isolation read filters for active, spatially present actors and available teammates before weighting choices. It can select drive, shot, pass, or reset. Drive preference uses the existing drive frequency and the existing defender-distance/rim-distance opportunity signal. The shared `DriveIntent` constructor then feeds the same MG6 movement, defensive help/rotation, and recovery path used by P&R drives. P&R's existing `selectDriveIntent` still uses that constructor, preserving its behavior.

Shot preference uses existing shot/pull-up tendencies, then the existing shot-location, contest, and shot-resolution path. This MatchEngine does not distinguish a pull-up from another handler shot. Pass preference uses advantage-pass tendency and the current pass limit; a receiver is selected from active teammates and resolved through existing lane, accuracy, and turnover logic. Reset clears the isolation action and allows ordinary possession resolution to continue in the same step.

Ratings remain execution inputs only. Drive and shot/pass tendencies select behavior; no rating, tendency, overall, or tactical field was added. Choices use the canonical decision RNG. Live and Instant share the same MatchEngine.

## Limits

- Macro selection of `ISOLATION` remains out of scope.
- No persisted effective matchup change exists after screen coverage ends; isolation reads the current assignments available to the step.
- Drive viability is limited to the existing spatial actor/opportunity signal; no new lane evaluator was introduced.
- Pull-up and direct shots share current shot resolution; pass target ranking and help-read kick-outs are not implemented.
- A selected continuation resolves through the existing one-action-per-step MatchEngine flow; no new isolation phase machine was added.

## Validation

- `npx vitest run src/engine/match/MatchSession.test.ts -t "canonical isolation action|isolation shot selection|isolation pass selection|isolation with no specialized option|selected handler drive activate MG6 drive movement"` — 5 passed, 36 skipped.
- Full suites and build were skipped per MG7C scope.

**MG7C result: PASS.**
