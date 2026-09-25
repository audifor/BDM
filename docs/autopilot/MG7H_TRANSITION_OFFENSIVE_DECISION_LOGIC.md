# MG7H - Transition Offensive Decision Logic

## Previous transition behavior

MG6 issued a one-step `transitionIntent` after a possession change and moved players toward transition targets. MatchEngine did not make an offensive transition read, so subsequent play returned to ordinary action selection. MG7H keeps that movement behavior and adds a short-lived offensive authority.

## Trigger and action contract

The existing possession-flip path remains the trigger for turnovers, defensive rebounds, and made baskets. It sets the MG6 movement pulse. When the new side already has a canonical controlled ball owner, MatchEngine also creates a `TRANSITION` `OffensiveAction` for that handler. If a made basket leaves the ball unassigned, the existing next-step handler selection controls the ball and the movement pulse supplies transition authority for that step.

An action is valid only for the current attacking team and canonical ball owner, with its initiator and participants on the active lineup and in the spatial state. No transition roster or persistent advantage field is added.

## Handler, runners, and spatial read

The handler is always `SpatialState.ball.playerId`. Other active teammates are treated as potential runners from their live positions. A runner must be ahead of the handler and closer to the attacking basket. The read counts defenders in the forward lane, compares numbers, checks rim distance, and finds an advanced teammate with an open-enough passing lane. It is recalculated after a completed ahead pass.

## Continuations and existing resolution

- `ATTACK_RIM` requires a live transition advantage, a viable existing drive opportunity, and a nonzero transition/drive tendency. It creates the shared `DriveIntent`; MG6 remains responsible for drive movement and existing defensive reaction and resolution.
- `PASS_AHEAD` requires an advanced active teammate, acceptable passing-lane pressure, transition advantage, and the existing advantage-pass tendency. It prioritizes the runner as receiver, then uses the normal pass lane, accuracy, turnover, event, and canonical ownership transfer paths. A completed pass retains transition authority only while the live read still shows advantage.
- `EARLY_SHOT` uses the handler's existing shot-zone and shot tendencies when the defense is not set. Shot location, contest, outcome, and events use normal shot resolution.
- `SETTLE` clears transition authority and its transient drive selection. Ordinary half-court action selection resumes on the next step.

Weighted selection uses the injected decision RNG. Ratings remain execution inputs; no PlayerTruth fields, tendencies, or tactical fields were added.

## Precedence and MG6 integration

While valid, transition authority suppresses P&R, isolation, post-up, handoff, spot-up, catch, and off-ball cut selection. This prevents MG7G catch logic from making a second decision after an ahead pass. The MG6 transition movement pulse remains a single bounded spatial step and continues to dominate movement on that step; MG7H does not add trajectories or a second engine. `ATTACK_RIM` then hands movement to the existing drive intent on following steps.

Live and instant match simulations share this MatchEngine path. The event stream, stats, and renderer are unchanged.

## Known limitations

The defense-set and numbers reads are intentionally geometric approximations, not a defensive transition assignment model. Made-basket transition begins only when the existing trigger/pulse permits it; no dedicated outlet phase is introduced. The model does not add transition handoffs, play calls, detailed fast-break roles, clock strategy, or tuning.

## Tests and result

Five focused MatchSession tests cover rim attack and shared drive movement, ahead-pass ownership and catch precedence, early shot resolution, settle/half-court return, and turnover transition precedence with MG6 movement. All five passed. `npm run typecheck` passed. MG7H is complete on its isolated branch; no build, full suite, Rust validation, merge, or push was run.
