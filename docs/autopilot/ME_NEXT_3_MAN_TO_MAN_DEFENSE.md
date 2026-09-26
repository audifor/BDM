# BDM MatchEngine Next
# ME-NEXT 3: Man-to-Man Defense

## Status

**PASS.** Automated gates are complete and the human visual review of scenarios A-E passed after the debug scenarios were updated to expose live defensive movement.

## Base

```text
fcb0eaec41448ce31eb7baa55b7794a26e295651
```

Branch: `matchengine-next-3-man-defense`
Worktree: `C:\BDM-ME-NEXT-3`

## Assignment model

The defending team receives five stable 1:1 assignments. Valid matchup overrides are applied first. Remaining defenders and attackers are matched deterministically by primary-position distance, height, and defensive mobility, with player IDs as stable tie-breakers. Overall ratings and random selection are not used. Setup validates roster membership and duplicate defenders or attackers across the full matchup plan; inactive reserve overrides are retained and only applied while both players are active.

## Assignment stability

Assignments persist through ordinary passes and changes of ball side. A new matching is built only when the current lineup invalidates the assignments or the roster structure changes. The 32-pass fixture preserves all assignment IDs and emits one assignment-establishment event.

## Defensive responsibility model

Each active defender has one responsibility during live defense: `ON_BALL`, `GAP`, `HELP`, or temporary `RECOVER`. Decisions are `GUARD_BALL`, `GUARD_GAP`, `HELP_POSITION`, `RECOVER_TO_MAN`, and `RETREAT_TO_DEFENSE`. Defensive intents retain responsibility and decision provenance.

## guardPosition geometry

Targets use the defender's assigned attacker, the live ball, the defended basket, and the responsibility. Targets are court-clamped. They never read offensive slot targets. The defended basket comes from the canonical `attackingBasketForTeam` function for the opponent.

## ON_BALL

The assigned defender guards the held-ball owner from the basket side. During pass flight, the old handler remains the defended handler; the receiver's defender takes `ON_BALL` only after receipt.

## GAP

Defenders assigned to attackers within one pass shade toward the ball while staying near the basket-side guard position of their own assignment.

## HELP

Weak-side defenders assigned more than one pass away move deeper and toward the ball while retaining their assigned attacker. The target remains recoverable to that attacker.

## RECOVER

When a helper becomes one pass away, `RECOVER` points to the normal `GAP` guard target and persists until the defender physically gets close. Recovery uses the ordinary movement kinematics.

## Position authority

`integrateMatchPlayers` remains the only live player-position writer and advances both teams through the existing 0.1-second `PlayerKinematics` authority. Shot and rebound flight phases preserve defensive positions and responsibilities; they add no contest, box-out, or rebound behavior. Debug UI only renders MatchState positions and intents.

## MatchFrame

Each player exposes the defensive assignment, responsibility, decision, intent, and provenance. The frame also exposes scheme, assignments, defended basket, on-ball defender, and help defenders.

## Observer

`observeFrames` checks assignment completeness, invalid and duplicate assignments, unassigned attackers, responsibility/decision/intent provenance, assignment churn, on-ball and help distances, basket-side positioning, offensive-slot mirroring, court bounds, movement continuity, speed, acceleration, and braking.

## Technical Pass

- Focused Match Next and debug tests: **48 passed**.
- Affected repository files rerun serially: debug and `LiveMatchController`, **11 passed**.
- Full repository run with four workers: **439 passed, 2 failed, 1 skipped** across 442 files; **3,474 passed, 1 failed, 1 skipped** across 3,476 tests. The failures were the debug JSX transform (fixed) and one `LiveMatchController` substitution assertion. Both affected files passed serially afterward (11 tests total). The 14m26s full suite was not repeated after those targeted reruns.
- Typecheck: **PASS**.
- Build: **PASS**; Vite reports a large-bundle advisory.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: **PASS**.
- `cargo check --manifest-path src-tauri/Cargo.toml`: **PASS**.
- `git diff --check`: **PASS**.
- `Math.random` and production `Date.now`/`performance.now`: **none** in Match Next. Benchmark timing calls are test-only.
- React, Zustand, Tauri, or GameWorld imports in production `src/engine/match-next`: **none**.
- Diff against legacy `src/engine/match/`: **empty**.

## Behavioural Pass

Settled defensive fixture across 260 frames:

- Assignment completeness: **100%**.
- Invalid assignments / duplicates / unassigned attackers: **0 / 0 / 0**.
- Defenders without responsibility: **0**.
- Missing or invalid defensive intent, decision, and responsibility links: **0**.
- Assignment churn: **0**.
- ON_BALL median / P95 distance to assigned man: **1.05 m / 1.05 m**.
- GAP median / HELP median / overall defender-to-man mean: **1.12 m / 2.89 m / 1.81 m**.
- Wrong-side ON_BALL, movement teleports, kinematic violations, out-of-bounds, and invalid provenance: **0**.
- Anti-mirror test: **PASS**.
- ME-NEXT 1 ball and possession regressions: **PASS**.
- ME-NEXT 2 movement and 5OUT regressions: **PASS**.
- JSON serialization/resume and deterministic continuation: **PASS**.

## Visual Pass

**PASS — human confirmed A-E.** The prepared debug was reviewed at `http://127.0.0.1:1421/?matchNextDebug=1` after updating the scenarios in response to the report that defenders appeared stationary:

Scenarios no longer start after 70 settling ticks. A, B, and E start at the first SETUP tick. C schedules a real skip pass from that point to provoke weak-side HELP movement; D starts 24 MatchState ticks later with HELP active and schedules a pass that triggers physical recovery. Play and Step advance MatchState and its real kinematics; no UI interpolation supplies the movement. The human confirmed the resulting A-E visuals.

- **A:** Recognizable 5v5 man defense, assignments and inspector.
- **B:** Pass the ball to the weak side. Confirm the receiver's assigned defender takes ON_BALL on receipt while the five matchups remain fixed.
- **C:** Confirm weak-side HELP is visibly deeper and closer to the ball while retaining its assignment.
- **D:** Pass toward the helper's man. Confirm HELP -> RECOVER -> GAP is physical and the defender returns to his assignment.
- **E:** Confirm defense with the other basket orientation and use Check JSON resume.

Also check that assignments stay stable, defenders track their actual players without mirroring 5OUT, no unexplained 8-10 m gaps or teleports appear, and the inspector explains the selected defender's movement.

## Performance

Focused local benchmark sample:

- Full 5v5 offense plus MAN defense, 24,000 live ticks: **506.1 ms**, **47,417 ticks/s**, one assignment establishment, seven responsibility changes.
- Pass-heavy workload, 128 pass-flight ticks: **15.8 ms**, **8,078 ticks/s**, one assignment establishment, 146 responsibility changes.
- Comparable 10-player movement microbenchmark, 24,000 ticks: **116.5 ms**, **206,005 ticks/s**. ME-NEXT 2 recorded **105.9 ms** on the same harness; runtime measurements vary by load.

## Serialization

MatchState and MatchFrame remain JSON-safe. Scenario E and the defense recovery test compare continued simulation against JSON round-trips.

## Determinism

Assignment matching uses stable player-ID ordering and deterministic exhaustive matching. No random or wall-clock input is used by production Match Next.

## Deliberately absent

Steals, blocks, fouls, screens, pick-and-roll, switching, coverage systems, zone, autonomous offensive decisions, shot contests, rebounds, and renderer gameplay authority.

## Open questions

None introduced by this milestone. No GameWorld, save-schema, domain-schema, or legacy MatchEngine changes were required.
