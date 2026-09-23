# CFI5 — Club Facilities & Infrastructure V2 — Operations, Maintenance & Deterioration Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi5-operations-maintenance-deterioration`, created from the certified CFI4 tip `38a5fbe` in `C:\BDM-FACILITIES`.

## 2. Initial SHA

`38a5fbebae885751d7b5b5a282fca04064fa7b09` (`docs(facilities): record CFI4 final commit SHA in certification report`). Verified as HEAD with a clean working tree before any CFI5 edit.

## 3. Final SHA

`2545053` (short form of `25450530c163f48d2da0cfcacc8fb9395a33b50f`), `feat(facilities): add operations, maintenance & deterioration engine (CFI5)`. This report is committed as a second, immediately-following docs commit.

## 4. Commits

Two atomic commits, matching the CFI1–CFI4 lineage's own convention:

1. `2545053` — `feat(facilities): add operations, maintenance & deterioration engine (CFI5)` — the domain model (`FacilityDeteriorationPolicy.ts`, `FacilityUsageLoad.ts`, `FacilityMaintenanceNeed.ts`, `FacilityMaintenanceAction.ts`, `FacilityInspection.ts`, `FacilityOperationalIncident.ts`), the new `src/engine/facilities/FacilityDeteriorationEngine.ts`, the extended `FacilityQueries.ts`/`FacilityValidation.ts`/`GameWorld.ts`/`index.ts`/ID files, the localized Save V4 extension, and all four new test files.
2. `docs(facilities): add CFI5 operations/maintenance/deterioration certification report` — this file.

No push, no merge, per instructions.

## 5. Mandatory pre-implementation audit

Read in full before writing any CFI5 code: `FacilityCondition.ts` (CFI4's condition/serviceability model), `FacilityComponent.ts` (`componentCategory`, current taxonomy), `FacilityComponentCapability.ts`, `FacilityQueries.ts`, `FacilityValidation.ts`, `GameWorld.ts`'s existing collection-wiring pattern, `CalendarEngine.ts`'s `advanceDay` composition function, `RandomSource.ts`, `PostMatchInjuries.ts` (the `generate`/`apply` split and `{world, results}` return shape), `WorldAnnualDevelopmentCycle.ts` (single global idempotency-flag pattern), `OffseasonDevelopment.ts`, and `GameDate.ts` (confirmed only `addDays`/`addYears`/`compareGameDates` exist — no month-diff helper, so the engine computes day-diffs locally via `Date.UTC`, exactly as `GameDate.ts` itself does internally). Findings:

- **CFI5 must not be wired into `advanceDay`.** Per the brief's explicit instruction, no edit was made to `CalendarEngine.ts` — CFI5 ships as a standalone, explicitly-invoked domain+engine surface (`src/engine/facilities/FacilityDeteriorationEngine.ts`), callable by a future integration point once one is unambiguous and safe.
- **No RNG is used anywhere in CFI5.** `RandomSource.ts` was read and deliberately not imported — the core deterioration formula (`conditionAfterElapsedPeriod`) is a pure closed-form function of `(startingCondition, wearProfile, elapsedMonths, utilizationRatio)`, with zero `Math.random` and zero implicit `Date.now()`.
- **`WorldAnnualDevelopmentCycle`'s single global idempotency flag does not fit CFI5's shape** (per-component idempotency across arbitrary date ranges, not one global yearly event) and was deliberately not reused directly. Instead CFI5 derives idempotency from deterministic, content-addressed record IDs (`facility-component-condition:${componentId}:${toDate}`, `facility-maintenance-need:${componentId}:${toDate}`), relying on `GameWorld`'s own existing duplicate-ID guard rather than adding a new ledger collection.
- **The `{world, results}` pure-calculate-then-apply split** used throughout `PostMatchInjuries.ts`/`OffseasonDevelopment.ts` was adopted for `calculateComponentDeterioration`/`advanceFacilityCondition` and for the new `applyFacilityMaintenanceAction` — the calculation half never mutates or touches `GameWorld`, only the apply half calls `updateGameWorld`, exactly once per invocation.

## 6. Maintenance need model

New `FacilityMaintenanceNeed.ts`. Fields: `id`, `facilityId`, `componentId` (optional — a need may be facility-wide), `detectedAt`, `type`, `severity`, `status`, `source` (free-text provenance string, e.g. `deterioration:${componentId}` or `inspection:${id}`), `resolvedAt` (optional). Eleven types (`ROUTINE`, `PREVENTIVE`, `CORRECTIVE`, `SAFETY`, `EQUIPMENT`, `STRUCTURAL`, `UTILITIES`, `SURFACE`, `CLEANING`, `SPECIALIST`, `OTHER`) — no hardcoded per-type branching exists anywhere in the domain or engine; every function that consumes a need treats `type` as opaque data except where severity/status drive behavior. No second 0–100 severity rating was introduced: `FACILITY_MAINTENANCE_NEED_SEVERITIES = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL']`, a small semantic scale kept explicitly distinct from `PhysicalCondition`.

## 7. Maintenance lifecycle

`FACILITY_MAINTENANCE_NEED_STATUSES = ['OPEN', 'PLANNED', 'IN_PROGRESS', 'DEFERRED', 'COMPLETED', 'CANCELLED']`. `COMPLETED`/`CANCELLED` are the only terminal statuses (`isFacilityMaintenanceNeedOpenStatus` treats every other status, including `DEFERRED`, as open). `resolvedAt` is required if and only if the status is terminal, enforced at `createFacilityMaintenanceNeed`'s construction boundary. History is immutable: no function anywhere mutates an existing need record in place — `applyFacilityMaintenanceAction` and `advanceFacilityCondition` both produce a **new** need object (via `createFacilityMaintenanceNeed` with the previous need's fields spread and overridden) rather than reaching into `GameWorld` and patching a field, so every write still goes through the canonical factory's own validation.

