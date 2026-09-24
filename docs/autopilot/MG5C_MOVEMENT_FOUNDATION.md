# MG5C — Movement Foundation

`MatchEngine` owns canonical movement through `movePlayerToward`, which returns an updated runtime `SpatialState`. Coordinates and maximum displacement use meters. The primitive moves only an active player, advances by at most the requested finite, non-negative distance, and stops at the target when it is closer than that limit. Targets outside the canonical court are rejected.

Zero distance and an unchanged target produce no movement. Moving the current ball holder updates the controlled ball to the holder's new position; unassigned or loose balls and all other players remain unchanged. The operation is deterministic and consumes no RNG.

The primitive does not select targets or add movement to possession resolution. Spacing AI, formations, tactical movement, velocity, acceleration, fatigue cost, and sporting effects remain out of scope.

## Proofs

Focused MatchSession tests cover partial movement, reaching a target, zero movement, court bounds, holder synchronization, unchanged unassigned ball state, inactive-player rejection, and invalid distance rejection.
