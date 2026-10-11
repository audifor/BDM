# BS ALL FINAL INTEGRATION — Certification

Worktree `C:\BDM-BS-FINAL-INTEGRATION` · branch `integration/bs-all-final`. Built from the real `main`; `main` was not updated,
nothing was pushed or fetched, no other worktree was modified (temporary measurement worktrees were created detached and removed).

## Verdict

**`PARTIAL · INHERITED TEST REGRESSIONS VS MAIN` — not `READY_FOR_SINGLE_MAIN_UPDATE`.**

- Every certified BS source is integrated (inventory below); nothing certified is left pending.
- The integration itself is clean: two real merges without conflicts, three focal commits, typecheck, build and guards pass.
- The candidate introduces **no** failing test of its own (every failure was reproduced on a source or on `main`).
- The second/third 1 July "blocker" was a harness artifact, not a game defect; **three complete seasons are certified** through the
  production path (2032-10-01 → 2035-10-01).
- BUT 26 test files / 129 tests that pass on `main` fail on the candidate. All of them fail identically on the already certified
  BS15/BS16/BS17 V3.1 integration (`67c61edc`), whose certification explicitly did not claim a full repository suite. They are legacy
  fixtures that create/remove contracts or sign players without the canonical BS16-final Finance (see *Regressions vs main*). Updating
  `main` with them would turn green tests red, so the candidate is not declared ready.

## Shas

| | SHA |
|---|---|
| Original `main` | `8a0b359e9ae48fe372668241788c9d5aa7a33b03` (local `origin/main` ref is `94c07709`, an ancestor of the BS17 final, not of `main`) |
| BS17 final (frozen source) | `1559409751223f88353ff52e04a2d1444508e510` |
| Final candidate | see the final commit of `integration/bs-all-final` (reported with this document) |

Ancestry: `main`, BS17 final and `dc63d604` are ancestors of the candidate. `main` was itself an ancestor of BS17 final, so the source
code of the candidate equals BS17 final plus the commits listed under *Changes made in this integration*.

## Inventory of every BS program

Method: every local and remote-tracking branch was tested for ancestry against `main` and BS17 final; branches that are not ancestors
were compared file by file (blob identity of every file they touch) and by patch equivalence (`git cherry`).

| Program | Source | Status | Evidence |
|---|---|---|---|
| BS0 game-loop audit, BS1 world lifecycle, BS2 breakpoints, BS3 season lifecycle, BS4 self-healing | `bdm-strengthening-bs0…bs4` | `ALREADY_IN_MAIN` | ancestors of `main` |
| BS5 player dynamic state, BS8 coach rotation AI | `bdm-stage2-bs5…`, `bs8…` | `ALREADY_IN_MAIN` | ancestors |
| BS9A–BS9E (strategy, needs, GM context, plan selection, workflow, lifecycle) | `bdm-stage2-bs9*` (not ancestors) | `ALREADY_IN_MAIN` (content) | every source file present in `main`/final, evolved further; docs archived under `docs/strengthening/reviewed/` |
| BS10A–BS10E, BS10 market closure | `bdm-stage2-bs10*` | `ALREADY_IN_MAIN` (content) | 0 missing source files; trade/market services present; docs in `reviewed/` |
| BS11A–BS11F contracts | `bdm-stage2-bs11a/b` + main docs | `ALREADY_IN_MAIN` (content) | `BS11_FINAL_CERTIFICATION.md`, services present |
| BS12A–F training/medical | `bdm-stage2-bs12*`, `bdm-integration-pre-bs12` | `ALREADY_IN_MAIN` | ancestors |
| BS13, BS14A–H staff and scouting | `origin/integration-bs13-bs14-*` | `ALREADY_IN_MAIN` | ancestors; `bs14a` branch's docs evolved in `main` |
| BS16C–E finance authority/authorization | `main` commits `e934cba5`, `0c9b43ea`, `8a0b359e` | `ALREADY_IN_MAIN` | |
| BS15 global talent, BS16 final (`680d7aa2`), BS17A–D, V3/V3.1 convergence | `integration-bs15-final-local`, `bdm-stage2-bs16-finance-canonical`, `bdm-stage2-bs17a…d*`, `integration/bs15-bs16-bs17-final-v3(-1)` | `INCLUDED_IN_BS17_FINAL` | ancestors of `1559409` |
| BS17E-A, E-B, E-C, F, global completion | `bdm-stage2-bs17-global-completion` | `INCLUDED_IN_BS17_FINAL` → integrated | merge `41715f5b` |
| BS17E-0 readiness, BS17E-P V1 and BS17E-P2 V1 approved product policies | `bdm-stage2-bs17e-p2-cost-governance-contracts` (`dc63d604`, contains `cfa13c4b`, `94694783`) | `CERTIFIED_PENDING_INTEGRATION` → integrated | documentation only, ratified principles BS17E implements; merge `c7719907` |
| BS16 finance-strengthening prototype (`93be7af8`, `b5c43115`) | `bdm-stage2-bs16-finance-strengthening` | `SUPERSEDED_BY_NEWER_CANON` | replaced by BS16C (`e934cba5`, a day later) and BS16 canonical; its `FinancialDecision.ts`/`FinancialReservations.ts` have canonical successors |
| BS15/16/17 integration readiness assessment (`4c33bec1`) | `bdm-bs15-bs16-bs17-integration-readiness` | `SUPERSEDED_BY_NEWER_CANON` | superseded by the V3.1 convergence certification |
| Player workspace rework (`bfd5e0c5`) | `canonical-human-runtime-v1` | `UNVERIFIED_NOT_ELIGIBLE` | not a BS program, uncertified, contains stray shell-output files |
| UI redesigns, match engine, World DB/phase1 branches, `feat/home-courtside` (dirty user checkout) | various | `UNVERIFIED_NOT_ELIGIBLE` (out of BS scope) | not strengthening programs |

