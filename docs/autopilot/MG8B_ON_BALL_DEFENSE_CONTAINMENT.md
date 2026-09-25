# MG8B · On-Ball Defense and Containment

## Previous behavior

MG8A established primary and temporary effective defender assignments. MG6
BaseSpacing positioned all defenders by role toward the attacking lineup's
spacing locations. The match step had no separate on-ball containment target.

## On-ball authority

`resolveOnBallDefensiveIntent` reads the current `SpatialState.ball` owner. It
returns no intent when the ball is unassigned, loose, owned by the wrong team, or
owned by a player outside the active offensive lineup. It resolves the defender
through MG8A's `getEffectiveDefender`, so active temporary assignments remain
authoritative.

## Target geometry and gap

The target uses the current handler position and the basket defended by that
team in the current period. In ordinary containment it lies along the handler
to defending-basket line, between the handler and basket. The base gap is
adjusted by rim distance and the existing `defense.pointOfAttack` match profile
signal. An active drive intent for the same handler and effective defender
reduces the gap slightly; it does not resolve the drive or its outcome.

The resolver recalculates from current positions each step, so lateral handler
movement changes the target. When the defender is clearly behind the handler
along the handler-to-basket line, the target moves to a short trailing position
behind the handler. This lets MG6 determine whether the defender can recover and
prevents an automatic reset in front of the ball.

The returned separation is a transient geometric read (`CONTAINED`,
`SLIGHT_SEPARATION`, or `BEATEN`). It is not persisted and does not trigger help.

## Movement and precedence

MG8B returns a defender responsibility and target only. MatchEngine passes the
target through the existing target override input to MG6's `stepPlayersTowardBaseSpacing`;
MG6 still owns position, velocity, acceleration, and physical reachability.

Transition movement suppresses the on-ball target while active. A current help
or recovery target takes precedence if it owns the same defender, and an active
screen coverage target also retains precedence. MG8B does not modify switch,
drop, hedge, or blitz decisions. Both live and instant simulation use the same
MatchEngine step.

## Compatibility and determinism

- Ball changes after passes and handoffs are followed from `SpatialState.ball`
  on the next step; no handler cache is introduced.
- Possession changes derive a new effective defender from the new session
  possession and assignments.
- Existing P&R, ISO, post-up, handoff, spot-up, and transition action logic and
  probabilities are unchanged.
- Physical movement uses existing MatchPlayerProfile kinematics in MG6. The only
  new rating influence is the existing point-of-attack defense signal; no speed
  or acceleration formula is duplicated.
- No GameWorld runtime reads, new RNG, events, statistics, or persisted advantage
  state are added.

## Tests

`OnBallDefense.test.ts` covers basket-aware containment geometry, ball-owner and
effective-defender changes, temporary switch use, drive gap adjustment, point-
of-attack rating influence, lateral recalculation, deterministic output,
invalid owners, and a beaten defender moving through MG6 without snapping to its
target.

## Limitations

MG8B does not add help, rotations, recovery logic, closeouts, steals, blocks,
fouls, post defense, transition defense, or advanced screen defense. Separation
is only an instantaneous geometric read and does not change offensive outcomes.
