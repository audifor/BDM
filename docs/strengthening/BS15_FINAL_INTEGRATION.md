# BS15 final integration audit

Status: focused integration validation PASS, with one documented and independently reproduced pre-existing MAIN test failure. Final WSR check PASS; merge publication follows this audit.

## Lineage and isolation

- MAIN integration base: `a6826469c78f8f948d73fd663e4996a99d30c678`.
- BS15 final: `a20ea256216d1256b707591103f7beceed27ea57`.
- BS15 final descends from `8d0e128181b39d1d0354ca3067b55a51428db213` and includes the cumulative BS15A-I commits.
- Merge base: `c35b62796514696075a7aff2aee66eacf29a34bc`.
- Isolated worktree: `C:/BDM-BS15-INTEGRATION`, branch `integration-bs15-final-local`, tracking `github/integration-bs15-final`.
- Canonical `C:/BDM` remains clean on local main `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; remote main remains the integration base. No main checkout, reset, clean, merge or push occurred.
- The BS15 source Y30 certification remains unchanged in its lineage. This integration uses a short merged-world smoke and does not repeat Y30.

## Conflict audit

Exactly 19 files conflicted. Each was reconciled by functional authority; no global branch-side selection was used. No unmerged index entries or conflict markers remain.

- `src/app/game/PlayerMatchConsequences.ts`: Keep MAIN pre-match career fatigue and BS15 optional batched immutable development evidence.
- `src/app/game/advanceGameDay.ts`: Keep MAIN single sync/async day generator, repairs, governance and Match Next preparation/application; wrap synchronous segments in BS15 dirty validation and publish one DAY_PUBLICATION phase. No transaction survives an await.
- `src/app/game/playUserGame.ts`: Keep MAIN legacy viewer preparation/fatigue and production Match Next route; retain BS15 evidence arguments and adapt older simulateAndApplyGame callers to production resolution.
- `src/app/game/simulateUntilDate.ts`: Keep MAIN shared sync/async tick planning and no-progress guard; retain BS15 observers and target-morning pre-match repair before seed draws.
- `src/app/worldSim/SimulationResolutionPolicy.ts`: One policy: keep MAIN settings, exact budgets, user/scouting bubbles and knockout ordering; add command-scoped BS15 observed/followed/forced detail and validation mode. STANDARD vocabulary maps to Match Next FAST; explicit FULL is honored. No second production engine.
- `src/domain/competition/CompetitionRules.ts`: Retain MAIN foul rules and BS15 player-age rules in the same validated factory.
- `src/domain/world/GameWorld.ts`: Retain BS15 112 dirty validation blocks, financial boundary checks, per-record training/evidence lineage and atomic transactions; use MAIN shared team/staff indexes inside scopes. Remove duplicate old depth validator.
- `src/domain/world/availability.ts`: Use MAIN shared injury index for both the BS15 historical query and active-injury query, retaining source order.
- `src/domain/world/index.ts`: Export the combined world APIs once, including batching, scheduled-session updates and single validation.
- `src/domain/world/responsibility.ts`: Keep MAIN shared responsibility indexes and remove the duplicate BS15 local cache; preserve first-match and ordered query semantics.
- `src/engine/eligibility/EligibilityEngine.ts`: Keep full BS15 enrollment, academics, effective rules and eligibility clock; use MAIN indexed profile/restriction lookups and once-per-game participation indexing.
- `src/engine/injury/Rehabilitation.ts`: Keep MAIN future-injury chronology and recovery-stage guards; equivalent BS15 guard semantics survive.
- `src/engine/staff/StaffCultureCohesionPipeline.ts`: Combine MAIN cached staff assignments with BS15 one-pass team/unit view preparation; do not change tactical cohesion.
- `src/engine/staff/StaffHumanStatePipeline.ts`: Keep MAIN context-indexed recovery map, equivalent to the BS15 map.
- `src/engine/staff/StaffHumanWorkloadTracking.ts`: Keep MAIN shared reaction-history index and BS15 one weekly event batch; retain ordering, duration and relief semantics.
- `src/engine/tactics/CoachRotationEngine.ts`: Keep MAIN allocation-free ordered lineup search, tie break and arithmetic; preserve BS15 performance requirement without changing basketball coefficients.
- `src/engine/world/WorldGenerator.ts`: Combine BS15 dated Draft rules with MAIN gender-specific NBA/WNBA trade-deadline policies.
- `src/save/GameWorldSaveV1.ts`: Preserve MAIN validated game formats/foul rules, TradeWindow and ecosystem deadlines plus BS15 Draft entries/history/return assessments, rights contractId, player-age rules and per-record large-save copies. V4 stays idempotent; V3 backfills remain legacy-only.
- `src/ui-ng/workspace/workspaceApps.ts`: Keep current MAIN workspace registry and negotiation/decision/request routing; add BS15 Talent/Portal and recruiting player-focus routing without dropping Facilities/Board/Trades.

## Resolution by area

- Lifecycle: one MAIN day sequence for sync and async commands, with BS15 Talent/NCAA/career phases retained exactly once. Dirty final validation, rollback, target-date repair, observers and timing publication remain available.
- Save: MAIN and BS15 fields form a superset. Preserve V4 idempotency, V3 migration routing and the large-save fix. Immutable history is retained.
- Talent/NCAA: bounded deterministic cohorts, materialization identity, youth/academy, dated college rules/enrollment, academic and eligibility clocks, knowledge-safe recruiting, walk-ons, continuation/NIL/Portal, Draft/rights, pro movement and career turnover remain present.
- WorldSim: MAIN Match Next FULL/FAST and WSR BACKGROUND remain the production authority, with one policy and unchanged default budgets. BS15 STANDARD is the compatibility vocabulary for FAST. Explicit FULL is dispatched inline in an async day; only FAST setups go to the existing worker runner.
- Market/Contracts: MAIN trade negotiation, ecosystem deadline activation, governance signing checkpoints, retention and accepted-offer workflows remain; BS15 rights/Draft/pro-entry constraints remain.
- UI/workspaces: current MAIN component identity and route registry retains Facilities, Board and Trades, and includes BS15 Talent Operations, Portal, Recruiting player focus and pathway history.
- Staff/other: MAIN cache optimizations and chronology survive alongside BS15 weekly batching; no simulation rules or dependencies were added.

## Integration repair and regression coverage

The merged production completion chain now appends BS15 immutable match-learning evidence using the exact existing MAIN action-derived deltas. It does not apply stimulus twice or introduce a second formula. Independent-day and repeated-team resolution append once per day; direct result completion appends immediately. MAIN writable-record batching remains in place.

The Facilities fixture now preserves existing Places instead of deleting canonical Talent cohort origins. The registry identity fixture includes both new BS15 workspaces. BS15 publication/history tests use the existing short-game fixture because their subject is validation, not regulation basketball; all corruption and rollback assertions remain intact. Full store tests use a 120-second runner timeout without changing their assertions.

`src/app/game/BS15FinalIntegration.test.ts` certifies:

- One merged world with real Talent materialization, a Board decision, funded Facilities, initialized Market and NBA Trade authority/deadline.
- A short mixed FAST/BACKGROUND day, identical sync/async Save payloads and an untouched input world.
- One publication phase, unique phase IDs and incremental validation.
- Exactly one match evidence record per contributing Player/Game.
- Save V4 load/load idempotency, Facility/Board reconstruction, Trade/Market persistence and materialization replay identity.
- Explicit FULL, STANDARD and BACKGROUND produce the same sync/async world and the requested stat-log provenance.

A focused read-only review found and corrected the initial FULL-to-FAST dispatch mismatch; the final review found no remaining defects in execution, evidence batching, determinism, rollback or Save reconciliation.

## Validation

- Final focused run: **PASS**, 364 tests in 42 files, zero failures. Two long-horizon tests are intentionally gated; no Y30 rerun. JSON proof: `C:/Temp/BS15-integration-final-focused.json`.
- Separate Staff reconciliation coverage: **PASS**, seven tests. The one unrelated full-calendar case was filtered after reproducing its baseline failure without modifying the test.
- Short merged-world smoke: **PASS**, four cases included in the final focused run.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**. Vite reports the existing large-chunk advisory; the build succeeds.
- Working and staged `git diff --check`: **PASS**.
- Unmerged entries: **0**; conflict markers in resolved source files: **0**.
- Production `Math.random(` occurrences in `src/`: **0**; improper React/Zustand/Tauri imports in Domain/Engine: **0**.
- MAIN WSR-specific suite: **PASS**, 13 tests in `src/app/worldSim/worldSim.test.ts`, retaining policy/budget/calibration/result contracts. JSON proof: `C:/Temp/BS15-integration-wsr-tests.json`.

The focused run covers supply/materialization, college enrollment/eligibility and clocks, Recruiting/RPG/permissions, walk-ons, Portal, Draft/advisory, career lifecycle, V4/TradeRules, sync/async daily and target-date lifecycle, policy dispatch, world validation and indexes, registry/component identity and routing, store, funded Facilities, Board, Trades/deadlines, rehabilitation, Staff reactions and appraisal, Match Next dynamic state/rotation and development history. Knowledge safety cases mutate hidden basketball ratings/preferences while keeping OrganizationKnowledge fixed and require Recruiting/Draft decisions to stay invariant.

## Pre-existing baseline failure

`src/engine/staff/StaffCultureCohesionPipeline.test.ts`, case `teamCohesionByTeamId is unchanged across full CalendarEngine days crossing multiple Mondays`, fails identically on the exact MAIN base `a6826469c78f8f948d73fd663e4996a99d30c678`. A read-only git archive at `C:/Temp/BS15-integration-main-baseline` reproduced the same tactical cohesion values changing from 50 to 54 during training. The Staff culture pipeline's direct no-write regression and its other seven cases pass. The stale full-calendar assertion is preserved unchanged; this integration does not alter MAIN's training behavior to satisfy it.

Baseline proof log: `C:/Temp/BS15-integration-main-baseline-test.log`. Initial timing-only failures from five-second defaults were resolved through short invariant fixtures or a longer test-runner timeout, not weakened assertions.

## Commit and push

After validation: one true two-parent merge, message `merge: integrate BS15 global talent program`, and push only `github/integration-bs15-final`. Integration commit identity will be delivered in the final response; it cannot be embedded in its own committed document.