No `BLOCKED_BY_DEPENDENCY` source exists. After integration no certified BS source is pending.

## Changes made in this integration

| Commit | Content |
|---|---|
| `41715f5b` | merge BS17 final (BS15, BS16 final, BS17A–F) into `main` — no conflicts (`main` was an ancestor) |
| `c7719907` | merge BS17E-0/P/P2 approved policy records — no conflicts (documentation only) |
| `d6614020` | opt-in three-season continuity test through the canonical production path |
| `11747b09` | performance repair with equivalence tests (below) |
| final commit | this certification, BS17 certification erratum, BS17 harness comment |

No mass ours/theirs, no directory replacement, no cherry-pick.

## Player Rating History "second 1 July"

**No code repair was needed; the BS17 report was mistaken.** The BS17 multi-season harness advanced the raw daily Calendar
(`advanceDayWithTrace`). That path never performs the canonical competition rollover (`advanceCompetitionLifecycles` /
`startNextSeasonTransitionFor`) that simulate-until and the next-season action perform. Without it no 2033-34 edition is ever created,
`currentSeasonId` stays on the first season, and the second annual development (keyed by season) would rewrite that season's immutable
rating history — the immutability guard correctly refuses. Evidence: the BS17 snapshot at 2034-03-25 held only first-season editions.
Through the production path the rollover creates the next editions, `currentSeasonId` migrates in October and every development is
recorded under its own season. Immutability checks, annual processing and the exactly-once guard are untouched. The BS17 certification
now carries an erratum and its harness documents the limitation.

## Three-season continuity (PASS)

`BSAllThreeSeasonContinuity.test.ts` (`BDM_BS_ALL_THREE_SEASONS=1`): `createConfiguredGame` (BDM_GAME_BALANCE_V1), full-AI after the
opening day exactly as the certified BS15I profile (the user moves to an unemployed coach; the club's appointed manager keeps acting
on its own Facilities jobs with the same rights), `simulateUntilDate` in 30-day chunks with seed 17017, Save V4 serialize → JSON →
reload every 180 days, operation events and rating history compared across the reload, invariants asserted at every checkpoint.
The user club renovated its court (accepted 2032-12-03) and ran a conservation service.

