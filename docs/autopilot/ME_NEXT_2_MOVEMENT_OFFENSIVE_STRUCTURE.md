# ME-NEXT 2 · Movement & Offensive Structure

## Status

VISUAL PASS: PASS (2026-09-26). Automated checks and focused behavioral gates pass. A and D were accepted in the initial review; after correcting B and C, the user re-reviewed and confirmed the debug is okay. Debug URL: `http://127.0.0.1:1420/?matchNextDebug=1`.

## Base

- Certified ME-NEXT 1 SHA: `ee38b9282ffb63f78942a2ea01e262d4541651a9`
- Branch: `matchengine-next-2-movement-offensive-structure`
- Worktree: `C:\BDM-ME-NEXT-2`

## Movement architecture

The canonical pipeline is structure → responsibility → structural decision → movement intent → kinematics → player position/velocity. There is no autonomous decision engine in this milestone.

- `structure/FiveOutStructure.ts` derives the five-out slots and attacking basket from the court, ball and team orientation.
- `structure/SlotAssignment.ts` deterministically assigns the four non-ball players to the four space slots.
- `structure/OffensiveStructure.ts` reconciles assignments, responsibility, decisions and intents with canonical possession and ball state.
- `responsibility/Responsibility.ts` defines BALL, SPACE and ADVANCE responsibilities and the OCCUPY_SLOT, HOLD_STRUCTURE and ADVANCE_BALL decisions.
- `movement/MovementIntent.ts` defines the serializable target, urgency, facing and provenance.
- `movement/PlayerKinematics.ts` is the sole normal live writer of offensive player position, velocity and facing. The kernel integrates movement at the fixed simulation tick and synchronizes a HELD ball to its moving owner afterward.

`MatchState` stores plain arrays and JSON-safe objects; no Map or Set is persisted. Initial state creation remains the fixture/setup exception. A source guard checks live position writers. The only live position and velocity writes are in `integrateOffensivePlayers`/`stepPlayerKinematics`.

## Kinematics

- Fixed tick: `0.1` game seconds.
- Speed: the supplied player profile's `maxSpeedMps`, scaled by intent urgency.
- Acceleration and braking: bounded by each player's `accelerationMps2` and `brakingMps2`; braking distance determines desired speed near the target.
- Urgency factors: walk `0.35`, jog `0.55`, run `0.80`, sprint `1.00` × max speed.
- Arrival: `0.15 m` target tolerance and `0.15 m/s` low-speed threshold; movement uses trapezoidal velocity integration and does not snap from a distance.
- Minimum separation: `0.6 m` soft steering target, capped at `0.35 m/s`; exact overlaps use a stable player-ID-derived direction.
- Court boundary: live positions are clamped to court geometry.

## Facing

Every active player has a normalized 2D facing vector. SPACE players face the ball; BALL and ADVANCE players face the attacking basket. TRAVEL follows velocity where selected. Facing remains simulation/debug state and does not implement body animation.

## Responsibilities and provenance

Every active offensive player has one base responsibility while the live possession structure is active. The ball handler has BALL during setup or ADVANCE while progressing the ball; teammates have one SPACE responsibility and unique slot each.

Example provenance:

```text
SPACE(WEAK_CORNER)
  → OCCUPY_SLOT (owner: offensiveStructure)
  → MovementIntent(target: derived weak-corner position, facing: BALL)
```

```text
ADVANCE
  → ADVANCE_BALL (owner: possession; no autonomous choice)
  → MovementIntent(target: frontcourt advance point, facing: BASKET)
```

Every intent contains both its responsibility ID and decision ID. The ball handler's setup decision is HOLD_STRUCTURE. All structural movement uses run urgency in this milestone; no speed randomness or player-choice AI is added.

## 5OUT structure

