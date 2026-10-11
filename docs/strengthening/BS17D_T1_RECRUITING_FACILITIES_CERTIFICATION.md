# BS17D-T1 Recruiting facility demonstrations

STATUS: PASS · BS17D-T1 RECRUITING PHYSICAL DEMONSTRATIONS

PHYSICAL DEMONSTRATION CONSUMER: LIVE. BS17D GLOBAL: PARTIAL.

## Visit authority and architecture gate

The approved mandate is preserved verbatim in [the T1 contract](BS17D_T1_RECRUITING_FACILITIES_CONTRACT.md).
Base: `64abd26a50e93fd827f27dccabaa486e0e73dd04`.
Branch: `bdm-stage2-bs17d-t1-recruiting-facilities`.
Worktree: `C:/BDM-BS17D-T1-RECRUITING`.
Final SHA: the local commit containing this report (`git log -1 --format=%H -- docs/strengthening/BS17D_T1_RECRUITING_FACILITIES_CERTIFICATION.md`).

Focal audit gate: SUPPORTED by the existing BS15 authority; no replacement visit engine.

- Entity: `RecruitingVisit` in `recruitingVisitsById`, linked to the canonical cycle, prospect, program Team, date, cost, outcome, official/unofficial type, dates, lodging nights, participants, source action and legal status.
- Scheduling/execution: `performRecruitingAction(..., 'visit', visitDetails?)` executes an immediate event on the current date. The UI previously submitted an unofficial same-day visit. There is no canonical pending/scheduled visit lifecycle or post-execution cancellation command. The optional dates of an official visit are existing legal metadata, not a scheduler.
- Permissions: the same RecruitingPermission, versioned calendar, Staff V2 workload/capacity and official count/lodging checks remain ahead of execution. No physical selection bypasses them. An invalid visit returns before any demonstration can be recorded.
- Decisions/results: existing relationships, intel, role fit, interest, story, promises, commitments and signings remain BS15-owned. T1 adds no prospect preference or psychological effect.
- Manager UI: the existing Recruiting workspace submits the same command. Its Visit control now confirms the event with an optional component demonstration. Canceling confirmation changes only React state and creates neither a visit nor an activity.
- AI/Calendar: existing AI continues invoking the shared visit gateway without selecting a demonstration; recruiting cadence and policy are untouched. Calendar has no T1 pending task and cannot complete an activity automatically.
- Extension: one optional `facilityDemonstration` belongs inside the visit; no new GameWorld collection or independent event authority. A manager `requestId` identifies replayed confirmation, while the existing `sourceActionId` still identifies the Staff/RPG visit action. Old callers and visits without those optional fields retain their old behavior.

## Physical demonstration operation

T1 demonstrates an existing component capability; it does not execute the sporting or clinical procedure that capability describes. Showing imaging equipment, for example, creates no imaging procedure and does not make specialized Medical LIVE.

The manager selects a component/capability from existing CFI anatomy. `attemptRecruitingFacilityDemonstration` uses the same `SportingOperationResolver` as Training P0, with the selected component as an optional resource filter. Existing callers without that filter retain all-alternative resolution. The full-court capability requires its existing concrete full-court specification; no new room standards, duration, demand, occupancy or booking rules were invented.

Each subordinate attempt persists historical execution evidence through the existing `SportingPhysicalAttempt` convention: attempted date, policy/operation, status, Facility/component/capability, access evidence, known nominal capacity/unit, reason and null operational capacity. `COMPLETED` or `NOT_EXECUTED` is the owner's activity result. Visit/prospect/Team identity comes from the enclosing visit, and Organization is resolved from the canonical Team. No duplicate current-availability projection is stored.

- VERIFIED_AVAILABLE: complete the selected demonstration.
- VERIFIED_LIMITED: complete only when that capability/specification remains compatible.
- VERIFIED_UNAVAILABLE: do not execute the demonstration; keep the canonical general visit and its normal outcome.
- UNVERIFIED_PHYSICAL_CONTEXT: record an unverified attempt, not a verified completion; keep the general visit's behavior and apply no penalty.
- NOT_SELECTED: represented by the absence of the optional demonstration; no activity record or effects are fabricated.

Rights come only from the existing Team/date usage-right authority. Organization ownership/right does not grant Team access, nor does inviting a prospect create a right. Purpose-agnostic semantics remain unchanged. BS17C component work, closures and serviceability are resolved through the existing physical owner. Nominal capacity does not become availability or reservations.

## Retry, cancellation, Save and Calendar

An explicit manager retry belongs to the same selected activity on the same valid visit date. It may select a legitimate alternative component for the same capability or retry after restoration. It consumes no additional visit, Staff action, recruiting capacity, cost or permission. An unchanged failed attempt is idempotent; a completed demonstration is terminal and cannot be executed again. Changed evidence is appended to the same activity's historical attempts.

Replayed confirmation after reload returns the existing visit unchanged before any Staff/RPG or physical execution. A request key cannot be reused for another program/prospect/cycle. A retry rejects a missing, foreign, legally invalid or out-of-date visit and rejects an unselected/different-capability activity.

Cancellation is explicitly scoped to the existing immediate-event architecture: canceling the UI confirmation produces no canonical visit or pending activity. No post-completion visit cancellation system was invented. There are no planned persisted demonstrations that Calendar could accidentally finish after cancellation; attempts occur synchronously only after a valid visit command or explicit same-day retry.

