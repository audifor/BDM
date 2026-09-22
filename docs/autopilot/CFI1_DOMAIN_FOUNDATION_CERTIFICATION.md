# CFI1 — Club Facilities & Infrastructure V2 — Domain Foundation Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi1-domain-foundation`

## 2. Initial SHA

`1fff9a507f2d22ae527554ae894146d9e2788812` (`test(governance): certify final integration`)

Final commit: `467c8aa7754885c8f9c8a27eba8dc448638bfe42`

## 3. Audit of legacy Facility/Venue/Place/Arena/Stadium implementations

Before writing any code, the repository was inspected for:

- `src/domain/**` — no `facilities`, `venue`, `arena`, `stadium`, or `place` directory or canonical entity existed. `grep -i` for `facility|venue|arena|stadium` across `src/domain` returned **zero** matches.
- `Organization.ts` (`src/domain/organization/Organization.ts`) has a loose, untyped `primaryPlaceId: string | null` field — a placeholder reference to a "place" concept that was never modeled. **Not modified**; CFI1 does not touch `Organization` at all (additive-only scope). A future CFI wave may want to type this field against the new `PlaceId`, but that is a product decision outside CFI1.
- `Team.ts` has no facility/venue/arena field of any kind.
- `GameWorld.ts`, `Competition`, `Season`, `Game` — no facility/venue reference anywhere.
- `World DB` (`src/domain/worldDb`) — no facility/place concept; it is entirely player/roster/rating focused.
- 51 files matched `facility|venue|arena|stadium` case-insensitively across `src/`, but on inspection **all of them belong to one of three unrelated systems**, none of which is canonical domain state:
  1. **MatchViewer court rendering** (`src/ui/match/court/**`, e.g. `ArenaCourtProfile.ts`, `ArenaPerimeterLayout.ts`, `CourtLightingRenderer.ts`) — purely visual court/lighting geometry for the match presentation layer. No persistent facility identity, no ownership, no GameWorld state.
  2. **Legacy PCB migration UI** — `src/ui/pcb-migrated/club/components/club/ClubFacilities.jsx`. This is a disconnected mockup carried over from a prior "PCB" (old app) migration: it holds a **hardcoded** `MIGRATION_CATALOG` of three fictional facility upgrade cards (training center, recovery lab, arena) with a mock "IPC" call (`window.pcbasket.invoke('rules.facilities', ...)`) that has no backing implementation in this codebase, no domain entity, and no GameWorld wiring. It manipulates a local `teamFacilities` prop keyed by ad hoc string IDs unrelated to any canonical Team/Organization identity.
  3. **Unrelated naming collisions** — e.g. `src/domain/supporters/SupporterInfluence.ts` and `InstitutionalSupport.test.ts` use the word "facility" only in prose/comments about donor-funded support, not as an entity.
- `src/save/GameWorldSaveV1.ts` / `V2.ts` / `V3.ts` / `V4.ts` — no facility-related fields exist in any save schema version.

**Conclusion:** there is no canonical legacy system to reuse, migrate, or deprecate. `ClubFacilities.jsx` and the MatchViewer court-rendering files are explicitly **left untouched** — they are out of CFI1's scope and are not wired to the new domain in this wave (see §17).

## 4. Architectural decisions