## 8. Inspections

New `FacilityInspection.ts`. A lightweight observation, explicitly **not** a regulatory license or homologation act (that role remains `FacilityCompetitionApproval`'s). `FACILITY_INSPECTION_FINDINGS = ['NO_ISSUE', 'MAINTENANCE_NEED_IDENTIFIED', 'SERVICEABILITY_RESTRICTION_IDENTIFIED']`. `producedNeedId` is required when and only when the finding is `MAINTENANCE_NEED_IDENTIFIED`, enforced at construction. `observedCondition`/`observedServiceability` are optional point-in-time observations, independent of whether a condition record is actually written (an inspection can observe without CFI5 automatically mutating CFI4 state on its behalf — that remains a separate, explicit act).

## 9. Incident decision

New `FacilityOperationalIncident.ts` was built, as the minimal seam the brief allowed ("si aporta valor"): it does add value because it gives outages a discrete, queryable cause distinct from ordinary deterioration or a completed inspection. Kept deliberately small — `FACILITY_OPERATIONAL_INCIDENT_CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'SURFACE_DAMAGE', 'EQUIPMENT_FAILURE', 'ENVELOPE_FAILURE', 'OTHER']`, an optional `resultingServiceability` effect, an optional `producedNeedId` cross-reference. No root-cause diagnostics, no severity/probability model, and critically **no news/RPG generation of any kind** — an incident is inert data until something outside CFI5 chooses to react to it.

## 10. Deterioration model

`conditionAfterElapsedPeriod` in `src/engine/facilities/FacilityDeteriorationEngine.ts`: a pure, deterministic function of `(startingCondition, component, fromDate, toDate, utilizationRatio, thresholds)`. `startingCondition === null` (CFI4 `UNKNOWN`) always returns `null` — CFI5 never invents a starting condition of 100. Elapsed time is computed via `daysBetween` (plain `Date.UTC` arithmetic, the same technique `GameDate.ts` itself uses) divided by `AVERAGE_DAYS_PER_MONTH = 30.436875` to get fractional elapsed months — a single closed-form multiplication, never a loop over days. `totalLoss = baseRate(wearProfile) * utilizationMultiplier(utilizationRatio) * elapsedMonths`; the result is clamped to `[0, 100]` and rounded to the nearest integer, respecting CFI4's integer-condition convention (no floats leak into the domain).

## 11. Deterioration policies

New `FacilityDeteriorationPolicy.ts`, centralizing every threshold/rate as named, documented constants rather than scattering magic numbers:

- **Wear profiles**: `FACILITY_WEAR_PROFILES = ['LOW', 'NORMAL', 'HIGH', 'VERY_HIGH']` with `BASE_MONTHLY_DETERIORATION_RATE` (LOW 0.15, NORMAL 0.4, HIGH 0.75, VERY_HIGH 1.2 physical-condition points per month, explicitly documented as provisional and revisable without a schema change). A component's profile is resolved via `wearProfileForComponentType(type, category)`: first checked against a small per-type override map (`OUTDOOR_COURT → VERY_HIGH`, `PARKING → LOW`, `IMAGING_ROOM`/`DIAGNOSTIC_ROOM → NORMAL`), falling back to a per-*category* default map covering all 19 `FacilityComponentCategory` values — **not** 90 hand-authored per-type constants, per the explicit instruction to group by family.
- **Utilization**: `utilizationMultiplier(utilizationRatio)` maps `[0, 1]` linearly to `[1.0×, 2.0×]` — idle components still incur baseline wear (weathering, disuse decay), fully-utilized components incur double.
- **Thresholds**: `DEFAULT_FACILITY_DETERIORATION_THRESHOLDS` — `maintenanceNeedCondition: 60`, `limitedServiceabilityCondition: 45`, `severelyLimitedServiceabilityCondition: 25`, `outOfServiceCondition: 10` — a single semantic cascade, passed explicitly through every engine function rather than hardcoded inline, so a future policy variant (e.g. a stricter regulatory standard) can be substituted without touching the deterioration math itself.
- **Serviceability floor rule**: `worstServiceabilityImpliedByCondition` computes what condition alone implies; `isServiceabilityAtLeastAsSevereAs` + the engine-local `resolveWorsenedServiceability` ensure this can only ever **worsen** an existing serviceability, never silently improve it — an `OUT_OF_SERVICE` component whose condition alone would now merely imply `LIMITED` stays `OUT_OF_SERVICE` until an explicit `applyFacilityMaintenanceAction` call restores it (§15). This directly implements the brief's own worked example: condition 85→78 leaves `FULL` `FULL`, and a simple component can remain `FULL` even at condition 38 if no explicit downgrade was ever recorded — serviceability is governed by policy/type-crossing, never by a blanket linear mapping applied on every tick.

## 12. Usage pressure

New `FacilityUsageLoad.ts`: a transient, **non-persisted** input `{ componentId, utilizationRatio }` (validated to `[0, 1]` at construction). It is passed explicitly into `calculateComponentDeterioration`/`advanceFacilityCondition` as a `readonly FacilityUsageLoad[]`; a component absent from the list uses the neutral baseline (`utilizationRatio = 1`, i.e. typical/ordinary use), never an assumed zero. It deliberately does not connect to any real `Match`/`Training` entity yet — it is directly testable via explicit engine-call inputs, which test "explicit usage loads override the neutral baseline utilization per component" exercises.

## 13. Time granularity decision

**Monthly-scale, closed-form elapsed-period computation — explicitly not daily loops and not one condition record per component per day.** `conditionAfterElapsedPeriod` computes total deterioration for the entire `[fromDate, toDate]` window in one arithmetic expression regardless of how many days that spans; `advanceFacilityCondition` writes **at most one** new `FacilityComponentConditionRecord` per component per invocation, and only when `changed: true` (condition or serviceability actually differs from the prior record) — a zero-elapsed or sub-threshold-movement call writes nothing at all. This was a deliberate choice among the brief's suggested options (monthly progression / period delta / event-driven snapshot): CFI5 adopts the "period delta" variant, letting the caller choose whatever cadence it wants to invoke the engine at (monthly, quarterly, or on-demand) without the engine itself ever assuming or requiring a fixed tick size.

## 14. Performance characteristics

`calculateComponentDeterioration` is `O(components)` per call — no nested loop over days, and no loop over the full history of condition records beyond the single `componentConditionAt` lookup per component (itself a filter+sort over that component's own historical records, not the whole world). `advanceFacilitiesCondition` iterates facilities once, in deterministic sorted `FacilityId` order, calling `advanceFacilityCondition` once per facility — for a world with thousands of facilities and tens of thousands of components this remains linear in total component count per invocation, with zero dependency on the elapsed day count. Test "a large elapsed period is computed directly via closed-form arithmetic, without looping day by day" asserts a 100-year span (`2000-01-01` → `2099-12-31`) computes in under 50ms, empirically confirming no day-by-day iteration exists.

## 15. Condition/serviceability integration and repair model

`applyFacilityMaintenanceAction(world, actionId)` — the engine function that closes the causal chain's final link, MAINTENANCE/REPAIR ACTION → CONDITION RESTORED, which was identified as a gap during initial implementation and built before any test-writing began (an action with no completed engine-side effect could not satisfy several of the brief's mandatory scenarios). Behavior:

- Only a `completedAt`-set action with a non-null `outcome` has any effect; an in-progress action is a no-op that returns the unchanged `world`.
- When the action specifies `resultingCondition`/`resultingServiceability`, exactly one new `FacilityComponentConditionRecord` is written (closing the prior open-ended record via `effectiveTo`, never destructively editing it — the same historical-append convention CFI4 itself established and `advanceFacilityCondition` already follows). `resultingCondition` is whatever the action declares; **repair does not necessarily restore condition to 100** — test "applying a REPAIR action increases condition and can restore serviceability without necessarily reaching 100" exercises the brief's own worked example (42 → 76, `FULL`).
- When the action references a `FacilityMaintenanceNeed` and its outcome is `SUCCESSFUL`, that need transitions to `COMPLETED` with `resolvedAt` set to the action's `completedAt` — atomically, in the same `updateGameWorld` call as the condition-record write, so no intermediate state (component repaired, need still open) is ever observable. A `PARTIAL`/`UNSUCCESSFUL` outcome deliberately leaves the need open — an unsuccessful attempt does not fabricate a resolution.
- Repair is explicitly not renovation: no field or code path in CFI5 lets an action reset a component to a "like new" baseline beyond whatever condition value the action itself specifies; a genuine renovation/CAPEX concept is deferred to CFI6 (§35).

## 16. Deferred maintenance

Fully representable via `status: 'DEFERRED'` on `FacilityMaintenanceNeed` — `isFacilityMaintenanceNeedOpenStatus('DEFERRED')` returns `true`, so a deferred need remains visible to every "open needs" query, and deterioration continues uninterrupted for that component (`advanceFacilityCondition` has no special-case branch that pauses progression for a component with an open, deferred, or any-status need — need status and deterioration progression are entirely independent axes). Two tests exercise this directly: the domain-level "deferred maintenance need remains open" and the engine-level "a deferred maintenance need remains open and its component continues deteriorating." CFI5 represents only the physical consequence; the future Finance/Governance/RPG reasons a need might be deferred (a board refusing expenditure, for example) are explicitly out of scope here (§34).

## 17. Atomicity

Every world mutation in CFI5 goes through exactly one `updateGameWorld` call per logical operation: `advanceFacilityCondition` writes all changed components' new condition records **and** any newly-opened maintenance needs in a single call; `applyFacilityMaintenanceAction` writes the (optional) new condition record **and** the (optional) need-completion patch in a single call. No function ever leaves `GameWorld` in a state where, e.g., a condition record exists without its corresponding maintenance-need side effect, or vice versa — `updateGameWorld`'s own whole-world `validateWorld` re-check on every call additionally guarantees no invalid intermediate state can be committed even under future refactoring.

## 18. Idempotency

No new idempotency-ledger collection was added (per the explicit instruction not to force a global event bus or ledger if one doesn't already exist). Instead, every engine-generated record uses a deterministic, content-addressed ID: `facility-component-condition:${componentId}:${toDate}` and `facility-maintenance-need:${componentId}:${toDate}` for deterioration-driven writes, and the action-id-scoped `facility-component-condition:${componentId}:${completedAt}` for repair-driven writes. Re-running the same engine call for the same `(component, date)` pair a second time would attempt to construct a record with an ID that `GameWorld`'s own `indexById` duplicate-ID guard already rejects — CFI5 deliberately relies on this existing mechanism rather than adding a parallel one. `advanceFacilityCondition` additionally guards maintenance-need opening explicitly: `maintenanceNeedsForComponentAt(...).some(isOpen)` is checked before opening a new need, so re-running deterioration for an already-degraded component does not open a second open need for the same underlying problem.

## 19. Queries

Added to `FacilityQueries.ts` (all pure, deterministic, explicit `onDate` parameter where temporal, zero `Math.random`/implicit `Date.now`): `maintenanceNeedsForFacilityAt`, `maintenanceNeedsForComponentAt`, `openMaintenanceNeedsAt`, `criticalMaintenanceNeedsAt`, `maintenanceActionsForFacility`, `maintenanceHistoryForComponent`, `inspectionsForFacility`, `latestInspectionForComponentAt`, `componentsRequiringMaintenanceAt`. Every name matches the brief's requested list exactly. Two explanatory (never serialized) readiness structures were added rather than a single arbitrary overall number: `facilityOperationalReadinessAt` returns `{ facilityId, activeComponentIds, limitedComponentIds, unavailableComponentIds, openMaintenanceNeeds, criticalMaintenanceNeeds }`, and `componentOperationalReadinessAt` returns `{ componentId, serviceability, openMaintenanceNeeds, criticalMaintenanceNeeds }` — both pure query-time projections, neither persisted anywhere in `GameWorld`.

## 20. Engine

New directory `src/engine/facilities/`, following the repo's existing `src/engine/<domain>/` convention (mirroring `src/engine/injury/`, `src/engine/development/`, `src/engine/calendar/`):

- **`FacilityDeteriorationEngine.ts`**: `conditionAfterElapsedPeriod` (pure math), `calculateComponentDeterioration` (pure calculate, per-facility), `advanceFacilityCondition` (calculate + apply, per-facility, one `updateGameWorld` call), `advanceFacilitiesCondition` (convenience: every facility with at least one active component, deterministic `FacilityId` order), and `applyFacilityMaintenanceAction` (apply a completed maintenance/repair action's effect). `FACILITY_DETERIORATION_OUTCOMES = ['MAINTENANCE_NEED_OPENED', 'COMPONENT_LIMITED', 'COMPONENT_OUT_OF_SERVICE']` are returned as plain data on each `ComponentDeteriorationResult` — the explicit "future RPG seam" the brief asked for, with **no event bus, dispatcher, or RPG/news/morale connection built or implied anywhere** in this file.
- **`src/engine/facilities/index.ts`**: `export * from './FacilityDeteriorationEngine'`.
- Verified no new circular dependency: the engine imports only from `@/domain/facilities`, `@/domain/ids`, `@/domain/date`, `@/domain/world`, none of which import back from `src/engine/facilities/`.

## 21. GameWorld additions

Four new normalized collections added to `GameWorld.ts`, following the exact existing pattern (`indexById`, `createXxx` factories, registered in `CreateGameWorldInput`, `createGameWorld`, `updateGameWorld`'s `collectionPatchTargets`/`collectionPatchIndexers`, and `validateFacilities`'s call into `validateFacilitiesDomain`):

- `facilityMaintenanceNeedsById: Readonly<Record<FacilityMaintenanceNeedId, FacilityMaintenanceNeed>>`
- `facilityMaintenanceActionsById: Readonly<Record<FacilityMaintenanceActionId, FacilityMaintenanceAction>>`
- `facilityInspectionsById: Readonly<Record<FacilityInspectionId, FacilityInspection>>`
- `facilityOperationalIncidentsById: Readonly<Record<FacilityOperationalIncidentId, FacilityOperationalIncident>>`

**No derived/computed field was added to `GameWorld`** — `derivedDeterioration`, `facilityReadiness`, `calculatedMaintenancePressure` and similar were explicitly not created anywhere, per instruction; every readiness/summary structure in §19 is computed on demand from these four collections plus CFI4's existing ones. No existing GameWorld field, collection, factory, or validation rule was altered.

## 22. Validation

Added to `FacilityValidation.ts`'s `validateFacilitiesDomain`, entirely additive to the existing checks, via a new `requireComponent` helper and four new context fields (`maintenanceNeeds`, `maintenanceActions`, `inspections`, `operationalIncidents`):

- Duplicate IDs for all four new record types.
- `facilityId` on every new record type must reference an existing `Facility`.
- `componentId` (where present) must reference an existing `FacilityComponent` **belonging to the same facility as the referencing record** — a cross-facility mismatch (e.g. a need naming a real component that belongs to a different facility) is rejected, not merely "component exists somewhere."
- `FacilityMaintenanceAction.needId` (where present) must reference an existing `FacilityMaintenanceNeed`, and that need must belong to the same facility as the action.
- `FacilityInspection.producedNeedId` / `FacilityOperationalIncident.producedNeedId` (where present) must reference an existing need on the same facility.
- Impossible dates, `completedAt`/`resolvedAt` preceding `startedAt`/`detectedAt`, and negative `utilizationRatio` are all rejected at the individual factory-construction boundary (`createFacilityMaintenanceNeed`, `createFacilityMaintenanceAction`, `createFacilityUsageLoad`), consistent with how every CFI1–CFI4 value object validates itself at construction rather than only at the `GameWorld` boundary.
- No monetary/deterioration-policy validation was added beyond range-checking `utilizationRatio` to `[0, 1]` — CFI5 introduces no configurable "invalid policy" shape beyond the one frozen `DEFAULT_FACILITY_DETERIORATION_THRESHOLDS` object, so no separate policy-validation function was needed.

## 23. Tests added

Four new files, 44 tests total (all new — no CFI1–CFI4 test was modified beyond the one Save V4 migration-test maintenance edit noted in §26):

- `src/domain/facilities/FacilityMaintenanceOperations.test.ts` (19 tests): maintenance need open/resolve lifecycle, invalid-status/date rejections, critical-needs query filtering, deferred-need-remains-open, maintenance action creation/cross-reference/outcome-timing validation, cross-facility need/action rejection, inspection NO_ISSUE and MAINTENANCE_NEED_IDENTIFIED cases (plus the missing-producedNeedId rejection), operational incident affecting a component and opening a need, outage-without-touching-FacilityLifecycle, the two operational-readiness query shapes, invalid component/need cross-reference rejection at the `GameWorld` boundary, and duplicate-ID rejection.
- `src/engine/facilities/FacilityDeteriorationEngine.test.ts` (25 tests): condition deteriorates over an elapsed period; zero elapsed period is a true no-op; deterministic same-input-same-output; higher usage causes greater deterioration; outdoor (VERY_HIGH) vs. indoor (HIGH) wear-profile divergence; LOW-profile (parking) vs. HIGH-profile comparative wear; condition floor at 0; unknown-condition component stays `null`/UNKNOWN; history preservation (old date still resolves to the old value after progression); maintenance-need-opened threshold crossing; CRITICAL-severity need generated on OUT_OF_SERVICE crossing; LIMITED-serviceability crossing; serviceability floor rule (no silent improvement); facility-remains-ACTIVE-during-outage; repair improves condition without necessarily reaching 100; successful repair closes its need; unsuccessful repair does not close its need; deferred need + continued deterioration; multiple components progress independently; explicit usage-load override; large-elapsed-period performance assertion; multi-facility batch progression order; negative-utilization rejection; toDate-before-fromDate rejection; in-progress-action-has-no-effect.
- `src/save/GameWorldSaveV4.FacilityOperations.test.ts` (9 tests): round-trip for each of the four new collections (including optional-field/null-field variants and the in-progress-action variant), the pre-CFI5-payload backward-compatibility test, and a deterministic-reload-plus-progression test (identical `calculateComponentDeterioration` output before and after a JSON-boundary save/load round-trip).
- One pre-existing test updated for CFI5 (see §26).

Deliberately not added: a dozen near-identical enum-membership tests, or redundant coverage of behavior CFI4 already certified (e.g. `componentConditionAt`'s tie-breaking, already covered by `FacilityConditionServiceability.test.ts`) — matching the brief's own "avoid over-testing" instruction and the precedent set by every prior CFI gate's certification report.

## 24. Total Facilities tests

`npx vitest run src/domain/facilities/`: **116/116 PASS** (5 files: 97 pre-existing CFI1–CFI4 tests, unchanged, plus 19 new CFI5 domain tests).

## 25. Save/engine tests

`npx vitest run src/domain/facilities src/engine/facilities src/save`: **316/316 PASS across 26 files** — 116 facilities-domain tests (§24), 25 new engine tests (`FacilityDeteriorationEngine.test.ts`, the first test file in `src/engine/facilities/`), and 175 Save tests (all pre-existing Save V3/V4 suites unchanged, plus the 9 new CFI5 Save tests and the 1 updated migration test).

## 26. Migration test maintenance

`GameWorldSaveV4.test.ts`'s "migrates canonical V3 by preserving V3 fields and adding empty runtime state" was updated to also destructure and assert the four new empty CFI5 fields (`facilityMaintenanceNeeds`, `facilityMaintenanceActions`, `facilityInspections`, `facilityOperationalIncidents`) — the same test-maintenance pattern already applied identically at the CFI3 and CFI4 gates, not a hidden defect.

## 27. Backward compatibility

A Save V4 payload written before CFI5 (missing all four new collections entirely, not merely empty arrays) continues to load correctly: each `hasOwnProperty` check reports `false`, so none of the four `exactKeys` allow-lists are consulted and every collection defaults to `[]` via `createGameWorld`'s own fallback — never to invented historical maintenance records. This is explicitly tested (`GameWorldSaveV4.FacilityOperations.test.ts`, "a pre-CFI5 V4 payload...still loads with empty, valid defaults") by taking a real serialized payload, deleting all four keys, and deserializing — mirroring CFI3/CFI4's own backward-compatibility test methodology exactly.

## 28. Typecheck

`npm run typecheck` (`tsc -b --pretty false`): **clean, zero errors.**

## 29. Build

`npm run build` (`tsc -b && vite build`): **succeeds.** Same pre-existing chunk-size warning as every prior wave (unrelated, predates this branch, concerns the main app bundle, not Facilities code).

## 30. `git diff --check`

Clean — only a benign LF/CRLF normalization notice on `FacilityQueries.ts` (a pre-existing repo-wide line-ending convention difference, not introduced by CFI5), no trailing-whitespace or conflict-marker errors.

## 31. Deliberately skipped gates

Per CFI5's explicit reduced test-gate policy:

- **`cargo fmt`/`cargo check` were deliberately NOT run** — CFI5 touched no Rust/Tauri code.
- **The full repository test suite was deliberately NOT run** — no cross-cutting infrastructure was modified beyond `GameWorld.ts`/`FacilityValidation.ts`/`FacilityQueries.ts`/Save V4 (all already covered by §24/§25's targeted runs), no regression evidence appeared outside the Facilities/engine/save modules, and it was not explicitly requested. Per the standing instruction not to re-investigate historical suite-timeout flakiness without new evidence, none of which surfaced in this wave.

## 32. Technical debt

- **`applyFacilityMaintenanceAction` currently only supports applying a single completed action at a time** (no batch/bulk variant). This mirrors `advanceFacilityCondition`'s own per-facility granularity and was judged sufficient for CFI5's scope; a future wave orchestrating many simultaneous repairs (e.g. a renovation project in CFI6) may want a batched variant that performs one `updateGameWorld` call across many actions rather than one per action.
- **`FacilityDeteriorationPolicy`'s category→wear-profile map hand-assigns all 19 `FacilityComponentCategory` values individually** rather than deriving a smaller number of "family" groupings programmatically. This was a deliberate simplicity-over-cleverness choice (19 explicit entries is still far short of the "90 arbitrary constants" the brief warned against, and every entry is one of only four possible values), but a future wave could compress this further if new categories are added frequently.
- **No explicit seam yet for "climate/weather exposure" beyond the static indoor/outdoor wear-profile split** (`OUTDOOR_COURT → VERY_HIGH` is a fixed override, not a function of season or geography) — intentionally deferred exactly as the brief instructed; the override map is the seam a future geographic/seasonal model would extend.

## 33. Deliberately deferred scope (explicit "NOT implemented" list)

Exactly the CFI5 "NO IMPLEMENTAR" list from the brief: monetary maintenance costs, budgets, Finance ledger events, construction, renovation projects, expansion, demolition, relocation projects, depreciation accounting, facility valuation, staffing, facility employees, sporting modifiers, training modifiers, injury modifiers, attendance, ticketing, board decisions, AI facility strategy, player complaints, staff complaints, news, leaks, RPG triggers, UI, and any wiring into `CalendarEngine.ts`'s `advanceDay`. Also deliberately not done: any change to CFI1's `Facility.capabilities`, CFI3's `FacilityComponentCapability`, or CFI4's `PhysicalCondition`/`FacilityServiceability`/`FacilityTechnicalStandard` enums or resolvers (all reused exactly as-is — see §10/§11/§15), and any change to `Organization`, `Team`, `Competition`, `Season`, or `Game`.

## 34. Future RPG/Finance seam

`ComponentDeteriorationResult.outcomes` (`MAINTENANCE_NEED_OPENED`, `COMPONENT_LIMITED`, `COMPONENT_OUT_OF_SERVICE`) and the maintenance-need/action/inspection/incident records themselves are the observable facts a future system can react to — CFI5 returns them as plain data from `calculateComponentDeterioration`/`advanceFacilityCondition`/`applyFacilityMaintenanceAction` but builds no event bus, dispatcher, or subscriber mechanism. `DEFERRED` status and `FacilityOperationalIncident` are the two concrete seams the brief called out as useful for a future Finance/Governance/RPG wave (e.g. "board refuses expenditure → maintenance deferred → condition worsens → players complain") — CFI5 represents only the physical half of that chain.

## 35. Exact proposal for CFI6

1. **Renovation/CAPEX engine**: consume CFI5's `FacilityMaintenanceAction` shape as a precedent but introduce a genuinely distinct concept (e.g. `FacilityRenovationProject`) that can reset a component's condition to a materially higher baseline, upgrade its `FacilityTechnicalStandard`, or change its `FacilityComponentSpecification` — explicitly not reusing `resultingCondition`/`resultingServiceability` on `FacilityMaintenanceAction`, keeping "kept it working" (CFI5) cleanly separate from "made it better/different" (CFI6).
2. **Cost/Finance integration**: attach a monetary cost to maintenance actions and renovation projects by referencing CFI5's existing `FacilityMaintenanceAction`/new renovation records from a Finance ledger event, rather than adding a cost field directly onto CFI5's domain types (CFI5 deliberately has none) — preserving CFI5 as a pure physical-simulation layer that Finance observes and reacts to, not one Finance edits.
3. **Deferred-maintenance consequence engine**: a governance/RPG-facing system that reads `DEFERRED` needs and worsening `FacilityOperationalReadiness` and produces board decisions, player/staff sentiment effects, or news — entirely downstream of CFI5's existing queries, requiring no CFI5 schema change.
4. **`advanceDay`/`CalendarEngine` integration point**: once a genuine, safe integration point exists (e.g. a monthly world-tick hook), wire `advanceFacilitiesCondition` into it with an explicit, documented cadence — deliberately not done in CFI5 per instruction.
5. **Application-layer read boundary** (carried over from CFI1–CFI4's own still-outstanding recommendation): a thin `src/app/facilities` module exposing the now-complete anatomy/capability/condition/serviceability/maintenance/readiness query surface to future UI/Zustand consumers.

## 36. Closing statement

No push or merge performed. Commit created only after this report's §24/§25 test results and §28/§30 gate results were all confirmed green, and only after the previously-identified engine gap (applying a completed maintenance/repair action's effect — §15) was filled and tested, per the brief's own principle that causes and results must be traceable end-to-end: USAGE/TIME/INCIDENT → DETERIORATION PRESSURE → CONDITION CHANGE → SERVICEABILITY CHANGE → MAINTENANCE NEED → MAINTENANCE/REPAIR ACTION → CONDITION RESTORED is now a complete, tested chain in both directions.
