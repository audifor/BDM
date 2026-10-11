# BS17D-C1 FINAL ACCEPTANCE REVIEW

STATUS: FAIL · REVIEW FINDINGS

REVIEWED SHA: ece086779ad500833880bc47aad125f60dbc5a66
BASE: a5576a9b70552c896ef589438f21380e3234a6f2
SAFE TO FREEZE: NO

## Material finding F1 (P1): Training can bypass a binding exclusive reservation

Source: src/engine/training/ScheduledTrainingEngine.ts:274-277. Only CONFIRMED, PENDING or BLOCKED records invoke evaluatePhysicalAllocation. A session with no record or only RELEASED records goes through resolveSportingOperation (src/integration/facilitiesSporting/SportingOperationResolver.ts:21-49), which does not consult C1 occupancy. Facilities resolves the conflict correctly, but Training does not consume that result for these paths.

Reproduction uses the existing allocationFixture with truthful controlled data: exclusive component capacity10 SIMULTANEOUS_PLAYERS, FULL condition, valid Team rights, youth8 10:00-11:00, senior individual1 10:30-11:30. No unknown participant count, missing capacity, missing interval or missing access explains the defect.

1. Confirm youth reservation and leave senior without one. evaluatePhysicalAllocation reports senior BLOCKED/RESOURCE_OCCUPIED. Execute the date: both sessions complete; senior physicalAttempt says VERIFIED_AVAILABLE and its execution contains a developmentStimulusEventId.
2. Confirm then explicitly release youth reservation; confirm senior reservation. Resolver reports youth RESOURCE_OCCUPIED. Both sessions nevertheless complete and receive sporting effects.
3. Save V4/reload scenario2. The same bypass persists: youth completes with VERIFIED_AVAILABLE and development stimuli.

All three diagnostic assertions reproduced the undesired actual behavior. Their PASS status means the defect was reproduced, not that the acceptance contract passed. The 29 imported existing allocator assertions also pass. This is incompatible physical consumption despite an exclusive reservation, rather than two confirmed allocation records escaping the allocation sweep. Impact: reservation binding, manager release semantics and the real sporting gate are not universally enforced. C1-05 and final acceptance gates for Training/physical conflict are not satisfied. The original PASS certificate remains preserved as historical evidence; this review does not amend it.

Command (executed):

`node node_modules/vitest/vitest.mjs run --config node_modules/.cache/c1-review/vitest.config.ts --reporter=json --outputFile=node_modules/.cache/c1-review/results.json`

Reproduction: ../c1-review/bypass.test.ts; config, results.json and results.log are preserved there. The test invokes real domain/engine/Save code, not mocked allocator behavior.

## Other checks and evidence boundaries

GIT ANCESTRY: base, V2 fbe788ce01f1dd34fc40b360b4661ebaad63457c, T 64abd26a50e93fd827f27dccabaa486e0e73dd04, T1 582f517e178ae8a7159237fd3d75e2db4c9d8f87 and consolidation eb12f9670b2c99a6cf3c8ddef0ae2d73fd5e78c9 remain ancestors. HEAD equals reviewed SHA. Worktree remains clean; main8a0b359 and origin/main94c0770 unchanged. No commits, merges, rebase, imports or push in this audit.

RESERVATION AUTHORITY: code inspection confirms Facilities domain/engine own physical records and transitions subordinate to the canonical Training session. Training owns scheduling, participants, sports results and stimuli. There is no second sporting agenda. Diff adds no Finance/Governance, Player supply/identity, Recruiting probability, Medical/Recovery or MatchEngine authority. Existing finance orchestration is inherited, not changed by C1.

CAPACITY INTEGRITY: existing causal tests and reviewed code support typed capacity, unknown demand/capacity/unit, LIMITED without fictitious reduction, OOS, full/partial overlap, half-open/consecutive and midnight intervals, parent-child scope, explicit physical sharing and dated Team access. No capacities or hours are added to production datasets. This integrity is established on explicitly evaluated/confirmed paths; F1 prevents a universal no-conflict consumption claim.

CONCURRENCY / ATOMICITY: synchronous store commands take one current GameWorld and engine confirmation publishes once. Confirmed records have uniqueness, source-link and peak-capacity validation. Existing duplicate commands and failed rescheduling tests pass. No multi-process concurrency guarantee is claimed. Manager release/cancel history, prior reservation preservation and unresolved pending priority are tested; released-session execution is affected by F1.

TRAINING INTEGRATION: revalidation of active requests, failure evidence without stimulus, effective modules and selected participants is tested. Batching/pending flush/incremental publication remain in code. A derived active WeakMap avoids scanning historical records in daily occupancy checks. This cache integration is reviewed by code; no new longitudinal or scaling certificate was run. F1 demonstrates a consumer path bypassing that revalidation.

PRODUCTION REACHABILITY: BootstrapApp -> createConfiguredGameAsync -> replaceWorld -> workspace host registers Training/Facilities. Training renders the resource control; Facilities renders it in a selected inspector. The manager UI test operates real store commands, Save/reload, rescheduling, release, cancellation and selected-Facility focus. This confirms the UI path, with controlled resource enrichment, not universal production coverage.

New-game production probe (executed without enrichment): prototype, ncaaSimulated and acb-2026-27 each have 0 Facilities, 0 components, 0 rights and 0 component conditions. WorldDbSpain (code inspected, no DB rerun) uses projectWorldDbPhysicalContent, which supplies Places, structural Facilities and Team associations only; total Facility capacity is not player-capacity evidence and structural usage is not a right. Therefore none of these shipped new-game paths demonstrably supplies full C1 confirmation data. Properly sourced existing/imported saves can use the conditional runtime, subject to F1. The certificate already qualifies LIVE by legitimate known data; this absence is a limitation, not a reason to invent data or an independent production falsification finding.

SAVE / CALENDAR: fresh focal Save30 and Calendar25 pass, alongside the manager Save flow and C1 Save cases. Save restores references/history without fictitious old reservations. F1 reproduces after reload; Save integrity does not repair consumer enforcement. Exactly-once completion is distinct from authorization to execute.

MX / UI: reachable actions confirmed by the real manager regression, with conditional known-data availability. No browser/Tauri manual walkthrough was executed; code navigation and React/store tests are the evidence.

REGRESSION RESULTS: 104 passed /0 failed,6 files: allocator29, Save Facilities30, Calendar25, Recruiting T1 demonstrations14, cross-system V2 five, real managerUI one. Additional production-data test passes. Three diagnostic scenarios expose F1. No global suite, Y1-Y30 or historical World DB simulation was rerun. Certified 374/31 results remain previous-run evidence, not claimed as newly reexecuted. All20 retained certification artifacts match their recorded hashes; none missing. Typecheck/build are reviewed prior exit0 artifacts, not rerun in audit. The complete base/final diff is preserved in reviewed.diff, and review-evidence.json records this run's artifact hashes.

REMAINING LIMITATIONS: missing physical datasets and quantified LIMITED facts; no generalized actual utilization; BS17D global PARTIAL; specialized Medical/FacilitiesAI and later phases outside scope. Historical2029 remains UNRESOLVED_HISTORICAL_CAUSE.

NEXT ACTION: separate focused repair of Training physical consumption for known resources with no active reservation, including the post-release and Save/reload paths. Add permanent causal regressions for all three cases while preserving UNKNOWN/P0 continuity and independent modules; repeat relevant focal gates and final acceptance review before freezing. No production correction performed in this audit.
