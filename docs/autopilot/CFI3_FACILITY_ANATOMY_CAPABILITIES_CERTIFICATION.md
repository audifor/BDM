# CFI3 — Club Facilities & Infrastructure V2 — Facility Anatomy & Capabilities Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi3-anatomy-capabilities`, created from the certified CFI2S tip `a5365e1` in `C:\BDM-FACILITIES`.

## 2. Initial SHA

`a5365e1d77eabdbc0f593a29fcffb97a4734979c` (`docs(facilities): record CFI2S final commit SHA in certification report`). Verified as HEAD with a clean working tree before any CFI3 edit.

## 3. Final SHA

`83537eb60153ef1c32eddc2f7e0ff1e73701508b`, plus the small SHA-reference follow-up commit carrying this line (matching the CFI2/CFI2S lineage's own convention).

## 4. Commits

Two atomic commits, matching the CFI1/CFI2/CFI2S lineage's own convention:

1. `83537eb` — `feat(facilities): add component anatomy, hierarchy and derived capabilities (CFI3)` — the domain model (`FacilityComponent.ts`, new `FacilityComponentCategory.ts`, `FacilityComponentSpecification.ts`, `FacilityComponentCapability.ts`), extended `FacilityValidation.ts`/`FacilityQueries.ts`/`index.ts`, the localized Save V4 extension, and both new test files.
2. `docs(facilities): add CFI3 anatomy & capabilities certification report` — this file.

No push, no merge, per instructions.

## 5. CFI1–CFI2(S) architecture audit

Read in full before writing any code: `Facility.ts`, `FacilityComponent.ts`, `FacilityValidation.ts`, `FacilityQueries.ts`, `index.ts`, the Save V4 `FacilityComponent` wiring in `GameWorldSaveV4.ts`, and the `GameWorld.ts` Facilities collection list. Findings:

- **`FacilityComponent` (CFI1) already existed** with `id`, `facilityId`, `type` (a flat 20-value enum), `name`, `status`, `capacity`, `quantity`, `openedAt`, `closedAt`. This is the exact model CFI3 was told to evolve, not replace — confirmed no second component system exists anywhere, and no legacy catalog of facilities/components exists outside `src/domain/facilities/` (the only other hits for "facility"/"component" keywords are the disconnected `ClubFacilities.jsx` PCB mockup, correctly excluded per instruction, and unrelated match-court rendering geometry).
- **`FacilityPhysicalProfile` (CFI1, embedded in `Facility`)** already carries `openedOn`, `totalCapacity`, `seatedCapacity`, `standingCapacity`, `courtCount`, `hasAccessibilityProvision` — this is **Facility-level** aggregate physical truth (e.g. "this Facility has 12000 total seats") and is explicitly **not** touched or duplicated by CFI3's **component-level** anatomy; the two remain complementary, not overlapping.
- **`Facility.capabilities: readonly FacilityCapability[]` (CFI1, `FacilityType.ts`) already exists** as a small, coarse, **explicitly stored** 8-value catalog (`HOSTS_COMPETITIVE_MATCHES`, `HOSTS_TRAINING_SESSIONS`, etc.) directly on the `Facility` entity itself. This is a **different, pre-existing concept** from what CFI3's brief asks for (a much richer, component-derived capability catalog like `HYDROTHERAPY`, `CRYOTHERAPY`, `MEDICAL_IMAGING`). **Decision, documented up front to avoid collision**: CFI3 introduces a **new, separate, non-overlapping name** — `FacilityComponentCapability` — in its own file, and does not modify, rename, or deprecate CFI1's `FacilityCapability`/`Facility.capabilities` field in any way. The two coexist: the old field is a small set of broad, author-declared facts; the new one is a larger set of specific, deterministically-derived-from-components facts.
- **Save V4's `FacilityComponent` wiring (CFI2S)** already has a working `parseFacilityComponents`/serializer pair using the exact `exactKeys` + `createFacilityComponent` factory pattern every other Facilities collection uses. This is the wiring CFI3 extends in place (see §15), not a parallel Save path.
- **`GameWorld.ts`'s Facilities section** exposes `facilityComponentsById: Readonly<Record<FacilityComponentId, FacilityComponent>>` as one of the twelve normalized collections; since `FacilityComponent`'s *shape* evolved but the *collection* did not change identity, **no `GameWorld.ts` edit was needed at all** — confirmed by `git status` showing zero changes to that file throughout CFI3.

**Conclusion of the audit**: every structure CFI1 introduced could be extended directly. No second component system, no second capability system, no second Save path was created.

## 6. FacilityComponent changes

`FacilityComponent` (`FacilityComponent.ts`) gained three new optional fields, all additive and backward-compatible:

- `parentComponentId: FacilityComponentId | null` — optional hierarchy (see §9).
- `specification: FacilityComponentSpecification | null` — optional richer physical detail (see §8).
- `equipmentTags: readonly string[]` — the minimal Equipment seam (see §11), defaulting to `[]`.

`FACILITY_COMPONENT_TYPES` grew from 20 to 90 distinct values, absorbing every family the brief listed (basketball, training/performance, medical, recovery, player support, staff/administration, media, spectator/arena, commercial/hospitality, academy, residential, logistics/transport). Every CFI1-original value is preserved unchanged (no renames, no removals) so no existing Save data or test becomes invalid.

`createFacilityComponent` gained validation for the three new fields (self-parent rejection, specification factory delegation, duplicate/empty equipment-tag rejection) without altering any existing validation rule.

## 7. Component taxonomy

New `FacilityComponentCategory.ts`: a closed 20-value family enum (`BASKETBALL`, `TRAINING`, `PERFORMANCE`, `MEDICAL`, `RECOVERY`, `PLAYER_SUPPORT`, `STAFF`, `ADMINISTRATION`, `MEDIA`, `SPECTATOR`, `COMMERCIAL`, `HOSPITALITY`, `ACADEMY`, `RESIDENTIAL`, `LOGISTICS`, `TRANSPORT`, `SECURITY`, `COMMUNITY`, `UTILITIES`, `OTHER`) matching the brief's list exactly, plus a `componentCategory(type)` pure function backed by an **exhaustive** `Readonly<Record<FacilityComponentType, FacilityComponentCategory>>` map — TypeScript's structural exhaustiveness check on this map is what caught a real gap during development (see §21) before any test ran. The category is **never independently stored** on a component (per the brief's principle that "no existe un único facility rating" extends to "no dupliques la categoría junto al tipo") — it is always recomputed from `type`, so the two can never silently disagree. TRAINING and PERFORMANCE were kept as two separate categories (STRENGTH_ROOM/CARDIO_AREA are training; BIOMECHANICS_LAB/PERFORMANCE_LAB/ALTITUDE_ROOM are performance) since the brief listed both as candidate families and they represent a real distinction (repeatable conditioning work vs. specialized performance science).

`SECURITY`, `COMMUNITY`, and `UTILITIES` categories exist in the enum (per the brief's minimum list) but currently have no component type mapped to them — this is intentional and matches the brief's own instruction that the taxonomy need not be exhaustively populated yet; the categories are reserved for future component types (e.g. a future `SECURITY_OFFICE` or `UTILITY_ROOM`) without requiring another category-enum change.

## 8. Component specifications

New `FacilityComponentSpecification.ts`, a discriminated union (`kind: 'COURT' | 'CAPACITY'`):

- **`CourtSpecification`**: `isFullCourt`, `isIndoor`, `lengthMeters`/`widthMeters` (nullable, non-negative finite), `surface` (`HARDWOOD`/`SYNTHETIC`/`CONCRETE`/`ASPHALT`/`RUBBER`/`OTHER`, nullable), `basketCount` (nullable non-negative integer), `competitionCapable` (boolean fact, not a homologation decision — see below), `spectatorCapacity` (nullable), `hasCompetitionLighting`/`hasShotTrackingTechnology`/`hasVideoTrackingTechnology` (nullable booleans). No NBA/FIBA rule (minimum dimensions, required lighting lux, etc.) is encoded — `competitionCapable` is recorded as a plain fact the world already knows, never computed from a regulatory formula; homologation remains explicitly out of CFI3's scope, exactly as instructed.
- **`CapacitySpecification`**: `unit` (`SIMULTANEOUS_PLAYERS`/`LOCKERS`/`TREATMENT_STATIONS`/`SEATS`/`BEDS`/`PARKING_SPACES`/`SPECTATORS`/`OTHER`) + `amount` (non-negative integer). This directly answers the brief's "no existe una sola capacidad" principle: a `LOCKER_ROOM`'s 18 lockers and a `PARKING`'s 500 spaces are never confused, because the unit is explicit and validated, not inferred from context.

`specification` remains **optional** on every component (`null` = no richer specification recorded, never coerced to a false zero/default) — the simple, pre-existing `capacity`/`quantity` fields remain the default path for components with no meaningful richer semantics (an office, a generic storage room), so no mega-interface was created and no component is forced to populate fields it has no use for.

## 9. Hierarchy model

`FacilityComponent.parentComponentId: FacilityComponentId | null`, optional and unbounded in depth (the brief explicitly asked not to impose an arbitrary depth limit, only to reject incoherent combinations). Validated in `FacilityValidation.ts`'s new `assertValidComponentHierarchy`:

- a referenced parent must exist;
- a parent must belong to the **same Facility** as its child (cross-Facility parenting is always incoherent and rejected);
- the graph must be **acyclic** (a DFS with a `visiting`/`resolved` two-set algorithm detects any cycle, including indirect ones, not just direct self-parenting — self-parenting itself is additionally rejected earlier, at the `createFacilityComponent` factory boundary, so it can never even be constructed as a single record).

A component with no parent is a root component (`rootComponentsOfFacility`); `childComponentsOf` resolves direct children only (one level), matching the brief's worked example (`Performance Center -> Recovery Area -> Cold Tub`) without requiring callers to walk the tree themselves for the common one-level case.

## 10. Capabilities model

New `FacilityComponentCapability.ts`. **Decision documented per the brief's explicit request (§"CAPABILITIES", option A vs B): capabilities are derived (option B), never independently stored.** Rationale: storing them would let a capability drift out of sync with the components that justify it (e.g. a `HYDROTHERAPY` flag surviving after its only `HYDROTHERAPY_POOL` component is closed/removed) — exactly the redundant-derivable-data anti-pattern CFI2S's own certification and this project's `AGENTS.md` both warn against ("Do not persist derived values when they can be reconstructed from source-of-truth data").

16 capabilities (`BASKETBALL_FULL_COURT`, `BASKETBALL_TRAINING`, `STRENGTH_TRAINING`, `CARDIO_TRAINING`, `HYDROTHERAPY`, `CRYOTHERAPY`, `PHYSIOTHERAPY`, `MEDICAL_EXAMINATION`, `MEDICAL_IMAGING`, `VIDEO_ANALYSIS`, `PLAYER_DINING`, `PLAYER_RESIDENTIAL`, `PRESS_CONFERENCE`, `LIVE_BROADCAST`, `HOSPITALITY`, `RETAIL`), matching the brief's list exactly. Each capability maps to one or more justifying component types (a capability may depend on any one of several types being present — e.g. `HOSPITALITY` is satisfied by a lounge, a restaurant, a bar, or a sponsor lounge). `BASKETBALL_FULL_COURT` additionally checks, when a `CourtSpecification` is recorded, that `isFullCourt` is true — but a court recorded with no specification at all is presumed capable rather than penalized for missing detail (absence of data is not evidence of absence of capability, per the brief's "la ausencia de un dato debe poder representarse sin inventar precisión" principle).

`capabilitiesOfFacility`/`facilityHasCapability`/`facilitiesWithCapability` are pure, deterministic, `onDate`-parameterized resolvers over `activeFacilityComponentsAt` — no capability is ever computed from a CLOSED or not-yet-opened component.

## 11. Equipment seam

Minimal, as instructed: `FacilityComponent.equipmentTags: readonly string[]` (default `[]`), free-form-but-non-empty, duplicate-free strings (e.g. `'MRI'`, `'FORCE_PLATES'`, `'SHOT_TRACKING_CAMERAS'`). No `Equipment` entity, no equipment lifecycle, no equipment-to-capability derivation was introduced — this is purely the reserved attachment point a future CFI4+ Equipment domain can build on without requiring another `FacilityComponent` schema change. Documented in the field's own doc comment in `FacilityComponent.ts` so the seam's intent is discoverable in the code itself, not only in this report.

## 12. Validation

Added to `FacilityValidation.ts` (`validateFacilitiesDomain`), all additive to the existing checks (which remain unchanged):

- `assertValidComponentHierarchy`: missing parent, cross-Facility parent, and cycle detection (§9).
- Specification-level validation lives at the factory boundary (`createCourtSpecification`/`createCapacitySpecification` in `FacilityComponentSpecification.ts`) rather than duplicated into `FacilityValidation.ts`: negative/non-finite court dimensions, invalid surface enum, negative capacity amounts, and invalid specification `kind` discriminants are all rejected there, consistent with how every other CFI1/CFI2 sub-value-object (e.g. `FacilityPhysicalProfile`) validates itself at construction rather than being re-validated a second time by the domain-wide validator.
- Equipment-tag validation (non-empty, no duplicates) lives at the `createFacilityComponent` factory boundary, matching the same pattern.

No NBA/FIBA regulatory rule was introduced anywhere in validation, per the explicit instruction.

## 13. Queries

Added to `FacilityQueries.ts` (all pure, deterministic, `onDate`-parameterized, delegating to existing lower-level resolvers rather than duplicating filtering logic):

`componentsOfFacility`, `componentsOfFacilityByCategory`, `componentsOfFacilityByType`, `childComponentsOf`, `rootComponentsOfFacility`, `courtsOfFacility`, `practiceCourtsOfFacility`, `medicalComponentsOfFacility`, `recoveryComponentsOfFacility`, `trainingComponentsOfFacility`, `capabilitiesOfFacility`, `facilityHasCapability`, `facilitiesWithCapability`, `usableComponentsForTeamAt`.

`activeFacilityComponentsAt` itself was **relocated** from `FacilityQueries.ts` into `FacilityComponent.ts` (and re-exported from `FacilityQueries.ts` under the same name, so no external import path changed) to avoid a circular module dependency: `FacilityComponentCapability.ts` needs it, and `FacilityQueries.ts` needs `FacilityComponentCapability.ts`'s resolvers, so the shared primitive had to live below both. This is a pure internal reorganization with zero behavioral change (confirmed by the full pre-existing CFI1/CFI2 test suite passing unchanged).

## 14. Rights integration

`usableComponentsForTeamAt` is a **thin alias** of CFI2's existing `facilityComponentsUsableByTeamAt` — it delegates to the exact same function rather than reimplementing usage-right scope resolution, per the explicit instruction "no duplicar la lógica de Access." Test #17/#18 (`FacilityAnatomyCapabilities.test.ts`) confirm this integration: a whole-facility usage right resolves to every currently-ACTIVE component (never a CLOSED one), and a component-scoped EXCLUSIVE right correctly resolves to only its own component.

## 15. Save changes

Localized to `GameWorldSaveV4.ts`'s existing `FacilityComponent` serializer/parser only — **no new Save collection, no new Save version, no other Facilities parser touched**:

- The serializer needed **no change**: it already does `Object.values(world.facilityComponentsById)`, and the new fields are simply present on every `FacilityComponent` object as part of its existing shape.
- `parseFacilityComponents` extended to conditionally accept `parentComponentId`/`specification`/`equipmentTags` via three independent `Object.prototype.hasOwnProperty.call(...)` checks, each gating both the `exactKeys` allow-list and the reconstructed input — so a payload that has all three, some, or none of them all parse correctly.
- New `parseFacilityComponentSpecification` helper (COURT/CAPACITY discriminated parsing, each branch `exactKeys`-gated), reusing the file's existing `boolean`/`nullableNumber`/`nullableInteger`/`number` helpers rather than introducing new ones.

## 16. Backward compatibility

A Save V4 payload written **before CFI3** (a `FacilityComponent` record with exactly the pre-CFI3 nine keys and none of the three new ones) continues to load correctly: `hasOwnProperty` correctly reports `false` for all three, so `exactKeys` does not expect them and the factory receives no override for them, falling through to `createFacilityComponent`'s own defaults (`parentComponentId: null`, `specification: null`, `equipmentTags: []`). This is explicitly tested (§18, test "a pre-CFI3 V4 payload...still loads with correct defaults") by taking a real serialized payload and deleting the three keys entirely (not merely nulling them) before deserializing, to simulate a genuinely pre-CFI3 save rather than a same-version payload that happens to have null values.

## 17. Tests added

Two new files, 26 tests total:

- `src/domain/facilities/FacilityAnatomyCapabilities.test.ts` (21 tests): all 18 numbered scenarios from the brief (arena with main court, training center with multiple practice courts, individually identifiable courts with distinct rights, component hierarchy, invalid cross-facility parent, cycle rejection, medical suite, recovery suite, performance center, academy components, residential components, arena spectator components, component-specific capacity, capability derivation, missing capability, multiple capabilities, component-scoped usage integration, usable components for team) plus 3 targeted malformed-input tests (invalid court dimensions, malformed specification discriminated union, negative capacity amount) — deliberately not decades of trivial enum tests, per the explicit instruction.
- `src/save/GameWorldSaveV4.FacilityAnatomy.test.ts` (5 tests): exactly the persistence tests the three new `FacilityComponent` fields need — hierarchy round-trip, COURT specification round-trip (every field populated), CAPACITY specification round-trip alongside a `null`-specification component, `equipmentTags` round-trip (including the empty-array case), and the pre-CFI3-payload backward-compatibility test (§16/§19).

Tests #19/#20 from the brief ("save round-trip of CFI3 fields" / "old save without new CFI3 fields still loads") are exactly what `GameWorldSaveV4.FacilityAnatomy.test.ts` covers.

## 18. Facilities test result

`npx vitest run src/domain/facilities/`: **74/74 PASS** (3 files: 18 CFI1 + 35 CFI2 = 53 unchanged from CFI2S, plus 21 new CFI3 tests).

## 19. Affected Save tests

`npx vitest run src/save/GameWorldSaveV4.test.ts src/save/GameWorldSaveV4.Facilities.test.ts src/save/GameWorldSaveV4.FacilityAnatomy.test.ts`: **49/49 PASS** (14 pre-existing V4 tests unchanged, 30 pre-existing CFI2S Facilities round-trip tests unchanged and still correctly proving the pre-CFI3 `FacilityComponent` shape round-trips, 5 new CFI3 tests).

## 20. Related tests

Searched for every other consumer of `@/domain/facilities` in the repository: only `src/domain/world/GameWorld.ts` (unchanged — `git status` confirms zero diff to it, since `FacilityComponent`'s collection identity in `GameWorld` did not change, only its element shape) and the Save V4 file already covered in §19. No other file in the codebase imports from the Facilities domain, so no further "related" test category exists to run.

## 21. Typecheck

`npm run typecheck` (`tsc -b --pretty false`): **clean, zero errors** — and specifically caught one real authoring mistake before any test ran: the initial `FACILITY_COMPONENT_TYPE_CATEGORY` exhaustive map was missing an entry for `MEDIA_ROOM` (a CFI1-original type carried into the expanded taxonomy), and TypeScript's structural check on the `Readonly<Record<FacilityComponentType, FacilityComponentCategory>>` type immediately flagged the omission by name. This is exactly the kind of drift-prevention "no serializar/derivar incorrectamente" the exhaustive-map design was chosen to provide.

## 22. `git diff --check`

Clean (exit 0) against the staged CFI3 diff — only benign LF/CRLF normalization notices, no trailing-whitespace or conflict-marker errors. Diff scope: exactly 9 files (5 in `src/domain/facilities/`, 1 new + 1 modified in `src/save/`) — zero files outside the Facilities/Save boundary touched.

## 23. Additional gates actually executed

Per CFI3's explicit reduced test-gate policy:

- `npm run build` (`tsc -b && vite build`): **succeeds**, run as the cheap final gate. Same pre-existing chunk-size warning as every prior wave (unrelated, predates this branch).
- `Math.random(` sweep restricted to the touched directories (`src/domain/facilities`, `src/save`): **zero hits**.
- **`cargo fmt`/`cargo check` were deliberately NOT run** — CFI3 modified no Rust/Tauri code, per the explicit instruction to skip Rust checks absent a concrete reason.
- **Full suite was deliberately NOT run** — no transversal regression evidence appeared, no shared infrastructure was modified (only additive Facilities-domain and localized Save-parser changes), and it was not explicitly requested. Per the explicit instruction not to spend time re-validating known machine-load timeouts (documented and independently re-verified at every prior gate in this lineage) without new evidence.

## 24. Technical debt

- **`SECURITY`, `COMMUNITY`, `UTILITIES` categories have no mapped component type yet** — reserved for future types, not a gap in coverage of anything the brief asked CFI3 to model now.
- **`CourtSpecification.competitionCapable` is a bare boolean fact with no link to any regulatory authority** — by design (homologation is explicitly deferred), but a future regulatory layer will need to decide whether this field becomes derived from an approval record or remains an independent world-truth flag; that decision is not made here.
- **`equipmentTags` is an unvalidated free-form string catalog** (beyond non-empty/no-duplicates) — intentionally minimal per the brief's explicit "no crear todavía un sistema completo de Equipment"; a real Equipment domain will likely want a closed enum or its own entity instead of ad hoc strings, but that redesign is out of CFI3's scope.
- **`assertValidComponentHierarchy`'s cycle-detection DFS is O(n) per component in the worst case** (so O(n²) overall for a facility with many hierarchically-linked components) — acceptable at CFI3's expected scale (a handful of nested components per Facility) but should be revisited if a world ever has facilities with deep, wide component hierarchies.

## 25. Deliberately deferred work

Exactly the CFI3 "NO IMPLEMENTAR" list: quality ratings, condition, wear, maintenance, deterioration, renovation, construction projects, CAPEX, OPEX, financial effects, sporting bonuses, injury modifiers, attendance, ticketing, venue scheduler, AI, RPG events, UI. Also deliberately not done: any change to CFI1's `Facility.capabilities`/`FacilityCapability` field (left fully alone, see §5), any NBA/FIBA court-homologation rule, any Equipment entity system beyond the `equipmentTags` seam, and any change to `GameWorld.ts`, `Organization`, `Team`, `Competition`, `Season`, or `Game`.

## 26. Exact proposal for CFI4

1. **Condition/quality layer**: introduce a separate, explicitly-derived-or-explicitly-stored (to be decided then, following the same store-vs-derive discipline CFI3 used for capabilities) `FacilityComponentCondition`/`FacilityQualityAssessment` concept — `condition`, `wear`, `age`-sensitivity, `modernity` — strictly layered on top of CFI3's "what exists" anatomy, never mixed into it. CFI3's `FacilityComponent`/`FacilityComponentSpecification`/`FacilityComponentCapability` models should not need to change shape for this; CFI4 should be addable as a new, independent GameWorld collection keyed by `FacilityComponentId`.
2. **Equipment domain** (if and when real gameplay need justifies the scope): promote `equipmentTags` into a proper `Equipment` entity with its own identity, condition, and possibly its own ownership/maintenance lifecycle, migrating the current free-form tags deterministically.
3. **Regulatory/homologation layer**: consume `CourtSpecification`'s physical facts (dimensions, lighting, capacity) plus `FacilityCompetitionApproval` (CFI1) to derive real competition-eligibility decisions per competition ruleset, without encoding any specific federation's rules into the Facilities domain core.
4. **Application-layer read boundary** (carried over from CFI1/CFI2's own still-outstanding recommendation): a thin `src/app/facilities` module exposing the now-rich anatomy/capability/rights query surface to future UI/Zustand consumers.
5. **World generation / seed data** (also carried over): extend `WorldGenerator`/World DB bootstrap to optionally attach deterministic starter components (a main court, a locker room, a weight room) to generated Facilities, as pure world-truth fixture data with no quality dimension yet.

No push or merge performed. Commit created only after this report's §18/§19/§20 test results and §22/§23 gate results were all confirmed green.
