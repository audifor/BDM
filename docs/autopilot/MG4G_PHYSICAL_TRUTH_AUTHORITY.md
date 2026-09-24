# MG4G · Physical Truth Authority

## Previous authority and canonical source

Before MG4G, physical dimensions had no MatchEngine authority; fatigue was already active and remains separate. The canonical source is `Player.bio`: `heightCm`, `weightKg`, `wingspanCm`, and `standingReachCm`. Height, wingspan, and reach use centimeters; weight uses kilograms. Runtime `PlayerBio` values are all present. At the Player factory boundary, omitted wingspan or reach values are generated deterministically from PlayerId, height, and position; MatchEngine does not invent or randomize measurements.

## Match profile transport

`MatchPlayerProfile.physical` carries all four canonical fields directly from `Player.bio`, typed as a `Pick<PlayerBio, ...>`. No second physical data model, conversion, or overall score is introduced. Live and instant matches use the shared profile construction in `prepareMatchOptions()`.

## Gameplay authority

Standing reach modifies the existing `calculateOffensiveReboundProbability` resolution. The engine compares offensive and defensive team-average standing reach, clamps the difference to ±30 cm, and adds 0.15 rebound-signal points per centimeter to the existing average rebounding-impact difference. The existing 0.0025 probability adjustment and 0.12–0.40 probability bounds still apply. The normal seeded sporting RNG draw consumes that probability; no draw or stream was added. Rebounder selection remains based on existing rebounding impact.

Ratings continue to supply the existing rebound-skill signal; standing reach contributes only a small, bounded physical matchup modifier. Tendencies are unchanged. Fatigue remains a separate existing input and was not modified.

## Available but unwired

- `heightCm` and `wingspanCm`: carried into the profile; no consumer added. Standing reach is the more direct reach measure for this rebound resolution. Wingspan may be considered for a later block/contest milestone.
- `weightKg`: carried into the profile; no contact-resolution consumer exists in this milestone.

Spatial state, movement, traits, new actions, event persistence, replay, UI, and balance retuning remain out of scope.

## Verification

Focused tests verify all four profile values are transported and that changing only standing reach changes the existing rebound probability with otherwise equal profiles. Existing rebounding ratings remain part of the same probability formula. The targeted profile and rebound tests passed; the TypeScript typecheck passed.
