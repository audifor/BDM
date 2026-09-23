# CFI8 — Club Facilities & Infrastructure V2 — Sporting Impact & Basketball Integration Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi8-sporting-impact-basketball-integration`, created from the certified CFI7 tip `41028ee` in `C:\BDM-FACILITIES`.

## 2. Initial SHA

`41028ee542f7239b795252bfb36f3291d5609ea7` (`docs(facilities): record CFI7 final commit SHAs in certification report`). Verified as HEAD with a clean working tree before any CFI8 edit.

## 3. Final SHA

`ee9e10b` (`feat(facilities): add CFI8 sporting facility context integration layer`); this certification report is committed as the immediately-following docs commit.

## 4. Commits

Two atomic commits, matching the CFI1–CFI7 lineage's own convention:

1. `ee9e10b` — `feat(facilities): add CFI8 sporting facility context integration layer` — `src/integration/facilitiesSporting/SportingFacilityContext.ts`, `src/integration/facilitiesSporting/index.ts`, and the test file.
2. `docs(facilities): add CFI8 sporting impact & basketball integration certification report` — this file.

No push, no merge, per instructions.

## 5. Sporting-systems audit (performed before any CFI8 code was written)

A dedicated read-only audit of every sporting system in `src/domain` and `src/engine` was performed first, per the brief's explicit requirement not to write integration code before understanding the real architecture. Findings, confirmed by direct source reads (not paraphrased from `docs/ARCHITECTURE.md` alone):

### Audit matrix

