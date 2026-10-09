# BS17B — Canonical physical existence and career reachability

Result: **PASS · BS17B CANONICAL PHYSICAL EXISTENCE AND CAREER REACHABILITY**.
Facilities as a whole is not certified complete. Next milestone: BS17C.

## Lineage and scope

- Canonical audited base: `8a0b359e9ae48fe372668241788c9d5aa7a33b03`.
- BS17A documentation closure / BS17B branch base: `8847045efb04313ff39c0f7d10119b167d1242bb`.
- Branch: `bdm-stage2-bs17b-facilities-provisioning`.
- Final SHA: the containing BS17B commit. Resolve the immutable certificate commit with
  `git log -1 --format=%H -- docs/strengthening/BS17B_FACILITIES_PROVISIONING_CERTIFICATION.md`.
  Its literal SHA is reported in the execution result; a commit cannot embed its own hash.
- BS17A closure contained only its two audit/roadmap documents. No merge or push; canonical
  main remains at the audited base. Worktree is preserved.

## Production sources and coverage

The read-only native bootstrap reads `C:/BDM_DB/DDL-12/output/bdm_world_ddl12.db`.
The audited database contains 578 Facility records and 948 team-use associations. Those are
source-wide counts, not a claim that every database asset is loaded in every career.

The supported slice loads physical assets referenced by selected competition teams through
`team_facility_usage`, plus their Places and parent Places. It joins source entity names,
keeps source IDs, and sorts/deduplicates deterministically. Missing referenced records fail
rather than generating replacements; older databases without physical tables remain empty.
No new dependency, source database write or RNG stream was introduced.

Actual native Spain ACB extraction produced **18 Facilities, 1 Place and 18 structural team
associations**. The real payload traversed the production TypeScript bootstrap, canonical
GameWorld, club read model and Save V4. This evidence is separate from fixture tests.
Native export: `%TEMP%/BS17B-world-db-physical-slice.json`.

Prototype/createNewGame, standalone ACB, and shared synthetic NBA/WNBA/NCAA generation
remain physically empty: their existing sources have no physical content. Source-absent
and pre-BS17B payloads do not acquire invented assets. The shared World DB seam supports
other selections when the same physical tables contain team-linked facts; actual database
certification here is Spain ACB, not every competition.

## Unknown and missing facts

A recorded asset is distinct from an absent asset. The database's generic FACILITY entity
classification does not prove ARENA or training-center type, so type is OTHER and administrative
status UNKNOWN. Purposes come from recognized source usage kinds, otherwise OTHER.
Recorded capacities and locations are copied; missing values stay null. COUNTRY Places use
OTHER because the canonical Place catalog has no COUNTRY kind; no CITY is fabricated.

The source has no component anatomy and no populated ownership, capability or classification
authority. Accordingly this slice creates **zero components, zero ownership interests and
zero usage rights**. Technical standard, condition, opening date, physical features and
ownership percentages are not guessed. A coarse opening year is not an exact opening date.

Exact ISO relationship dates are retained. Source season/year labels are not exact dates:
canonical boundaries remain null and the UI explains this precision gap. Raw labels remain in
the native payload. Structural team associations make an asset inspectable as RELATED, not
owned or legally/sportingly accessible. Existing explicit usage rights still use existing gates.

## Implementation and visible authority

- Native physical extraction extends the existing World DB slice, not a parallel bootstrap.
- A pure source projection feeds both production GameWorld construction stages; validators
  reject duplicate source IDs and canonical collection validation rejects duplicate identities.
- CREATE_FACILITY accepts explicit validated purposes. Legacy scopes without a purpose use
  OTHER instead of indiscriminately TRAINING. Existing lifecycle transitions are unchanged.
  Sponsorship creates no ownership, entitlement, commissioning, Players or money.
- The club read model includes structural team associations and existing team-targeted rights.
- PCB's Facilities tab renders the existing NG FacilitiesWorkspace. Local Facility levels,
  50,000 upgrades, mutable Facilities balance and bonuses are removed from that reachable path.
  The unused legacy component is retained; no unrelated legacy presentation was deleted.
  Board's pre-existing preview value remains isolated and unchanged in behavior.
