# MG6H · Defensive coverages foundation

## Authority and scope

Pick-and-roll coverage is selected in the team's canonical tactical plan and
copied into `MatchSession.coachingState`. The pre-match tactics screen and live
tactical panel update that plan; the engine reads no UI or local storage state.
Coverage is derived by `coverageForCurrentScreen` only for a valid `set` or
`postScreen` `ScreenIntent`, while its handler controls the ball and both
offensive participants and their assigned defenders remain active. The screen
captures both primary defensive assignments so a defensive substitution cancels
the context instead of silently transferring coverage to a new player.

The optional persisted instruction `defense.pickAndRollCoverage` keeps older
saves compatible. Missing values normalize to `switch`. The existing interior /
perimeter tactical emphasis remains a separate legacy setting and its shot-zone
modifier is unchanged; it is not used to implement these coverages. No coverage
adds a shot, turnover, passing, or contest modifier.

## Coverage behavior

- **Switch:** temporarily swaps the handler and screener defender assignments.
  The two defenders target the opposite offensive player's current position,
  with a basketward cushion. Ratings and the resulting mismatch remain real.
- **Drop:** keeps assignments and sends the screener's defender toward the
  basket from the live handler position, or from the roll target after the
  screen. One canonical depth is used.
- **Hedge:** keeps assignments and sends the screener's defender toward the
  midpoint between handler and screener, biased slightly toward the basket.
  When the screen enters `postScreen`, the hedge target is removed and ordinary
  BaseSpacing movement recovers toward the assignment.
- **Blitz:** keeps assignments and sends both primary defenders to distinct,
  closely separated targets around the current handler. The screener / roller
  receives no direct coverage target and can become spatially available.

All coverage targets are clamped inside the court and are movement targets, not
teleports. MG6A/B movement and player-specific kinematics govern how quickly
defenders reach them. Coverage targets override MG6G help targets for the two
direct participants. Those defenders are excluded from MG6G helper and rotator
selection while the screen context remains active; uninvolved defenders can
still help and rotate once.

## Lifecycle and determinism

Coverage is derived each MatchEngine step; it is not a separate persisted or
session state machine. It ends when the screen expires, the handler changes, the
ball leaves the handler, possession changes, or a screen participant or either
captured defender is substituted. Hedge enters its recovery phase in the
post-screen action; other coverage targets remain active through that action
and clear with the screen. No new RNG draws are used. Live and Instant Result
share MatchEngine, while MatchViewer remains presentation-only.

Roll and pop remain MG6E intents. Their movement, defensive positions, passing
lanes, and shot contests interact through existing spatial resolution. No
special result is forced for any coverage. Zone defense, ICE, press, traps
outside P&R, scram / peel switching, collective rotations, contact, fouls,
playbook defense, and animation remain out of scope for MG6H.