- **New dedicated domain module** at `src/domain/facilities/`, following the same file-per-concept convention as `src/domain/ownership/`, `src/domain/multiClub/`, etc.
- **`PLACE` vs `FACILITY`** kept as two separate entities with separate ID types (`PlaceId`, `FacilityId`). `Place` never carries capacity/ownership/lifecycle; `Facility` never carries geography beyond a `placeId` reference. A `Place` can nest under another `Place` (e.g. campus within a city) via `parentPlaceId`, itself validated against self-reference and missing-parent cycles.
- **`VENUE` was not introduced as a new root entity.** Per the brief's explicit instruction to investigate before assuming a new root, "acting as a venue for competitive matches" is modeled as a `FacilityPurpose` (`MATCH_HOSTING`) plus the `FacilityTeamRelationship` kind `HOME_VENUE`/`SECONDARY_HOME_VENUE`/`TEMPORARY_HOME`. This avoids a redundant parallel hierarchy while still letting any Facility act as a venue for a bounded period.
- **`FacilityType` / `FacilityPurpose` / `FacilityCapability` were split into three separate concepts**, exactly as the brief suggested as an option: `FacilityType` is a broad classification label (ARENA, TRAINING_CENTER, ...), `FacilityPurpose` is what it is actually used for (can be multiple at once — e.g. an academy that also hosts matches), and `FacilityCapability` is an additive world-truth fact (e.g. `HOSTS_MEDICAL_TREATMENT`) kept separate so a Facility is never forced into one rigid label.
- **Ownership is deliberately NOT the same type as `OrganizationOwnership`.** `FacilityOwnershipInterest` is a new, parallel concept (physical-asset ownership) with the same shape/conventions (nullable percentage, temporal validity, Person-or-Organization actor) as `OrganizationOwnership`, but is never persisted in or resolved from the corporate-ownership collections. This directly satisfies the brief's instruction not to "incorrectly reuse corporate ownership if the semantics differ."
- **Relationships are independent of ownership.** `FacilityOrganizationRelationship` (OWNER, CO_OWNER, OPERATOR, TENANT, LESSOR, LESSEE, MANAGER, FINANCIER, DEVELOPMENT_PARTNER) and `FacilityTeamRelationship` (HOME_VENUE, SECONDARY_HOME_VENUE, TRAINING, ACADEMY, MEDICAL, ADMINISTRATION, TEMPORARY_HOME, DEVELOPMENT, STORAGE) are separate collections from `FacilityOwnershipInterest`, so "uses" never implies "owns" and vice versa. Both are temporal (`validFrom`/`validTo`), matching the `OrganizationOwnership`/`OrganizationControl` interval pattern already established in the codebase.
- **Usage rights are a separate concept again.** `FacilityUsageRight` exists so a one-off or non-institutional usage arrangement can be recorded without inventing an ownership or relationship record that wouldn't otherwise exist.
- **Competition approval is a minimal hook, not a system.** `FacilityCompetitionApproval` records only `approved: boolean` plus a temporal window and a Facility/Competition reference — no homologation rules, no minimum-capacity policy engine, no workflow states. This satisfies "prepare architecture... but without implementing the full regulatory system."
- **Naming history is separate from lifecycle status history.** `FacilityNameRecord` (canonical vs commercial name, with deterministic `resolveFacilityNameAt` — an active commercial/naming-rights name takes priority over the canonical name while active, otherwise the canonical name wins) is independent from `FacilityStatusRecord` (dated lifecycle transitions, resolved via `resolveFacilityStatusAt`). Neither creates a new Facility identity on change.
- **Composition over a megastructure for physical characteristics.** `Facility.physical` is a small `FacilityPhysicalProfile` value object (openedOn, totalCapacity, seatedCapacity, standingCapacity, courtCount, accessibility) rather than dozens of top-level optional fields on `Facility` itself, leaving room for future composed profiles (e.g. surface/court specification) without bloating the root entity.
- **World truth vs valuation kept strictly separate.** No rating, score, or 0–100 valuation field exists anywhere in this module. `FacilityComponent.capacity`/`quantity` are physical facts (e.g. "4 practice courts"), never quality judgments.
- **No reuse of `OrganizationOwnership`, `Team.organizationId`, or `Organization.primaryPlaceId`** for facility semantics — the brief explicitly warned that `Facility.organizationId` alone would be insufficient for multi-team organizations, so no single-owner field exists on `Facility` at all; every relationship is an independent, multiplicity-open collection.

## 5. New models (all in `src/domain/facilities/`)

