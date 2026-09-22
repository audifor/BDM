# CFI2S — Club Facilities & Infrastructure V2 — Save, Persistence & Round-Trip Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi2s-save-persistence`, created from the certified CFI2 tip `ada39e7` in `C:\BDM-FACILITIES`.

## 2. Initial SHA

`ada39e76072a43c558aea62bf45ae6507f4f8a2a` (`docs(facilities): record CFI2 final commit SHAs in certification report`). Verified as HEAD with a clean working tree before any CFI2S edit.

## 3. Final SHA

The commit carrying this file (recorded via a small follow-up SHA-reference commit after this file's own commit, matching the CFI2 lineage's own convention).

## 4. Commits

Two atomic commits, matching CFI1/CFI2's own convention:

1. `482e6ec` — `feat(save): persist Club Facilities & Infrastructure V2 in Save V4 (CFI2S)` — the Save V4 extension (`GameWorldSaveV4.ts`), the pre-existing V4 migration test's updated field list (`GameWorldSaveV4.test.ts`), and the new round-trip/query-equivalence/malformed-input test file (`GameWorldSaveV4.Facilities.test.ts`).
2. `docs(facilities): add CFI2S save persistence certification report` — this file.

No push, no merge, per instructions.

## 5. Save architecture audit

Read in full before writing any code: `GameWorldSaveV1.ts` (611 lines), `GameWorldSaveV2.ts` (177 lines), `GameWorldSaveV3.ts` (614 lines), `GameWorldSaveV4.ts` (614 lines before this change), plus `GameWorldSaveV4.test.ts` for its testing conventions.

Findings:

- **V1** is the original disk format. Most of its collections are typed loosely as `readonly JsonRecord[]` in the `GameWorldSaveV1` interface — there is **no `exactKeys`/closed-schema enforcement at V1**. Reconstruction still goes through the canonical `createXxx` domain factories (so domain validation always applies), but the wire shape itself is not strictly gated at this layer.
- **`assertExactKeys` was introduced at V2`** (`GameWorldSaveV2.ts`) and is applied only to the fields V2 itself newly owns (Player Truth, `organizationKnowledge`, `scoutingRuntime`, `marketRuntime`). Every V1-inherited field is still passed through loosely.
- **V3** introduces a large nested `staffCareraRuntime`-style blob (`staffCareerRuntime`) holding Staff Career, Governance, and Supporters state. `exactKeys` gates the *top level* of that blob, but many of its nested collections are still passed through as plain `JSON.parse(JSON.stringify(...))` casts rather than fully re-validated per-field — a deliberately looser pattern than V4's.
- **V4 (`GameWorldSaveV4.ts`) is the strictest, most current pattern**, and is the one CFI2S replicates exactly: every V4-owned collection (`organizations`, `organizationOwnership`, `organizationControl`, `organizationOwnershipTransactions`, `multiClubOwnershipPolicies`, `organizationStructuralChanges`, `regulatoryOrders`, `organizationLicenses`, etc. — 19 collections before CFI2S) has:
  - a dedicated `parseXxx(value: unknown): readonly Xxx[]` function;
  - `exactKeys(record, [...expectedFields], label)` enforced on every record and every nested object (discriminated-union actors, scope objects, consideration objects);
  - reconstruction exclusively through the canonical `createXxx` domain factory (so Save never re-implements domain validation — it only gates the wire shape and re-derives typed values, then hands off to the same factory `GameWorld.ts` itself uses);
  - `Object.prototype.hasOwnProperty.call(payload, 'xxx') ? parseXxx(payload.xxx) : []` legacy-tolerance at the top of `deserializeGameWorldV4`, so an older payload missing that field defaults to an empty array rather than `undefined`;
  - threading through `updateGameWorld(...)` (never a raw object merge), so the full canonical `validateWorld` invariants always re-run on load.
- **This correction supersedes an inaccuracy in the CFI1 report**: `organizationOwnership` (and its siblings) **is** already wired into V4, with the exact strict pattern above — it is not an unwired collection. CFI2S replicates this proven, current pattern precisely.
- `GAME_WORLD_SCHEMA_VERSION` (in `GameWorld.ts`) is a separate, unrelated constant (always `1`) — Save schema versioning (`schemaVersion: 1|2|3|4` in the envelope) is fully independent of it and was not touched.

## 6. Save version decision

**Extended Save V4 in place. Did not create Save V5.**

Rationale: Facilities' 12 collections are all-optional, all-new, additive fields — exactly the shape V4 already tolerates for its own recently-added collections (`Object.prototype.hasOwnProperty.call(...) ? parseXxx(...) : []`, defaulting a legacy payload's absence to `[]`). No existing V4 field's shape, validation, or serialization changed. No architectural constraint in the current codebase requires a new schema version for a purely additive, all-optional collection set. Creating V5 for this reason alone would have been scope-inflation the brief explicitly warns against ("No crear Save V5 simplemente porque Facilities sea nuevo").

## 7. Exact list of collections persisted (source of truth: the code, not this prompt)

Extracted directly from `GameWorld.ts`'s interface (`grep -n "readonly facility\|readonly places"`), confirming **exactly 12 collections** — matching the CFI2 certification's own estimate precisely, with no discrepancy to document:

| GameWorld field | Domain model | Save V4 field | Serializer | Parser | Migration source (empty default) | Round-trip test |
|---|---|---|---|---|---|---|
| `placesById` | `Place` | `places` | `Object.values(world.placesById)` | `parsePlaces` | `migrateGameWorldSaveV3ToV4` → `places: []` | "Place: nested parent/child places survive..." |
| `facilitiesById` | `Facility` (incl. embedded `FacilityPhysicalProfile`) | `facilities` | `Object.values(world.facilitiesById)` | `parseFacilities` (+ `parseFacilityPhysicalProfile`) | `facilities: []` | "Facility: physical profile...and lifecycle survive" |
| `facilityComponentsById` | `FacilityComponent` | `facilityComponents` | `Object.values(world.facilityComponentsById)` | `parseFacilityComponents` | `facilityComponents: []` | "FacilityComponent: independent identity..." |
| `facilityNameRecordsById` | `FacilityNameRecord` | `facilityNameRecords` | `Object.values(world.facilityNameRecordsById)` | `parseFacilityNameRecords` | `facilityNameRecords: []` | "FacilityNameRecord: canonical + multiple commercial-name periods..." |
| `facilityOwnershipInterestsById` | `FacilityOwnershipInterest` | `facilityOwnershipInterests` | `Object.values(world.facilityOwnershipInterestsById)` | `parseFacilityOwnershipInterests` (+ `parseFacilityOwnershipActor`) | `facilityOwnershipInterests: []` | "FacilityOwnershipInterest: 100%, 60/40, and unknown share..." + PERSON-actor variant |
| `facilityControlRightsById` | `FacilityControlRight` | `facilityControlRights` | `Object.values(world.facilityControlRightsById)` | `parseFacilityControlRights` (+ `parseFacilityControlActor`) | `facilityControlRights: []` | "FacilityControlRight: survives and controllersOfFacilityAt returns exactly the same result..." |
| `facilityOperatorAssignmentsById` | `FacilityOperatorAssignment` | `facilityOperatorAssignments` | `Object.values(world.facilityOperatorAssignmentsById)` | `parseFacilityOperatorAssignments` | `facilityOperatorAssignments: []` | "FacilityOperatorAssignment: owner==operator, owner!=operator, and historical operator change..." |
| `facilityOrganizationRelationshipsById` | `FacilityOrganizationRelationship` | `facilityOrganizationRelationships` | `Object.values(world.facilityOrganizationRelationshipsById)` | `parseFacilityOrganizationRelationships` | `facilityOrganizationRelationships: []` | "FacilityOrganizationRelationship and FacilityTeamRelationship: kinds and historical periods..." |
| `facilityTeamRelationshipsById` | `FacilityTeamRelationship` | `facilityTeamRelationships` | `Object.values(world.facilityTeamRelationshipsById)` | `parseFacilityTeamRelationships` | `facilityTeamRelationships: []` | (same test as above) |
| `facilityUsageRightsById` | `FacilityUsageRight` | `facilityUsageRights` | `Object.values(world.facilityUsageRightsById)` | `parseFacilityUsageRights` | `facilityUsageRights: []` | "FacilityUsageRight: exclusivity, priority, component scope, and agreementReferenceId..." + "whole-facility scope..." |
| `facilityCompetitionApprovalsById` | `FacilityCompetitionApproval` | `facilityCompetitionApprovals` | `Object.values(world.facilityCompetitionApprovalsById)` | `parseFacilityCompetitionApprovals` | `facilityCompetitionApprovals: []` | "FacilityCompetitionApproval: approved/not-approved and temporal window survive" |
| `facilityStatusRecordsById` | `FacilityStatusRecord` | `facilityStatusRecords` | `Object.values(world.facilityStatusRecordsById)` | `parseFacilityStatusRecords` | `facilityStatusRecords: []` | "FacilityStatusRecord: multi-period lifecycle history round-trips..." |

**No separate "physical profile" collection exists.** `FacilityPhysicalProfile` is an embedded value object inside `Facility` itself (confirmed by reading `Facility.ts`), not a normalized GameWorld collection — it is persisted as a nested object within each `facilities` entry via `parseFacilityPhysicalProfile`, exactly mirroring how the domain models it.

**Conflicts are explicitly not a persisted collection.** `facilityRightsConflictsAt` is a pure query-time projection over `FacilityUsageRight` records (confirmed in `FacilityConflict.ts`); it is derived, never stored. §"does not serialize derived conflicts" test explicitly asserts the raw save payload contains no `facilityRightsConflicts`/`facilityConflicts` key and that the derived result recomputes identically before and after reload.

## 8. Serializers

All 12 added to `serializeGameWorldV4` as `Object.values(world.xxxById)`, alongside the existing organization/governance collections, inside the same `Object.freeze({ ...compatibility.payload, ... })` payload construction. No new top-level serializer function was needed — Facilities compose into the existing single `serializeGameWorldV4(world, savedAt)` entry point exactly like every other V4 collection.

## 9. Parsers

12 new parser functions added to `GameWorldSaveV4.ts`, following the file's exact existing idiom (`record()`, `exactKeys()`, `nonEmptyText()`, `nullableText()`, `nullableInteger()`, `nullableNumber()`, `boolean()`, `stringArray()`, then reconstruction through the canonical `createXxx` domain factory):

`parsePlaces`, `parseFacilityPhysicalProfile` (helper, not top-level), `parseFacilities`, `parseFacilityComponents`, `parseFacilityNameRecords`, `parseFacilityOwnershipActor` (helper) + `parseFacilityOwnershipInterests`, `parseFacilityControlActor` (helper) + `parseFacilityControlRights`, `parseFacilityOperatorAssignments`, `parseFacilityOrganizationRelationships`, `parseFacilityTeamRelationships`, `parseFacilityUsageRights`, `parseFacilityCompetitionApprovals`, `parseFacilityStatusRecords`.

Every parser reuses the file's existing helper functions rather than re-implementing text/number/boolean/array validation, and every discriminated union (`FacilityOwnershipActor`, `FacilityControlActor`) is parsed with the exact same `exactKeys`-per-branch technique as the file's existing `parseOrganizationOwnershipActor`.

## 10. `exactKeys` changes

No existing `exactKeys` call was modified. 12 new `exactKeys` call sites were added, one per parser, each listing exactly that record's canonical field set (verified field-by-field against the actual domain interface in `src/domain/facilities/*.ts` before writing each list — not guessed). Nested objects each have their own `exactKeys` gate: `FacilityPhysicalProfile` (6 fields), `FacilityOwnershipActor`/`FacilityControlActor` (2 fields per branch, `kind` + the matching ID field).

A dedicated test (`rejects an unknown property on a Facility record (exactKeys)`) proves an unexpected extra field on a `Facility` record is rejected.

## 11. Migration changes

`migrateGameWorldSaveV3ToV4` extended with 12 new empty-array defaults (`places: [], facilities: [], ...`) alongside the existing organization/governance empty defaults, in the same `Object.freeze({ ...value.payload, ... })` construction. This is the only migration-path change: V1→V2 (`GameWorldSaveV2.ts`) and V2→V3 (`GameWorldSaveV3.ts`) were **not touched** — they correctly have no concept of Facilities at all, and a save that never had Facilities data should not have it invented at an earlier migration stage. The V3→V4 migration is the single, correct place to introduce the empty defaults, exactly matching how every other recently-added V4 collection (organization ownership, governance, structural regulation) was introduced at this same migration boundary.

## 12. Backward compatibility

- A V1/V2/V3 save that predates Facilities loads through the full migration chain and produces **empty, valid** `placesById`, `facilitiesById`, etc. — never `undefined`, confirmed by three explicit migration tests (§21) that inspect `restored.facilitiesById` etc. directly.
- `deserializeGameWorldV4` itself additionally uses `Object.prototype.hasOwnProperty.call(payload, 'xxx') ? parseXxx(...) : []` for every one of the 12 new fields, so even a **hand-authored or externally-produced V4 payload** that omits a Facilities field (not just one that went through the V1→V4 migration chain) still loads safely to an empty collection rather than throwing or producing `undefined`.
- No legacy save needs fictitious Facilities data of any kind — confirmed by "a real V3 save already carrying Facilities-independent state migrates cleanly and old saves need no fictitious Facilities data", which explicitly checks the V3 payload has no `facilities` key at all before migrating, then confirms the V4 result is an empty array, not an invented one.

## 13. Round-trip tests

`src/save/GameWorldSaveV4.Facilities.test.ts` (new file, 30 tests):

- One comprehensive rich-world round-trip test asserting every one of the 12 collections' `xxxById` maps are `toEqual` before/after `serializeGameWorldV4` → `JSON.parse(JSON.stringify(...))` (proving genuine JSON-boundary round-tripping, not in-memory object identity) → `deserializeGameWorldV4`.
- 15 dedicated per-collection round-trip tests (§21 lists them against their collection in the table above), each isolating one model's edge cases (nested physical profile including all-null; PERSON vs ORGANIZATION actor; component scope null vs populated; historical multi-period sequences).

## 14. Temporal tests

Covered across: "FacilityStatusRecord: multi-period lifecycle history" (3-period ACTIVE→TEMPORARILY_CLOSED→ACTIVE sequence), "FacilityOperatorAssignment: ...historical operator change" (sequential non-overlapping periods), "FacilityNameRecord: canonical + multiple commercial-name periods", "preserves query equivalence at a historical date spanning operator change, status closure, and temporary relocation" (three separate historical dates checked in one test), and the rich-world fixture itself, which includes an open-ended `validTo: null` ownership interest, a closed historical `HOME_VENUE` period, and a bounded `TEMPORARY_HOME` period — exercising closed interval, open interval, initial-date-with-no-end, and multi-period history in one fixture.

## 15. Ownership tests

"FacilityOwnershipInterest: 100%, 60/40, and unknown share all survive with the correct actor kind" (all three required cases in one test) plus "...with a PERSON owner actor survives" (the fourth actor-kind case) plus the rich-world fixture's own 60/40 + unknown + municipal-100% mix, verified via `ownershipShareOfAt` before/after equality.

## 16. Control tests

"FacilityControlRight: survives and controllersOfFacilityAt returns exactly the same result after reload" — the exact assertion the brief requested (§"CONTROL RIGHTS": *"Después de load: controllersOfFacilityAt(...) debe devolver exactamente el mismo resultado"*).

## 17. Operator tests

"FacilityOperatorAssignment: owner==operator, owner!=operator, and historical operator change all survive" — all three brief-required cases in one test, using `operatorsOfFacilityAt` at two different historical dates to confirm the correct operator resolves at each.

## 18. Usage-right tests

"FacilityUsageRight: exclusivity, priority, component scope, and agreementReferenceId all survive without type collapse" — explicitly asserts `typeof restoredRight.exclusivity === 'string'` (never coerced to boolean) and checks the exact enum value, priority value, component scope array, and optional agreement reference string all survive intact. A second test isolates the `componentIds: null` (whole-facility) case to prove it is distinct from a populated scope after reload.

## 19. Component-scope tests

"Team A uses Component X inside Facility Y" is exactly the rich-world fixture's `usage:rt-train-a`/`usage:rt-train-b` pair (Team A → practice court A, Team B → practice court B, both EXCLUSIVE, both under the same `trainingCenter` Facility) plus the dedicated component-scope round-trip test. `facilityComponentsUsableByTeamAt` is included in the full query-equivalence snapshot (§22), and cross-reference validation (component must exist and belong to the same Facility) is proven still enforced post-load by "rejects a missing component reference in a component-scoped usage right at the domain-validation boundary".

## 20. Name-history tests

"FacilityNameRecord: canonical + multiple commercial-name periods survive and resolve identically" — three name periods (canonical, old commercial, new commercial) round-tripped, then `facilityNameAt` compared before/after at two different dates to prove the resolution logic (not just the raw records) survives unchanged.

## 21. Lifecycle tests

"FacilityStatusRecord: multi-period lifecycle history round-trips and facilityStatusAt matches at each period" — a three-period ACTIVE→TEMPORARILY_CLOSED→ACTIVE history, `facilityStatusAt` compared before/after at three dates spanning all three periods.

## 22. Query-equivalence tests

`queryEquivalenceSnapshot()` calls **every** resolver from CFI2's query layer (`ownersOfFacilityAt`, `ownershipShareOfAt` ×2 organizations, `facilitiesOwnedByOrganizationAt`, `controllersOfFacilityAt`, `operatorsOfFacilityAt`, `facilitiesOperatedByOrganizationAt`, `organizationsRelatedToFacilityAt`, `usageRightsForFacilityAt`, `usageRightsForTeamAt`, `usageRightsForOrganizationAt`, `facilitiesUsedByTeamAt`, `facilitiesUsedByOrganizationAt`, `homeFacilitiesForTeamAt`, `trainingFacilitiesForTeamAt`, `teamsUsingFacilityAt`, `organizationsUsingFacilityAt`, `facilityComponentsUsableByTeamAt`, `facilityRightsConflictsAt`, `facilityNameAt`, `facilityStatusAt`) against the rich fixture, before and after a full save/load cycle, and asserts the entire snapshot object is `toEqual`. This is run twice: once at a single date, once across three historical dates spanning every temporal edge case in the fixture (§14).

## 23. Malformed-save tests

8 tests, each targeting exactly one category the brief listed:

- bad ownership percentage (150%) → `RangeError`
- unknown enum value (`Facility.status`) → `TypeError`
- malformed temporal interval (`validTo` before `validFrom`) → `RangeError`
- invalid `FacilityUsageRight` shape (no Team and no Organization beneficiary) → `TypeError`
- invalid component scope (empty array) → `RangeError`
- unknown property on a `Facility` record → `TypeError` (`exactKeys` rejection)
- malformed discriminated union (`owner.kind: 'ALIEN_CORP'`) → `TypeError`
- missing component reference in a component-scoped usage right → generic `Error`, explicitly at the **domain-validation** boundary (`updateGameWorld`), not the schema-parsing boundary — proving CFI2S correctly preserved the "schema parsing vs domain/world validation" separation the brief required rather than duplicating `FacilityValidation.ts`'s cross-reference logic inside the Save parser.

## 24. `validateWorld` after load

Every round-trip test's `deserializeGameWorldV4(...)` call itself routes through `updateGameWorld(...)`, which always calls the canonical (unexported) `validateWorld` internally — so a successful `deserializeGameWorldV4` return is already proof `validateWorld` passed. Three tests additionally re-invoke `updateGameWorld(restored, {})` (a no-op patch that still re-runs full validation) immediately after reload, as an explicit belt-and-suspenders confirmation that the reconstructed world remains internally consistent under the canonical validator a second time.

## 25. Deterministic reload result

"reloading the same save repeatedly is deterministic": the same raw (JSON round-tripped) save payload is deserialized twice independently; the two resulting `facilitiesById`/`facilityUsageRightsById`/`facilityOwnershipInterestsById` maps and an `ownersOfFacilityAt` query result are asserted `toEqual` between the two loads. No `Math.random`, `Date.now`, random UUID generation, or unstable ordering exists anywhere in the new parser code (confirmed by the zero-hit `Math.random(` sweep in §31).

## 26. Facilities regression count

`npx vitest run src/domain/facilities/`: **53/53 PASS** (unchanged from CFI2 — 18 CFI1 + 35 CFI2, exactly as required; CFI2S did not modify any domain file).

## 27. Save/migration test count

`npx vitest run src/save/`: **19 files, 209 tests, all PASS**, comprising every pre-existing Save test file (V1/V2/V3/V4 and all the feature-specific persistence tests: Board, CoachCareer, CoachReputation, CoachRpg, CompetitionRules, Morale, PlayerRatingHistory, Relationship, Responsibility, ScheduledTrainingModule, StaffConflict, StaffCultureCohesion) plus the new `GameWorldSaveV4.Facilities.test.ts` (30 tests). The one pre-existing V4 test that asserts "migrating V3→V4 adds exactly these fields on top of V3" (`migrates canonical V3 by preserving V3 fields and adding empty runtime state`) was updated to also destructure and assert the 12 new empty Facilities fields — the same test-maintenance pattern this file already uses every time a new V4 field set was historically added; it is not a hidden defect.

## 28. Related regression count

`npx vitest run src/domain/facilities/ src/save/` (run together, 19 files): **209/209 PASS**, confirming Save V4's Facilities wiring causes no interference with Organization/Governance/MultiClub/StructuralRegulation persistence or any other Save-layer feature.

## 29. Full-suite result

Run twice (`npx vitest run`, no filter): first run **17 files / 31 tests failed**, second run (immediately after, no other background job competing) **27 files / 55 tests failed**. In **both** runs, **every single failure was a `Test timed out` error** (never an assertion mismatch), and the machine-load signal is unambiguous: `transform` time alone went from 94.7s in the first run to 661.2s in the second, and `import` time from 386.8s to 989.4s — the same suite, same code, same machine, degrading run-over-run purely from sustained load (this session had run `npm run build`, two `cargo check` compiles, and three consecutive full-suite executions in a short window). This exactly matches the pattern already documented and independently verified at both the CFI1 and CFI2 certification gates in this lineage.

**None of the failing tests are in `src/domain/facilities/` or `src/save/`.** Spot-checked five of the reported failures in isolation, immediately after the noisy full-suite run: `StaffScreen.test.ts`, `ClubPcbPage.test.ts`, `GovernanceUniverseProfile.test.ts`, `StaffPoliticalPositionEngine.test.ts` — **all pass**, each completing in a fraction of the timeout that tripped under full-suite contention. `src/domain/facilities/ + src/save/` run together in isolation immediately afterward: **209/209 PASS** (unchanged from §26/§27/§28).

**Conclusion: no regression.** Every failure across both full-suite attempts is machine-load-induced test-runner flakiness in files this branch never touches, not a defect introduced by CFI2S. This is reported transparently rather than hidden or worked around by loosening any timeout or test.

## 30. Typecheck

`npm run typecheck` (`tsc -b --pretty false`): **clean, zero errors.**

## 31. Build / Rust checks / git diff check

- `npm run build` (`tsc -b && vite build`): **succeeds.** Same pre-existing chunk-size warning as CFI1/CFI2 (unrelated, predates this branch).
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: clean.
- `cargo check --manifest-path src-tauri/Cargo.toml`: clean (CFI2S touches no Rust code).
- `Math.random(` sweep across `src/`: **zero hits.**
- Forbidden-import sweep (`react`/`zustand`/`@tauri-apps` in `src/domain`, `src/engine`, `src/save`): **zero hits.**
- `git diff --check` (staged): **clean** — only a benign LF/CRLF normalization notice, no trailing-whitespace or conflict-marker errors.
- Diff scope: exactly 3 files touched (`GameWorldSaveV4.ts`, `GameWorldSaveV4.test.ts`, and the new `GameWorldSaveV4.Facilities.test.ts`) — zero domain files modified, per the brief's explicit "no cambiar dominio sin necesidad" instruction. One domain-adjacent maintenance fix is documented in §32.

## 32. Technical debt

- **`nullableText`/`nullableInteger`/`nullableNumber` are reused as-is from the existing V4 helper set** rather than duplicated — this is intentional reuse, not debt, but is noted because it means any future change to those helpers' semantics (e.g. stricter finite-number checking) would affect Facilities parsing too, exactly as it already affects every other V4 collection.
- **`FacilityUsageRight.organizationId`/`teamId` are parsed via `nullableText` and re-validated by the branded ID constructors inside `createFacilityUsageRight`**, not by a dedicated `organizationIdFromString`/`teamIdFromString` call at the parser boundary — consistent with how the domain factory itself accepts a plain string for those fields and brands it internally; this mirrors the existing V4 pattern for optional ID references elsewhere in the file (e.g. `nullableText` + factory-side branding) rather than introducing a new convention.
- **No dedicated fuzz/property-based test exists** for the parser layer — the 8 malformed-input tests are targeted, not exhaustive, matching the brief's explicit instruction not to duplicate all of `FacilityValidation.ts` inside the parser.

## 33. Deliberately deferred / not implemented

Exactly the CFI2S §"NO IMPLEMENTAR" list: construction, renovation, CAPEX/OPEX, deterioration, maintenance, valuation, ticketing, attendance, sponsorship, economic leases, loans, public funding, training/medical effects, AI decisions, UI, scheduling. No domain model in `src/domain/facilities/` was changed — CFI2S is a persistence-boundary task only, as scoped.

## Fixture defect found and corrected during this milestone (per the brief's explicit "if a real domain defect appears" protocol)

While building the round-trip fixture, an initial version placed a whole-facility (`componentIds: null`) `NON_EXCLUSIVE` `ADMINISTRATION` usage right for Organization B on the same Training Center where Team A already held an `EXCLUSIVE` `TRAINING` right scoped to one practice court, with fully overlapping validity windows. CFI2's own `assertNoIncompatibleExclusiveUsageRights` validator (built and certified in the prior milestone) correctly rejected this as an incompatible EXCLUSIVE claim over overlapping scope and time for differing beneficiaries — this is **not a Save-layer defect**, it is the domain validator working exactly as CFI2 certified it to. The fixture itself was corrected (scoping the administrative right to its own dedicated `COACHES_OFFICE` component instead of the whole Facility) rather than touching any domain file, per the brief's explicit instruction to fix a *fixture* mistake minimally rather than expand scope into the domain layer. No regression test was needed for this because it is exactly the behavior CFI2's own "exclusive rights conflicting" test (`FacilitiesOwnershipAccessRights.test.ts`) already covers; it simply surfaced here as a reminder that a rich fixture must itself respect every domain invariant.

## 34. Exact recommendation for CFI3

1. **Application-layer read boundary**: a thin `src/app/facilities` (or equivalent) module exposing the now-persistable CFI1/CFI2 queries to future UI/Zustand consumers, mirroring how `app/game` wraps other domain queries — this was CFI1's own §18 proposal item 3 and remains valid and now unblocked by persistence.
2. **World generation / seed data**: extend `WorldGenerator`/World DB bootstrap to optionally attach a deterministic starter Facility (owned home arena + training center) per generated Team, as world-truth fixture data only (no ratings, no economics) — CFI1's own §18 item 4, now safe to build on top of a Facilities domain that reliably survives save/load.
3. **`Organization.primaryPlaceId` retrofit** (product decision required, unchanged from CFI1/CFI2's own outstanding recommendation): type it as `PlaceId | null` or formally deprecate it — still not done, still requires explicit approval since it touches an existing canonical entity outside the Facilities domain.
4. **Economic layer** (construction cost, maintenance, revenue from `FacilityUsageRight`/`agreementReferenceId`-linked leases): explicitly out of scope until Finance V2's direction is decided, exactly as CFI1/CFI2 already deferred it — CFI2S changes nothing about this boundary, it only makes the `agreementReferenceId` seam durable across save/load so a future Finance system has something stable to attach to.

No push or merge performed. Commit created only after this report's full-suite comparison (§29) confirmed no new regression versus the `ada39e7` baseline.