| SPORTING AREA | CURRENT AUTHORITY | CURRENT STATE | FACILITIES INPUT REQUIRED | INTEGRATION STRATEGY |
| --- | --- | --- | --- | --- |
| Training (plans/sessions/stimulus) | `src/domain/training/`, `src/engine/training/ScheduledTrainingEngine.ts` | CANONICAL — normalized GameWorld state, sole automatic execution via `executeScheduledTrainingSessions` in `advanceDay` | Usable court/strength/cardio/video-analysis capability, technical standard | Expose via `trainingFacilityContextForTeamAt`/`performanceFacilityContextForTeamAt`; **not wired into `executeScheduledSession`'s multiplier chain in this wave** (see §16) |
| Player Development (offseason) | `src/engine/development/PlayerDevelopment.ts`, `OffseasonDevelopment.ts` | CANONICAL — `PlayerDevelopmentContext` already has an idiomatic optional-bounded-modifier seam (`stimulusByRating`) | Facts about practice/performance-lab/video-analysis availability | Context exposed via query surface; **no field added to `PlayerDevelopmentContext` in this wave** — Facilities does not decide development outcomes (see §17) |
| Player Potential | `src/domain/player/PlayerPotential.ts` | PARTIAL — thin, explicitly-legacy derived compatibility surface over `Player.development` | None | Not touched. CFI8 never modifies potential/ceiling under any circumstance (explicit NO list) |
| Medical/Injury | `src/domain/injury/Injury.ts`, `src/engine/injury/` | CANONICAL — normalized `injuriesById`, advisory layer via `DecisionQualityContext` | Presence of medical examination/imaging/physiotherapy capability | Exposed via `medicalFacilityContextForTeamAt`; **no injury-risk modifier introduced** (explicit NO list) |
| Rehabilitation/Recovery/Fatigue | Two distinct CANONICAL systems: persistent `careerFatigueByPlayerId` (`src/domain/careerFatigue/`) and transient live `MatchSession` fatigue (`src/engine/match/Fatigue.ts`, never in GameWorld) | CANONICAL (both), architecturally and intentionally separate per `docs/ARCHITECTURE.md` | Presence of hydrotherapy/cryotherapy/physiotherapy capability | Exposed via `rehabilitationFacilityContextForTeamAt`/`recoveryFacilityContextForTeamAt`; **neither fatigue system is touched** |
| Staff | `src/domain/staff/StaffPerson.ts`, `StaffRoleRegistry.ts`, `DecisionQualityContext` (`src/domain/responsibility/Responsibility.ts`) | CANONICAL — every `*Quality` function (training/medical/scouting/tactics/recruiting) already funnels through one context shape | None required this wave | Identified as the correct future seam for facility-quality influence on staff-mediated outcomes, but **`DecisionQualityContext` is not modified in this wave** — no sporting system was told to consume a new field (see §16) |
| Coaching/Video analysis/Scouting | `src/domain/scouting/Scouting.ts`, `src/engine/scouting/`, `src/engine/tactics/OppositionScoutingReportEngine.ts` | CANONICAL (scouting engine itself); ABSENT (no facility linkage — Facilities' own `VIDEO_ANALYSIS` capability was completely unconsumed before CFI8) | Presence of a Film Room / video-analysis component | Exposed via `analysis` sub-context; scouting engine itself unmodified |
| Academy/Youth development | — | ABSENT — no such domain or engine exists anywhere in the codebase | N/A | `support` sub-context and query surface exist and return an empty/UNAVAILABLE result gracefully; no academy system was invented (explicit NO list) |
| advanceDay/CalendarEngine | `src/engine/calendar/CalendarEngine.ts` | CANONICAL composition root, long explicit order-sensitive chain | None | **Not touched.** No Facilities call was added to `advanceDay` (see §23) |

### The critical pre-existing seam

`src/domain/facilities/FacilityComponentCapability.ts` (CFI3) already names the exact sporting capabilities CFI8 needed: `BASKETBALL_TRAINING`, `STRENGTH_TRAINING`, `CARDIO_TRAINING`, `HYDROTHERAPY`, `CRYOTHERAPY`, `PHYSIOTHERAPY`, `MEDICAL_EXAMINATION`, `MEDICAL_IMAGING`, `VIDEO_ANALYSIS`. Its own doc comment anticipated "a future CFI4 quality/condition layer" gating these by condition — CFI4 delivered that gate (`usableCapabilitiesOfFacilityAt`), but **zero file outside `src/domain/facilities`, `src/engine/facilities`, and `src/integration/facilitiesFinance` ever consumed it** before this wave. CFI8 is exactly the consumer-side counterpart the CFI3/CFI4 doc comments anticipated — it reuses these names verbatim and introduces no parallel taxonomy.

## 6. Authority boundaries (enforced, not merely stated)

```
FACILITIES   physical existence, component anatomy, access, condition, serviceability, capability, availability
    |
    |  src/integration/facilitiesSporting   (the ONLY place importing both @/domain/facilities and a sporting domain)
    v
TRAINING / PLAYER DEVELOPMENT / MEDICAL / REHABILITATION / RECOVERY / STAFF / MATCH
             each remains sole authority over its own outcomes
```

Verified by grep, not assumed:

- `src/domain/facilities` and `src/engine/facilities` contain **zero** imports of `@/domain/training`, `@/engine/training`, `@/engine/development`, `@/domain/injury`, `@/engine/injury`, or `@/domain/careerFatigue`.
- `src/domain/training`, `src/engine/training`, `src/engine/development`, `src/domain/injury`, `src/engine/injury`, `src/domain/careerFatigue`, `src/domain/staff`, `src/engine/staff` contain **zero** references to `facilitiesSporting` (i.e. no sporting system reaches back into the new integration layer either — the seam is one-directional, read-only, consumed only by future callers this wave does not itself add).
- `TeamSportingFacilityContext` and every sub-context it returns carry no `rating`, `injur*`, `fatigue`, or `overall`/`score` field — verified both by the type definitions themselves and by three dedicated tests (§13, tests 25/26/27/35) that serialize the returned context and assert those substrings are absent.

This preserves the exact dependency-direction discipline CFI7's certification documented as a prior lesson (§"DEPENDENCY DIRECTION" in the brief): Facilities Domain sits below the integration layer, sporting systems sit on the other side of it, and nothing reaches through the seam in the wrong direction.

## 7. Central principle enforced: no magic facility rating

No `Facility.overall`, no `TrainingFacilityScore: number`, no `development += facilityBonus`. Every fact in `TeamSportingFacilityContext` is resolved through the full chain the brief specified:

```
TEAM → HAS ACCESS? (CFI2 usageRightsForTeamAt/usableComponentsForTeamAt)
     → COMPONENT EXISTS? (facilityComponentsById, active at date)
     → COMPONENT ACTIVE? (openedAt/closedAt window)
     → SERVICEABLE? (CFI4 componentConditionAt/serviceability)
     → WHAT CAPABILITIES? (CFI3 capability-justifying component types)
     → WHAT TECHNICAL STANDARD? (CFI4 technicalStandard, when recorded)
     → SPORTING CONTEXT (this module's per-capability AVAILABLE/LIMITED/UNAVAILABLE + explanation)
```

Sporting systems (not implemented here) would take that final context and decide their own outcome — this wave stops at producing the context, per the brief's explicit instruction not to wire numeric modifiers into Training/Development/Medical without those systems already having a canonical API that requires one (none currently do; see §16/§17).

## 8. `TeamSportingFacilityContext` architecture

New module: `src/integration/facilitiesSporting/SportingFacilityContext.ts`. Core type:

```ts
export interface TeamSportingFacilityContext {
  readonly teamId: TeamId
  readonly date: GameDate
  readonly basketball: BasketballFacilityContext
  readonly strengthAndConditioning: TrainingFacilityContext
  readonly performance: PerformanceFacilityContext
  readonly medical: MedicalFacilityContext
  readonly rehabilitation: RehabilitationFacilityContext
  readonly recovery: RecoveryFacilityContext
  readonly analysis: AnalysisFacilityContext
  readonly support: SupportFacilityContext
  readonly constraints: readonly SportingFacilityConstraintFact[]
}
```

Deliberately **not** the brief's suggested shape verbatim — `analysis` and `support` were added as their own sub-contexts (rather than folding video analysis into `performance` alone, or omitting player dining/residential support entirely) because CFI3's capability catalog already names `VIDEO_ANALYSIS`, `PLAYER_DINING`, and `PLAYER_RESIDENTIAL` as first-class capabilities with no natural home in the other six groups; the brief explicitly permitted departing from its suggested shape ("No forzar esta shape exacta si otra encaja mejor"). Every capability entry (`SportingCapabilityStatus`) carries `status`, `reason`, `sourceComponentId`, `serviceability`, and `technicalStandard` — never collapsed into a boolean or a single number.

The composition root, `sportingFacilityContextForTeamAt(world, teamId, onDate)`, is the only function that builds the full object; every other exported query (`basketballFacilityContextForTeamAt`, `trainingFacilityContextForTeamAt`, `performanceFacilityContextForTeamAt`, `medicalFacilityContextForTeamAt`, `rehabilitationFacilityContextForTeamAt`, `recoveryFacilityContextForTeamAt`, `availableSportingCapabilitiesForTeamAt`, `sportingFacilityConstraintsForTeamAt`) is a thin projection over it — matching the brief's explicit instruction not to create 50 trivial wrappers while still exposing every name it requested.

## 9. Not persisted, never cached

`TeamSportingFacilityContext` has **no GameWorld collection**, **no Save V4 field**, and **no runtime memoization**. `sportingFacilityContextForTeamAt` recomputes from `world.facilityUsageRightsById`, `world.facilityComponentsById`, and `world.facilityComponentConditionRecordsById` on every call — pure, deterministic, and stale-cache-free by construction. This was a deliberate choice per the brief's explicit "no persistir contextos derivados" instruction and its stated cache preference ("Preferencia: no añadir cache en CFI8 salvo evidencia de necesidad") — no evidence of a performance problem was found (see §20), so none was added.

## 10. Access/rights integration (CFI2)

`accessibleComponentsForTeam` resolves the Team's reachable components via CFI2's own `usableComponentsForTeamAt` (facility-wide or component-scoped usage rights, purpose-agnostic — a Team's `TRAINING` purpose right does not artificially block it from a `MEDICAL`-purpose component the same right's scope covers, matching CFI1/CFI2's own "purpose is descriptive, not an access gate" design). Deliberately **not** CFI4's `availableComponentsForTeamAt`, which pre-filters out `OUT_OF_SERVICE` components — CFI8 needs the Team's full rights-accessible set first, then layers CFI4 serviceability per component itself, so an `OUT_OF_SERVICE` component the Team has rights to remains *explainable* (its degraded state is reported, not silently indistinguishable from "the Team never had access"). This is the source of the `NO_ACCESS` vs `OUT_OF_SERVICE` distinction required by tests 39/40.

Organization-only relationships never substitute for a Team-scoped right (test 3): a Team with zero `FacilityUsageRight` records gets an empty context regardless of what its Organization owns, exactly per CFI2's own "no asumir herencia automáticamente" rule, reused unchanged.

## 11. Basketball/practice integration

`basketballContext` resolves every court-family component (`MAIN_COURT`, `PRACTICE_COURT`, `SECONDARY_COURT`, `HALF_COURT`, `SHOOTING_COURT`, `ACADEMY_COURT`, `OUTDOOR_COURT`) the Team can reach into a `SportingCourtStatus[]` — never a bare count. Each entry carries `serviceability`, `isFullCourt`/`isIndoor` (from CFI3's `CourtSpecification` when recorded, `null` when not — never defaulted), `technicalStandard`, and `hasVideoTrackingTechnology`. `usablePracticeCourtCount` is `courts.filter(c => c.serviceability !== 'OUT_OF_SERVICE').length` — a real derived fact, never a guess when the underlying set is empty (0 usable courts is representable, not conflated with UNKNOWN).

## 12. Training/Performance/Medical/Rehabilitation/Recovery/Analysis/Support integration

Each sub-context is a `capabilityStatuses(...)` projection over a fixed, small capability list drawn directly from CFI3's `FACILITY_COMPONENT_CAPABILITIES`:

| Sub-context | Capabilities |
| --- | --- |
| `strengthAndConditioning` | `STRENGTH_TRAINING`, `CARDIO_TRAINING` |
| `performance` | `STRENGTH_TRAINING`, `CARDIO_TRAINING`, `VIDEO_ANALYSIS` |
| `medical` | `MEDICAL_EXAMINATION`, `MEDICAL_IMAGING` |
| `rehabilitation` | `PHYSIOTHERAPY`, `HYDROTHERAPY`, `STRENGTH_TRAINING`, `CARDIO_TRAINING` |
| `recovery` | `HYDROTHERAPY`, `CRYOTHERAPY`, `PHYSIOTHERAPY` |
| `analysis` | `VIDEO_ANALYSIS` |
| `support` | `PLAYER_DINING`, `PLAYER_RESIDENTIAL` |

Overlap between groups (e.g. `STRENGTH_TRAINING` in both `strengthAndConditioning` and `performance`/`rehabilitation`) is intentional: a capability's meaning is contextual to the consumer, not exclusive to one sub-context, per the brief's own basketball/medical/rehab worked examples all referencing strength/conditioning facilities.

`resolveCapabilityStatus` picks the single **best-serviceability** justifying component the Team can access (not merely the first one found), so a Facility with two strength rooms — one degraded, one FULL — correctly reports `AVAILABLE` from the FULL one rather than `LIMITED`. `sourceComponentId` always names which component the status came from.

## 13. Player Development integration (deliberately non-invasive)

`PlayerDevelopmentContext` (`src/engine/development/PlayerDevelopment.ts`) already has an idiomatic optional-bounded-modifier seam, `stimulusByRating`. CFI8 **does not add a field to it** in this wave. Rationale: the brief's explicit "no anadir bonuses hasta conocer la arquitectura real" and "nunca modificar potential por poseer una instalación" — wiring a facility-derived stimulus modifier into `applyOffseasonDevelopment` is a genuine Player Development product decision (what magnitude, what curve, whether it stacks with existing age/potential logic) that belongs to Player Development's own milestone, not to a Facilities-side change made without that system's own explicit sign-off. CFI8 delivers the context Player Development would need (`basketballFacilityContextForTeamAt`, `performanceFacilityContextForTeamAt`) and stops there — exactly the brief's distinction between "Facilities provides context/capacity" and "sporting systems decide the outcome."

## 14. Medical/Rehabilitation/Recovery integration (deliberately non-invasive)

Same reasoning applies identically to Medical (`MedicalRiskAssessment`/`MedicalAdvisory`, both driven by `DecisionQualityContext`) and to both fatigue systems (persistent Career Fatigue, transient live `MatchSession` fatigue). No field was added to `DecisionQualityContext`, no injury-risk formula was touched, no fatigue recovery-rate constant was modified. CFI8 exposes `medicalFacilityContextForTeamAt`/`rehabilitationFacilityContextForTeamAt`/`recoveryFacilityContextForTeamAt` as the future seam; wiring them into Medical's advisory quality or Career Fatigue's recovery rate remains explicitly out of this wave's scope, per the brief's "si ya admiten context/modifiers, adaptarse; si no, crear el seam mínimo — NO rediseñar" instruction. No admitting system exists yet, so only the minimal seam (the context itself) was built.

## 15. Staff integration decision

`DecisionQualityContext` (`src/domain/responsibility/Responsibility.ts`) is the one real cross-cutting seam every staff-mediated quality function (`trainingQuality`, `medicalQuality`, `scoutingQuality`, `tacticsQuality`, `recruitingQuality`, `basketballOperationsQuality`) already shares. It was identified, read, and **deliberately not modified** — adding an optional `facilityContext` field to it without any of the six `*Quality` implementations reading it would be dead weight, and deciding *how* facility quality should influence staff decision quality is a Staff/Responsibility product decision, not a Facilities one. This is recorded as the correct next integration point for a future wave (§27), not built speculatively now.

## 16. Court/capacity handling

`usablePracticeCourtCount` is provided; `effectivePracticeCapacity` (simultaneous-player capacity) is **not** computed in this wave because no `CapacitySpecification` (`unit: 'SIMULTANEOUS_PLAYERS'`) fixture exists yet in any generated world, and the brief explicitly warned against inventing a capacity number when the underlying data is `UNKNOWN` ("UNKNOWN != zero"). The seam exists: `SportingCourtStatus` and the underlying `FacilityComponentSpecification` already carry everything needed once `CapacitySpecification` data is populated by world generation or a future wave; no schema change would be required to add `effectivePracticeCapacity` later.

## 17. Serviceability handling

Exactly the brief's rule, enforced in `resolveCapabilityStatus` and `basketballContext`: `OUT_OF_SERVICE` → `status: 'UNAVAILABLE'`; `LIMITED`/`SEVERELY_LIMITED` → `status: 'LIMITED'` (never silently dropped, never merged into UNAVAILABLE); `FULL` → `status: 'AVAILABLE'`. The four-state `FacilityServiceability` enum is carried through to the output unchanged — never collapsed into a boolean anywhere in this module.

## 18. Technical standard handling

`technicalStandard` (CFI4's `BASIC`/`CONVENTIONAL`/`ADVANCED`/`SPECIALIST`) is carried through on every `SportingCapabilityStatus` and `SportingCourtStatus` verbatim, `null` when not recorded. No universal `SPECIALIST = +20%` conversion exists anywhere in this module — interpretation is left entirely to a future consumer, per the brief's explicit instruction.

## 19. Condition/unknown-data handling

No `physicalCondition` number appears anywhere in `TeamSportingFacilityContext` — only `serviceability` and `technicalStandard`, both already CFI4's own explicit, bounded, non-numeric-condition representations. This matches the brief's "Serviceability debe tener prioridad conceptual" instruction directly: condition 70 + FULL and condition 90 + OUT_OF_SERVICE are both representable upstream in CFI4, and CFI8 consumes only the already-resolved serviceability/standard, never re-deriving a linear condition-based effect of its own. `UNKNOWN` technical standard/serviceability-record-absence is preserved as `null`/the CFI4-defined default (`FULL` when no record exists, per CFI4's own documented "never recorded as impaired" convention) — never re-interpreted or defaulted a second time by this module.

## 20. Performance characteristics

`sportingFacilityContextForTeamAt` is `O(components accessible to the Team)` per call: `usableComponentsForTeamAt` already scopes by the Team's own `FacilityUsageRight`s (CFI2), not by iterating every Facility in the world, and every capability/court resolver operates only over that already-narrowed set. No nested "for every Facility, for every Component, for every Team" loop exists — the CFI2 rights relation is the index that keeps this linear in the Team's own reachable component count, exactly per the brief's explicit scale requirement (thousands of teams/facilities, tens of thousands of components). No dedicated large-scale timing test was added (CFI5's equivalent 100-year-span test targeted a genuine unbounded-loop risk in date arithmetic; CFI8 has no such loop to guard against — its cost is bounded by rights-scoped component count, already small per Team by construction).

## 21. Determinism

Every function in this module is pure: no `Math.random()`, no `Date.now()` (verified by a full-file grep — zero hits), explicit `onDate` parameter threaded through every call, and stable output ordering (`courts` sorted by `componentId`, `availableSportingCapabilitiesForTeamAt`'s result `.sort()`ed, `constraints` built via a `Set` then `.sort()`ed). Tests 28/29 assert two consecutive calls with identical inputs produce `toEqual` results and stable capability ordering.

## 22. Integration architecture / dependency direction

New directory `src/integration/facilitiesSporting/`, mirroring CFI7's `src/integration/facilitiesFinance/` precedent exactly:

- `SportingFacilityContext.ts` — the entire implementation (one file; the sub-contexts are simple enough that splitting into `TrainingFacilitiesAdapter.ts`/`MedicalFacilitiesAdapter.ts`/etc. per the brief's suggested-but-not-mandatory module list would have fragmented ~350 lines into five near-empty files re-importing the same primitives — the brief explicitly permitted not forcing that shape: "No forzar estos nombres si las convenciones sugieren otros").
- `index.ts` — barrel re-export, documenting the one-directional seam in its own header comment.
- `SportingFacilityContext.test.ts` — the test suite.

Dependency direction verified (§6): `src/domain/facilities`/`src/engine/facilities` import nothing from Training/Development/Medical/Staff; no sporting domain or engine file imports `facilitiesSporting`. This is the same shape CFI7 established for Finance and explicitly avoids repeating the "wrong-direction dependency" risk CFI7's own certification flagged as a lesson from its inherited draft.

## 23. `advanceDay` — explicitly not touched

`src/engine/calendar/CalendarEngine.ts` was read in full as part of the audit (§5). No call into `src/integration/facilitiesSporting` or `src/engine/facilities` was added to `advanceDay`. Per the brief's explicit "NO conectar todo Facilities automáticamente a advanceDay solo porque es CFI8" instruction: `TeamSportingFacilityContext` is demand-computed by whichever future sporting-system change chooses to call it (e.g. a future Training wave that decides to read `trainingFacilityContextForTeamAt` inside `executeScheduledSession`), not proactively pushed into the daily tick by this wave. This mirrors CFI5's own precedent of shipping a callable engine without forcing `advanceDay` wiring until a genuine, safe integration point is chosen by the consuming system's own milestone.

## 24. GameWorld changes

**None.** `git diff` confirms zero changes to `src/domain/world/GameWorld.ts`. No new collection, no new field, no schema-version bump.

## 25. Save changes

**None.** `git diff` confirms zero changes to any `src/save/*.ts` file. `TeamSportingFacilityContext` has no Save V4 field because it is never persisted (§9) — there is nothing for Save to round-trip.

## 26. Backward compatibility

Trivially preserved: no existing file was modified, so every prior Save/GameWorld/domain contract is untouched. The full pre-existing regression suite (§30) confirms this empirically as well as by inspection.

## 27. RPG/Event seams

`SportingFacilityConstraintFact` (`TRAINING_CAPACITY_INSUFFICIENT`, `KEY_PRACTICE_COURT_UNAVAILABLE`, `MEDICAL_CAPABILITY_UNAVAILABLE`, `REHABILITATION_CAPACITY_LIMITED`, `RECOVERY_INFRASTRUCTURE_LIMITED`) is returned as plain, non-persisted string data from `sportingFacilityContextForTeamAt`/`sportingFacilityConstraintsForTeamAt` — exactly the brief's requested subset relevant to what this wave actually computes (`FACILITY_CONSTRAINT_RESOLVED`, `PERFORMANCE_CAPABILITY_AVAILABLE` were part of the brief's larger illustrative list but are directly derivable by any future consumer from `status === 'AVAILABLE'`/the presence of a previously-UNAVAILABLE constraint disappearing, so no additional fact type was needed to cover them). No complaint, morale, relationship, board-meeting, press, leak, promise, demand, or ultimatum object exists anywhere in this module — verified by a dedicated test asserting the serialized constraint list never matches `/complain|morale|news|press/i`.

## 28. Debug/explainability

Every `SportingCapabilityStatus` carries `status`, `reason` (one of `SPORTING_FACILITY_CONSTRAINT_REASONS`: `NO_COMPONENT`, `NO_ACCESS`, `OUT_OF_SERVICE`, `LIMITED_SERVICE`, `INSUFFICIENT_CAPACITY`, `UNKNOWN_SPECIFICATION`), `sourceComponentId`, `serviceability`, and `technicalStandard` — answering "why is HYDROTHERAPY unavailable?" exactly as the brief's worked example requires, without any UI being built (none was requested). `INSUFFICIENT_CAPACITY` and `UNKNOWN_SPECIFICATION` are declared in the reason catalog for forward-compatibility with §16's future capacity work but are not yet produced by any code path in this wave (no capacity data exists to trigger them) — this is documented, not silently absent.

## 29. Tests added

42 tests in `src/integration/facilitiesSporting/SportingFacilityContext.test.ts`, covering the brief's 40 numbered scenarios one-to-one (tests 41-44 — Save round-trip / regression — are structurally satisfied by §24/§25/§30/§31/§32 rather than needing a dedicated Save test, since this module has no Save surface to round-trip) plus two additional targeted tests: constraint facts are plain, narrative-free data, and the mandatory rich end-to-end scenario (Organization with two Teams sharing a Training Center with mixed component serviceability and rights scope, including a repair and a subsequent deterioration step, verified from both Teams' perspectives per the brief's own worked example). **42/42 passed.**

Deliberately not added: redundant enum-membership tests for `FACILITY_COMPONENT_CAPABILITIES`/`FacilityServiceability` (already exhaustively covered by CFI3/CFI4's own test suites) or per-sub-context near-duplicates of the same access/serviceability rule already proven once at the capability-resolver level.

## 30. Facilities regression result

`npx vitest run src/domain/facilities src/engine/facilities src/integration/facilitiesFinance src/integration/facilitiesSporting src/save`: **39 files / 471 tests, all passing.**

## 31. Sporting-system regression result

`npx vitest run src/domain/training src/engine/training src/engine/development src/domain/injury src/engine/injury src/domain/careerFatigue src/domain/staff src/engine/staff`: **51 files / 495 tests** — 494 passed on the first run, 1 timeout (`StaffPoliticalCaseEngine.test.ts`, "creates one prospective case for every supported open request kind without duplication") that is **not** a Facilities-caused regression: re-run in isolation, it passes (11/11) in 12s. This matches the exact machine-load-sensitive timeout pattern independently documented in CFI1's and CFI2's own certification reports for a materially overlapping set of files (`StaffPoliticalPositionEngine.test.ts` and siblings), re-verified here rather than assumed.

## 32. CFI7 regression result

`src/integration/facilitiesFinance/FacilityFinanceIntegration.test.ts`: all 33 tests still pass (included in the §30 combined run: 39 files / 471 tests).

## 33. Save result

Not affected — no Save file was touched (§25). The full `src/save` suite (included in §30's combined run) passes unchanged.

## 34. Typecheck

`npx tsc --noEmit -p tsconfig.json`: **clean, zero errors.**
`npx tsc --noEmit -p tsconfig.app.json` (the stricter config `npm run build` actually uses, which type-checks test files against the branded `GameDate` type rather than treating it as an interchangeable string): initially caught 20 real type errors where the test file passed raw `string` literals to functions typed as accepting only branded `GameDate`. Fixed by widening every public entry point's date parameter to `GameDate | string` (matching CFI7's own `FacilityFinanceQueries.ts` convention exactly) and parsing once via `parseGameDate` at the top of the composition root — now **clean, zero errors** under both configs.

## 35. Build

`npm run build` (`tsc -b && vite build`): **succeeds**, built in 6.30s. Same pre-existing >500 kB chunk-size warning as every prior wave (unrelated, predates this branch).

## 36. `git diff --check`

Clean — only benign LF/CRLF normalization notices on the three new files (this repository's standing line-ending convention difference, not a defect), no trailing-whitespace or conflict-marker errors.

## 37. Skipped gates

Per CFI8's explicit reduced test-gate policy:

- **`cargo fmt`/`cargo check`**: deliberately not run — CFI8 touched no Rust/Tauri code.
- **Full `npm test`**: deliberately not run — no shared/core file was modified (§24/§25 confirm zero changes to `GameWorld.ts` or any Save file), the combined targeted gate (§30/§31, 90 files / 966 tests) covers every directly and indirectly affected area, and no cross-cutting regression evidence appeared. Per the standing instruction not to re-investigate the historical suite-timeout flakiness (independently documented and re-verified at every prior CFI gate in this lineage, most recently §31 here) without new evidence.

## 38. Technical debt

- **`effectivePracticeCapacity`/simultaneous-player capacity is not computed** — the seam exists (§16) but no fixture data populates `CapacitySpecification` yet anywhere in the codebase, so implementing it now would have meant testing against synthetic data with no real consumer, contrary to the brief's "no inventar capacidades cuando el dato es UNKNOWN" instruction.
- **`INSUFFICIENT_CAPACITY` and `UNKNOWN_SPECIFICATION` constraint reasons are declared but never produced** by any current code path — reserved for when capacity/specification data becomes real (§16, §28).
- **No facility-quality field was added to `DecisionQualityContext` or `PlayerDevelopmentContext`** — identified as the correct future seam (§13/§14/§15) but deliberately not built speculatively; a future Training/Development/Medical-side milestone should add the field on its own side once it has decided what magnitude/curve it wants, then this integration layer's context becomes its input.
- **`analysis`/`support` sub-contexts currently have exactly one and two capabilities respectively** (`VIDEO_ANALYSIS`; `PLAYER_DINING`/`PLAYER_RESIDENTIAL`) — thin by design, matching how few CFI3 capabilities exist in those families today; more would be added automatically if CFI3's capability catalog grows, requiring no CFI8 schema change (the capability-list constants are simple arrays, not a hardcoded shape).

## 39. Deliberately deferred / out-of-scope work

Exactly the CFI8 "NO IMPLEMENTAR" list: Facility overall rating, generic Training Facility score as world truth, direct Player rating bonuses, direct Potential bonuses, direct hardcoded injury-risk reduction, direct MatchEngine bonuses, attendance, ticketing, fan experience, venue atmosphere, home-court advantage, geography/market, regulations, licensing, AI facility strategy, board decision logic, new Finance systems, depreciation, valuation, facility staffing simulation, RPG, News, conversations, promises, morale, relationships, and UI. Also deliberately not done: reopening Finance (CFI7 untouched), wiring anything into `advanceDay` (§23), adding a field to any sporting system's own context type (§13/§14/§15), and inventing an Academy/Youth domain (none exists; §5).

## 40. Facilities V2 closure assessment

**Facilities V2 can be declared FEATURE COMPLETE FOR CURRENT BDM SCOPE.**

Canonical support now exists, end to end, for: physical infrastructure (CFI1/CFI3), ownership/access (CFI2), persistence (CFI2S), anatomy/capabilities (CFI3), condition/serviceability/technical standard (CFI4), maintenance/deterioration (CFI5), construction/renovation/development (CFI6), lifecycle restoration (CFI6a), finance integration (CFI7), and now sporting integration (CFI8) — a Team's actually-reachable, actually-usable sporting infrastructure is queryable, explainable, deterministic, and correctly bounded by rights and serviceability, without Facilities ever becoming an authority over training outcomes, development, injuries, match performance, or morale.

This does not mean every future Facilities idea is implemented (see §38's technical debt and the explicit NO list in §39) — it means the canonical seam every future sporting-system wave needs already exists and requires no Facilities-side schema change to be consumed, exactly the brief's stated bar for closure.

## 41. Recommendation for the next system

Per the brief's own instruction and CFI7's own forward pointer, the next system is the **Event / Trigger / Human RPG Engine**. Facilities' role in it is now fully prepared: `SPORTING_FACILITY_CONSTRAINT_FACTS` and every `SportingCapabilityStatus`/`sourceComponentId`/`reason` are the observable, explainable facts an RPG/event layer can react to (a coach noticing `KEY_PRACTICE_COURT_UNAVAILABLE`, a player agent noticing `MEDICAL_CAPABILITY_UNAVAILABLE`) without Facilities itself ever generating a complaint, news item, or narrative — that reaction belongs entirely to the new system. **CFI9 is not started automatically**, per the explicit instruction.

---

*Certified on branch `club-facilities-infrastructure-v2-cfi8-sporting-impact-basketball-integration`. No push, no PR, no merge to main.*