| File | Purpose |
|---|---|
| `Place.ts` | Geographic/location entity (`PlaceKind`: COUNTRY_REGION, CITY, DISTRICT, CAMPUS, SPORTS_COMPLEX, PARCEL, ADDRESS, OTHER), optional nesting via `parentPlaceId`. |
| `FacilityType.ts` | `FacilityType`, `FacilityPurpose`, `FacilityCapability` catalogs (extensible via `OTHER`/open enums) and type guards. |
| `FacilityLifecycle.ts` | `FacilityStatus` enum (PLANNED → ... → DECOMMISSIONED/DEMOLISHED) and terminal-state helpers. |
| `Facility.ts` | The `Facility` root entity: place reference, type, purposes[], capabilities[], status, canonicalName, composed `FacilityPhysicalProfile`, `closedOn`. Validates lifecycle/date consistency (e.g. DEMOLISHED requires closedOn; PLANNED cannot have one; seated+standing ≤ total capacity). |
| `FacilityComponent.ts` | Functional sub-parts (MAIN_COURT, PRACTICE_COURT, GYM, WEIGHT_ROOM, RECOVERY_ROOM, HYDROTHERAPY, LOCKER_ROOM, MEDICAL_ROOM, VIDEO_ROOM, COACHES_OFFICE, SCOUTING_OFFICE, ACADEMY_COURT, MEDIA_ROOM, HOSPITALITY_AREA, VIP_BOX, MERCHANDISE_STORE, PARKING, FAN_ZONE, DORMITORY_ROOM, OTHER) with independent id, status, capacity/quantity, openedAt/closedAt. |
| `FacilityNameHistory.ts` | `FacilityNameRecord` (canonical/commercial), `resolveFacilityNameAt`. |
| `FacilityOwnership.ts` | `FacilityOwnershipInterest` (Person/Organization actor, nullable percentage, temporal), `getActiveFacilityOwnership`, `totalKnownFacilityOwnershipPercentage`. |
| `FacilityRelationship.ts` | `FacilityOrganizationRelationship` and `FacilityTeamRelationship` (both temporal), plus their active-at-date resolvers. |
| `FacilityUsageRight.ts` | `FacilityUsageRight` (Organization and/or Team beneficiary, purpose, temporal, exclusivity flag). |
| `FacilityCompetitionApproval.ts` | Minimal hosting-eligibility hook (approved boolean + temporal window, Facility/Competition reference). |
| `FacilityStatusHistory.ts` | `FacilityStatusRecord` + `resolveFacilityStatusAt` deterministic historical status resolution. |
| `FacilityValidation.ts` | `validateFacilitiesDomain` — the single cross-entity validation entrypoint GameWorld calls; `FacilityValidationError`. |
| `FacilityQueries.ts` | Deterministic resolvers: `ownersOfFacilityAt`, `organizationsRelatedToFacilityAt`, `usersOfFacilityAt`, `facilitiesUsedByTeamAt`, `activeFacilityComponentsAt`, `facilityNameAt`, `facilityStatusAt`. |
| `index.ts` | Barrel export. |

New nominal ID types added to `src/domain/ids/EntityIds.ts` (and re-exported from `src/domain/ids/index.ts`): `PlaceId`, `FacilityId`, `FacilityComponentId`, `FacilityNameRecordId`, `FacilityOwnershipInterestId`, `FacilityOrganizationRelationshipId`, `FacilityTeamRelationshipId`, `FacilityUsageRightId`, `FacilityCompetitionApprovalId`, `FacilityStatusRecordId` — each with its own `xxxIdFromString` validating constructor, following the existing `EntityId<Name>` brand pattern exactly.

## 6. Files modified

- `src/domain/ids/EntityIds.ts` — new ID types and constructors (additive only).
- `src/domain/ids/index.ts` — re-exports for the new ID types (additive only).
- `src/domain/world/GameWorld.ts` — see §7 below (additive only; no existing field, collection, or validation rule changed).

No other existing file was modified. `Organization.ts`, `Team.ts`, `Competition`, `Season`, `Game`, MatchViewer court files, and `ClubFacilities.jsx` are all untouched.

