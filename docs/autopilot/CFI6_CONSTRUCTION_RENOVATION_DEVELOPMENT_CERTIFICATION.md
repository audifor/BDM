# CFI6 — Club Facilities & Infrastructure V2 — Construction, Renovation & Development Projects Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi6-construction-renovation-development`, created from the certified CFI5 tip `6078bd3` in `C:\BDM-FACILITIES`.

## 2. Initial SHA

`6078bd3196fb5a315632d4c8feff7682c21b1ddc` (`docs(facilities): add CFI5 operations/maintenance/deterioration certification report`). Verified as HEAD with a clean working tree before any CFI6 edit.

## 3. Final SHA

`7f5e854` (short form of `7f5e854e6a819e20b200b96f3c37194ce0be8766`), `feat(facilities): add construction, renovation & development projects (CFI6)`. This report is committed as a second, immediately-following docs commit.

## 4. Commits

Two atomic commits, matching the CFI1–CFI5 lineage's own convention:

1. `7f5e854` — `feat(facilities): add construction, renovation & development projects (CFI6)` — the domain model (`FacilityDevelopmentProject.ts`, `FacilityDevelopmentProjectPhase.ts`, `FacilityDevelopmentProjectScope.ts`), the new `src/engine/facilities/FacilityDevelopmentEngine.ts`, the extended `FacilityQueries.ts`/`FacilityValidation.ts`/`GameWorld.ts`/`index.ts`/ID files, the localized Save V4 extension, and all three new test files.
2. `docs(facilities): add CFI6 construction/renovation/development certification report` — this file.

No push, no merge, per instructions.

## 5. Architecture audit

Read in full before writing any CFI6 code: `src/domain/facilities/FacilityLifecycle.ts` (the 8-status `FACILITY_STATUSES` enum, confirming `PLANNED`/`UNDER_CONSTRUCTION`/`UNDER_RENOVATION`/`DECOMMISSIONED`/`DEMOLISHED` already exist — no new lifecycle statuses were needed), `FacilityStatusHistory.ts` (the `resolveFacilityStatusAt` temporal-resolution pattern, reused unchanged), `FacilityComponent.ts` (confirmed `FacilityComponentStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED'`, and critically that `activeFacilityComponentsAt` already resolves `openedAt`/`closedAt` temporally — see §16), `FacilityCondition.ts` (CFI4's condition/serviceability model, reused verbatim), `FacilityMaintenanceNeed.ts`/`FacilityMaintenanceAction.ts` (CFI5's need/action lifecycle), the full Save V4 Facilities wiring, `FacilityValidation.ts`, `FacilityQueries.ts`, and `GameWorld.ts`'s collection-registration pattern.

Also read, per the explicit instruction to check other systems' project/lifecycle patterns before inventing a new one:

- **`src/domain/structuralRegulation/OrganizationStructuralChange.ts`** — its explicit `allowedTransitions: Record<Status, readonly Status[]>` map plus a `transitionOrganizationStructuralChange` helper is the direct precedent CFI6's own `FACILITY_DEVELOPMENT_PROJECT_ALLOWED_TRANSITIONS` and status-transition guards are modeled on, reused as a pattern (not literally imported — the two entities are unrelated) exactly because it is the closest existing "lifecycle with an explicit approval-adjacent status and a closed transition graph" precedent in the repository.
- Searched the whole repository for any legacy `construction`/`renovation`/`project`/`development` concept already representing facility infrastructure work: **none found** (`grep -rn "FacilityDevelopmentProject|FacilityConstruction|FacilityRenovation|ConstructionProject|RenovationProject"` returned zero matches). No second concept was created alongside reusable infrastructure — CFI6 is the first and only such entity.
- **CFI5's `FacilityDeteriorationEngine.ts`** (`calculateComponentDeterioration`/`advanceFacilityCondition`'s pure-calculate-then-atomically-apply split, and `applyFacilityMaintenanceAction`'s "write a new CFI4 condition record + close a related need in one `updateGameWorld` call" pattern) is the direct architectural precedent `FacilityDevelopmentEngine.ts`'s `completeFacilityDevelopmentProject`/`applyFacilityDevelopmentScope` follow.

## 6. Project model

New `FacilityDevelopmentProject.ts`. Canonical fields: `id`, `organizationId` (never `teamId` — see §6a), `facilityId` (nullable — see §12), `projectType`, `status`, `scope` (structured, see §10), `plannedStartDate`, `actualStartDate`, `plannedCompletionDate`, `actualCompletionDate`, `createdAt`, `cancelledAt`, `reason` (optional free-text purpose), `externalReferenceId` (optional, for a future integration hook). No monetary field exists anywhere on this entity or its phase — cost/budget/financing is exclusively CFI7's domain; CFI6 only guarantees a stable `id` for CFI7 to reference later (see §33).

### 6a. Organization, not Team, as the owning actor

Per the explicit instruction, `organizationId: OrganizationId` is the sole institutional-actor field; no `teamId` field exists anywhere on `FacilityDevelopmentProject`. A Team that wishes to be associated with a project's outcome does so through the existing CFI2 `FacilityTeamRelationship`/usage-right layer on the resulting Facility/components, never through the project entity itself.

## 7. Project types