| Day | Date | Current season | Development cycle | Rating entries | Players | Facilities ops | Service facts | Lowest cash (minor) | Save MB | Save s |
|---|---|---|---|---|---|---|---|---|---|---|
| 180 | 2033-03-30 | season-0001 | — | 0 | 528 | 218 | 256 | 275,496,000 | 42.3 | 7.0 |
| 360 | 2033-09-26 | season-0001 | 2033 | 528 | 528 | 218 | 544 | 271,668,800 | 72.5 | 9.9 |
| 540 | 2034-03-25 | season-0007 | 2033 | 528 | 585 | 263 | 809 | 257,344,000 | 107.8 | 12.7 |
| 720 | 2034-09-21 | season-0007 | 2034 | 1,113 | 585 | 263 | 1,079 | 256,019,200 | 138.8 | 13.6 |
| 900 | 2035-03-20 | season-0015 | 2034 | 1,113 | 729 | 331 | 1,355 | 209,356,800 | 182.0 | 23.0 |
| 1080 | 2035-09-16 | season-0015 | 2035 | 1,842 | 729 | 335 | 1,637 | 179,769,600 | 224.6 | 39.6 |
| 1095 | 2035-10-01 | season-0023 | 2035 | 1,842 | 729 | 335 | 1,653 | 80,680,000 | 228.7 | 27.6 |

Every checkpoint: one rating entry per (player, season); no duplicated roster ownership; every Facilities lifecycle derivable with at
most one proposal/request/contract/completion; unique service periods equal to service cost facts; no organization with negative cash;
operation events and rating history identical after reload. 24 canonical season transitions; 3 annual developments (2033, 2034, 2035).
Final Facilities events: 335 proposals, 328 contracts, 188 works completed, 1,653 service periods (1 skipped), 96 services ended,
7 cancellations. Runtime 20,511 s (shared machine, see below). Status `PASS`, test exit 0.

## Calendar performance

Same procedure in each build, run concurrently on the same machine: new prototype game, full-AI, `simulateUntilDate` 120 days.

| Build | Total | ms/day by 30-day window | Save at day 120 | Save / load | Facilities records |
|---|---|---|---|---|---|
| V3.1 base `67c61edc` | 425 s | 5,569 · 5,845 · 2,061 · 554 | 25.0 MB | 222 / 910 ms | 0 |
| BS17 final `1559409` | 591 s (+39 %) | 5,934 · 6,849 · 3,592 · 3,084 | 51.9 MB | 356 / 2,165 ms | 2,021 |
| Candidate (after `11747b09`) | 500 s (+18 %) | 5,828 · 6,529 · 2,730 · 1,369 | 31.1 MB | 208 / 2,110 ms | 2,021 |

Phase totals (120 days): MATCH_RESOLUTION ≈ 405–423 s in all three (unchanged). BS17 final added FACILITY_MANAGEMENT 83 s, TRAINING
40.5 s (V3.1: 0.8 s), CLUB_FINANCE_V2 15 s (V3.1: 4.4 s), DAY_PUBLICATION 7 s (V3.1: 0.5 s). Candidate: FACILITY_MANAGEMENT 30 s,
TRAINING 2.1 s, CLUB_FINANCE_V2 15 s, DAY_PUBLICATION 7 s.

Classification:
- **Pathological (repaired):** with the preset every club owns a facility; `componentPhysicalAvailabilityAt` rescanned all condition
  records, maintenance actions, usage rights and components per call, the Facilities economy reads rescanned all records per operation,
  and every Training physical attempt persisted every court in the world as `NO_ACCESS` evidence (quadratic Save growth). `11747b09`
  adds per-world (immutable) lookup tables with identical answers and records only usable resources (or the denied ones when nothing is
  usable) while deciding the status over every candidate. Equivalence tests compare each answer with the verbatim previous
  formulation on live worlds (>10,000 availability comparisons; all record kinds; sporting statuses for every team).
- **Expected cost of new work:** +75 s per 120 days (≈0.6 s/day) for 47 AI clubs managing facilities, Finance facts of maintenance,
  CAPEX and services, and validation of the new collections; +6 MB Save at 120 days.
- **Not a regression:** match resolution dominates and is unchanged.
Long-run memory: RSS 1.1–3.0 GB in the three-season run, Save 228.7 MB after three seasons (most of it pre-existing Training history).

## Finance and revenue

The only approved, shipped revenue route is the BDM Demo Economic Policy V1 for the ACB demo competition (participation distribution
installments). It works in the candidate: 36 revenue recognitions (EUR 7.2 M) in 70 days of a new ACB game. Prototype, NCAA and World DB
have no approved `CompetitionEconomicProfile` ("no global fallback economy" by design), so the three-season run records no revenue and
lives on the simulated opening treasury (lowest club 80.7 M minor units after three seasons). No pending certified revenue integration
exists; this remains functional debt of the economy program. No revenue, debt or balance was invented.