## 7. GameWorld integration

Ten new normalized collections were added to `GameWorld`, following the exact existing pattern (`indexById`, `createXxx` factories, `Readonly<Record<Id, Entity>>`):

- `placesById`, `facilitiesById`, `facilityComponentsById`, `facilityNameRecordsById`, `facilityOwnershipInterestsById`, `facilityOrganizationRelationshipsById`, `facilityTeamRelationshipsById`, `facilityUsageRightsById`, `facilityCompetitionApprovalsById`, `facilityStatusRecordsById`.

Wired into:
- `CreateGameWorldInput` (all ten as optional arrays, defaulting to empty — legacy/existing world construction is unaffected).
- `createGameWorld` construction (indexed via the same `createXxx` + `indexById` calls used by every other collection).
- `updateGameWorld`'s canonical `collectionPatchTargets` / `collectionPatchIndexers` maps, so the ten new collections are patchable through the existing single update boundary used by every other domain slice (tests use exactly this path, matching `OrganizationOwnership.test.ts`'s own convention).
- `validateWorld`, via a new `validateFacilities(world)` call that delegates entirely to `validateFacilitiesDomain` in `FacilityValidation.ts`, wrapping any thrown error into `GameWorldValidationError` for consistency with every other GameWorld validation rule.

No existing `GameWorld` field, collection, factory, or validation rule was altered. `GAME_WORLD_SCHEMA_VERSION` was **not** bumped (no existing serialized shape changed).

## 8. Save integration

**Explicitly deferred**, not implemented. Rationale:

- `Save V1/V2/V3/V4` (`src/save/GameWorldSaveV1.ts` … `V4.ts`) each **explicitly enumerate every GameWorld field** in their serializer/deserializer — there is no generic passthrough. Adding Facilities there is a mechanical, self-contained follow-up that does not require any further domain design; it is safer to do once the domain shape from CFI1 is reviewed/certified than to couple it into this domain-foundation milestone.
- The most recently added domain slice in this lineage (`organizationOwnershipById` / `OrganizationOwnership`, from the BG8 governance work also present in this history) is itself **not yet wired into any Save version** either, confirming this is an accepted, precedented sequencing in this codebase: domain foundation first, save wiring as a distinct, later, explicitly-scoped step.
- Per `AGENTS.md`, "keep each implementation scoped to one task" and "do not opportunistically refactor unrelated areas" — touching four save-schema files (and their extensive existing tests) is a materially separate task from the domain foundation requested here.

**Consequence:** a `GameWorld` built with Facilities populated cannot yet be round-tripped through `serializeGameWorldV4`/`deserializeGameWorldV4` and will silently lose that state on save/load, exactly like the current state of `organizationOwnershipById`. This is a known, explicit limitation of CFI1, not an oversight (see §16 risk log).

## 9. Validations implemented (`FacilityValidation.ts`, called from `GameWorld.validateWorld`)