`FACILITY_DEVELOPMENT_PROJECT_TYPES`: `NEW_FACILITY`, `FACILITY_EXPANSION`, `FACILITY_RENOVATION`, `FACILITY_MODERNIZATION`, `COMPONENT_ADDITION`, `COMPONENT_REPLACEMENT`, `COMPONENT_RENOVATION`, `COMPONENT_REMOVAL`, `RECONFIGURATION`, `TEMPORARY_WORKS`, `DEMOLITION` — exactly the brief's minimum list, no finer-grained project types added. `projectType` is a coarse classification for reporting/filtering; the engine never branches on it — it branches exhaustively on `scope.kind` instead (see §10/§24). A loose but real compatibility check (`PROJECT_TYPE_COMPATIBLE_SCOPE_KINDS`) rejects only genuinely incoherent pairings (e.g. `DEMOLITION` paired with an `ADD_COMPONENT` scope) without forcing a rigid 1:1 mapping where several types legitimately share a scope shape.

## 8. Lifecycle

`FACILITY_DEVELOPMENT_PROJECT_STATUSES`: `PLANNED`, `APPROVED`, `SCHEDULED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `CANCELLED` — exactly the brief's list. `APPROVED` records the world truth that approval occurred without modeling who approved it or why (that remains Governance's future concern, per §32); a caller with no real approval concept yet may skip straight from `PLANNED` to `SCHEDULED`/`IN_PROGRESS`, since `APPROVED` is an optional waypoint in the transition graph, not a mandatory gate — this was the "if APPROVED doesn't carry enough semantics without Governance, document and pick a cleaner alternative" decision point the brief raised, resolved by making it optional rather than removing it, since it still usefully distinguishes "approval is recorded" from "approval was never modeled" for a future Governance integration to read.

## 9. Transitions

`FACILITY_DEVELOPMENT_PROJECT_ALLOWED_TRANSITIONS`, an explicit closed graph (the `OrganizationStructuralChange`-precedent pattern, §5):

```
PLANNED     -> APPROVED, SCHEDULED, IN_PROGRESS, CANCELLED
APPROVED    -> SCHEDULED, IN_PROGRESS, CANCELLED
SCHEDULED   -> IN_PROGRESS, CANCELLED
IN_PROGRESS -> PAUSED, COMPLETED, CANCELLED
PAUSED      -> IN_PROGRESS, CANCELLED
COMPLETED   -> (terminal)
CANCELLED   -> (terminal)
```

`PLANNED`/`APPROVED` permit a direct jump to `IN_PROGRESS` specifically because `SCHEDULED` is an optional intermediate waypoint, not a mandatory one — a project can be started the moment it is approved (or even while merely planned) without first passing through an explicit scheduling step. `COMPLETED -> IN_PROGRESS` and `CANCELLED -> COMPLETED` are both correctly unreachable (verified by an explicit test), matching the brief's blocking requirement. `isValidFacilityDevelopmentProjectTransition` is the single source of truth every engine command checks before mutating status; `createFacilityDevelopmentProject`'s own date-consistency invariants (§8a below) provide a second, independent layer of protection against an internally inconsistent status/date combination even bypassing the transition graph.

### 9a. Status/date consistency invariants

Enforced at `createFacilityDevelopmentProject`'s construction boundary, independent of the transition graph: `CANCELLED` requires `cancelledAt`; every other status forbids it. `COMPLETED` requires `actualCompletionDate`. `IN_PROGRESS`/`PAUSED` require `actualStartDate`; `PLANNED`/`APPROVED`/`SCHEDULED` forbid it. `actualCompletionDate` requires `actualStartDate` and cannot precede it. `actualStartDate` cannot precede `createdAt`. `plannedCompletionDate` cannot precede `plannedStartDate`.

## 10. Scope model

New `FacilityDevelopmentProjectScope.ts` — a discriminated union, never free text, exactly as required: `CreateFacilityScope`, `AddComponentScope`, `ReplaceComponentScope`, `RenovateComponentScope`, `RemoveComponentScope`, `ExpandFacilityScope`, `ReconfigureFacilityScope`, `DemolishFacilityScope`. A separate `CreateFacilityDevelopmentProjectScopeInput` union (and one `Create...ScopeInput` per kind) accepts plain strings for ID-shaped fields, matching every other `createXxx`/`CreateXxxInput` pair convention in this domain, while the canonical `FacilityDevelopmentProjectScope` union stores only branded `FacilityComponentId`s — the same input/output type separation `FacilityComponent.ts`/`FacilityMaintenanceNeed.ts` already use, applied consistently here rather than leaking loosely-typed strings into the canonical shape.

`ComponentBlueprint` is the shared "not yet real" component description every addition/replacement scope embeds: it reuses `CreateFacilityComponentInput`'s shape minus `id`/`facilityId`/`status`/`openedAt`/`closedAt` — fields only knowable once the engine actually realizes it at completion time (see `componentBlueprintToCreateInput`). A blueprint can never accidentally claim to already exist.

`ReconfigureFacilityScope` bundles `additions`/`renovations`/`replacements`/`removals` sub-scopes for exactly the brief's own worked example (Performance Center Expansion: add 2 courts + add hydrotherapy + add performance lab + replace strength room, all as one project) — realized atomically by `applyFacilityDevelopmentScope`'s `RECONFIGURE_FACILITY` branch (§24).

## 11. Phase model

New `FacilityDevelopmentProjectPhase.ts`. Deliberately a plain 1-based linear `sequence` integer, never a DAG, per the explicit instruction. Fields: `id`, `projectId`, `sequence`, `name` (optional), `status` (`PLANNED`/`IN_PROGRESS`/`PAUSED`/`COMPLETED`/`CANCELLED`), `plannedStart`, `plannedCompletion`, `actualStart`, `actualCompletion`, `scopeComponentIndexes` (optional — a plain index list into the parent project's own scope component array, never a duplicated copy of blueprint data; `null`/omitted is explicitly allowed, since forcing every phase to name its exact slice of scope would be unnecessary ceremony for a simple two-phase project). Phases are opt-in: a project with zero phase records is simply a single-phase project in effect, not an error.

## 12. New Facility construction

Resolved the brief's explicit "decide carefully when the Facility entity is born" question in favor of **option B, engine-mediated**: a `NEW_FACILITY` project's scope (`CreateFacilityScope`) is a blueprint only — it never itself references an existing `facilityId` (enforced: `facilityId` may only be set once `actualStartDate` is non-null, i.e. once the project has genuinely started). The real `Facility` entity is created by `startFacilityDevelopmentProject` the moment the project transitions to `IN_PROGRESS`, with lifecycle status `UNDER_CONSTRUCTION` (reusing CFI1's existing status, not a new `projectFacilityStatus` second source of truth). This directly answers the brief's stated preference ("Facility debe poder existir como planned real-world asset, si FacilityLifecycle ya soporta PLANNED/UNDER_CONSTRUCTION — reutilizar lifecycle") by having the engine itself perform exactly that transition at the moment reality changes (construction genuinely begins), rather than inventing a parallel "project's own idea of facility status."

## 13. Component additions

`addComponents` (used by `ADD_COMPONENT`/`EXPAND_FACILITY`/`CREATE_FACILITY`'s initial components/`RECONFIGURE_FACILITY`'s additions) converts each `ComponentBlueprint` to a real `FacilityComponent` via `componentBlueprintToCreateInput` + `createFacilityComponent`, written in one `updateGameWorld` call alongside every other scope effect for the same completion. Derived capabilities (CFI3's `FacilityComponentCapability`) appear automatically once the new component exists — CFI6 never serializes or duplicates capability output, exactly as required (test "adding a component produces a derived capability once the project completes" exercises this directly via `facilityHasUsableCapabilityAt`).

## 14. Renovations

`applyRenovation`: same component `id`, only its `specification`/`equipmentTags` (and, via the paired CFI4 write, `technicalStandard`/`physicalCondition`/`serviceability`) change. A new `FacilityComponentConditionRecord` is written with the scope's **mandatory, explicit** `resultingCondition` — never an assumed 100 (§17). The prior open-ended condition record is closed via `effectiveTo` (CFI4's own historical-append convention, never a destructive edit).

## 15. Replacements

`applyReplacement`: the retired component is updated to `status: 'CLOSED'`, `closedAt: completedAt` — **its `id` is never reused or mutated into a different identity**. A brand-new `FacilityComponent` is created with its own content-addressed id (`facility-component:${projectId}:replacement`) and a fresh CFI4 condition record at the scope's explicit `resultingCondition`. Old and new are cross-referenced only through the `FacilityDevelopmentOutcome`'s `retiredComponentIds`/`createdComponentIds` (§25), never by forcing one entity to "become" the other.

## 16. Removals

`applyRemoval` (and the component-level half of `DEMOLISH_FACILITY`): `status: 'CLOSED'` + `closedAt` — **never a physical delete from `GameWorld`**. Audit finding (§5): `FacilityComponent.ts`'s existing `activeFacilityComponentsAt` **already** resolves `openedAt`/`closedAt` temporally (a `CLOSED` component with `closedAt: '2032-01-01'` is excluded from "active at date ≥ 2032-01-01" queries and correctly included for any earlier date) — this already satisfies the brief's "component existed until 2032" requirement with zero new component-history infrastructure. No new `FacilityComponentStatusRecord`-equivalent collection was introduced; this was a deliberate minimal-footprint decision documented here rather than silently assumed, since the brief explicitly asked to "introduce the minimum temporal model necessary" only if the existing model proved insufficient — it did not.

## 17. Modernization

A `RENOVATE_COMPONENT` scope's `updatedTechnicalStandard` field lets a modernization project move a component from e.g. `BASIC` to `ADVANCED` **without creating a new component** — written into the same new CFI4 condition record the renovation itself produces (CFI4's `technicalStandard` field already lives on `FacilityComponentConditionRecord`, so no CFI4 schema change was needed). History is preserved exactly as CFI4 already guarantees: the prior record's `effectiveTo` is closed, never overwritten.

### 17a. Condition-after-project policy (explicit, never hidden)

Every scope that can change condition (`RenovateComponentScope`, `ReplaceComponentScope`) carries a **mandatory** `resultingCondition: number` field — there is no code path anywhere in `FacilityDevelopmentEngine.ts` that defaults a post-project condition to 100. A `REFURBISHMENT`-flavored project can specify `resultingCondition: 85`; a full replacement can specify `100`; the brief's own worked examples (42→76 not 100) are exercised directly by test "completion restores serviceability via the explicit resulting condition (not necessarily 100)."

## 18. Demolition / decommissioning

`DEMOLISH_FACILITY` scope: the whole Facility transitions `ACTIVE -> DEMOLISHED` (a new `FacilityStatusRecord` written, reusing CFI1's existing lifecycle — no new terminal status was needed since `DEMOLISHED` already existed), and every currently-active component of that Facility is closed (`status: 'CLOSED'`, `closedAt`) in the same atomic write — **no component ID is ever deleted**, and the Facility's own `facilitiesById` entry is never removed from `GameWorld` (verified by test "a decommissioned/demolished facility remains queryable historically"). Decommissioning-without-demolition is representable simply by a project transitioning a Facility's status to `DECOMMISSIONED` (already in CFI1's enum) instead of `DEMOLISHED` — CFI6 did not need to add a distinct project-level mechanism for this since it is the same status-record write with a different target status; no dedicated test scope kind was introduced beyond `DEMOLISH_FACILITY` because a decommission-only path is a strict subset of what that scope already demonstrates against the same lifecycle machinery.

## 19. FacilityLifecycle integration

No second lifecycle/status source of truth was created anywhere (`projectFacilityStatus` was explicitly never introduced, per instruction). Every Facility-status change CFI6 performs is written as a real `FacilityStatusRecord` through the exact same collection CFI1 established, and read back through the exact same `resolveFacilityStatusAt`/`facilityStatusAt` resolvers CFI1–CFI5 already use. The mapping realized:

```
NEW_FACILITY starts        →  Facility created directly as UNDER_CONSTRUCTION
NEW_FACILITY completes     →  UNDER_CONSTRUCTION → ACTIVE
RECONFIGURE_FACILITY/
DEMOLISH_FACILITY starts   →  ACTIVE → UNDER_RENOVATION  (only if the Facility was ACTIVE)
DEMOLISH_FACILITY completes→  → DEMOLISHED
```

A single-component scope (`ADD_COMPONENT`, `RENOVATE_COMPONENT`, `REPLACE_COMPONENT`, `REMOVE_COMPONENT`) **never** touches Facility-level lifecycle at all — the Facility remains `ACTIVE` throughout, exactly matching the brief's explicit instruction not to close the entire Facility for a scoped project (verified by test "partial closure: a project affecting only one component does not touch the Facility lifecycle").

## 20. CFI4 integration

CFI6 never re-implements or duplicates condition/serviceability state — it **produces** new `FacilityComponentConditionRecord`s through the exact same `createFacilityComponentConditionRecord` factory and `effectiveFrom`/`effectiveTo` historical-append convention CFI4 established and CFI5 already reused. `componentConditionAt`/`componentServiceabilityAt` resolve identically regardless of whether a given record was written by CFI4 (initial), CFI5 (deterioration/repair), or CFI6 (renovation/replacement) — there is exactly one condition-record shape and one resolution algorithm in the whole domain.

## 21. CFI5 integration

**Maintenance needs are never blanket-closed.** `closeRelatedMaintenanceNeeds` closes only needs whose `componentId` matches the component a renovation/replacement/removal actually intervened on — an unrelated need on a different component of the same Facility is left untouched (verified by two paired tests: "a maintenance need related to the intervened component is resolved explicitly" and "an unrelated maintenance need on a different component is left open by the same completion"), exactly matching the brief's own worked example (renovated Court 1 may close Court 1's surface need, but never a roof leak on another component).

## 22. Partial closures

Demonstrated end-to-end: a `RENOVATE_COMPONENT`/`REPLACE_COMPONENT`/`REMOVE_COMPONENT` scope changes only the named component's own CFI4 serviceability record (or `status`), while the Facility itself and every other component remain fully as they were — reusing CFI4's existing serviceability model rather than inventing a parallel "project affects this" flag. `Court 2`/`Court 3` OUT_OF_SERVICE during works, Facility ACTIVE throughout, is exactly the shape a `RECONFIGURE_FACILITY` project with two `renovations` entries would produce if it chose to also mark those components' condition records `OUT_OF_SERVICE` mid-project (CFI6 does not force this — a caller/future refinement can layer an explicit "mark component under works" step using the same CFI4 writes CFI5 already demonstrated, without any new CFI6 mechanism).

## 23. Temporary relocation seam

`FacilityDevelopmentOutcome.requiresTemporaryRelocation: boolean` is set `true` only for `RECONFIGURE_FACILITY` completions (the one scope kind broad enough to plausibly displace a whole team's usage) — a plain derived seam value, never a scheduler and never an automatic `FacilityUsageRight`/`TEMPORARY_HOME` relationship creation. No venue is chosen, no relationship is written; a future consumer reads this boolean and decides what to do with it, exactly as the brief requires ("no elegir venue automáticamente").

## 24. Execution engine

New `src/engine/facilities/FacilityDevelopmentEngine.ts`. Explicit commands, each returning `{ world, outcome }` (the CFI5-precedent shape, §5): `startFacilityDevelopmentProject`, `pauseFacilityDevelopmentProject`, `resumeFacilityDevelopmentProject`, `completeFacilityDevelopmentProject`, `cancelFacilityDevelopmentProject`. `applyFacilityDevelopmentScope` is a `switch` over `scope.kind` that TypeScript enforces is exhaustive (a `never` check in the `default` branch) — adding a new scope kind in a future wave without updating this function is a compile error, not a silently-ignored case. `projectsEligibleToStartAt` is the one read-only "which projects are due" query (§27) — it never starts anything itself, per the explicit instruction to prefer commands over automatic decisions implying a human/institutional choice.

## 25. Atomicity

Every command that changes world truth performs **exactly one `updateGameWorld` call per logical operation** (status transitions call it once via `transition`; `completeFacilityDevelopmentProject` calls `applyFacilityDevelopmentScope` — itself composed of atomic sub-writes per scope kind — then one final `transition` call for the status change). A `RECONFIGURE_FACILITY` completion chains multiple sub-scope applications (`addComponents`, `applyRenovation`, `applyReplacement`, `applyRemoval`), each individually atomic, composed sequentially against the same accumulating `world` value — `updateGameWorld`'s own whole-world `validateWorld` re-check on every call guarantees no invalid intermediate state (e.g. "project COMPLETED but component not created") can ever be committed, matching the brief's explicit requirement verbatim.

## 26. Idempotency

Every engine-generated ID is content-addressed from the project's own identity: `facility:${projectId}` (new Facility), `facility-component:${projectId}:${index}` (additions), `facility-component:${projectId}:replacement` (replacement), `facility-component-condition:${componentId}:${completedAt}` (condition records), `facility-status:${facilityId}:${date}` (status records). Re-running `completeFacilityDevelopmentProject` on an already-`COMPLETED` project is rejected outright by the status-transition guard (`COMPLETED` has no outgoing transitions) before any world-mutating code runs at all — a stronger guarantee than merely relying on duplicate-ID rejection, verified by test "completion is atomic and idempotent: completing twice is rejected rather than duplicating world truth," which additionally asserts exactly one matching component ID exists in `GameWorld` after the (rejected) second attempt.

## 27. Outcomes

`FacilityDevelopmentOutcome`: `{ projectId, previousStatus, newStatus, createdFacilityIds, createdComponentIds, retiredComponentIds, updatedComponentIds, conditionRecordIds, requiresTemporaryRelocation }` — exactly the brief's requested shape (using `requiresTemporaryRelocation` as CFI6's one additional, explicitly-requested seam field in place of a generic `statusChanges` array, since every status change already appears in `previousStatus`/`newStatus` for the single command that produced it, and CFI6 issues one outcome per command rather than a batch needing an internal changelog). Returned as plain data from every command — no event bus, no dispatcher, no connection to Finance/RPG/News/Board/AI anywhere in this file.

## 28. Queries

Added to `FacilityQueries.ts`: `developmentProjectsForFacility`, `developmentProjectsForOrganization`, `activeDevelopmentProjectsAt`, `projectsAffectingComponentAt`, `projectPhases`, `currentProjectPhaseAt`, `isDevelopmentProjectDelayedAt`, `facilitiesUnderDevelopmentAt`, `facilitiesUnderRenovationAt` — exactly the brief's requested list, no additional trivial wrappers. `isDevelopmentProjectDelayedAt` is a pure derived query (never persisted, per §29): `true` only when a non-terminal project's `plannedCompletionDate` has passed as of the query date — a `COMPLETED` project is never retroactively "delayed" regardless of how late its `actualCompletionDate` actually was (verified by a dedicated test). No delay is ever generated randomly; it is a pure function of stored dates.

## 29. GameWorld additions

Two new normalized collections, following the exact existing pattern (`indexById`, `createXxx` factories, `CreateGameWorldInput`, `createGameWorld`, `updateGameWorld`'s `collectionPatchTargets`/`collectionPatchIndexers`, `validateFacilities`'s call into `validateFacilitiesDomain`):

- `facilityDevelopmentProjectsById: Readonly<Record<FacilityDevelopmentProjectId, FacilityDevelopmentProject>>`
- `facilityDevelopmentProjectPhasesById: Readonly<Record<FacilityDevelopmentProjectPhaseId, FacilityDevelopmentProjectPhase>>`

**No derived field was added** — `progress`, `derivedDeterioration`-style summaries, or any percentage-complete value are explicitly absent from `GameWorld` (see §30's progress decision). No existing GameWorld field, collection, factory, or validation rule was altered.

## 30. Progress representation (explicit decision)

The brief's "no guardar un porcentaje arbitrario" instruction was honored by **not adding any `progress`/`percentComplete` field anywhere** — CFI6 has no world-truth progress number at all. A caller wanting a progress signal derives one from `currentProjectPhaseAt`/`projectPhases` (phase N of M complete) or from the elapsed-time ratio between `plannedStartDate`/`actualStartDate` and `plannedCompletionDate`/today, entirely at query time from already-stored dates — never a stored fabrication. This mirrors `isDevelopmentProjectDelayedAt`'s own derive-don't-store philosophy exactly.

## 31. Save changes

Extended Save V4 in place (no Save V5 — the two new collections are purely additive and all-optional, exactly the shape V4 already tolerates), following the exact established per-collection pattern:

- Two new interface fields on `GameWorldSaveV4`.
- Migration defaults (`facilityDevelopmentProjects: [], facilityDevelopmentProjectPhases: []`) added to `migrateGameWorldSaveV3ToV4`.
- Serializer extended with `Object.values(world.xxxById)` for both.
- Deserializer extended with the `hasOwnProperty`-gated `? parseXxx(...) : []` idiom for both.
- Two new parser functions: `parseFacilityDevelopmentProjectPhases` follows the exact `exactKeys` + canonical-factory pattern every prior collection uses. `parseFacilityDevelopmentProjects` does the same for the project's own scalar fields, and delegates the project's `scope` field to a dedicated `parseFacilityDevelopmentProjectScope` helper that reconstructs it through the same `createFacilityDevelopmentProjectScope` domain factory used everywhere else in the domain — deliberately not a bespoke re-implementation of the discriminated union's own validation rules inside the Save layer, keeping the domain factory the single source of truth for what a valid scope looks like (per the repository's "store vs. derive"/single-source-of-truth discipline established since CFI3).
- One pre-existing V4 test (`GameWorldSaveV4.test.ts`'s "migrates canonical V3 by preserving V3 fields and adding empty runtime state") updated to also destructure and assert the two new empty fields — the same test-maintenance pattern already applied identically at every prior CFI gate.

## 32. Backward compatibility

A Save V4 payload written before CFI6 (missing both new collections entirely) continues to load correctly: both `hasOwnProperty` checks report `false`, neither `exactKeys` allow-list is consulted, and both collections default to `[]` via `createGameWorld`'s own fallback — **no historical project is ever fabricated for a pre-existing Facility**, explicitly tested (`GameWorldSaveV4.FacilityDevelopment.test.ts`, "a pre-CFI6 V4 payload...still loads with empty, valid defaults") by taking a real serialized payload, deleting both keys, and deserializing — mirroring every prior CFI gate's backward-compatibility test methodology exactly.

## 33. Validation

Added to `FacilityValidation.ts`'s `validateFacilitiesDomain`, entirely additive, via two new context fields (`developmentProjects`, `developmentProjectPhases`) and two new helpers (`assertScopeReferencesResolve`, `assertValidPhaseSequencing`):

- Duplicate project IDs; duplicate phase IDs.
- `organizationId` must reference a known Organization; `facilityId` (when present) must reference a known Facility.
- Every component a scope names (`RENOVATE_COMPONENT.componentId`, `REPLACE_COMPONENT.retiredComponentId`, `REMOVE_COMPONENT.componentId`, and every corresponding sub-scope inside a `RECONFIGURE_FACILITY` bundle) must already exist **and belong to the same Facility the project targets** — a cross-Facility reference is rejected (verified by a dedicated test), not merely "component exists somewhere."
- `DEMOLISH_FACILITY.facilityId` must reference a known Facility.
- Phases: `projectId` must reference a known project; phase `sequence` numbers within one project must be unique **and contiguous starting at 1** (no gaps) — both violations explicitly tested.
- Impossible dates, `actualCompletionDate` before `actualStartDate`, `actualStartDate` before `createdAt`, `plannedCompletionDate` before `plannedStartDate` are all rejected at the individual factory-construction boundary (`createFacilityDevelopmentProject`/`createFacilityDevelopmentProjectPhase`), consistent with every prior CFI's validation convention.
- Replacement old/new identity collision is structurally impossible by construction: the replacement's new component ID (`facility-component:${projectId}:replacement`) is never equal to `retiredComponentId` (a real, pre-existing ID), so no explicit "collision" check was needed beyond `GameWorld`'s own duplicate-ID guard, which would reject an actual collision regardless.
- Hierarchy-after-project validity is guaranteed by CFI3's own pre-existing `assertValidComponentHierarchy`, run unconditionally on the full component set on every `updateGameWorld` call — CFI6 introduces no separate hierarchy check because none was needed; any invalid parent/child result from a CFI6 completion is caught by the same mechanism that already protects CFI1–CFI5.
- Completion creating a duplicate component ID is rejected by `GameWorld`'s own `indexById` duplicate-ID guard (the same mechanism CFI5's idempotency relies on, §26).

## 34. Tests added

Three new files, 76 tests total (no CFI1–CFI5 test was modified beyond the one Save V4 migration-test maintenance edit noted in §31):

- `src/domain/facilities/FacilityDevelopmentProjects.test.ts` (23 tests): planned NEW_FACILITY project creation, CREATE_FACILITY facilityId-timing invariants, project-type/scope-kind compatibility rejection, transition-graph coverage (including the two explicitly-blocked transitions), CANCELLED-requires-cancelledAt rejection, multi-phase sequencing and `currentProjectPhaseAt` resolution, duplicate/non-contiguous phase sequence rejection, orphan-phase rejection, `isDevelopmentProjectDelayedAt` (both the true and completed-never-delayed cases), full-history queries (`developmentProjectsForFacility`/`developmentProjectsForOrganization`), `activeDevelopmentProjectsAt`'s future-date exclusion, `projectsAffectingComponentAt`, `facilitiesUnderDevelopmentAt`/`facilitiesUnderRenovationAt`'s type-flavor distinction, cross-Facility scope-reference rejection, missing-component-reference rejection, duplicate project ID rejection, unknown-Organization rejection.
- `src/engine/facilities/FacilityDevelopmentEngine.test.ts` (23 tests): all 33 numbered brief scenarios that are engine-shaped, condensed to distinct-rule coverage rather than one test per number (several numbers share one assertion, e.g. #2/#3/#4 in a single "starts a NEW_FACILITY project...and completing it activates the Facility" test) — NEW_FACILITY lifecycle end-to-end, component addition + derived capability, renovation identity-preservation + CFI4 write, replacement identity-change + old-history preservation, removal without deletion, modernization without a new component, partial closure not touching Facility lifecycle, facility-wide reconfiguration touching lifecycle, condition-after-project not-necessarily-100, pause/resume, cancellation preserved historically, completion atomicity + idempotency (rejecting a second completion), multiple simultaneous projects on different components applying independently, related-need-closed vs. unrelated-need-preserved, demolition preserving component identity, decommissioned-facility-remains-queryable, outcome shape, the temporary-relocation seam, invalid-start-from-IN_PROGRESS rejection, invalid-complete-before-start rejection, `projectsEligibleToStartAt`'s pure-query behavior (never starting anything itself), and a determinism/reload-equivalence check.
- `src/save/GameWorldSaveV4.FacilityDevelopment.test.ts` (7 tests): round-trip of a CREATE_FACILITY-scoped project with no facilityId, a RENOVATE_COMPONENT scope with technical-standard upgrade, a full RECONFIGURE_FACILITY bundle (additions + renovations + replacements), a multi-phase project, a CANCELLED project's `cancelledAt`, the pre-CFI6-payload backward-compatibility test, and a query-identical-after-reload check.
- One pre-existing test updated for CFI6 (§31).

Deliberately not added: a test per enum value, or redundant coverage of behavior CFI1–CFI5 already certified (e.g. `componentConditionAt`'s own tie-breaking) — matching the brief's own "no sobre-testear enums" instruction and the precedent set by every prior CFI gate's certification report.

## 35. Accumulated Facilities gate

`npx vitest run src/domain/facilities src/engine/facilities`: **187/187 PASS** (8 files: 141 pre-existing CFI1–CFI5 tests, unchanged, plus 46 new CFI6 tests: 23 domain + 23 engine).

`npx vitest run src/domain/facilities src/engine/facilities src/save/GameWorldSaveV4.test.ts src/save/GameWorldSaveV4.FacilityDevelopment.test.ts src/save/GameWorldSaveV4.FacilityOperations.test.ts src/save/GameWorldSaveV4.FacilityCondition.test.ts src/save/GameWorldSaveV4.FacilityAnatomy.test.ts src/save/GameWorldSaveV4.Facilities.test.ts`: **257/257 PASS across 14 files** — the full Facilities-domain + Facilities-engine + every directly-affected Save V4 file, including all 7 new CFI6 Save tests and the 1 updated migration test.

A prior single combined run of the entire `src/save/` directory (broader than the reduced gate requires) surfaced 5 failing tests, all `Error: Test timed out in 5000ms` under parallel load — none in a CFI6-touched file (`GameWorldSaveV4.FacilityAnatomy.test.ts`, `GameWorldSaveV4.FacilityCondition.test.ts`, `MoralePersistence.test.ts`, `PlayerRatingHistoryPersistence.test.ts`), and `MoralePersistence.test.ts`/`PlayerRatingHistoryPersistence.test.ts` do not import anything from the Facilities domain at all. Re-run individually with a longer timeout, all 4 files (14 tests) passed cleanly — confirmed as the same pre-existing full-suite timeout flakiness under parallel load documented in every prior CFI certification report (CFI3–CFI5), not a CFI6 regression, and per the standing instruction not to re-investigate known historical timeout flakiness without new evidence, none of which surfaced here.

## 36. Typecheck

`npm run typecheck` (`tsc -b --pretty false`): **clean, zero errors**, on the final pass (two intermediate rounds surfaced and fixed: (1) forgetting that ID-shaped scope fields need a separate widened input type from the canonical branded-ID output type — resolved by introducing `CreateFacilityDevelopmentProjectScopeInput`/per-kind `Create...ScopeInput` types, §10; (2) the `CREATE_FACILITY`-scope `facilityId`-timing invariant initially forbidding `facilityId` unconditionally, which conflicted with the engine legitimately setting it once construction starts — resolved by gating the check on `actualStartDate === null`, §12).

## 37. Build

`npm run build` (`tsc -b && vite build`): **succeeds.** Same pre-existing chunk-size warning as every prior wave (unrelated, predates this branch).

## 38. `git diff --check`

Clean — only benign LF/CRLF normalization notices on the newly-created/touched files (a pre-existing repo-wide line-ending convention difference, not introduced by CFI6), no trailing-whitespace or conflict-marker errors. Diff scope: exactly 16 files (2 in `src/domain/ids/`, 8 in `src/domain/facilities/` including 4 new files, 1 in `src/domain/world/`, 1 in `src/engine/facilities/index.ts` plus 2 new engine files, 3 in `src/save/`) — zero files outside the Facilities/Save/engine/ids boundary touched.

## 39. Skipped gates

Per CFI6's explicit reduced test-gate policy:

- **`cargo fmt`/`cargo check` were deliberately NOT run** — CFI6 touched no Rust/Tauri code.
- **The full repository test suite was deliberately NOT run** — no cross-cutting infrastructure was modified beyond `GameWorld.ts`/`FacilityValidation.ts`/`FacilityQueries.ts`/Save V4 (all already covered by §35's targeted runs), the only regression-looking evidence found (§35's 5 timeouts) was confirmed to be pre-existing flakiness unrelated to any CFI6-touched file, and a full run was not explicitly requested.

## 40. Technical debt

- **`FacilityDevelopmentOutcome` has no batched/multi-action variant** — `completeFacilityDevelopmentProject` handles one project at a time, and `RECONFIGURE_FACILITY`'s internal sub-scope loop is sequential (not parallel-batched into a single lower-level write per kind). This mirrors CFI5's own per-facility granularity and was judged sufficient for CFI6's scope; a future wave orchestrating many simultaneous large projects across many facilities in one call may want a batched `completeFacilityDevelopmentProjects` variant.
- **The `PROJECT_TYPE_COMPATIBLE_SCOPE_KINDS` compatibility map is intentionally permissive** (several project types accept multiple scope kinds) rather than a strict 1:1 mapping — a deliberate choice favoring flexibility over rigid classification, but worth revisiting if a future consumer (e.g. reporting) needs a canonical single scope-kind-per-type mapping instead.
- **No enforcement that a `RECONFIGURE_FACILITY`/`DEMOLISH_FACILITY` project's Facility-lifecycle transition to `UNDER_RENOVATION` is ever reverted back to `ACTIVE` automatically on completion for the renovation case** (only `DEMOLISH_FACILITY`'s completion writes a further status transition, to `DEMOLISHED`) — a completed `RECONFIGURE_FACILITY` project currently leaves the Facility in whatever status `startFacilityDevelopmentProject` set it to (`UNDER_RENOVATION`) rather than restoring `ACTIVE`. This is a real, deliberately-scoped-out gap: fixing it requires deciding whether "renovation complete" should always mean "back to ACTIVE" (not necessarily true for a project whose scope includes a `DEMOLISH_FACILITY` sub-step, though CFI6's `ReconfigureFacilityScope` cannot currently express that) — flagged here rather than silently left as an assumed-correct behavior, and recommended as the first small fix for CFI6.1/CFI7's own facility-lifecycle-completion work.

## 41. Deliberately deferred scope

Exactly the CFI6 "NO IMPLEMENTAR" list from the brief: project money, CAPEX, OPEX, budgets, loans, grants, debt, contractors, procurement, tenders, labor simulation, permit bureaucracy, geographic construction rules, venue scheduler, attendance, ticketing, sporting bonuses, training modifiers, injury modifiers, board approval logic, AI strategy, RPG, News, UI, and any wiring into `CalendarEngine.ts`'s `advanceDay`. Also deliberately not done: any change to CFI1's `FacilityLifecycle`/`FacilityStatusHistory` enums, CFI3's `FacilityComponent`/capability model, CFI4's `PhysicalCondition`/`FacilityServiceability`/`FacilityTechnicalStandard`, or CFI5's `FacilityMaintenanceNeed`/`FacilityMaintenanceAction`/`FacilityInspection`/`FacilityOperationalIncident` (all reused exactly as-is), and any change to `Organization`, `Team`, `Competition`, `Season`, or `Game`.

## 42. Exact proposal for CFI7

1. **Finance ledger integration**: attach monetary cost/budget/financing to `FacilityDevelopmentProject`/`FacilityDevelopmentProjectPhase` by referencing their existing stable `id`s from a new Finance-owned ledger-event entity, rather than adding cost fields directly onto CFI6's domain types (which deliberately have none) — preserving CFI6 as a pure physical-project-execution layer that Finance observes and gates, not one Finance edits.
2. **Board/Governance approval integration**: wire `APPROVED` status transitions to a real Governance decision record (who approved, what authority grant justified it) once Governance's own decision-participation model can express "approve a Facility development project" as a decision kind — CFI6's `APPROVED` status already exists as the world-truth slot this would populate, requiring no CFI6 schema change.
3. **Facility-lifecycle-completion fix** (see §40): decide and implement the correct post-`RECONFIGURE_FACILITY`-completion lifecycle transition back to `ACTIVE` (or an explicit alternative) as a small, targeted addition to `completeFacilityDevelopmentProject`.
4. **Cost-aware progress/earned-value**: once CFI7 exists, a derived "earned value" query (planned cost vs. actual cost vs. physical phase completion) becomes possible without CFI6 itself storing any percentage — exactly the seam §30 left open.
5. **Application-layer read boundary** (carried over from CFI1–CFI5's own still-outstanding recommendation): a thin `src/app/facilities` module exposing the now-complete anatomy/capability/condition/serviceability/maintenance/development query surface to future UI/Zustand consumers.

No push or merge performed. Commit created only after this report's §35 test results and §36/§38 gate results were all confirmed green.
