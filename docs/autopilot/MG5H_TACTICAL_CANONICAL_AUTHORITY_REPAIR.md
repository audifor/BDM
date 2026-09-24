# MG5H · Tactical canonical authority repair

## Tactical plan precedence

Before MG5H, passing the global UI plan to match preparation replaced both teams'
stored plans. That skipped a team's base instructions and game override, and gave
the opponent a neutral default. Preparation now resolves each team's canonical base
plan, merges that game's override, then applies an explicit runtime plan only to the
side that supplied it. The existing tactical UI store records whether its plan was
explicitly set; an untouched neutral store is not treated as an override.

`prepareMatchOptions()` creates this single effective input for both Live and
Instant. Live coaching after tip-off still belongs to
`MatchSession.coachingState`; changes are validated and recorded through the
existing live coaching command.

## Rotation minutes

Before MG5H, saving `minutesByPeriod` could persist an empty instruction list, which
then suppressed default substitutions. Valid regulation-minute matrices are now
compiled deterministically into chronological substitutions consumed by the
existing `RotationController`. The compilation allocates the five available places
minute by minute from each player's saved target. A missing matrix uses the existing
non-empty saved instructions when present; an unusable matrix or empty instruction
plan falls back to the deterministic default rotation.

This does not add fatigue rules, bench strategies, positions, or overtime
allocations.

## Shot profile and spatial authority

Before MG5H, player shot-zone weights and the team profile were sampled and the
selected zone was discarded, consuming an unused decision-RNG draw. The current
shooter location is now resolved from `SpatialState` before possession outcome
selection. Player tendencies contribute the zone's natural weight and team shot
profile scales that weight. Together they influence the relative chance of a field
goal attempt versus the already existing turnover, shooting-foul, and pass outcomes.
The actual `shotZone`, points, and make calculation still come from that same
spatial location; tactics never move the player.

The discarded weighted zone draw is removed. This can change later values in the
`match-decisions-v1` stream, which is an intentional consequence of removing a draw
with no authoritative result.

## Live validation and apply errors

The domain exports one list of supported defense presets. Tactical-plan validation
and the Live selector both use it; each selector option therefore maps to a plan the
runtime accepts. The separate perimeter-pressure selector that could form rejected
defense pairs is removed. Existing Live apply handlers catch a rejected command so
it is presented through the current UI feedback instead of becoming an unhandled
error.

## Deferred tactics

MG5H does not implement spacing layouts, pick-and-roll, schemes, zones or help,
roles or duties, playbooks, tactical rebound or transition controls, or the other
gaps from the tactics audit. Those remain later work.
