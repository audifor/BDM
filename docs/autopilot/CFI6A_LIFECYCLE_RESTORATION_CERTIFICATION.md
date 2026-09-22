# CFI6a — Club Facilities & Infrastructure V2 — Facility Lifecycle Restoration Fix Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi6a-lifecycle-restoration-fix`, created from the certified CFI6 tip `ba0b0bf` in `C:\BDM-FACILITIES`.

## 2. Initial SHA

`ba0b0bf913845b4178ee5b58f652471022a8afc4` (`docs(facilities): add CFI6 construction/renovation/development certification report`). Verified as HEAD with a clean working tree before any CFI6a edit.

## 3. Final SHA

`a337991` (short form of `a3379918adbaa1db33f710e20b0bbf8f660df24b`), `fix(facilities): restore correct Facility lifecycle after CFI6 project completion (CFI6a)`. This report is committed as a second, immediately-following docs commit.

## 4. Scope statement

This is a single-purpose fix, not a new wave. **No new project types, scopes, statuses, or queries were added.** The only change is: a facility-wide project that temporarily alters `Facility.status` on start now correctly restores the Facility's actual prior status on completion or cancellation, instead of leaving it stranded or (had one been attempted) wrongly hardcoding `ACTIVE`.

## 5. The bug

Documented as technical debt in `docs/autopilot/CFI6_CONSTRUCTION_RENOVATION_DEVELOPMENT_CERTIFICATION.md` §40: `startFacilityDevelopmentProject` moves an `ACTIVE` Facility to `UNDER_RENOVATION` when a `RECONFIGURE_FACILITY`/`DEMOLISH_FACILITY` project starts, but nothing in `completeFacilityDevelopmentProject` ever reverted that transition. A completed facility-wide renovation left the Facility permanently stuck in `UNDER_RENOVATION` — a real correctness bug, since the project's own work was in fact finished.

## 6. Audit

Read in full before writing any fix: `FacilityLifecycle.ts` (confirmed `FACILITY_STATUSES`/`TERMINAL_FACILITY_STATUSES` needed no change — `ACTIVE`, `UNDER_RENOVATION`, `TEMPORARILY_CLOSED`, `PARTIALLY_CLOSED`, `DECOMMISSIONED`, `DEMOLISHED` already all exist), `FacilityStatusHistory.ts` (`resolveFacilityStatusAt`'s deterministic latest-`effectiveFrom`-wins resolution, reused unchanged — no change was needed here either), and the entirety of `FacilityDevelopmentEngine.ts` (`startFacilityDevelopmentProject`, `completeFacilityDevelopmentProject`, `cancelFacilityDevelopmentProject`, `pauseFacilityDevelopmentProject`/`resumeFacilityDevelopmentProject`, and every scope-application branch inside `applyFacilityDevelopmentScope`, including `DEMOLISH_FACILITY`'s own terminal status write).

Confirmed by direct code inspection which projects should, and should not, touch Facility-wide lifecycle at all — matching the brief's own worked examples exactly:

- **`FACILITY_RENOVATION`/facility-wide `RECONFIGURE_FACILITY`**: legitimately `ACTIVE -> UNDER_RENOVATION -> ACTIVE` (or back to whatever the Facility actually was — see §8).
- **`FACILITY_EXPANSION` realized as a facility-wide scope**: same as above — the fix does not distinguish by `projectType`, only by `scope.kind`, so any project whose scope is `RECONFIGURE_FACILITY` gets the same correct treatment regardless of its coarse type label.
- **`COMPONENT_RENOVATION`/any single-component scope** (`ADD_COMPONENT`, `RENOVATE_COMPONENT`, `REPLACE_COMPONENT`, `REMOVE_COMPONENT`, `EXPAND_FACILITY`): never touches Facility-wide lifecycle at all, before or after the fix — confirmed unchanged by test (§9, scenario 3).
- **`DEMOLITION`**: legitimately reaches `UNDER_RENOVATION` on start (a Facility genuinely does pass through active demolition works) but must **never** be restored to any prior status on completion — it reaches the terminal `DEMOLISHED` status instead (§9, scenario 5).
- **`NEW_FACILITY`**: unaffected by this fix entirely — a brand-new Facility has no "prior status" to restore (it did not exist before), and its own `PLANNED`/`UNDER_CONSTRUCTION -> ACTIVE` transition on completion was already correct in CFI6 and remains unchanged (§9, scenario 4).

