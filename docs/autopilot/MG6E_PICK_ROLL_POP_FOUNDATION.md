# MG6E — Pick & Roll / Pick & Pop Foundation

MG6E extends MG6D's transient `MatchSessionState.screenIntent`; it does not add a
separate pick-and-roll engine. The handler remains the actual ball controller,
and the existing primary-defender assignment remains authoritative.

## Lifecycle and decision

The screener approaches and sets the screen under MG6D. The screen remains in
`set` for its existing two movement steps. When that window expires, the same
intent enters `postScreen` with one persisted action (`roll` or `pop`) and target.
The choice is weighted by the screener's canonical `PICK_AND_ROLL_ROLL_FREQUENCY`
and `PICK_AND_POP_FREQUENCY` tendencies. It uses one weighted selection from the
existing `decisionRandom` stream. No overall or execution rating is invented or
used to choose the action; ratings continue to affect movement only through the
MG6A/B kinematic profile.

## Targets and movement

Both targets derive their inward court direction from the current handler and
screener positions relative to the attacking basket. A roll target is two metres
from that basket, avoiding an exact under-basket destination. A pop target uses
the current court's three-point arc radius plus 0.45 m. Both are clamped to a
0.6 m court margin, so targets remain inside FIBA, NBA and other supported
court geometries. The roll target is closer to the attacking basket than the pop
target.

The screener moves through the existing BaseSpacing movement step with their own
MG6A/B kinematics. While `postScreen` is active, its target overrides BaseSpacing
and the screener cannot start a cut or another screen. The intent clears within
0.45 m of the target or after four movement steps. BaseSpacing takes authority on
the following movement step; no position is teleported.

## Existing systems and boundaries

Possession flips, handler changes, and substitution of the handler, screener or
assigned defender cancel the complete screen intent. The MG6C cut/screen
exclusion remains intact. Live and Instant Result use the same MatchEngine core;
the renderer reads spatial snapshots and has no gameplay authority.

The post-screen action only changes screener position. It does not force a pass
or shot and does not change receiver weights. Existing pass, shot, rebound and
spacing calculations consume the resulting positions. Handler drive, reject,
re-screen, short roll, defensive coverages, help defense, playbooks and animation
remain out of scope.

## Validation

- `npm test -- --run src/engine/match/ScreenInteractions.test.ts`: focused screen,
  post-screen decision, target geometry, movement, completion and cancellation
  coverage.
- `npm run typecheck`: run once for this milestone.
- Full test suite and build are skipped by the MG6E milestone.