Save V4 already carries RecruitingVisit records through the compatibility payload. New optional nested evidence and request identity round-trip without a new save version; old records load without mandatory T1 fields. Save implementation, Calendar phases, exactly-once processing and batching are unchanged.

## MX / UI

The existing Recruiting workspace offers compatible component types and previews their known current capability/access/service state, including unavailable alternatives and unknown information. Selection alone changes no simulation state. Confirmation executes the existing visit command. A preview is labelled as unexecuted; recorded outcomes appear in a separate historical section, including failed and unverified attempts. Same-day unsuccessful activities expose explicit alternative/restoration retry controls. Completed results remain visible after reload; no completion is inferred from a planned record.

The same confirmation offers navigation to the existing Facilities workspace. No new application was created. The current manager UI remains unofficial/same-day, matching its previous scope; engine-level official visit compatibility is also tested. There are no recruiting percentages, potential boosts, affinity advantages or economic obligations.

## Causal and regression evidence

**211/211 tests PASS in 14 files**, zero failed or pending. New T1 coverage: 14 causal/owner tests and 4 manager UI tests. Regressions: RecruitingEngine 8, RecruitingLifecycle 5, RecruitingPermission 16, RecruitingRpg 20, existing Recruiting workspace 6, prior youth Facilities integration 10, CFI8 42, Training P0 17, Facilities Save 30, physical operations Save 9, Calendar 25 and combined convergence causal tests 5.

`npm run typecheck`: PASS (exit 0). `npm run build`: PASS (exit 0), retaining the Vite large-chunk advisory. `git diff --check`: PASS. No `Math.random()` in src or improper production framework imports in Domain/Engine. Rust is untouched; the user contract specifies focal regressions, typecheck, build and diff rather than a new Rust/full-suite run.

[Machine-readable evidence](BS17D_T1_RECRUITING_FACILITIES_EVIDENCE.json) records test names, seed, source fingerprint, ancestry and local log digests. Reproduction from this worktree with the provisioned dependencies:

```powershell
$bs17t1Evidence = Get-Content docs/strengthening/BS17D_T1_RECRUITING_FACILITIES_EVIDENCE.json -Raw | ConvertFrom-Json
$bs17t1Tests = $bs17t1Evidence.tests.files.path
npx vitest run @bs17t1Tests --maxWorkers=1 --reporter=verbose
npm run typecheck
npm run build
git diff --check
```

Raw reports/logs are retained under ignored `node_modules/.cache/bs17d-t1/`; summarized evidence and source tests are committed. No new unresolved regression was demonstrated in this scope.

The deterministic small fixture uses cohort seed `151617` and date `2032-10-01`, with a real BS15 materialization into a Recruiting prospect and stable CandidateKey/PlayerId. Its explicit NCAA ruleset is labelled testFixture; tests do not replace or reinterpret NCAA source rules.

Pairs differ only in physical service/access/specification or work evidence. Tests compare the same canonical visit facts and all non-Facilities/non-demonstration business state against the no-demonstration visit. This includes normal RPG relationships/interest/story, Player truth, CandidateKey materializations, Staff ledgers, Finance, Governance, NIL, scholarship and enrollment authorities. No additional bonus, cost, visit or mutation is permitted.

Coverage includes available/OOS, compatible/incompatible LIMITED, known wrong capability, valid/denied/expired Team access with Organization rights retained, legitimate alternative, unknown anatomy/service evidence, not selected, restoration/retry, canceled UI confirmation, Save/reload and Calendar non-reexecution. Official and unofficial NCAA permission pairs and dead-period atomic rejection preserve their canonical rules; the official count limit still blocks a distinct second visit.

Original transient test failures are retained in local logs: an invalid expired-right fixture interval was corrected to a valid past interval, and serialized-object UI assertions were corrected from reference to deep equality. No valid assertion was removed. The initial typecheck identified and corrected an import of a helper from a barrel that did not export it.

## Boundaries and next action

No implementation changes to MatchEngine, Training formulas, Medical/Recovery, Finance, Governance, Talent materialization, NCAA rules, recruiting choice/probabilities, AI recruitment policy, Calendar or Save. CFI8 remains the source of capability evidence. The only shared physical resolver extension is optional explicit component selection; its legacy/default behavior is covered by Training P0 and Facilities regressions.

The certified BS15, frozen BS16 K-C, BS17D-M, V2 and BS17D-T SHAs remain in ancestry. Main, the source Talent worktree and V2 convergence are preserved; no recent BS16 import, merge or push.

Historical 2029 remains **UNRESOLVED_HISTORICAL_CAUSE**. Existing bounded V2 evidence and known baseline classifications remain unchanged. No historical World DB, Y1-Y30 or full-suite rerun is part of T1. T1 does not explain that old failure or widen V2's certified scope.

BS17D global remains PARTIAL. Specialized Medical, Facilities AI and global quantitative allocation are not certified. No BS17E/F begins while BS16 dependencies remain open.

Next action: retain this scoped physical Recruiting consumer; any psychological effect, new accommodation allocator, scheduled visit lifecycle or other Facilities operation requires its own explicit policy and milestone. No outstanding decision is needed for the implemented T1 scope.
