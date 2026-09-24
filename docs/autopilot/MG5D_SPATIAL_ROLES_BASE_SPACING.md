# MG5D — Spatial Roles and Base Spacing

`assignBaseSpatialTargets` derives targets from the current MatchSession possession, active lineups, player primary positions and canonical court geometry. Unique primary positions claim their corresponding PG/SG/SF/PF/C role; duplicate or missing positions fall back deterministically to the next available role in lineup order. The current ball handler takes the PG initiation spot, swapping roles with that slot's player.

The five offensive spots are defined once in normalized court coordinates and mirrored horizontally according to the attacking basket. Five defenders receive the matching role target along the segment between that offensive spot and the basket they defend. Targets remain derived runtime values and are not stored in `SpatialState`.

At each resolved possession step, MatchEngine selects the existing ball handler, then `stepPlayersTowardBaseSpacing` moves each of the ten active players by at most `BASE_SPATIAL_STEP_METERS` using only MG5C's `movePlayerToward`. The ball follows its handler through that primitive. The step is deterministic and consumes no RNG; positions do not affect action selection or sporting probabilities.

This is a static base shape only. Plays, tactical movement, transition, rotations, pathfinding, collisions and rating-, tendency- or physical-based spacing remain out of scope.

## Proofs

Focused MatchSession tests cover deterministic five-per-side targets, distinct legal spots, position fallback, handler role, attack-direction mirroring, role-paired defensive locations, possession flips, bounded movement toward a target and the possession-step runtime integration.
