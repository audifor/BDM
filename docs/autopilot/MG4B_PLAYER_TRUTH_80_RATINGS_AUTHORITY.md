# MG4B · Player Truth 80 Ratings Authority

Branch: `matchengine-v3-mg4b-player-truth`
Base: `matchengine-v3-mg4a` @ `0a5eb356ac5e7e641b229716562eb55564206752` (MG4A, certified PASS)

## 1. Objective

Give `PlayerTruthRatings` (the 80-key canonical player ratings) real gameplay resolution
authority inside MatchEngine, eliminating the `80 → 35 → 7` legacy collapse that MG4A found
between the canonical rating truth and the possession-resolution formulas.

## 2. Files Changed

- `src/engine/match/MatchPlayerProfile.ts` — construction rewritten
- `src/engine/team/TeamEvaluation.ts` — `calculatePlayerImpact` rewritten
- Tests updated for the resulting (expected) value changes:
  `PlayerDrivenOffense.test.ts`, `SecondaryActionResolution.test.ts`, `MatchSession.test.ts`,
  `rotation/RotationPlan.test.ts`, `TeamEvaluation.test.ts`
- New: `src/engine/match/PlayerTruthAuthority.test.ts` (TEST A-D, see §8)

## 3. Previous Authority

`MatchPlayerProfile` (every possession-resolution consumer) and `calculatePlayerImpact`
(starting-five selection, team strength) both called `legacyRatingSignals(player.basketball.ratings)`
— a two-step collapse (80-key Truth → 35-key `LegacyCanonicalPlayerRatings` → 7-key
`LegacyPlayerRatings`) before any gameplay math ran.

## 4. New Authority

Both consumers now read `player.basketball.ratings` — already typed as
`PlayerTruthRatings & ...` — directly. Each match-context signal is built from a small,
semantically relevant subset of the 80 canonical keys instead of the 7-key aggregate:

| `MatchPlayerProfile` signal | Rating keys used |
|---|---|
| `offense.usage` | `SHOT_TOUCH`, `ADVANTAGE_CREATION`, `DRIVE_CREATION`, `OFFENSIVE_AWARENESS` |
| `offense.rimAttack` | `RIM_FINISHING`, `CONTACT_FINISHING`, `VERTICAL_FINISHING`, `FINISHING_THROUGH_LENGTH` |
| `offense.shooting` | `SHORT_MIDRANGE`, `LONG_MIDRANGE`, `THREE_POINT_STATIC`, `THREE_POINT_PULLUP`, `CONTESTED_SHOOTING`, `SHOT_TOUCH` |
| `offense.creation` | `DRIVE_CREATION`, `ADVANTAGE_CREATION`, `CHANGE_OF_DIRECTION`, `PRESSURE_HANDLING` |
| `offense.ballSecurity` | `BALL_CONTROL`, `DRIBBLE_SECURITY`, `DECISION_MAKING`, `PRESSURE_HANDLING` |
| `defense.pointOfAttack` | `POINT_OF_ATTACK_DEFENSE`, `LATERAL_DEFENSE`, `SCREEN_NAVIGATION_DEFENSE` |
| `defense.interior` | `RIM_PROTECTION`, `POST_DEFENSE`, `SHOT_CONTEST` |
| `defense.mobility` | `AGILITY`, `SPEED`, `ACCELERATION`, `LATERAL_DEFENSE` |
| `rebounding.impact` | `OFFENSIVE_REBOUNDING`, `DEFENSIVE_REBOUNDING`, `STRENGTH`, `VERTICAL_LEAP` |

`TeamEvaluation.calculatePlayerImpact` (starter ranking / team-strength display, not
possession resolution) reads a separate, explicitly-scoped 16-key subset
(`IMPACT_RATING_KEYS`) directly from `PlayerTruthRatings`. It remains a contextual,
roster-evaluation-only aggregate — not a new persisted "overall."

`MatchPlayerProfile`'s external shape (`offense`/`defense`/`rebounding` signal fields) is
unchanged, so `ShotResolution`, `TurnoverResolution`, `ReboundResolution`, `AssistResolution`,
`DefensiveAttribution`, and `Matchups` required **no changes** — only the profile's
construction moved.

## 5. Migrated Consumers

- `MatchPlayerProfile.createMatchPlayerProfile` — all in-match possession resolution
- `TeamEvaluation.calculatePlayerImpact` — starting-five selection, team strength
- `TeamEvaluation.selectStartingFive` / `calculateTeamStrength` — migrated transparently
  (they call `calculatePlayerImpact`, no direct changes needed)
- `rotation/RotationPlan.createDefaultRotationPlan` — migrated transparently (calls
  `calculatePlayerImpact` via `@/engine/team`)

## 6. Legacy Remaining (out of scope, confirmed non-authoritative for gameplay)

- `legacyRatingSignals()` / `CANONICAL_RATING_KEYS`: **zero references remain in
  `src/engine/match/**`** (verified by search). Still used by UI/scouting code
  (`SquadScreen`, `TacticsPcbPage`, `CanonicalRoster`, `buildRosterDepthChart`,
  `PlayerKnowledgeEnrichment`) — untouched, per scope.