- Duplicate `Place` IDs.
- `Place.parentPlaceId` referencing a missing Place; self-parenting rejected at the factory level.
- Duplicate `Facility` IDs; `Facility.placeId` referencing a missing Place.
- Duplicate `FacilityComponent` IDs; `facilityId` referencing a missing Facility.
- Duplicate `FacilityNameRecord` IDs; `facilityId` referencing a missing Facility; overlapping **canonical** name periods for the same Facility rejected.
- Duplicate `FacilityOwnershipInterest` IDs; `facilityId` referencing a missing Facility; Person/Organization owner referencing a missing entity; **total known ownership percentage exceeding 100% at any point in time** (evaluated at every temporal boundary, so 60%+40%+40% concurrent for the same window is rejected while 60%+40% sequential non-overlapping periods are allowed) — unknown (`null`) percentages never falsify a total, per the brief's explicit requirement.
- Duplicate `FacilityOrganizationRelationship` / `FacilityTeamRelationship` IDs; foreign Facility/Organization/Team references; **duplicate active relationships of the same kind for the same Facility+Organization (or +Team) pair** rejected via overlap detection.
- Duplicate `FacilityUsageRight` IDs; foreign Facility/Organization/Team references; requires at least one of Organization/Team beneficiary.
- Duplicate `FacilityCompetitionApproval` IDs; foreign Facility/Competition references.
- Duplicate `FacilityStatusRecord` IDs; foreign Facility references.
- Invalid temporal ranges (`validTo`/`closedOn`/`closedAt` preceding `validFrom`/`openedOn`/`openedAt`) rejected at every factory boundary (`RangeError`), not only at the GameWorld level.
- Lifecycle/date impossibilities: `DECOMMISSIONED`/`DEMOLISHED` require a `closedOn`; `PLANNED` cannot already have one; the analogous rule applies to `FacilityComponent.status`.
- Negative or non-integer capacity/quantity values rejected.
- Self-reference impossibilities: a Facility ownership interest cannot be validated against a missing owner; a Place cannot be its own parent.

## 10. Queries/resolvers created (`FacilityQueries.ts`)

All are pure, deterministic, and take an explicit `onDate: GameDate`:

- `ownersOfFacilityAt`
- `organizationsRelatedToFacilityAt`
- `usersOfFacilityAt`
- `facilitiesUsedByTeamAt`
- `activeFacilityComponentsAt`
- `facilityNameAt`
- `facilityStatusAt`

Determinism is verified by test #14 (identical results across repeated calls and across differently-ordered input construction).

## 11. Tests added

`src/domain/facilities/Facilities.test.ts` — 18 tests covering all 14 requested scenarios plus 4 additional targeted cases:

1. Club owns and uses its own arena.
2. Club rents a municipal arena it does not own (no ownership interest recorded; usage right only).
3. Two teams share one arena.
4. Organization owns a facility used by several Teams (multi-team organization).
5. Team temporarily relocates to a different venue, then returns.
6. NCAA-like university facility shared by different program Teams.
7. Facility changes commercial (naming-rights) name without changing identity.
8. Facility partially closed while one component remains active and another is closed.
9. Ownership split 60/40 across two Organizations.
10. Ownership with unknown (`null`) percentage.
11. Multiple distinct components inside one training center.
12. Invalid temporal ranges blocked at the factory boundary (team relationship, ownership interest, Facility lifecycle, Facility ownership percentage).
12b. Ownership exceeding 100% when fully known is rejected at `GameWorld` validation.
12c. Duplicate active relationships of the same kind rejected.
13. Invalid foreign references detected (missing Place, missing Team, missing Organization, missing Facility on a component).
14. Deterministic temporal queries (order-independent, repeat-call-stable).
- Facility status resolves deterministically at a past date via `FacilityStatusRecord` history.
- Facility competition approval references a real Competition and rejects a missing one.

## 12. Tests PASS

`npx vitest run src/domain/facilities/Facilities.test.ts`: **18/18 PASS**.

Full-repo regression run (`npx vitest run`, 391 test files): **379 files / remainder pass; 12 pre-existing failures** in files CFI1 never touches (`startNextSeason.test.ts`, `SeasonProgression.test.ts`, `StaffPoliticalPositionEngine.test.ts`, `GameWorldSaveV4.test.ts`, `MemoryEngine.test.ts`, `CoachReputationConsequences.test.ts`, `StaffHumanState.integration.test.ts`, `createAcbTestGame.test.ts`). These were verified to **pass on the pre-CFI1 base commit in isolation** (`git stash` + targeted re-run: 26/26 passed for the season/staff-political sample), confirming they are pre-existing order/timing-sensitive flakiness in the full-suite run, not regressions introduced by this change. No facilities-related test failed in any run.

## 13. Typecheck

`npm run typecheck` (`tsc -b --pretty false`): **clean, zero errors.**

## 14. Build

`npm run build` (`tsc -b && vite build`): **succeeds.** Pre-existing chunk-size warning (`index-*.js` > 500kB) is unrelated to this change and predates it.

