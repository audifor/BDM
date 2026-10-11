# Convergence V2 certification result

**PASS · BS15/BS16/BS17 CONTROLLED CONVERGENCE V2 · BOUNDED CROSS-SYSTEM**

## Canonical acceptance and source

The user expressly approved CONVERGENCE CERTIFICATION V2 as a new bounded acceptance contract after preparation commit `7edbba2f8e0feefeb1794d1c19442fe33bb95ad8`. That approval replaces the prerequisite of reconstructing the irreproducible 2029 stop with deterministic differential and causal tests. Approval alone did not grant PASS: every gate below was executed again.

The [prepared contract](BS15_BS16_BS17_CONVERGENCE_V2_PROPOSAL.md) was checked against the user's final restrictions. Its bounded tests and authority boundaries agree. This certificate supersedes its pending-acceptance status and uses the user's exact final PASS formula. The preparation runner's raw pending-acceptance label is retained as original tool output; the runner validates differential tests, while explicit approval and the complete gate decision are recorded here.

Validated implementation/test source: `7edbba2f8e0feefeb1794d1c19442fe33bb95ad8`. Final certificate SHA is the local commit containing this document, directly descending from that source. This closure changes documentation/evidence only, so the validated implementation is identical. Worktree: `C:/BDM-INTEGRATION-BS15-BS16-BS17`; branch: `integration/bs15-bs16-bs17-certified`.

All three frozen sources are verified ancestors:

- BS15: `94c077092224a9f75c861a853d9d52fceae526fe`.
- BS16 through K-C: `97c58b98b9192a569f30bdfd8b63565f0b02a744`.
- BS17 through D-M: `6945cb90604bd349edd9d2333aa7d1861e9a311a`.

