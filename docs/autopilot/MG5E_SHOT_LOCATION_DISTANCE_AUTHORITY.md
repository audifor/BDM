# MG5E: Shot Location and Basket Distance Authority

MG5D used shot-zone preferences selected from player tendencies, ratings, and offensive
tactics as the shot event zone. MG5E keeps that preference calculation and RNG draw, but
the actual event zone now comes from the selected shooter's current `SpatialState` position
and the possession's attacking basket. Preferences do not move players; future movement and
action selection can make a preferred location reachable.

`CourtGeometry` now includes three-point arc radius and corner sideline offset in meters
for FIBA, NBA, WNBA, NCAA, and high-school rulesets. Classification uses the circular arc
away from the corners and the straight parallel boundary in the corner strips. A shot within
1.5m of the attacking basket is `rim`; otherwise a location beyond the selected court's
three-point boundary is `threePoint`, and the remaining area is `midRange`.

The exact shooter-to-basket distance is calculated in meters. It adds a small linear make
probability adjustment relative to a zone reference distance, clamped to +/-0.04 before the
existing zone clamp. Ratings still determine execution skill; tendencies and offensive
tactics still determine the preferred shot category; defensive tactics and fatigue keep
their existing effects. Defensive spatial proximity is not involved.

The spatial calculation consumes no RNG. The existing preference draw remains in its prior
position in the seeded decision stream, and Live and Instant Result continue to use the same
MatchSession shot path. `SpatialState` remains runtime-only; renderer, statistics, scoring,
and shot-zone categories are unchanged. Three-point events continue to use the existing
three-point scoring path. Focused validation covers court boundaries, mirrored baskets,
spatial zone classification, and bounded distance effects.
