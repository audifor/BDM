# MG8A · Defensive Authority Foundation

## Previous defensive state

`Matchups.ts` derived one-to-one assignments from the active lineups, optional
game-plan matchups, primary positions, and the existing deterministic mobility
tie-break. `MatchEngine` rebuilt them from the current possession on each step.
P&R coverage produced a separate assignment projection for the active screen;
switch coverage exchanged the handler and screener defenders for that step.

## Canonical assignment authority

`DefensiveAuthority.ts` now owns the runtime assignment contract and lookup
surface. It derives the defending team from the session's attacking team and the
two match teams, validates both active lineups against `SpatialState`, builds
primary assignments through the existing matcher, and enforces opposing teams
and one-to-one primary assignments. No assignment is persisted in `GameWorld`.

Each assignment records attacking team, defending team, offensive player,
defender, intent (`GUARD`), and whether it is a primary matchup or a temporary
override. `getPrimaryDefender` and `getEffectiveDefender` are the canonical
lookups. `getEffectiveMatchups` provides the existing `PlayerMatchup` shape to
movement, coverage, and offensive consumers.

## Base matchups and temporary overrides

Base matchups continue to use active lineup order, primary-position proximity,
the established mobility tie-break, stable PlayerId tie-breaks, and valid
explicit game-plan assignments. This preserves current behavior and uses no
randomness. A valid P&R switch becomes a temporary assignment overlay. Other
coverage movement targets do not change the identity of the primary defender.
Removing the coverage context restores the base lookup automatically.

## Possession and lineup lifecycle

Assignments are derived from `MatchSessionState.attackingTeamId` for the current
step, so a possession change rebuilds the attacking/defending roles without
retaining stale assignments. Period transitions likewise use the new period's
current possession. Substitutions update the active lineups and spatial players;
the next authority build uses only those active lineups. Inactive defenders and
offensive targets cannot enter the authority.

## Architecture boundaries and compatibility

- `SpatialState.ball` remains the ball owner/flight authority.
- MG6 retains movement authority: this change does not set coordinates, velocity,
  or acceleration. MG6 still consumes spatial target inputs.
- MG7 action decisions and probabilities are unchanged. Its existing P&R, ISO,
  post-up, spot-up, handoff, and transition flows receive the canonical matchup
  projection.
- No Overall value, new defensive tactic, or GameWorld runtime read is added.
- No RNG is used for assignment or tie-breaking.

## Known limitations

This milestone provides primary matchup responsibility and the existing P&R
switch overlay only. It does not add help decisions, rotations, closeouts,
coverage intelligence, post defense, transition defense, traps, or zone defense.

## Tests

`Matchups.test.ts` covers active opposing assignments, one-to-one defense,
possession flips, substitution repair, temporary switch precedence and removal,
and deterministic ordering. Existing MatchEngine tests cover the MG7 and MG6
flows through their shared assignment projection.
