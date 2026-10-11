# BS15 / BS16 / BS17 controlled convergence certification

Status: FAIL ? certification not established. The closure audit confirms identical bounded behavior on frozen BS15 and the integrated branch, but cannot recover the historical World DB 2029 stop from retained evidence. This is not a global BS16 or BS17D completion certificate.

## Frozen sources and isolation

- BS15: `94c077092224a9f75c861a853d9d52fceae526fe` (O).
- BS16 through K-C: `97c58b98b9192a569f30bdfd8b63565f0b02a744` (C).
- BS17 through D-M: `6945cb90604bd349edd9d2333aa7d1861e9a311a` (S).
- Common merge-base: `a6826469c78f8f948d73fd663e4996a99d30c678` (A).
- Destination: `integration/bs15-bs16-bs17-certified`, isolated worktree `C:/BDM-INTEGRATION-BS15-BS16-BS17`.
- BS15 + BS16 two-parent merge: `c54ba1bf5fb10f75874b62011dde51f4bf76b33a`.
- Final integrated code SHA: `7030f1b551e55368d90e477a956893fe6ae40fc7`. Parents: `c54ba1bf5fb10f75874b62011dde51f4bf76b33a` and frozen S. O, C and S are all verified ancestors; no PASS is implied by Git ancestry.
- Main observed at start: `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; origin/main observed at O. No fetch/pull, push, main update, source worktree edit or uncommitted-source import.

Pairwise O/C, O/S and C/S merge-bases are A. None of O, C or S contains either other frozen tip. Patch equivalence of historical Finance changes is not ancestry. The first merge contains O and C; the second explicit merge adds S. Final source ancestry was verified with merge-base --is-ancestor after committing, rather than inferred from document presence. The local merge can establish ancestry while functional certification remains FAIL.

## Actual conflicts and semantic resolution

First merge: four conflicts, recorded in [intermediate gate](BS15_BS16_INTERMEDIATE_CERTIFICATION.md).

- `createNewGame.ts`: retain BS15 dated Talent supply, Recruiting/Portal, NCAA institutional policy and pro pathways; append canonical Finance foundation and initial-date processing.
- Finance exports: retain ExpenseAccountMapping and FinanceFoundation.
- Calendar imports: retain both systems and a single Finance daily phase.
- Save V4 compatibility payload: union the compatibility exclusions, including Talent and financial reservations. Valid V4 restoration does not run a Talent backfill.

Second merge: ten conflicts, resolved per hunk without strategy flags or replacing directories.

- `docs/ARCHITECTURE.md`: preserve certified K-C authority rather than restoring older Finance descriptions inherited by S.
- `createNewGame.ts`: preserve the composed O+C bootstrap; S's older bootstrap must not erase later Talent or Finance policies.
- `FinanceActivationLoad.test.ts`, `FinanceActivation.test.ts`, `FinanceActivation.ts`, `FinanceActivationPersistence.test.ts`: resolve add/add duplicate history in favor of the certified K-C implementations and their preserved-ledger contract.
- Finance exports: retain later currency, opening, Treasury and economic-source APIs alongside physical integration.
- `GameWorld.ts`: retain BS15 indexing/revision/append-only validation and financial account validation; exclude physicalAttempt from scheduled-to-completed planned identity comparisons, while completed sessions remain wholly immutable.
- `ScheduledTrainingEngine.ts`: preserve date cache, pending arrays, batch flush and atomic publication. The P0 resolver executes within that owner. A verified physical block appends only the updated pending session; it does not rebuild the world or apply stimuli.
- `GameWorldSaveV4.ts`: union compatibility exclusions; preserve additive Finance/Talent/Facilities restoration, optional physical attempts and physical history sequence.

Automatically merged files were reviewed as contracts, not assumed correct: Save V1 retains per-record copying and the optional physicalAttempt parser; Rust and WorldDb bootstrap carry physical source identities; Facilities/Training UI retains recent Finance precision and adds truthful gate evidence/navigation.

## Authorities preserved and defects corrected

GameWorld remains JSON-safe and the only published persistent world. BS15 validation scopes, dependency tracking, dirty reuse, indexed Training history and atomic transactions are retained. A constructor-only financial reservation validation block closes a missed dirty dependency. The indexed Training validation loop invokes the existing session constructor when physicalAttempt exists, closing the direct Record publication bypass without a new physical rule.

Calendar remains the single daily authority. Finance executes once per date, including initial-date processing, followed by the existing lifecycle phases. No transaction is held across an await. Training owns sporting changes; Facilities supplies physical facts and P0 permission only. UNKNOWN preserves continuity; established OOS blocks only a dependent session; restoration permits a legitimate retry exactly once.

Talent retains canonical PlayerId/candidateKey, materializations, annual supply, youth pathways, NCAA, Recruiting, Portal, Draft and career-end. No new Talent generator or Y1-Y30 replay. Finance retains FinancialAuthority/Authorization/Reservations, profiles/currency/minor units, recognition/payables and fully fundable Treasury batches. Recognized revenue is not collected cash. No receivables collection policy, new balance source, monetary formula or BS16L/M/N implementation was added.

Facilities retains CFI collections, temporal Team rights, condition/history, physical work progression, availability/commissioning, CFI8, World DB facts and canonical UI. No capacity allocator, invented ownership/equipment/dates or independent persisted availability cache. Medical preserves BS12C Advisory, Rehabilitation, Injury, Recovery, fitness tests and RTP; specialized physical Medical remains NOT_IMPLEMENTED.

Production file comparison confirms no differences from O in Injury/Recovery/RTP, MatchEngine and Talent domain; FinanceActivation, FinanceFoundation, ClubFinanceLifecycle and ClubTreasuryLifecycle match frozen C.

Stale tests were repaired without removing coverage: Finance fixtures respect initial payroll and independent NIL budget lines; Facilities fixtures retain Talent origin Places; the Staff Calendar test accounts for newly completed Training execution deltas while the direct Staff no-write test remains intact and exercised.

## Cross-system causal evidence

`src/app/game/BS15BS16BS17Convergence.test.ts`: five passing tests.

1. Same July 1 day: annual Talent, controlled payroll/OPEX/revenue/reservation, dependent Training and independent Training. Worlds differ only in physical condition. OOS creates no dependent stimulus; FULL executes; Finance and Talent facts match. Cash is 980000 minor after payroll/OPEX, excluding the uncollected 50000 revenue receivable. Reprocessing cannot duplicate payroll, recognition or Treasury facts. Restoring a real component condition permits the pending session once, preserving the already completed independent session.
2. Combined Save -> Load -> Save -> Load: exact semantic payload equality, stable identities, NCAA and career-end history, reservations/Treasury/physical history/attempts, no materialization replay or altered rights.
3. Sync/async commands: identical saved worlds, unchanged input, one publication, unique phases, and an actual VERIFIED_UNAVAILABLE physical gate.
4. Full publication rejects a malformed future physical attempt, preserving the input.
5. Incremental publication rejects the same malformed attempt, preserving the input.

The fixture supplies explicit controlled economic/physical facts in tests only. Production bootstrap does not fabricate them.

## Validation evidence

Evidence is local JSON/log output, preserved under `node_modules/.cache/bs15-bs16-bs17-certification/` after all writers finish. Archives of exact O/C and the extracted source DB slice remain there; generated evidence is not committed.

- Intermediate gate: 423/431 initial tests; seven failures reproduced on exact frozen C; all eight failing cases corrected and covered by passing focused reruns. Details in the intermediate document.
- Changed-behavior gate: 191/224 PASS initially; all 33 failures were the same stale Facilities Place replacement. The 191 passing cases include all Training/Medical suites, five new convergence cases, reservation dirty validation and world day batching.
- Corrected Save Facilities plus convergence rerun: 49/49 PASS (all 33 previously failing cases included).
- Wider physical surface first run: 156/317 PASS; 160 failures from the same missing Talent origin Places and one stale UI expectation of an empty commitment collection after bootstrap payroll. Additive Place fixtures and the UI assertion of unchanged input commitments are corrected; complete rerun: 317/317 PASS. CFI7 fact orchestration uses the pre-payroll generated world, matching its unit scope.
- CF1 Save and Facilities command fixture gate: 8/11 initially; all three stale payroll-era expectations corrected, rerun 11/11 PASS. CF1 legacy payload now derives from a genuinely pre-payroll world; rejected project commitments preserve the entire input world.
- Corrected Staff pipeline: 8/8 PASS.
- Real World DB TypeScript production smoke: 2/2 PASS using the native-extracted slice.
- Rust `cargo fmt --check`, offline `cargo check`: PASS. Native world_db tests: 8/8 PASS, 3 unrelated tests filtered. Real database `C:/BDM_DB/DDL-12/output/bdm_world_ddl12.db` read-only; extracted physical content: 1 Place, 18 Facilities, 18 Team usages. No fake assets or source DB writes.
- Typecheck: PASS after final production and fixture validation changes.
- Final build: PASS. Existing chunk-size advisory is retained.
- Full suite completed: 4916 tests, 4819 passed, 38 failed, 59 pending. The raw run is NOT green. Failure classification and focused repair evidence are below; pending tests include the explicit 30-second season fixture hook timeout. No test was deleted or skipped to obtain a green result.
- Diff/conflict/RNG/import checks: PASS. The explicit local merge left a clean working tree. This following documentation-only commit records its numeric code SHA and verified ancestry.

## Deferred product work and recommendation

BS16 certification stops at K-C. H opening sources remain PARTIAL; L/M/N remain outside the frozen certified source; documented initial ACB/payroll and receivable boundaries remain unexpanded. BS17D is globally PARTIAL: Medical specialized NOT_IMPLEMENTED and Talent Facilities NOT_LIVE. Presence of BS15 in ancestry does not connect Talent to Facilities. BS17E/F and global physical allocation are deferred.

After final PASS only, this isolated local branch is a candidate base for BS17D-T. Implement that separately against an approved Talent physical contract. Main integration requires its own authorized step; this execution never merges into main or pushes.

## Full-suite classification and final closure

Raw evidence: `full.json` and `full.log`. The full required suite ran with BS15I opt-in replay flags unset. Its legacy World DB ten-year test was included because it is unconditionally in npm test; this was not a rerun of certified BS15I Y1-Y30. No additional ten-year replay has been launched.

- **PREEXISTING_BASELINE, reproduced on exact O:** PlayerRatingHistory annual checkpoint, MatchSession game-clock shape, DesktopAppHost Depth Chart, MatchEquivalence snapshots, MatchRotationRunner substitution, nextTruth shot clock, MatchNextDebugApp rebound text and RosterWorkspace ambiguous Overview button. `bs15-baseline-failures.json`: 106 tests, 96 passed, 10 failed; the additional two failures are the obsolete NCAA institutional policy expectation and a crypto-seeded monthly NCAA run stopping early. No MatchEngine/navigation/rating production repair was introduced.
- **STALE_TEST, repaired:** five V1 assertions compared a modern world with fields outside the V1 schema. Every V1 payload field is now compared; personality/morale identity-keyed rows are sorted without dropping any row, ID or value. All 21 V1 tests pass. Current V4 authorities retain exact combined double-roundtrip coverage. The earlier BS15 closure document already records this exploratory V1 whole-world mismatch.
- **STALE_TEST, repaired:** ShippedUniverseFacilities (2) now permits exactly the canonical Talent origin Places while still requiring zero fictional Facilities/components/rights; WorldDbPhysicalContent (5) and TrainingWorkspace (1) retain those Places additively. All corresponding focal tests pass.
- **STALE_TEST, repaired:** FinanceActivationLoad (1), ClubStrategy/ClubNeeds/GMDecisionContext (3), FacilitiesWorkspace (1) and ClubPcbPage (1) now preserve initial payroll facts and query actual known cash. Empty finance assertions on genuinely stripped legacy worlds remain intact. All corresponding focal tests pass.
- **STALE_TEST, repaired:** NCAA institutional policy (1) asserts the actual bootstrap-owned institutional date and provenance, retaining separate simulated calendar assertions. The monthly Recruiting integration now injects a replayable match seed instead of crypto entropy; arrival/profile assertions remain unchanged.
- **ENVIRONMENTAL_FAILURE:** exact-Y5 opt-in Save audit needs external persisted Save/checkpoint paths absent from this ordinary suite invocation. No Y5 replay or invented substitute artifact was used.
- **ENVIRONMENTAL_FAILURE / test budget:** short deterministic simulateUntilDate case passes on isolated rerun. startNextSeason preparation measured 53.88 seconds against an explicit 30-second hook; SeasonProgression all-game V1 fixture had an explicit 10-second limit; the eight-day Talent certification smoke had a 30-second outer test limit. Only those outer fixture/test limits were enlarged to 120 seconds; assertions and the certification runner's internal runtime budget are unchanged. Focused results: simulateUntilDate 16/16 PASS; SeasonProgression 4/4 PASS; eight-day certification smoke 1/1 PASS; startNextSeason 12/13 PASS followed by the remaining third-season assertion 1/1 PASS after increasing its explicit 10-second test budget as well. No assertion or internal certification budget changed.
- **PREEXISTING_BASELINE, separately reproduced on exact O:** SeasonContentActivation past-game rejection (`season-content-baseline.json`, 1/1 matching failure) and World DB pre-fix Staff contract expectation (`world-staff-baseline.json`, 1/1 matching failure). The latter preserves the actual zero-contract result rather than fabricating a contract.
- **STALE_TEST assumptions with actual captured causes:** World DB 1000-day direct loop stops at a required pre-Cup media opportunity; the 365-day loop stops at seasonComplete. Both loops call raw advanceGameDay without resolving the respective canonical command/rollover. Their real exceptions are preserved in full.json; this is not evidence of an integration-created Calendar defect. ContinueFlow's decision authority was not changed.
- **ENVIRONMENTAL_FAILURE / test budget:** World DB 100-day timing case elapsed 295.95 seconds against its explicit 60-second test limit; it reported timeout, not a failed semantic assertion. No claim of a newly diagnosed or repaired scaling defect is made.
- **INCOMPLETE auxiliary evidence:** the broad frozen-O filter also selected the inherited 100/365-day timing cases. It was stopped after over 30 minutes because it cannot recover the missing ten-year result telemetry. Its unfinished log is not used as baseline proof (`bs15-world-baseline-aborted.md`). The required full suite was already completed and all its failures remain visible.
- **UNRESOLVED_FAILURE_CAUSE:** the legacy World DB ten-year run returned 2029-06-05 instead of 2035-10-01. Its result.stopReason was not captured. The unconditional one-call arrival expectation is statically incompatible with `ContinueFlow.getExplicitAdvanceStopReason`, which preserves required medical/other decisions; default match seeds also use crypto entropy. This identifies a stale test assumption, but DOES NOT establish the actual cause of this particular stop or rule out a runtime defect. The observed failure cannot honestly be relabeled PREEXISTING_BASELINE solely from the date. No clinical authority, breakpoint or target-date assertion has been bypassed.

Focused read-only review confirmed the V1 projection preserves every persisted field and that the specific 2029 stop remains unresolved. Until that cause is classified, the no-unresolved-regression PASS gate is not satisfied. The user's short-only integration constraint prevents silently extending this run into a second long simulation merely to recover missing telemetry. The explicitly authorized local second merge records the resolved composition and this FAIL certificate; it does not assert functional certification, readiness for main, or a certified BS17D-T base. This follows the active convergence contract's explicit PASS/FAIL outcome and clean local-branch requirement; no known runtime defect is hidden or claimed repaired. A stopReason field has been added to the existing long-test diagnostic report for any later authorized reproduction, without weakening or rerunning that assertion.

## Final evidence and follow-up

- Final Save V1 + combined five causal tests + deterministic NCAA integration: 30/30 PASS (`save-cross-final.json`).
- Final typecheck PASS (`closure-typecheck-committable.log`); build PASS (`closure-build.log`). The existing chunk-size advisory remains.
- Diff checks for both staged and working changes PASS; no unresolved index entries or source conflict markers; no Math.random in src or React/Zustand/Tauri runtime imports in Domain/Engine. No new unauthorized RNG.
- BS16 canonical worktree advanced independently to `083ccc3ba6ad6d2b86fec2f4618553d95fcd16be` during this run. Its later work was NOT imported: the merge source remains frozen C.
- Next action: recover/capture the legacy World DB stop reason in a separately authorized diagnostic scope with replayable match seeds and frozen-O comparison; classify the actual observed failure, repair any demonstrated integration defect, and rerun only justified focal gates. Do not bypass canonical medical decisions or repeat the certified BS15I Y1-Y30 program. Until then: convergence certification FAIL; main integration and certification-based BS17D-T development are deferred.

The combined V4 test additionally loads its blocked Training record through the V1 parser and asserts complete physicalAttempt equality plus VERIFIED_UNAVAILABLE status. This extended five-test cross-system rerun passes 5/5 (`cross-v1-final.json`).

Raw failure accounting: 20 stale cases repaired with passing focal coverage; 10 cases reproduced on frozen O (eight Match/rating/navigation cases plus SeasonContent and World DB Staff); two direct-loop stale expectations with captured media/season-stop exceptions; five timeout/artifact-environment failures, three subsequently green in focused reruns, with the exact-Y5 external-artifact dependency and inherited 100-day budget left visible; one unresolved ten-year stop. The failed preparation hook accounts for pending assertions separately. The additional intermittent crypto-seeded monthly NCAA failure seen during focused runs was reproduced on O and then made replayable; it was not one of the original 38 full-suite failures.

Final Git state: O/C/S ancestry to the integrated code SHA all true; second merge has exactly two parents. main remains `8a0b359e9ae48fe372668241788c9d5aa7a33b03`, origin/main remains O. No fetch/pull, push, main merge, branch/worktree deletion or later-source import. The local branch is composed but NOT functionally certified. All 13 pending season assertions from the full-run setup timeout were exercised by green focused reruns; the other 46 original skips belong to existing opt-in suites, including the real World DB smoke later run successfully with the actual DB slice. No skip was introduced by this convergence.

## Convergence closure audit ? 2026-10-09

Closure base: `d7fce9afa6ee0cde3989b50523844d38fc9040c2`. Integrated production remains `7030f1b551e55368d90e477a956893fe6ae40fc7`; this closure changes only tests and documentation. No new merge, main/source-worktree write, production RNG change, clinical decision or system reopening.

### Original execution and missing evidence

Exact test: `World DB Spain ACB playable GameWorld bootstrap / RWS-BUG-002 ten-year run: reaches 2035-10-01 through canonical simulation, rollovers, and annual development`, in `src/app/game/WorldDbGameBootstrap.test.ts`. Function: one `simulateUntilDate(initialWorld, targetDate)` call. Origin: `createWorldDbSpainGame(selection.teamId, { repository: repository(slice()), databasePath: 'real-world.db', runtimeBundlePath: 'runtime-bundle.json' })`, an injected in-memory repository fixture, not a persisted historical external DB world.

The fixture contains 18 male Teams and 90 Players (five positions per Team) plus their Head Coaches; primary competition `competition:ESP:liga-endesa`, season `season:2025_26`, edition `edition:ESP:liga-endesa:2025-26`, user Team `team:ESP:male:000`, coach `worlddb:coach:team:ESP:male:000`. Linked Copa format, deterministic derived schedule, runtime bundle BLAKE3 pin `'a'.repeat(64)`. Start `2025-10-01`; requested target `2035-10-01`.

The original full.json records finalDate `2029-06-05`, then a target-date assertion failure at then-current line 647; duration 3,273,172.89 ms. The simulation returned a result: the reported exception is an assertion error, not a captured application exception. **Original stopReason, day count, returned world, last operation/phase and pending IDs remain UNKNOWN.**

Search covered full.json's complete test-result structure, full.log, preserved convergence files, the test's checkpoint behavior and bounded relevant C:/Temp checkpoint/log inventories. No valid checkpoint for this fixture near June 2029 was found. The native-extracted world-db-slice.json is source content, not an advanced GameWorld. BS15I annual checkpoints belong to a different generated universe/configuration and cannot substitute. This test retained world/spy histories only in worker memory and did not write annual or stop checkpoints. Its original console report omitted stopReason; the retained JSON-reporter log has no historical world. Default match seeds came from Web Crypto and were not retained.

There is therefore no exact origin-to-stop replay from these artifacts. Static unchanged policy, similar dates, a controlled Media decision or another seed do not identify the historical event. **No evidence establishes Medical/RTP as the June 2029 cause.**

### Bounded paired reproduction

Two `closure diagnostic:` tests reuse the existing source fixture. No existing target/date/cycle assertion was removed or relaxed; no skip or larger existing timeout was added. Transient diagnostic output records current/requested/reached dates, day count, full stopReason, pending decision types and IDs, phase/last operation, exception classification, injected seed and configuration/state fingerprints. None enters GameWorld/Save.

- **Natural original fixture:** MatchSeedFactory `() => 151617`; daily progression from `2025-10-01` to `2025-10-05`, through its first match day on October 4. Four days advanced, nine Games resolved, `{ type: 'arrived' }`, no pending decision. Last phase `DAY_COMPLETE`, status `COMPLETED`, last match operation `Resolved 9 scheduled game(s) through the existing match application boundary.` Original saved payload unchanged. V4 reload retains reached date and explicit-stop projection. No direct future-date jump.
- **Controlled Media fixture ? explicitly not historical reconstruction:** the first scheduled user Game on `2025-10-04` is marked final as an explicit fixture fact; canonical createPreMatchMediaOpportunity creates a pending opportunity. Current `2025-10-01`, target `2025-10-02`, reached `2025-10-01`, zero days and zero RNG draws. Phase `EXPLICIT_ADVANCE_PRECHECK`, exception classification `NO_EXCEPTION_RETURNED`. Exact stop type `mediaOpportunity`, level `ACTION_REQUIRED`, reason `mediaOpportunity`, source kind `MEDIA_OPPORTUNITY`, effective date `2025-10-04`, route `media`, source/opportunity ID `media:pre:derived-simulation-from-b04:edition:ESP:liga-endesa:2025-26:0001:pressure`.

The controlled full stopReason equals getExplicitAdvanceStopReason(world). Save/reload preserves that decision and stopping date. An explicitly selected canonical skipMediaOpportunity clears only this Media decision; repeat skip is idempotent. Injury (including recovery/RTP facts), financial transactions and Governance decisions remain unchanged. No medical/institutional decision was accepted automatically.

Both cases run against the integrated branch and exact frozen O production in the existing ignored archive inside this same worktree: **2/2 PASS each**. The added diagnostic harness copies do not modify any original archived production file or the actual BS15 worktree. The precise test-name filter matches neither long runs nor benchmarks. Complete emitted diagnostic objects are exactly equal between both executions.

Source/configuration SHA-256 in both: `456153258a2d289fe7e22a4c10ef2154d6aeff83ccb280e0c39412c55021e471`. Relevant origin-state SHA-256: `b7183b463afe8181a7c2d22baf0910b0bad18f4a4383c9a3ac58113f4a27f7b8`; controlled pending-Media state: `a48afc327bbac5902b2ea0467cb344450fa76ea233ee2ff5fb331b73711defde`. These cover the explicit source/configuration and decision-relevant collections, not an assertion that every added Finance/Facilities field is identical to older BS15.

ContinueFlow.ts, simulateUntilDate.ts, SimulationBreakpoints.ts, advanceGameDay.ts and MediaEngine.ts are identical Git blobs between O and closure base. Their archived text matches O with Windows line-ending normalization only. Injury Domain/Engine production is unchanged; the only added Injury-folder file is the prior MedicalPhysicalCompatibility test. Engine Calendar's added Finance phase remains the previously integrated authority, covered by the focal regressions.

**Classification:** PREEXISTING_BASELINE for the demonstrated controlled Media behavior; unconditional one-call arrival contradicts this legitimate policy. **UNRESOLVED_FAILURE_CAUSE for the historical 2029-06-05 stop.** The probe does not relabel it STALE_TEST or prove absence of a later runtime defect. Neither a production repair nor weakening of the original ten-year assertion is justified.

### Validation and verdict

Focused regressions **61/61 PASS**: ContinueFlow 15, SimulationBreakpoints 16, CalendarEngine 25, cross-system convergence 5. New World DB diagnostics **2/2 integrated + 2/2 frozen O PASS**. Save/reload exercised in both stop and combined convergence coverage. No clinical-cause test was invented because no clinical cause was demonstrated.

Typecheck **PASS** (`typecheck-final.log`), build **PASS** (`build-final.log`, existing chunk-size advisory). Final diff/source ancestry and clean branch are checked at closure commit. No full-suite or ten-/thirty-year replay. Previous full-suite result 4916/4819/38/59 and all other failure classifications are preserved; these focal results do not claim to resolve them.

**Certification verdict: FAIL retained.** The required original-stop explanation gate remains unsatisfied. Missing evidence: the original returned SimulateUntilResult, particularly world/stopReason; alternatively, a valid checkpoint of this exact world immediately before the stop plus its intervening seed sequence and command/decision journal. Without it, the original phase, pending IDs and true stop class cannot be recovered. Next action: recover such a historical record from a valid backup if one exists. A replacement certification with another seed/horizon requires an explicitly different contract; this closure does not silently start a new ten-year run or substitute synthetic evidence.

BS17D-T is **not enabled on a certified base**. Frozen BS16 certification remains through K-C; BS17D remains globally PARTIAL, specialized Medical NOT_IMPLEMENTED, Talent Facilities NOT_LIVE.

Evidence: `node_modules/.cache/bs15-bs16-bs17-certification/closure/`: paired-match-diagnosis.json, current/frozen-bs15-match-diagnosis JSON/logs, relevant-regressions.json/log and final typecheck/build logs. Earlier probe setup failures also remain: the initial controlled test assumed a user Game existed on October 1; it now selects the actual first scheduled Game, keeping currentDate unchanged. This was a diagnostic fixture correction, not a production defect.