## Gameplay observations (pre-existing, not integration defects)

- In the full-AI prototype, AI retention chooses `ALLOW_EXPIRY` by strategy or reports `EFFECTIVE_CONTRACT_RULES_UNAVAILABLE`
  for the rolled-over season (BS11C2 rule: no extension without effective contract rules), so the 70 contracts that expired on
  2034-10-01 were not renewed and rosters fell to 7–12 players; 4 new contracts appear at the 2035 season start. Finance did not block
  them. This is a talent/contract-rules continuity question for the owning program, not a BS17 or integration effect.

## Tests

| Category | Result |
|---|---|
| Focal BS17/Facilities/Training/Sporting suites | PASS (397/398 + 1 skipped; the only failures were load timeouts that pass alone) |
| New equivalence tests (`FacilityPhysicalOperationsIndex`, `SportingOperationEvidence`) | PASS |
| Three-season continuity | PASS (new) |
| Full repository suite, candidate | 5,286 tests: 4,561 passed, 619 failed — 481 are 5 s timeouts under a heavily shared machine |
| Full repository suite, `main` (same conditions) | 4,419 tests: 4,310 passed, 66 failed (55 timeouts) |
| FAIL introduced by the candidate | **none** (`ClubEconomicSourceLifecycle` failed only a wall-clock budget under load; 10/10 alone) |
| FAIL inherited, also failing on `main` | 7 files (match engine audits, desktop host, World DB bootstrap, season content activation) |
| FAIL inherited from the certified V3.1 lineage, passing on `main` | **26 files / 129 tests** (list below) — reproduced on V3.1 `67c61edc` |

### Regressions vs main (inherited from V3.1)

`BasketballOperationsAdvisory` 34, `ContractReviewService` 10, `FreeAgentSigningService` 10, `PlayerContractSigningGovernanceService` 9,
`AiRetentionEngine` 9, `GameWorldSaveV3` 9, `BoardGovernance` 8, `MarketEngine` 8, `BoardWorkspace.governance` 6, `ClubNeedsEngine` 4,
`RosterContractIntegrity` 4, `RetentionSigningService` 3, `ClubStrategyEngine` 2, and one each in `SimulationBreakpoints`,
`createAcbTestGame`, `ContractReleaseService`, `MarketService`, `PlayerRatingHistory` (engine), `GMDecisionContextEngine`,
`ClubStrategyScreen`, `ClubPcbPage`, plus five files that do not exist on `main` (`SimulateUntilTargetRepair`, `BS15IFinalY5SaveAudit`,
`MatchEquivalence`, `CanonicalFinanceStack.integration`, `ProfessionalDecisionRealism`).
Common causes: fixtures replace or delete contracts whose payroll BS16-final Finance already recognized ("financial transaction …
references missing contract"), or sign/hire without canonical liquidity/authorization ("INSUFFICIENT_LIQUIDITY", MX0.7 "FINANCIAL_BLOCK").
They were not modified here: reconciling them is fixture work that must preserve each test's causality (as V3.1 did for its own set),
and hiding them would violate the integration rules.

## Technical certification

`npm run typecheck` PASS · `npm run build` PASS · `git diff --check` clean · no conflict markers · no new `Math.random`/`randomUUID` in
production sources · new `new Date(...)` uses are deterministic calendar arithmetic and one evidence-directory name in certification
tooling · no Domain imports of app/engine/ui · no Engine imports of UI · ancestry verified · working tree clean. No Rust or native contract
changed.

## Known limitations

1. 26 files / 129 tests regress vs `main` (inherited from V3.1) — blocks the single main update.
2. No approved revenue profile outside the ACB demo; long careers in other universes live on the simulated opening treasury.
3. AI contract retention in the rolled-over prototype season is blocked by strategy/contract-rule availability (pre-existing).
4. Calendar is ≈18 % slower than V3.1 over 120 days (new AI/Facilities/Finance work); Save +6 MB at 120 days.
5. `BS17MultiSeasonContinuity` (raw Calendar) cannot cross the second 1 July by construction; use the production-path test.

## Next step required before `READY_FOR_SINGLE_MAIN_UPDATE`

Reconcile the 26 inherited fixture files with canonical Finance (fund through declared financing/authorization, never delete a
recognized contract), re-run them on the candidate and on `main`, then re-issue this certification.
