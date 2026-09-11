# MATCH & BASKETBALL SIMULATION V3 — MG2C · Rotation Authority Cleanup

Branch: `match-gameplay-v3-mg2c-rotation-authority-cleanup`
Base: `7f5c678f330bb80d4cd8cb511e3272d3b428336d` (MG2B-certified `match-gameplay-v3-mg2b-live-coaching-contract`)
Scope: remove `calculatePlayerImpact` as a hidden-overall dependency from rotation/bench authority. No Rotation Engine V2, no 80-rating mapping, no Coach AI.

---

## MG1 BUG-4 root cause

`calculatePlayerImpact` (`src/engine/team/TeamEvaluation.ts:8`) collapses the 7 `legacyRatingSignals` (themselves an unweighted average of the 80 canonical ratings) into one scalar:

```ts
export function calculatePlayerImpact(player: Player): number {
  const r = legacyRatingSignals(player.basketball.ratings)
  return r.finishing*.15 + r.shooting*.15 + r.playmaking*.15 + r.perimeterDefense*.15 + r.interiorDefense*.15 + r.rebounding*.15 + r.athleticism*.1
}
```

MG1 found this scalar used in `RotationPlan.ts`'s `bestPlayer` helper to literally rank and select which bench player enters the game during the automatic (default) rotation — a genuine `player → one number → sort → decision` pattern, in direct conflict with BDM's canonical "no OVERALL" principle, and unlike `TeamStrength` (which is explicitly fenced off from play resolution and verified as such), this one directly affects who is on the court.

## calculatePlayerImpact call-site inventory

