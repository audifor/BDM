# MG7A Offensive Action Authority Foundation

## Previous authority

MatchEngine V3 represented offensive behavior through transient spatial intents such as `ScreenIntent`, `OffBallCutIntent`, and `DriveIntent`. No runtime value identified the possession-level action that gave those movements their meaning.

## Contract and taxonomy

`OffensiveAction` is the canonical runtime context for the current action. It records the action kind, owning team, initiating player, and distinct canonical participants. Its factory rejects participants outside the current active lineup. The supported kinds are `PICK_AND_ROLL`, `ISOLATION`, `POST_UP`, `CUT`, `HANDOFF`, `SPOT_UP`, `TRANSITION`, and `DRIVE`.

MG7A selects `PICK_AND_ROLL` when the existing on-ball-screen tendency selects an active screener; otherwise the existing cut tendency may select `CUT`. This adapts the current behavior without adding new tendencies or tactical fields.

## Implemented vertical slice

The selected Pick & Roll action identifies the current ball handler as initiator and its active teammate as screener. The action gates the existing screen intent's continuation, then MG6 performs screen positioning, roll/pop movement, and defensive coverage. The action remains a decision context; it does not force a shot or pass. Cut actions use the same contract around the existing off-ball cut movement.

Movement remains owned by MG6. Canonical ball ownership remains `SpatialState.ball`, and the initiating handler is taken from that state. Participants are selected from the runtime active lineup. Resolution, canonical events, and MatchEngine remain unchanged and shared by Live and Instant.

## Lifecycle, fallback, and determinism

An action is active while its corresponding screen or cut intent remains active. It clears when that intent completes, possession changes, a period boundary occurs, or a substitution removes a participant. If no specialized action is selected, the existing base spacing and possession behavior continue.

Action selection reuses `decisionRandom`, `ON_BALL_SCREENING_FREQUENCY`, and `CUT_FREQUENCY`; no new random source or tendency is introduced. PlayerTruth ratings, tactics, renderer authority, event types, and stats are unchanged.

## Remaining MG7 roadmap

- MG7B: Pick & Roll offensive logic
- MG7C: Isolation and drive decision logic
- MG7D: Post-up offensive logic
- MG7E: Cuts and off-ball action logic
- MG7F: Handoff offensive logic
- MG7G: Spot-up, catch, and closeout attack logic
- MG7H: Transition offensive decision logic
- MG7I: Offensive sequencing, team systems, and playcalling
- MG7J: Offensive Engine integration and final certification

These remain provisional until later milestones inspect the implementation needs.

## Validation

- `npx vitest run src/engine/match/MatchSession.test.ts -t "offensive action|pick-and-roll action"` — 2 passed.
- `npx vitest run src/engine/match/MatchSession.test.ts` — 35 passed.
- `npm run typecheck` — passed because the shared `MatchSessionState` type changed.
- Build was not run, as requested by the MG7A validation policy.