- Formation: `5OUT` with BALL, STRONG_CORNER, STRONG_SLOT, WEAK_SLOT and WEAK_CORNER.
- Four SPACE targets are derived from the ball, attacking basket, three-point arc and court dimensions. Targets have a `0.5 m` boundary margin and are checked for at least `3 m` pairwise spacing; the computed corner-to-slot spacing target is `3.2 m`.
- Attacking basket: home attacks right in periods 1–2 and left in periods 3–4; away attacks the opposite basket. The period-direction function repeats this two-period pairing.
- Strong/weak side: TOP is the upper half of the court (`y < court midpoint`), BOTTOM the lower half. A prior side is retained until the ball crosses `0.8 m` beyond the midpoint.
- Assignment: initial formation evaluates all `4!` player/slot assignments by player-to-target distance, with deterministic player-ID and fixed slot-order tie breaks. Later, every still-valid player/slot assignment is fixed; only unassigned players are matched by minimum distance to open slots. This retains valid assignments instead of using a distance penalty that can still permit a global reshuffle.
- Reassignment: occurs on first structure creation, ball-owner change, strong/weak flip or invalid prior assignment. On a side flip, strong/weak labels exchange for the retained physical lanes. On an owner change, the former BALL handler becomes SPACE at the nearest point on the attacking three-point arc; that point anchors the receiver's vacated slot while the three other SPACE players retain their lanes. The anchor is stored in MatchState and remains a real movement target. Ball movement otherwise updates unanchored target positions without slot churn.

## ADVANCE → SETUP

The handler's advance point is the court midpoint shifted `2 m` toward the attacking basket. The holder and HELD ball move through normal kinematics. After the owner physically crosses `0.5 m` into the offensive frontcourt, possession changes from ADVANCE to SETUP. The active possession ID and shot clock are preserved; this transition does not reset the shot clock.

## MatchFrame

The immutable projection exposes each player's position, velocity, facing, kinematic profile, responsibility, structural decision and movement intent, alongside global responsibility/decision/intent arrays and the current five-out structure. It does not share mutable simulation objects with MatchState.

## Observer

The observer checks player and ball continuity, speed/acceleration/braking limits, court bounds, movement without intent, decision/responsibility/intent provenance, responsibility cardinality, 5OUT assignment uniqueness, slot spacing, long target distance, held-ball attachment, possession and clocks. It also reports spacing percentage, slot churn and movement teleports.

## Technical Pass

Focused Match Next engine and debug-view tests: **40 passed** across 3 files after the B/C corrections. Movement and ball/possession checks report:

```text
movement teleports: 0
speed-bound violations: 0
acceleration/braking violations: 0
out-of-bounds positions: 0
movement without intent: 0
intent without decision/responsibility: 0
decision without responsibility: 0
invalid responsibility counts: 0
invalid slot assignments: 0
ME-NEXT 1 ball invariant violations: 0
ME-NEXT 1 possession invariant violations: 0
```

`npm run typecheck`, `npm run build`, `cargo fmt --check --manifest-path src-tauri/Cargo.toml`, `cargo check --manifest-path src-tauri/Cargo.toml` and `git diff --check` pass. The build reports the existing large-chunk advisory.

The full parallel repository run completed with 425 test files passing, 1 skipped and 15 files containing 25 failures/timeouts (out of 441 files and 3,469 tests). Affected files were `src/save/GameWorldSaveV4.test.ts`, `src/app/game/ContinueFlow.test.ts`, `src/app/game/createAcbTestGame.test.ts`, `src/app/game/LiveMatchController.test.ts`, `src/app/game/simulateUntilDate.test.ts`, `src/app/game/startNextSeason.test.ts`, `src/app/staffHumanState/StaffHumanState.integration.test.ts`, `src/engine/coach/CoachReputationConsequences.test.ts`, `src/engine/draft/DraftEngine.test.ts`, `src/engine/memory/MemoryEngine.test.ts`, `src/engine/scouting/DelegatedScouting.test.ts`, `src/engine/season/SeasonProgression.test.ts`, `src/engine/staff/StaffPoliticalCaseEngine.test.ts`, `src/engine/staff/StaffPoliticalPositionEngine.test.ts` and `src/ui/screens/StaffScreen.test.ts`. The 25 affected test cases were rerun filtered and serially with one worker: **25 passed**. `src/app/game/LiveMatchController.test.ts` was also rerun separately: **10 passed**. No unrelated tests were changed.

