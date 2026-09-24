# MG5F: Defensive Spatial Contest Authority

Before MG5F, shots used zone-specific defensive skill, fatigue, and the existing tactical
defense modifier, without using defender position. MG5F keeps the canonical defender from
the existing matchup assignment (including its explicit override and deterministic fallback)
and reads that player's current `SpatialState` position alongside the actual shooter's.

The Engine calculates their Euclidean separation in meters. A deterministic proximity signal
is full at 1m, falls linearly to zero at 4m, and remains zero farther away. It is multiplied
by the defender's existing zone-specific effective defense, including fatigue, and capped at
12 defensive points before entering the existing make-probability calculation. Defensive
ratings and tactical modifiers continue to contribute independently. If the assigned defender
has no spatial entry, MG5F supplies no spatial bonus and preserves the existing skill/tactical
behavior; it never invents coordinates.

MG5E still determines shooter location, shot zone, and basket distance. Contest calculations
add no RNG draws and do not move players. Live and Instant Result share the MatchSession path.
Help defense, rotations, switches, blocks by geometry, wingspan/reach, pass lanes, rebounds,
transition, and renderer changes remain out of scope. Focused tests cover distance, skill
scaling, far-distance neutrality, bounds, and coexistence with defensive tactics.