| File | Function | Purpose | Gameplay effect | Classification | MG2C action |
|---|---|---|---|---|---|
| `src/engine/team/TeamEvaluation.ts:8` | `calculatePlayerImpact` (definition) | Collapses 7 legacy signals into one 0-100 scalar | N/A (definition) | — | Left as-is; still a legitimate exported function for its remaining callers |
| `src/engine/team/TeamEvaluation.ts:9` | `selectStartingFive` | Picks best-available player per position when no user `TeamLineup` is configured | Determines the AI/fallback starting five (MG2A's explicit fallback path) | `GLOBAL_PLAYER_RANKING`, but **out of MG2C scope** | Not touched — see "Starter-selection implications" below |
| `src/engine/team/TeamEvaluation.ts:10` | `calculateTeamStrength` | Averages `calculatePlayerImpact` over the starting five into `TeamStrength.value` | Feeds only `deriveCoachMatchExperienceGain` (coach XP fairness) — MG1 confirmed via `DetailedMatchSimulation.test.ts` that it is never read by shot/rebound/turnover/assist math | `LEGITIMATE_CONTEXTUAL_DERIVATION` (fenced scalar, not a play-resolution input) | Not touched |
| `src/engine/match/rotation/RotationPlan.ts:73` (old) | `bestPlayer` | Ranked bench candidates by `calculatePlayerImpact` descending to pick the automatic-rotation backup per position | **Directly decided who substitutes in** during scripted automatic rotations | `BENCH_RANKING` — the exact BUG-4 pathway | **Removed.** See below. |
| `src/app/game/LiveMatchController.ts` (`replacementCandidates`, MG2B) | — | Never used `calculatePlayerImpact` | Returns unordered eligible bench (squad minus active lineup) | N/A — never had the dependency | Confirmed clean; added a static guard test (Test G) |
| `src/ui-ng/applications/roster/buildRosterDepthChart.ts` | `buildRosterDepthChart` | Computes a 1-5 "quality stars" display value per player for the Roster app's depth-chart screen | Presentation only — a Roster management UI feature, not read by Match/rotation runtime | `PRESENTATION_ONLY` | Out of scope — different domain (Roster app, not Match) |
| `src/app/game/LineupAuthority.test.ts`, `src/app/game/RotationAuthority.test.ts` | test fixtures | Used to construct "objectively worse/better" players for adversarial regression tests (MG2A/MG2C) | Test-only | `TEST_ONLY` | Legitimate test tooling — proves the *opposite* of BUG-4 (that production code ignores this ranking) |
| `src/engine/team/TeamEvaluation.test.ts` | unit tests | Tests `calculatePlayerImpact`/`selectStartingFive`/`calculateTeamStrength` directly | Test-only | `TEST_ONLY` | Not touched |

## Other pseudo-overall findings

A broad search (`overall`, `power`, `quality`, `strength`, `playerScore`, `playerValue`, `composite`, `weightedRating`, `averageRating`, etc.) across `src/engine/match`, `src/engine/team`, `src/domain/player` found no other hidden-overall pattern:

- `MatchPlayerProfile.rebounding.impact` — a rebounding-specific weighted blend (`rebounding*0.75 + athleticism*0.25`), read only by `ReboundResolution.ts` for rebound-outcome weighting. Scoped/contextual, not a global ranking (MG1 already confirmed this class of signal as legitimate).
- `TeamStrength`/`validateStrength` — the fenced coach-XP scalar noted above.
- `PlayerPotential.ts` explicitly documents itself as "not an overall rating."
- No other `quality`/`strength`/`impact`/`power`/`composite` hit anywhere in the match/team/rotation code touches candidate ordering or eligibility.

## Old replacement-candidate flow

```
RotationPlan.createDefaultRotationPlan
  → for each starter position, build a same-position bench pool (fallback: any-position pool)
  → bestPlayer(pool, players) = pool.sort((l, r) => calculatePlayerImpact(r) - calculatePlayerImpact(l))[0]
  → highest-scalar player wins, ties broken by PlayerId
```

`LiveMatchController.replacementCandidates` (MG2B) never had this problem — it already returned unordered squad-minus-active-lineup membership, with no ranking step at all.

## New candidate flow

```
RotationPlan.createDefaultRotationPlan(options: { ..., benchPriorityOrder?: readonly PlayerId[] })
  → for each starter position, build the same eligibility pool as before (unchanged: same-position, then any-position fallback)
  → preferredCandidate(pool, benchPriorityOrder):
      if benchPriorityOrder is supplied, the first pool member that appears in it wins
      otherwise (or if no pool member appears in it), the pool's own order wins, tie-broken by PlayerId
  → benchPriorityOrder is resolved once per team in playUserGame.ts via resolveBenchPriorityOrder(world, teamId),
    which reads the team's configured TeamLineup bench slots (B1..B7) in that exact priority order —
    the same "B1 = highest priority" semantic the domain type already documents
```

No player rating is read anywhere in this path anymore. `RotationPlan.ts` no longer imports `calculatePlayerImpact` at all (enforced by a static test guard — see Tests).

## Eligibility vs ordering separation

These were already separate concepts before MG2C, but the ordering step's *implementation* conflated "who can replace" (structural: same team, not on court, in the available squad) with "who should be preferred" (previously: `calculatePlayerImpact`). MG2C keeps eligibility exactly as it was (unchanged filters: `availableBench = squad.filter(not in initialLineup)`, then same-position/fallback pooling) and replaces only the preference step with a non-evaluative rule. `LiveMatchController.replacementCandidates` already had this separation — it does eligibility only and leaves ordering entirely to its caller (the UI, which currently presents candidates in stable squad order and never claims the first one is "best").

## Temporary ordering rule

**Configured bench priority (`TeamLineup` B1..B7) when available; otherwise stable pool order, tie-broken by `PlayerId`.** This satisfies the brief's requirements: deterministic (same inputs always produce the same pick), non-evaluative (no rating is read), documented (doc comments on `preferredCandidate` and `RotationPlanOptions.benchPriorityOrder`), and stable (no dependency on object enumeration, `Math.random`, or render order). It uses only information that already exists in the repository — no new depth-chart concept was invented; `BENCH_SLOTS` (`domain/tactics/TeamLineup.ts:6`, documented "B1 (highest priority) through B7") already encodes exactly this priority, and MG2C simply reads it into the rotation path for the first time.

## Automatic-substitution implications

`RotationPlan.createDefaultRotationPlan` is BDM's only automatic-substitution logic (scripted clock-threshold swaps; MG1 confirmed there is no fatigue-driven, foul-trouble-driven, or otherwise adaptive automatic substitution system). It is used whenever a team has no explicit `rotationOverride`/`world.rotationPlansByTeamId` entry — true for essentially every AI team and any user team that hasn't separately configured rotation minutes. This is exactly the pathway BUG-4 named. MG2C's fix changes its tie-break rule (see Test B / RotationPlan.test.ts), which is a genuine, intentional behavior change for teams with a configured bench order — automatic substitutions now honor B1..B7 instead of picking the highest-rated bench player. For teams with no configured lineup at all (the default for `createNewGame()` and virtually all AI teams), behavior changes from "highest-rated bench player wins ties" to "squad-order-earliest bench player wins ties," which is deterministic and stable but not identical to the old output in cases where impact-ranking previously broke a tie between same-position candidates — this is documented, not hidden, and is the entire point of the fix.

## Starter-selection implications

`selectStartingFive` (the AI/fallback path, MG2A's explicit boundary) still uses `calculatePlayerImpact` internally and was **not modified**. Reasons, per the brief's explicit constraints:
1. MG2A's Test C requires the AI opponent to keep using `selectStartingFive` unchanged.
2. Fixing `selectStartingFive`'s internal ranking would require building a real starter-selection heuristic — architecturally adjacent to Coach AI, which MG2C is explicitly prohibited from building.
3. `selectStartingFive` only ever runs as a *fallback* (no configured `TeamLineup`, or an invalid one) — the user's own starter authority (MG2A) is unaffected regardless of what this fallback does internally.

This remains a documented, open item (see MG1 audit update) rather than a silent gap.

## Remaining hidden-overall uses

- `selectStartingFive`/`calculateTeamStrength` (`TeamEvaluation.ts:9-10`) — unchanged, explicitly out of MG2C scope (see above).
- `buildRosterDepthChart.ts` — a Roster app presentation feature (depth-chart "quality stars"), unrelated to Match runtime; not audited further here since it never touches match construction or rotation.
- The underlying 80→7-rating collapse (`legacyRatingSignals`) that `calculatePlayerImpact` itself is built on remains fully in place and unresolved — this is a broader PLAYER-ratings-pipeline concern (MG1's Section 8 finding) that no MG2 wave has addressed and that MG2C was explicitly told not to attempt to fix ("No 80-rating mapping todavía").

## Future Rotation Engine V2 boundary

MG2C's `benchPriorityOrder` mechanism and `preferredCandidate`'s eligibility/ordering split are intended as the seam a future Rotation Engine V2 builds on, not a permanent design:
- **Eligibility** (`availableBench` filtering, same-position/fallback pooling, `LiveMatchController.replacementCandidates`'s squad/active-lineup membership check) is the structural boundary that should stay stable as rotation intelligence grows.
- **Ordering/preference** is exactly where future contextual logic belongs — target minutes, fatigue, foul trouble, matchup fit, tactical fit, coach tendencies, training/familiarity, hot-hand, garbage-time behavior. None of these exist yet and none were added by MG2C. When they are built, they should replace or extend `preferredCandidate`'s tie-break rule with genuinely contextual questions (per the brief's canonical principle) — never reintroduce a single computed quality scalar as the deciding factor.
- The `benchPriorityOrder` mechanism itself is intentionally minimal (a flat priority list) and is not meant to survive as the final rotation-intelligence design — it is the smallest change that removes the hidden overall while staying deterministic and using only data that already exists.

---

## Files changed

| File | Change |
|---|---|
| `src/engine/match/rotation/RotationPlan.ts` | Removed `calculatePlayerImpact` import and use; added `benchPriorityOrder` option; replaced `bestPlayer` (rating-ranked) with `preferredCandidate` (priority-order-or-stable-fallback, no ranking). |
| `src/engine/match/rotation/RotationPlan.test.ts` | Updated the two tests that asserted rating-based selection to assert stable squad-order selection instead; added a new test proving a lower-rated, priority-earlier bench player is preferred over a higher-rated, priority-later one. |
| `src/app/game/playUserGame.ts` | Added `resolveBenchPriorityOrder(world, teamId)`, reading the team's configured `TeamLineup` bench slots (B1..B7); threaded it into both `createDefaultRotationPlan` call sites (`createLiveUserMatch`, `prepareMatch`). |
| `src/app/game/RotationAuthority.test.ts` | New. Tests A-G per the MG2C brief (eligibility, quality-independent ordering, stability, manual-substitution flexibility, MG2A/MG2B regressions, static guards against `calculatePlayerImpact` reappearing on the replacement-ranking path). |
| `docs/match/MATCH_GAMEPLAY_V3_MG1_AUDIT.md` | BUG-4 marked PARTIALLY RESOLVED with evidence and an explicit list of what remains unresolved. |
| `docs/match/MATCH_GAMEPLAY_V3_MG2C_REPORT.md` | New (this file). |

No UI files were touched — the manual-substitution UI (`ManualSubstitutionsPanel`, `TacticalPanel`, entity-action substitution) already presented candidates in stable squad order with no "best player" claim, so removing the hidden overall from the automatic-rotation path required no UI change.

---

## Tests

All in `src/app/game/RotationAuthority.test.ts` unless noted:

- **Test A** — `replacementCandidates` for every on-court player contains only real, currently-eligible bench members (in the squad, not on court); never anything else.
- **Test B** — reversing the configured bench priority between two otherwise-identical worlds changes which player the automatic rotation brings in first, proving the decision follows structural order, not a fixed ratings-based winner.
- **Test C** — the same roster/lineup/state produces the identical candidate list on repeated construction (determinism).
- **Test D** — a manual substitution can bring in the *last*-listed valid candidate, not just the first, proving ordering never restricts eligibility.
- **Test E (MG2A regression)** — configuring the five lowest-`calculatePlayerImpact` roster players as starters still produces exactly those starters in the match, confirming MG2A's lineup authority survived the rotation-authority cleanup.
- **Test F (MG2B regression)** — a live manual substitution and a live tactical change both still return `{ status: 'applied' }` and take effect, confirming MG2B's command boundary survived unaffected.
- **Test G (×2)** — static guards: `RotationPlan.ts`'s source no longer contains the string `calculatePlayerImpact`; `LiveMatchController.ts`'s source never did. Follows the repository's existing static-source-guard pattern (`src/ui/pcb-migrated/tactics/NoIndexBasedLineup.test.ts`).

Plus, in `src/engine/match/rotation/RotationPlan.test.ts`: the pre-existing "selects unique positional backups" test now documents and asserts the new squad-order fallback explicitly (comment explains why `backup-PG`, not the higher-rated `backup-PG-alpha`, wins); a new test proves a lower-rated but higher-configured-priority bench player wins over a higher-rated, lower-priority one.

Focused suite (`src/engine/match`, `src/app/game`, `src/engine/team`, `src/engine/tactics`, `src/ui-ng/applications/roster`): **42 test files, 279 tests, all passed.**

---

## Validation

- `npm run typecheck`: **PASS**, zero errors.
- `npm run build`: **PASS**.
- Focused suite: **42 test files, 279 tests, all passed.**
- Full repository suite (`npm test`): **321 test files, 2362 tests, all passed, exit code 0** (up from MG2B's 320/2353 baseline by exactly 9 new tests — no regressions anywhere).
- Determinism boundary (`Math.random(` in `src/`): **zero matches** — clean.
- Domain/Engine dependency boundary (react/zustand/@tauri-apps import in `src/domain`, `src/engine`): **zero matches** — clean.
- `git diff --check`: clean (only benign LF/CRLF normalization notices).
- Scope check: only `RotationPlan.ts`, `RotationPlan.test.ts`, `playUserGame.ts`, plus new test/doc files were touched — no Rotation Engine V2 component (target minutes, stints, fatigue-driven decisions, foul-trouble logic, matchup optimization, coach tendencies) was added.
