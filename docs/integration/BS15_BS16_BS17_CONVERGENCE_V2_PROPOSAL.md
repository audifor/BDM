# Controlled Convergence V2 ? proposed bounded acceptance

Status: **PROPOSAL_PREPARED / PENDING_EXPLICIT_ACCEPTANCE**. This document is not a PASS certificate. The user expressly requires approval of the changed acceptance criterion before V2 can be certified. No product proposal becomes DECIDED here.

## Frozen composition and provenance

Worktree: `C:/BDM-INTEGRATION-BS15-BS16-BS17`; branch: `integration/bs15-bs16-bs17-certified`. Preparation base: `cc570af5cdd82a773d7a6191230d06d11af77a4b`.

The following frozen sources remain ancestors of the preparation base and its local V2 descendant:

- BS15: `94c077092224a9f75c861a853d9d52fceae526fe`, including its accepted Save and World Simulation work.
- BS16 through K-C: `97c58b98b9192a569f30bdfd8b63565f0b02a744`.
- BS17 through D-M: `6945cb90604bd349edd9d2333aa7d1861e9a311a`.

The original two semantic merges remain `c54ba1bf5fb10f75874b62011dde51f4bf76b33a` and `7030f1b551e55368d90e477a956893fe6ae40fc7`. No new merge, external import, rebase, cherry-pick or push occurs in V2. Main remains `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; the observed local origin/main ref remains frozen BS15. Neither is changed or fetched.

The V2 diff contains only tests, a test-only diagnostic utility, a local runner and this evidence/documentation. Production ContinueFlow, Medical, Finance, Calendar, Talent, Save and Facilities rules are unchanged.

## Historical evidence is retained

The original [FAIL certificate](BS15_BS16_BS17_CONVERGENCE_CERTIFICATION.md) is unchanged. Its old wording remains a historical record; the classification used by this proposal is **UNRESOLVED_HISTORICAL_CAUSE**.

The original ten-year test returned **2029-06-05** instead of **2035-10-01**, after 3,273,172.89 ms. Its returned world, stopReason, phase, seed sequence and decision journal were not preserved. No cause is invented, and this failure is not retrospectively classified as PREEXISTING_BASELINE, STALE_TEST or PASS. A synthetic Medical or Media stop does not explain that execution.

The original raw `full.json` and `full.log`, previous focal evidence and closure diagnostics remain under `node_modules/.cache/bs15-bs16-bs17-certification/`. The tracked [evidence manifest](evidence/CONVERGENCE_V2_BOUNDED.json) preserves their hashes, sizes and the complete original failed assertion record. The historical report and raw files must remain available separately from any future V2 verdict.

## Proposed ContinueFlow criterion

Exactly one outcome is classified for each tested command:

1. **ARRIVED**: final date equals the requested target, world date agrees, stop type is arrived, and no mandatory decision is pending.
2. **CANONICAL_DECISION**: the returned breakpoint exactly matches a current ACTION_REQUIRED/BLOCKING candidate, including date, reason, source, ownership, route and identifiers. Typed Media/Game/Season reasons must also agree with their corresponding source IDs. A legitimate stop is not a simulation error.
3. **SIMULATION_ERROR**: exceptions, invalid arrival claims, incoherent breakpoint IDs, no-progress/safety-limit returns or other unexplained results fail the gate.

The classifier is test-only. No command bypasses Medical, Governance, Media, competition or manager decisions. The Medical fixture explicitly chooses CONTINUE_RECOVERY through reviewReturnToPlay; it never auto-clears a player or changes the expected return date. The Media fixture explicitly selects skipMediaOpportunity. The season-end fixture supplies completed scores through applyMatchResult, explicitly skips its generated pending Media opportunities, then chooses startNextSeason. Those initial conditions and choices are not historical reconstruction.

## Reproducible bounded differential coverage

Run from this worktree:

```powershell
node scripts/certify-convergence-v2.mjs
```

No network, package installation or source-worktree mutation is required. The runner creates an additive ignored archive of exact frozen BS15 and verifies every original archived src blob except the deliberately replaced acceptance test. Windows line endings may be normalized; no other source difference is accepted. The identical test and diagnostic utility are then run against the frozen production and integrated production with the same test-name filter. Neither longitudinal test nor performance benchmark is selected.

Both sides use the same World DB slice fixture, runtime bundle, selection, configuration and injected match seed **151617**. This is a mocked repository over a documented canonical World DB-shaped slice, not a fresh certification against every external database file. It has 18 teams, 90 players, stable staff/person/organization identity and the ACB plus linked Cup formats. Source/config SHA-256 is `456153258a2d289fe7e22a4c10ef2154d6aeff83ccb280e0c39412c55021e471`. The Talent cohort also explicitly stores seed 151617 and its population/participation/access inputs.

Ten scenarios pass on each side:

- Normal canonical progress through the first scheduled match day, 2025-10-01 to 2025-10-05, with sporting resolution and V4 reload.
- Pre-Match Media: no progress or RNG calls while its coherent decision is pending; Save/reload and explicit skip.
- Medical: due user RTP review, coherent zero-day stop, reload and explicit CONTINUE_RECOVERY.
- SeasonComplete plus season change: completed score fixture, required Continue stop, explicit idempotent rollover, history/identity and reload. This is not a season simulated day by day.
- Calendar sync/async: identical complete V4 results within each version, unchanged input, one publication and unique phases.
- Talent materialization: one canonical seeded player/person identity, reload, repeated candidate resolution creates nothing.
- Training with a FULL court/right.
- Training with the same court OUT_OF_SERVICE.
- Training with UNKNOWN physical context.
- Shared Coach Finance monthly processing: replay and reload remain exactly once.

Shared projections cover date/season/user identities, Teams, Players, Persons, Coaches, Seasons, Games, season history, Injury, Media, Talent cohorts/materializations, NCAA enrollments, Training sessions, development stimulus/events, fatigue, morale/cohesion, Coach Finance and Governance decisions. Complete emitted diagnostic objects agree for the non-Training cases. Per-field hashes also enforce unrelated shared authority equality in the known-outage case. This is an explicitly bounded projection comparison, not equality of every GameWorld field or a longitudinal equivalence claim.

## Enumerated legitimate version differences

BS16 introduces club accounting beyond the old BS15 model. Club opening balances, reservations, payroll/cost/revenue recognitions, payables/receivables and treasury applications are not silently compared to nonexistent BS15 authorities. Their current integrity, immutability and exactly-once behavior are tested in the existing combined causal suite and Finance reservation regression. Shared Coach Finance is compared directly across versions. No claim is made that BS16 beyond K-C is present or complete.

BS17 Training P0 adds physicalAttempt facts. With a FULL resource or UNKNOWN context, sporting shared projections and stimulus agree with BS15; only the additional VERIFIED_AVAILABLE or UNVERIFIED_PHYSICAL_CONTEXT evidence differs. Unknown context preserves continuity.

With a known out-of-service court, BS15 completes the module without a P0 consumer; integrated P0 leaves only that module scheduled, records VERIFIED_UNAVAILABLE and creates no stimulus for it. The permitted consequences are confined to its scheduled-session evidence, development stimulus/events, fatigue, morale and cohesion. All other compared projections must remain equal. This is the previously approved physical gate, not a new duration/efficacy/fatigue/injury/RTP multiplier. The combined suite separately proves independent work continues and restoration retries only unexecuted work.

CFI8 authority, Training P0 and BS12C remain intact. Specialized Medical procedures remain NOT_IMPLEMENTED; Facilities Talent remains NOT_LIVE. BS17D stays globally PARTIAL.

## Longitudinal test separation and future evidence

Both old unconditional arrival tests (1000 days and ten years) remain present with every original assertion, including the requested target/date and sporting/history requirements. Their execution is now opt-in via `BDM_WORLD_DB_LONGITUDINAL=1`. Skipping them in ordinary bounded runs is visible and is not a passing longitudinal result. Their strict arrival assertions can still fail on a legitimate required stop; this proposal does not retroactively weaken them.

The ordinary bounded tests separately validate ContinueFlow stops, actual match progress, supplied season sporting consequences and canonical rollover. Existing performance and manual multi-edition lifecycle tests are retained unchanged and are not selected by this runner. The accepted BS15 performance program is not reopened.

A separately authorized longitudinal invocation can select the preserved test explicitly:

```powershell
$env:BDM_WORLD_DB_LONGITUDINAL = '1'
$env:BDM_WORLD_DB_EVIDENCE = 'node_modules/.cache/bs15-bs16-bs17-certification/future-longitudinal'
npx vitest run src/app/game/WorldDbGameBootstrap.test.ts -t 'RWS-BUG-002 ten-year run'
```

This command is documented, **not executed in V2 preparation**. No automatic decision-resolution loop is added.

The test-only evidence writer creates a unique run directory, source.json, append-only seeds.jsonl and decisions.jsonl, initial/annual/terminal V4 checkpoints, and atomically updated diagnostic.json. It retains seed calls, source fingerprint, dates, target, stopReason, last phase, pending decisions, relevant IDs, last compatible checkpoint, result and error. Explicit manual rollovers are journaled. An assertion failure retains the already returned stop reason rather than erasing it. A forced writer-failure test verifies diagnostic retention and exact checkpoint reload without mutating GameWorld. Interruption may leave RUNNING and the latest completed diagnostic/checkpoint; that is not a PASS result. No diagnostic field is added to canonical GameWorld or Save authorities.

## Proposed gates and observed checks

All three frozen SHAs remain ancestors. Ten bounded differential scenarios are green on each side; no unexplained difference was observed in their projections. The five combined cross-system cases remain green. Save V4 integrity, scoped V1 physical-attempt parsing, Calendar exactly-once, Talent identity, Finance through K-C, CFI8 and Training P0 remain covered.

Focal regression result: **89/89 passed**: ContinueFlow 15, SimulationBreakpoints 16, Calendar 25, combined convergence 5, diagnostic persistence 1, reservation dirty validation 2, Medical compatibility 8, Training physical consequences 17. The diagnostic writer is additionally rerun after its final journal changes. Typecheck and build pass; the existing bundle-size advisory remains. Git diff/ancestry/index checks and source boundary/RNG searches pass. No Rust or production implementation changes require a new Rust certification.

These are green preparation checks, **not approval of the proposed gate change**. The prior full-suite result remains 4916 total / 4819 passed / 38 failed / 59 pending. The full suite is not rerun or presented as green. Its recorded accounting remains visible: 20 stale cases repaired previously; 10 reproduced frozen-BS15 baseline failures; two direct-loop stop assumptions; five timeout/artifact-environment failures (three later green, exact-Y5 artifact and inherited 100-day budget still visible); one unresolved historical ten-year stop. Pending/opt-in cases remain distinguished from passing tests. The extra intermittent NCAA failure previously reproduced on BS15 is also retained in the original report.

## Scope and next action

**Certified scope now:** no new V2 certificate; only the previously accepted component certificates remain in force. **Prepared scope:** bounded shared-authority convergence with the above scenarios and cross-system regressions.

**Uncertified scope:** the original 2029 stop cause; new longitudinal external World DB equivalence; every inherited full-suite failure; BS16 beyond frozen K-C; global BS16 completion; global BS17D completion; specialized Medical and Facilities Talent execution.

BS17D-T has an integrated technical composition to develop against, but it is **not yet enabled on a V2-certified base**. Explicit acceptance of this bounded criterion is still required. Talent physical-operation requirements also need an approved product contract before any LIVE consumer can be implemented.

Next executable action: expressly approve or reject this proposed V2 acceptance criterion. After approval, rerun the committed bounded runner and relevant gates, verify clean Git/ancestry, then issue only `PASS ? CONTROLLED CONVERGENCE V2 ? BOUNDED CROSS-SYSTEM` if they remain green. The certificate must still state **UNRESOLVED_HISTORICAL_CAUSE for 2029**. Approval does not authorize main integration, new external merges, a long rerun, BS16/BS17 global PASS, or invented Talent/Medical operations.