The Match Next scan found `performance.now()` only in tests used for benchmarks, and React/Zustand/Tauri/GameWorld matches only in a test asserting the production boundary. No `Math.random`, wall-clock calls or UI/application imports were found in production Match Next. `git diff ee38b9282ffb63f78942a2ea01e262d4541651a9 -- src/engine/match` is empty.

## Behavioural Pass

- Settled 5OUT spacing at least 3 m: **100%**; minimum measured spacing `3.20 m`.
- Maximum continuous time more than 6 m from an assigned target: **0.5 s**.
- Stable-structure slot churn: **0**.
- BALL-owner changes: tested through legal pass receipt; the former handler receives a SPACE assignment.
- Strong/weak flips: tested, including hysteresis.
- B continuity: after the simultaneous owner/side change, the former handler's SPACE target is within `6 m` and on the attacking three-point arc, the three continuing spacers retain their physical targets within `1.1 m`, and all four targets still pass court bounds and 3 m spacing validation.
- C uses equal `6.3 m` starting distances and realistic profiles spanning max speed `4.8-6.2 m/s`, acceleration `2.3-4.0 m/s^2`, and braking `3.0-5.0 m/s^2`. Its panel reports peak speed, acceleration, braking and settled arrival time measured from recorded MatchState snapshots.
- ADVANCE → SETUP: tested in both attacking directions without teleport or shot-clock reset.
- Athletic-profile travel-time difference: tested with equal-distance profiles.

Observed maxima in the behavioral fixture: speed `4.95 m/s`, acceleration `3.20 m/s²`, braking `4.00 m/s²`.

## Visual Pass

**VISUAL PASS: PASS (2026-09-26).** A and D were accepted in the initial review. After the B/C corrections below, the user re-reviewed the debug and confirmed it is okay. Scenario E serialization/resume is covered by automated tests.

Human review corrections: B assigns the former handler a SPACE target at the nearest valid point on the attacking three-point arc, rather than sending him to the receiver's vacated physical location. The three other spacers retain their physical lanes through the strong/weak flip, and valid anchors carry across later passes. C starts with equal `6.3 m` runs and reports acceleration, peak speed, braking and settled arrival from recorded MatchState snapshots. Profiles in A, B, D and E remain unchanged.

## Performance

Measurements use the same focused test harness on this machine; allocations were not directly counted.

| Workload | ME-NEXT 1 | ME-NEXT 2 |
| --- | ---: | ---: |
| Clock-only regulation, 24,000 ticks | `3.2 ms/game` | `6.4 ms/game` |
| Ball-heavy script | `2,410 ticks`, 907 events, `5.6 ms` | `610 ticks`, 908 events, `19.9 ms` |
| 10 players moving, 24,000 ticks | — | `105.9 ms` (`226,558 ticks/s`) |
| Structure-heavy | — | `128` pass-flight ticks, `55` reassignments, `4.0 ms` |

The ball-heavy fixture has similar event counts but different tick counts because movement is integrated in ME-NEXT 2. That script measured `19.9 ms`; the full 10-player, 24,000-tick movement workload measured `105.9 ms` in the latest run.

## Deliberately absent

Defense, autonomous basketball decisions, screens/cuts/P&R/drives/post-ups, transition offense, advanced actions, legacy event projection, GameWorld/save-schema changes, and renderer gameplay authority.

## Open questions

- Competition-owned shot-clock configuration and offensive-rebound reset remain unresolved from ME-NEXT 1; this milestone leaves them untouched.
- No new product or architecture decision was required by movement and 5OUT.

## Next milestone

ME-NEXT 3 · Man-to-Man Defense.