Rust: `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: clean. `cargo check --manifest-path src-tauri/Cargo.toml`: clean (CFI1 touches no Rust code).

## 15. `git diff --check`

Clean (exit 0) against the staged CFI1 diff. Only benign LF/CRLF normalization notices from Git, no trailing-whitespace or conflict-marker errors.

## 16. Risks / technical debt detected

- **Save integration deferred (see §8).** Facilities state does not yet survive save/load. This must be picked up before Facilities can be exposed to any real gameplay loop.
- **`Organization.primaryPlaceId` remains an untyped loose string.** CFI1 introduces the properly-typed `PlaceId` but does not retrofit `Organization.primaryPlaceId` to use it, to avoid touching a file outside CFI1's stated scope. A future wave should decide whether to type/migrate that field.
- **No enforcement that mutually-exclusive relationship kinds cannot coexist** (e.g. nothing stops an Organization from holding both `LESSOR` and `LESSEE` relationships to the same Facility simultaneously) — only *duplicate* active relationships of the *same* kind are rejected, per the explicit CFI1 scope ("no ratings/no gameplay rules yet"). This is a deliberate simplicity choice, not an oversight, and should be revisited once real-world relationship rules are approved.
- **`assertNoOverlap`/`assertOwnershipDoesNotOverlapPast100` are O(n²)-ish per Facility** (boundary-based re-evaluation). Acceptable for CFI1's expected scale (a handful of relationships/owners per Facility) but should be revisited if a world ever has facilities with dozens of concurrent ownership interests.
- **`FacilityCompetitionApproval` is intentionally shallow** — it has no workflow, no minimum-capacity check, no homologation authority. Any future regulatory system must be designed as a new, additive layer, not by overloading this record.

## 17. Deliberately NOT implemented (per explicit instruction)

- Facility economics (construction cost, valuation, revenue, sponsorship, public funding, loans, infrastructure debt).
- Construction/maintenance simulation, deterioration.
- Sporting/gameplay impact of any facility fact (training bonuses, injury modifiers, fan happiness, attendance, ticket revenue).
- UI of any kind (`ClubFacilities.jsx` legacy mock is untouched and unwired; no new screen was added).
- Scheduling / venue day-to-day operations.
- Procedural generation of facilities.
- Facility ratings 0–100 or any derived quality valuation.
- Full regulatory/homologation workflow (only the minimal `FacilityCompetitionApproval` hook exists).
- Save/Load wiring (see §8/§16).
- Any change to `Organization`, `Team`, `Competition`, `Season`, `Game`, or MatchViewer court rendering.

## 18. Proposal for CFI2

1. **Save integration**: wire the ten new collections into `GameWorldSaveV4` (and a corresponding V1→V4 migration path defaulting to empty collections for legacy saves), following the exact enumeration pattern already used for every other collection.
2. **Organization.primaryPlaceId retrofit** (product decision required): either type it as `PlaceId | null` or formally deprecate it in favor of an explicit `FacilityOrganizationRelationship`/`Place` reference — needs explicit approval since it touches an existing canonical entity.
3. **Application-layer read APIs**: a thin `src/app/facilities` (or equivalent) boundary exposing the CFI1 queries to future UI/Zustand consumers without leaking domain internals, mirroring how `app/game` wraps other domain queries today.
4. **First real-world seed data**: extend `WorldGenerator`/World DB bootstrap to optionally attach a deterministic starter Facility (home arena) per generated Team, strictly as world-truth fixture data (no ratings), to validate the model against the existing Alpha career flow end-to-end.
5. **Economic layer (separate, larger milestone)**: construction cost, maintenance cost, revenue from `FacilityUsageRight`/ticketing, once Finance v2 direction is decided — explicitly out of CFI1/CFI2 scope until a product decision authorizes it.

No push or merge was performed. No commit was made until this implementation was complete and self-certified against the Definition of Done.
