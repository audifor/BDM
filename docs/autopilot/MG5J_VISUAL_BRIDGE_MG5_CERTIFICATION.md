# MG5J · Visual Bridge + MG5 Certification

## Visual bridge

`MatchEngine` remains the authority for spatial gameplay. `LiveMatchController`
provides read-only before/after `SpatialState` snapshots for a resolved step.
`MatchPresentationSegment` adapts those snapshots to an immutable visual contract
containing active `playerId`/`teamId` pairs, court dimensions, normalized positions
and ball ownership. The court renderer consumes the projected snapshots and never
updates MatchSession or its `SpatialState`.

Engine coordinates are metres. The adapter projects them to percentages of the
canonical court dimensions. The existing `CourtProjection` maps those percentages
back onto its regulation geometry and projects them to canvas pixels. The same
single normalized transform is used for players and ball; no pixel coordinates
enter Engine state.

The viewer interpolates the previous and current snapshot with clamped linear
progress in `[0, 1]`. Progress follows the existing match presentation segment and
pause/speed behavior; this milestone sets no new simulation frequency. If a
snapshot is interrupted, the current segment remains the previous/current pair
until completion, so subsequent segments start at the newest canonical state. The
Canvas receives already-sampled positions and does not apply a second movement
animation to them.

Players are matched by stable `playerId`, and only the active spatial snapshot's
players render. A substitution removes the outgoing ID and introduces the incoming
ID at the inherited canonical position. The ball uses its canonical position and
owner. During a controlled-player A-to-B ownership change, the visual ball linearly
travels between the two snapshot positions; the handoff is presentation-only. A
loose or unassigned ball has no invented owner. MG5I transition positioning appears
through those same player snapshots.

## Authority and parity

The render loop only samples and draws UI snapshots. FPS, interpolation progress
and window refresh rate cannot change sporting resolution. Live and Instant
simulation continue to use the same MatchEngine core; the visual bridge is a Live
MatchViewer consumer and is not required to resolve Instant results.

## Focused evidence

`SpatialVisualBridge.test.ts` checks a live MatchSession step through projection
and interpolation, the ten active stable player IDs, clamped endpoint/midpoint
positions, canonical ball ownership, a visual owner handoff, and substitution
identity/position continuity. A render-level assertion confirms the court receives
the projected active actors and ball. Existing
`MatchPresentationSegment.test.ts` verifies segment timing, and
`LiveMatchController.test.ts` verifies the live snapshot boundary.

Manual browser inspection was attempted with the local Vite dev server, but no
browser surface was available in the environment. No screenshot or visual claim is
recorded from that attempt.

## MG5 cumulative certification

The following is the accumulated MG5A–I milestone evidence plus the focused MG5J
bridge checks. This certifies coherent canonical spatial authority and a connected
visual consumer; it does not certify human-like movement or a full animation
system.

| Capability | Status | Authority / evidence |
| --- | --- | --- |
| Court geometry | PASS | Canonical `CourtGeometry` in metres |
| Spatial state | PASS | Transient MatchSession state |
| Ball authority | PASS | SpatialState owner and position; bridge coverage |
| Movement | PASS | MG5C movement primitive |
| Base spacing | PASS | MG5D spacing targets and movement |
| Shot location | PASS | MG5E shot resolution |
| Shot distance | PASS | MG5E canonical basket distance |
| Defensive contest | PASS | MG5F spatial contest |
| Passing | PASS | MG5G canonical pass action |
| Passing lanes | PASS | MG5G spatial lane context |
| Rebound geometry | PASS | MG5I position, rating and standing-reach inputs |
| Transition | PASS | MG5I one-step canonical transition |
| Visual bridge | PASS | MatchSession snapshots to court renderer |
| Interpolation | PASS | Clamped snapshot interpolation tests |
| Renderer authority | PASS | UI-only snapshot consumer; no write-back path |
| Determinism | PASS | Render sampling does not invoke sporting resolution |
| Live / Instant parity | PASS | Shared MatchEngine core |

## Deferred to MG6+

Human-like movement, speed/acceleration, collisions, screens, cuts, pick-and-roll
execution, help defense, rotations, zones, advanced transition, box-outs, rebound
trajectories, ball physics, specialized passes, playbooks, body motion and
animations remain unimplemented.