- `TeamStrength` (`SimulateMatchOptions.homeStrength`/`awayStrength`): still computed
  pre-match and still unread by possession resolution (confirmed in MG4A); now built on
  the migrated `calculatePlayerImpact`, so it is no longer legacy-derived, but its
  removal from the input surface remains out of MG4B scope.
- `calculateFatigueAdjustedTeamStrength`: still dead code, untouched.

## 7. 80 Ratings Without a V3 Consumer Yet

31 of the 80 canonical keys are read directly by `MatchPlayerProfile`'s gameplay signals
(rim finishing/contact/vertical/length, shot-touch/midrange/three-point/contested-shooting
family, drive/advantage creation, change of direction, pressure handling, ball
control/dribble security, decision making, point-of-attack/lateral/screen-nav defense, rim
protection/post defense/shot contest, agility/speed/acceleration, offensive/defensive
rebounding, strength, vertical leap). A further subset is read by
`TeamEvaluation.calculatePlayerImpact` for roster-evaluation purposes only (free throw,
short/long midrange, three-point static, passing vision).

The remaining ~49 keys (e.g. passing-accuracy/timing, most playmaking sub-skills,
screening/spacing/relocation, most mental-attribute keys, stamina/endurance, balance,
concentration, composure, discipline, etc.) are **AVAILABLE IN MATCH PROFILE, NO V3
CONSUMER YET** — they reach `player.basketball.ratings` unaltered (no 80→35→7 collapse
loses them), but no current match mechanic consumes them. Per MG4B scope, no artificial
consumer was invented for them; they await future mechanics (tendencies wiring, spatial
engine, etc. — all explicitly out of scope here).

## 8. Tests Executed

New tests (`src/engine/match/PlayerTruthAuthority.test.ts`):
- **TEST A** — `MatchPlayerProfile` signals move only when their semantically relevant
  80-key ratings change; unrelated signals stay identical. Demonstrates no legacy collapse.
- **TEST B** — Two players identical except for shooting-relevant 80-key ratings produce
  different `calculateShotMakeProbability` results. Demonstrates real resolution authority.
- **TEST C** — `calculatePlayerImpact` responds to relevant 80-key rating changes; no
  `overall` field exists on `player.basketball.ratings`.
- **TEST D** — `player.basketball.ratings` enumerable keys are exactly the 80 canonical
  keys (no legacy shape leak); `MatchPlayerProfile` construction produces bounded output
  from that source directly.

Commands run:
- `npx vitest run src/engine/match/PlayerDrivenOffense.test.ts` — pass (after updating 2
  exact-value assertions to reflect the new formula)
- `npx vitest run src/engine/team/TeamEvaluation.test.ts` — pass (after updating 3
  exact-value assertions)
- `npx vitest run src/engine/match/Matchups.test.ts src/engine/match/SecondaryActionResolution.test.ts
  src/engine/match/MatchSession.test.ts src/engine/match/FreeThrowSimulation.test.ts
  src/engine/match/DetailedMatchSimulation.test.ts src/engine/match/MatchResultApplication.test.ts
  src/engine/match/rotation/MatchRotationRunner.test.ts src/engine/match/MatchEngine.test.ts` —
  pass (after updating 1 exact-value assertion each in `SecondaryActionResolution.test.ts`
  and `MatchSession.test.ts`)
- `npx vitest run src/engine/match/rotation/RotationPlan.test.ts` — pass (after updating 1
  tie-break-winner assertion; root cause: the id-seeded jitter in the legacy 7→35 migration
  path no longer cancels out identically across a different, smaller rating-key subset —
  confirmed deterministic, not a bug)
- `npx vitest run src/engine/match/PlayerTruthAuthority.test.ts` — pass (new tests)
- `npx vitest run src/engine/match/ src/engine/team/` — full directory pass, 96/96 tests
- `npx vitest run src/app/game/LiveMatchController.test.ts` — pass (Level 3 spot-check of
  the Live pipeline, which also constructs `MatchPlayerProfile`)

## 9. Tests Consciously Skipped

- Full project test suite (`npm test`) — not run; no risk signal indicated it was needed
  beyond the directly-affected files above.
- `npm run build` — skipped; no bundling/config concern in scope.
- Global `tsc` typecheck — skipped; the affected files compile as part of the vitest
  runs above (transform step), and the type changes are narrowly scoped (both edited
  functions kept identical public signatures — `MatchPlayerProfile` shape unchanged,
  `calculatePlayerImpact(player: Player): number` unchanged).
- Per-rating (80x) individual tests — not created; representative contract tests (A-D)
  were used instead, per MG4B's explicit instruction against exhaustive per-key coverage.

## 10. Result

`legacyRatingSignals()` no longer participates in MatchEngine gameplay resolution. All 80
canonical `PlayerTruthRatings` keys reach `MatchPlayerProfile` and `TeamEvaluation`
without collapse; a documented subset currently has an active gameplay consumer, the rest
are available for future mechanics. Determinism preserved (no RNG/timing changes
introduced). No Overall or new global aggregate was introduced. `TeamLineup` authority,
Live coaching, tendencies, and physical/spatial truth were not touched.
