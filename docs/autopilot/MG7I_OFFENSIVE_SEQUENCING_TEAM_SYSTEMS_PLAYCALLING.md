# MG7I - Offensive Sequencing, Team Systems, and Playcalling

## Previous behavior and authority

Before MG7I, MatchEngine could start P&R and CUT from separate local checks, while ISO, POST_UP, HANDOFF, SPOT_UP, and TRANSITION were entered through their action-specific contexts. MG7I centralizes the next half-court primary action in `OffensivePlaycalling.ts`. It returns the existing canonical `OffensiveAction`; the existing MG7B-H modules still own action-internal reads, movement intents, and resolution.

## Selection boundary and sequencing

MatchEngine selects only at a clean boundary: the attacking team owns a controlled ball, no valid transition or primary action owns it, and no catch, handoff, or drive continuation is in progress. The selector requires the canonical ball owner on the active lineup and verifies live on-court handler and defender positions. A valid saved action remains authoritative until its existing system completes or resets it. RESET clears that authority on its resolution step; a new selection can occur on the next decision step. The setup step preserves the selected action without resolving a generic shot/pass in the same step.

Secondary cuts can coexist with P&R, ISO, POST_UP, or HANDOFF and do not replace the primary action or block a later call. A primary CUT is tracked as the primary action. A new primary action cannot start while an active cut or drive continuation owns the branch.

## Candidates and validity

The selector considers PICK_AND_ROLL, ISOLATION, POST_UP, HANDOFF, and CUT. It constructs only candidates with valid active participants, spatial context, an existing viable continuation, and positive tendency weight:

- PICK_AND_ROLL uses the controlled handler, an active screener, both assigned live defenders, the existing screen intent builder, and an on-court target.
- ISOLATION requires the controlled handler, assigned defender, and an existing drive, shot, pull-up, or pass continuation.
- POST_UP requires the current ball owner to satisfy the existing MG7D post context and have a back-down, shot, or pass continuation. No entry pass is invented.
- HANDOFF requires an active nearby receiver, live on-court positions and assigned defender, plus an existing receiver continuation. MG7F still owns approach and transfer.
- CUT uses MG7E's existing deterministic viable-cutter geometry and active lineup.

SPOT_UP is not started arbitrarily with the ball handler; it remains a catch-context action under MG7G. DRIVE remains a continuation, and TRANSITION remains exclusively under MG7H. No new playbook, event type, player field, tendency, or tactical field is added.

## Weighting and runtime inputs

Base weights come from existing action tendencies: P&R handler/screener frequencies, isolation frequency, post-up frequency, advantage-pass frequency combined with the receiver's existing continuation tendency for Handoff, and cut frequency. The only existing offensive tactical preference available is `featuredPlayerId`; the existing featured-player usage modifier applies when that player participates. Pace and shot profile retain their established possession/shot effects and do not become new playcall preferences.

Inputs are the attacking team, active lineup, materialized player profiles, SpatialState, current matchups, attacking basket, current tactical plan, pass count, and injected decision RNG. The selector does not read GameWorld. Candidate order follows active lineup order. Weighted choice is deterministic for the same state and RNG stream.

## Precedence and fallback

Valid TRANSITION authority wins and is handled by MG7H without entering half-court weighting. Active primary actions and catch/handoff continuations keep their existing authority. After transition SETTLE, half-court selection occurs on a later clean step. If no specialized candidate is valid, MatchEngine continues its ordinary possession and BaseSpacing behavior without forcing an action.

## Limitations

Handoff has no dedicated existing initiation tendency. Its V1 preference is approximated with the handler's advantage-pass frequency and the receiver's strongest existing drive, shot, pull-up, or pass continuation tendency; the receiver must be within twice the MG7F transfer distance. Weights are initial contextual choices, not calibrated play frequencies. The model does not implement named plays, mismatch hunting, a scripted possession tree, direct movement, or outcome resolution.

## Validation and result

Nine focused MatchSession tests passed: automatic clean-boundary call and setup step; RESET clearing; active P&R with a secondary cut; isolation, post-up, and handoff paths; catch/spot-up precedence; and transition precedence. `npm run typecheck` is recorded in the milestone completion result. Full suite, build, and Rust checks are reserved for MG7J.