- NG reads GameWorld through the same read model. Labels distinguish recorded physical
  capabilities and capacity from sporting effects, and recorded commitment coverage from
  funding permission or cash. Existing CFI7 payment facts are displayed, not recomputed.
- Architecture documentation is updated; BS17A audit documents remain historical evidence.

## Identity, persistence and boundary evidence

Source IDs are retained across reordering and equivalent loads. Shared-venue tests yield one
Facility and Place with separate team associations. Save V4 preserves Places, Facilities,
components, unknown state, structural history, explicit purposes and pre-existing rights.
No derived club model is persisted. Existing rights/condition/save test coverage remains intact.

Production smoke compares every nonphysical GameWorld collection with an otherwise identical
source-absent bootstrap: Finance, Governance, Players, matches and other collections are
identical. Creation-fidelity tests also prove no generated accounts, transactions, commitments
or Players. Diff inspection confirms no changes in Finance/Governance authority, Training,
Medical, Talent supply or MatchEngine. CFI1–8, CFI2S, CFI6A and MX0 remain the authorities.
Domain/Engine have no React, Zustand or Tauri imports; `src/` has zero `Math.random(` matches.

BS15 commit `a20ea25` is not an ancestor of the audited base. No Talent implementation or
player-supply integration was recreated. BS17D depends on resolving that canonical lineage;
no new BS16 behavior is introduced.

## Validation

- Focused TypeScript suite: **24 files, 382 tests PASS**, including the actual native production
  payload smoke (not skipped), shipped source-absent worlds, projection, creation, persistence,
  existing Facilities authorities, read model and UI. Machine report:
  `%TEMP%/BS17B-focused-tests.json`.
- Final presentation adjustment: NG and PCB **13 tests PASS**.
- Native `cargo test --manifest-path src-tauri/Cargo.toml world_db_ -- --nocapture`:
  **8 tests PASS**, including real read-only Spain extraction and deterministic shared source.
- `npm run typecheck`: PASS. `npm run build`: PASS (existing chunk-size advisory).
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: PASS.
- `cargo check --offline --manifest-path src-tauri/Cargo.toml`: PASS.
- `git diff --check`, scope review and deterministic/import checks: PASS.

The initial overbroad test selection accidentally included unrelated 1,000-day/10-year
World DB tests and was terminated; it is not counted as passing. A stale UI tab expectation
and an unsupported testing-library option were corrected, then the focused suite and typecheck
passed. The milestone explicitly requests focused validation; no global full-suite claim is made.

## Deferred findings

- BS17C: physical project planning/progression, replacement-ID collision concerns and maintenance
  policies stay outside this existence milestone. No fabricated component blueprint.
- BS17D: sporting/Medical/Training consequences and academy/Talent links; requires BS15 lineage.
- BS17E: canonical Finance/Governance activation, permissions, account catalog and economic
  reconciliation. Recorded commitments alone are not an affordability decision.
- BS17F: AI, alerts and later manager workflow strengthening.
- Unlinked assets, coarse source dates, unclassified buildings and missing anatomy remain honest
  source gaps. Do not claim all 578 database Facilities or unknown access are certified.

## Changed-file inventory

Production: native `lib.rs`, `world_db_bootstrap.rs`, new `world_db_facilities.rs`;
`GameBootstrap.ts`, `WorldDbGameBootstrap.ts`, new `WorldDbPhysicalContent.ts`;
`FacilityLifecycle.ts`, `FacilityDevelopmentProjectScope.ts`, `FacilityDevelopmentEngine.ts`;
`ClubFacilitiesReadModel.ts`, `FacilitiesWorkspace.tsx`, `facilitiesPresentation.ts`,
`ClubPcbPage.tsx`.

Tests: `ShippedUniverseFacilities.test.ts`, new `WorldDbPhysicalContent.test.ts`,
`WorldDbProductionSmoke.test.ts`, `FacilitiesWorkspace.test.tsx`, `ClubPcbPage.test.ts`.
Documentation: `docs/ARCHITECTURE.md` and this certificate.