## 7. The fix

**Minimal, non-hardcoded solution**: the Facility's actual pre-renovation status is recorded on the `FacilityDevelopmentProject` entity itself at the moment `startFacilityDevelopmentProject` changes it, and read back by `completeFacilityDevelopmentProject`/`cancelFacilityDevelopmentProject` to restore precisely that status — never an assumed `ACTIVE`.

- **New field**: `FacilityDevelopmentProject.facilityLifecyclePriorStatus: FacilityStatus | null` (`FacilityDevelopmentProject.ts`). `null` means either the project never altered Facility-wide lifecycle (the common case — every single-component scope) or it has not started yet. Validated at construction: it can only be non-null once `actualStartDate` is also set (it is recorded, not guessed, and only once the project has genuinely started).
- **`startFacilityDevelopmentProject`** (`FacilityDevelopmentEngine.ts`): when it writes the `UNDER_RENOVATION` status record for a `RECONFIGURE_FACILITY`/`DEMOLISH_FACILITY` scope, it now also captures `target.status` (whatever it genuinely was — `ACTIVE`, `TEMPORARILY_CLOSED`, `PARTIALLY_CLOSED`, or any other valid status) and passes it through to the project's own `facilityLifecyclePriorStatus` field via the same `transition` call that sets `actualStartDate`. The eligibility guard was also tightened: a Facility already `UNDER_RENOVATION` or in a terminal status is no longer redundantly re-transitioned (`target.status !== 'UNDER_RENOVATION' && !isTerminalFacilityStatus(target.status)`, replacing the previous `target.status === 'ACTIVE'`-only check) — this is a strict widening, not a behavior change for the `ACTIVE` case CFI6 already covered.
- **New shared helper `restoreFacilityLifecycleIfNeeded`**: reads `project.facilityLifecyclePriorStatus`; if non-null and the Facility has not since reached a terminal status, writes one new, additive `FacilityStatusRecord` at the restoration date and updates `Facility.status` to that recorded prior value. If `null` (never altered) or the Facility is already terminal (the `DEMOLISH_FACILITY` case — see §8), it is a correct no-op.
- **`completeFacilityDevelopmentProject`**: calls `restoreFacilityLifecycleIfNeeded` on the world *after* `applyFacilityDevelopmentScope` has run (so a `DEMOLISH_FACILITY` completion's own `DEMOLISHED` write happens first), then performs the project's own `IN_PROGRESS -> COMPLETED` transition.
- **`cancelFacilityDevelopmentProject`**: calls the same helper before the project's own transition to `CANCELLED`, so an abandoned in-progress renovation does not leave its Facility stranded `UNDER_RENOVATION` forever.
- **`pauseFacilityDevelopmentProject`/`resumeFacilityDevelopmentProject`**: audited, confirmed unchanged and correct as-is — pausing/resuming a project never changes Facility-wide lifecycle in either CFI6 or CFI6a (the Facility legitimately stays `UNDER_RENOVATION` for the whole `IN_PROGRESS`/`PAUSED` duration; only completion or cancellation ends that period).

## 8. Demolition is never "restored" (explicit non-assumption)

`restoreFacilityLifecycleIfNeeded`'s guard is `isTerminalFacilityStatus(target.status)` on the **current** world state at call time — for `DEMOLISH_FACILITY`, `completeFacilityDevelopmentProject` runs `applyFacilityDevelopmentScope` first (which writes `DEMOLISHED`, a terminal status) and only then calls the restoration helper, which therefore observes an already-terminal Facility and correctly no-ops. No `scope.kind === 'DEMOLISH_FACILITY'` special case was needed anywhere in the restoration logic itself — the general terminal-status guard already produces the brief's required behavior ("DEMOLITION: no restaurar ACTIVE") as a natural consequence of call ordering, not a hardcoded exception.

## 9. Tests added

New file `src/engine/facilities/FacilityDevelopmentLifecycleRestoration.test.ts`, 12 tests, covering every numbered scenario the brief required plus the cancellation-path variants it implied:

1. Facility-wide renovation: `ACTIVE -> UNDER_RENOVATION -> ACTIVE`, and — a variant proving the fix is keyed on `scope.kind` not `projectType` — the same behavior for a `FACILITY_EXPANSION`-typed project realized via a facility-wide `RECONFIGURE_FACILITY` scope, plus the critical non-hardcoding case: a Facility that was genuinely `TEMPORARILY_CLOSED` before the project is restored to `TEMPORARILY_CLOSED`, never `ACTIVE`.
2. Lifecycle history preserved after completion: `facilityStatusAt` resolves `ACTIVE` before the project, `UNDER_RENOVATION` during it, and `ACTIVE` again after — and the original `UNDER_RENOVATION` record is confirmed still present and unedited in `facilityStatusRecordsById`.
3. A component-only renovation (`RENOVATE_COMPONENT` scope) does not alter Facility lifecycle at all — confirmed both by status staying `ACTIVE` throughout and by asserting **zero** `FacilityStatusRecord`s were written for that Facility (no spurious no-op record).
4. New facility construction continues behaving correctly: `PLANNED -> UNDER_CONSTRUCTION -> ACTIVE`, with `facilityLifecyclePriorStatus` confirmed `null` throughout (a brand-new Facility has nothing to restore).
5. Demolition does not restore any prior status — the Facility ends at `DEMOLISHED`, not `ACTIVE`, despite having passed through `UNDER_RENOVATION` on start.
6. Repeated completion remains idempotent: a second `completeFacilityDevelopmentProject` call is rejected by the pre-existing status-transition guard (unchanged from CFI6), and exactly one `ACTIVE`-restoration status record exists afterward, not two.
7. The lifecycle resolver (`facilityStatusAt`) returns the correct status when queried before, during, and after the renovation window.
8. (Save round-trip) — see §11; folded into the existing `GameWorldSaveV4.FacilityDevelopment.test.ts` file rather than a new one, since it is a small, targeted addition to that file's existing coverage, not a new persistence surface.

Plus three additional cancellation-path tests the brief's own rule ("CANCELLED renovation: resolver de forma explícita... No inventar ACTIVE si la Facility no era ACTIVE originalmente") explicitly required: a cancelled facility-wide renovation restores `ACTIVE` when that was the genuine prior status; a cancelled renovation of a Facility that was `PARTIALLY_CLOSED` beforehand restores `PARTIALLY_CLOSED`, not `ACTIVE`; and a project cancelled before it ever started leaves the Facility completely untouched (zero status records written), confirming the fix only acts when a real prior transition actually happened.

## 10. Facilities lifecycle tests (accumulated, unaffected)

`npx vitest run src/domain/facilities src/engine/facilities`: **199/199 PASS** (187 pre-existing CFI1–CFI6 tests, entirely unchanged and unmodified by this fix, plus the 12 new CFI6a tests). No CFI1–CFI6 test needed any edit — the fix is additive and backward compatible with every existing scenario, including the CFI6 test that exercises `startFacilityDevelopmentProject`'s original `ACTIVE`-only-Facility guard (still passes: `ACTIVE` is the one case that behaved correctly before and continues to).

## 11. Save changes and round-trip

`FacilityDevelopmentProject.facilityLifecyclePriorStatus` required extending Save V4's existing `parseFacilityDevelopmentProjects` (`GameWorldSaveV4.ts`), since its strict `exactKeys` allow-list would otherwise reject the new field the serializer now emits. Handled with the same conditional-`exactKeys` pattern `OrganizationOwnershipTransaction`'s `governanceDecisionId` field already established (`hasOwnProperty`-gated: the allow-list includes `facilityLifecyclePriorStatus` only when the payload actually has that key) — so a payload serialized by CFI6 (before this field existed) still deserializes correctly, defaulting the field to `null` rather than failing `exactKeys` or fabricating a value.

Two tests added to the existing `GameWorldSaveV4.FacilityDevelopment.test.ts` (not a new file, since this is a small, targeted extension of CFI6's own persistence coverage): a full round-trip of `facilityLifecyclePriorStatus` together with the resulting `UNDER_RENOVATION` status-history record it produced, and a dedicated pre-CFI6a backward-compatibility test (a real serialized payload with the new field stripped from the project object, confirming it deserializes with `facilityLifecyclePriorStatus: null`).

`npx vitest run src/save/GameWorldSaveV4.FacilityDevelopment.test.ts src/save/GameWorldSaveV4.test.ts`: **23/23 PASS** (14 pre-existing CFI6 Save tests, unchanged, plus 2 new CFI6a Save tests; `GameWorldSaveV4.test.ts`'s own suite, unaffected by this change, included as the directly-adjacent affected file).

## 12. Typecheck

`npm run typecheck` (`tsc -b --pretty false`): **clean, zero errors.**

## 13. Build

`npm run build` (`tsc -b && vite build`): **succeeds.** Same pre-existing chunk-size warning as every prior wave (unrelated, predates this branch).

## 14. `git diff --check`

Clean — only benign LF/CRLF normalization notices (a pre-existing repo-wide line-ending convention difference, not introduced by this fix), no trailing-whitespace or conflict-marker errors. Diff scope: exactly 5 files (`FacilityDevelopmentProject.ts`, `FacilityDevelopmentEngine.ts`, one new test file, `GameWorldSaveV4.FacilityDevelopment.test.ts`, `GameWorldSaveV4.ts`) — zero files outside the exact bug's footprint touched, matching the "no ampliar scope" instruction precisely.

## 15. Skipped gates

- **`cargo fmt`/`cargo check` were deliberately NOT run** — no Rust/Tauri code touched.
- **The full repository test suite was deliberately NOT run**, per the explicit "no full suite" instruction — the reduced gate (facilities domain + facilities engine + the two directly affected Save files + typecheck + build + `git diff --check`) is the complete required gate for a single-purpose fix of this size, and no cross-cutting infrastructure was modified beyond the two files this fix legitimately needed to change.

## 16. Technical debt

None newly introduced by this fix. The CFI6 technical-debt item this branch targets is now resolved. One related, narrower observation surfaced during the audit: `restoreFacilityLifecycleIfNeeded`'s guard checks only `isTerminalFacilityStatus`, not "has some other process already changed the Facility's status since the project started" (e.g. a hypothetical future system moving the Facility to `TEMPORARILY_CLOSED` mid-renovation for an unrelated reason). CFI6a does not need to handle this — no such concurrent-mutation system exists yet anywhere in the repository — but a future wave introducing one should re-audit this helper's assumption that the Facility's status at restoration time is exactly what `startFacilityDevelopmentProject` left it as (modulo the project's own scope-application, i.e. demolition).

## 17. Deliberately unchanged / out of scope

Per the brief's explicit "no ampliar scope" instruction, this fix did not: add any new project type, scope kind, or status; touch `FacilityLifecycle.ts`'s or `FacilityStatusHistory.ts`'s own enums/resolvers (both remain byte-for-byte identical to CFI6); change `pauseFacilityDevelopmentProject`/`resumeFacilityDevelopmentProject` (audited, confirmed already correct); add any Finance/Governance/RPG/UI integration; or run the full test suite.

No push or merge performed. Commit created only after this report's §10/§11 test results and §12/§14 gate results were all confirmed green.