Main remains `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; the observed local origin/main ref remains `94c077092224a9f75c861a853d9d52fceae526fe`. No new BS16 commits, external merges, main modification, other-worktree modification or push occurs.

## Re-executed bounded gates

The committed certifier was executed from the clean approved source:

```powershell
node scripts/certify-convergence-v2.mjs
```

Frozen BS15 **10/10 PASS**; integrated **10/10 PASS**. Archive production blobs were checked against frozen Git, allowing only Windows line-ending normalization. Both versions used the identical acceptance harness, World DB-shaped fixture/runtime/configuration, match seed 151617 and source fingerprint `456153258a2d289fe7e22a4c10ef2154d6aeff83ccb280e0c39412c55021e471`.

The scenarios cover normal advancement and resolved matches; Pre-Match Media; legitimate Medical RTP review; SeasonComplete plus explicit rollover; Save/reload; Calendar sync/async; shared Coach Finance exactly-once; Talent materialization; Training with FULL, OUT_OF_SERVICE and UNKNOWN physical contexts. Their exact initial conditions, projections and authorized fixture choices remain in the prepared contract and unchanged committed tests.

The shared projections agree except the explicitly approved Training P0 outage consequences. FULL and UNKNOWN worlds retain the same shared sporting/stimulus facts as BS15; physicalAttempt evidence is an added BS17 fact. A known outage blocks only the required module and emits no stimulus for it. Unrelated compared authorities remain equal. Added BS16 club-accounting authorities are separately validated in the combined suite, rather than compared to nonexistent BS15 fields.

ContinueFlow distinguishes ARRIVED, CANONICAL_DECISION and SIMULATION_ERROR. Arrival is asserted with a coherent target/world date and no required decision. Media, SeasonComplete and Medical stops match current canonical source/date/ID facts. Negative tests reject a false arrival, safety-limit result and wrong injury ID, and preserve an injected failure in diagnostic evidence. Fixture decisions use only the authorized canonical skip, rollover and CONTINUE_RECOVERY commands; no clinical decision is bypassed.

The five combined causal cases are **5/5 PASS** within the focal suite. They demonstrate simultaneous Talent/Finance/Training work, scoped outage/restoration, input immutability, full/incremental validation rejection, combined double V4 reload and scoped V1 physical-attempt parsing, plus identical sync/async publication. These are real production consumers and commands, not new simulated authorities.

## Focal regression and resource-contention diagnosis

Final focal gate: **89/89 PASS**, eight files, zero skipped assertions, one worker, unchanged original test timeouts:

- ContinueFlow 15; SimulationBreakpoints 16; CalendarEngine 25.
- Combined convergence 5; diagnostic persistence 1; Finance reservation dirty validation 2.
- Medical physical compatibility 8; Training physical consequences 17.

The initial concurrent run, alongside the differential runner/typecheck, produced 88 passes and one ContinueFlow timeout. The original failed record is retained: runner-created STACK_TRACE_ERROR at 5735.84 ms against the unchanged 5000 ms default budget. The exact seeded case passed isolated in 3.48 seconds; the complete focal suite then passed with `--maxWorkers=1`, without production changes, assertion changes or timeout increases. Vitest's local withTimeout implementation rejects synchronously completed work after the budget is exceeded. This is classified as a contended test-run timeout, not a demonstrated world-simulation scaling defect. The initial failure is not erased or counted as a pass. No unresolved implementation regression was observed in the final V2 gate.

Reproduction command:

```powershell
npx vitest run src/app/game/ContinueFlow.test.ts src/app/game/SimulationBreakpoints.test.ts src/engine/calendar/CalendarEngine.test.ts src/app/game/BS15BS16BS17Convergence.test.ts src/app/game/WorldDbCertificationDiagnostics.test.ts src/engine/training/TrainingPhysicalConsequences.test.tsx src/engine/injury/MedicalPhysicalCompatibility.test.ts src/domain/world/FinanceReservationDirtyValidation.test.ts --maxWorkers=1
```

Typecheck and build exit successfully. The preexisting bundle-size advisory remains. Git diff checks, frozen ancestry, unmerged-index checks, source conflict-marker checks, zero src Math.random calls and Domain/Engine runtime-import boundaries pass. No production/Rust implementation changes are made; no full suite, performance program, Y1-Y30 horizon or historical longitudinal rerun is executed.

## Preserved historical limitations and known failures

**The original longitudinal World DB run remains unexplained: UNRESOLVED_HISTORICAL_CAUSE.** It returned 2029-06-05 instead of 2035-10-01 without a preserved stopReason/world/seed journal. Neither this approval nor these replacement tests establish its actual cause. It is not reclassified as baseline, stale or PASS.

The original [FAIL report](BS15_BS16_BS17_CONVERGENCE_CERTIFICATION.md), raw full.json/full.log, prior preparation manifest and previous classifications remain unchanged; their Git blob/hash/size integrity was rechecked. Historical full-suite totals remain 4916 total / 4819 passed / 38 failed / 59 pending. That suite is not newly certified.

The original accounting remains visible: 20 stale cases repaired previously; 10 failures reproduced on frozen BS15 (eight Match/rating/navigation plus SeasonContent and World DB Staff); two direct-loop stop assumptions; five timeout/artifact-environment failures, three subsequently green, with the exact-Y5 artifact dependency and inherited 100-day budget still visible; one unresolved ten-year stop. Pending/opt-in assertions and the previously reproduced intermittent NCAA issue retain their earlier classifications. None is explained away by the bounded V2 PASS.

## Certified scope

This PASS certifies convergence of the frozen BS15/BS16/BS17 authorities and functional compatibility only in the tested bounded projections/scenarios: combined GameWorld/Save integrity; canonical Calendar execution and exactly-once publication; canonical Talent identity/materialization/pipeline preservation; Finance through frozen K-C; CFI8, Facilities and Training P0; and no unresolved new regression demonstrated within that scope.

The World DB source is the documented repository fixture; this is not a certificate for every external database, every persisted field or multi-year equivalence. Season-end supplied scores/rollovers do not stand in for a simulated sporting season. Future longitudinal diagnostics remain test-only and add no GameWorld authority.

## Uncertified scope and continuity

This PASS does **not** certify the original longitudinal World DB execution or its cause, global BS16 completion, global BS17D completion, specialized Medical, Facilities AI management, or global quantitative facility assignment. BS16 is preserved through K-C; BS17D remains globally PARTIAL. Specialized Medical stays NOT_IMPLEMENTED and Facilities Talent stays NOT_LIVE.

The integrated branch may now serve as a **certified bounded base for developing BS17D-T**, only after its Talent contract is approved and dependencies are resolved. No Talent Facilities LIVE claim is made until a real BS15 consumer is implemented and causally demonstrated. BS17D-T is not started in this execution.

Next executable action: verify/approve the BS17D-T Talent contract and resolve its dependencies in a separate milestone, then develop on this certified integrated base. This PASS does not authorize or automatically enable a merge to main.

## Evidence and Git closure

Tracked [final evidence manifest](evidence/CONVERGENCE_V2_CERTIFICATION.json) preserves the fresh gate counts, ancestry, approval, source/harness provenance, original timeout and isolated pass, historical classifications and SHA-256 hashes of the complete raw outputs. Fresh raw gate evidence: `node_modules/.cache/bs15-bs16-bs17-certification/approved-1791568214531`; paired differential evidence: `C:/BDM-INTEGRATION-BS15-BS16-BS17/node_modules/.cache/bs15-bs16-bs17-certification/v2/runs/1791568215227-16248`.

One local documentation/evidence certification commit closes this run. Final Git verification requires an empty working tree, all three ancestors retained, no unmerged entries, and unchanged main/origin-main refs. No push, merge or production repair was required.
