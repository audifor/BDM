# BS15I contract integrity closure

Status: contract defect corrected. The historical five-year attempt below failed at 2036-02-03; the subsequent [NCAA rollover continuity closure](BS15I_NCAA_ROLLOVER_CONTINUITY_CLOSURE.md) reproduces and fixes that failure, passes the bounded 2036-04-03 rerun and the calendar/eligible-supply continuation through all five annual NCAA/Save V4 checkpoints, with nine new fifth-year Recruiting signings. Full NCAA closure remains unconfirmed because native professional departures and Portal movement did not occur. Ten-year gate remains CLOSED. Historical evidence below is retained.

## Exact reproduction

- Seed: 15015; existing BS15I worktree.
- Simulated failure date: 2033-11-10, PRE_MATCH_SELF_HEALING.
- Primary affected Player: `generated-player-0001`.
- Person: `person:player:generated-player-0001`.
- Contract: `contract:generated-player-0001:generated-team-0001:2032-10-01`.
- Team: `generated-team-0001`; standard contract, 2032-10-01 through 2034-10-01.
- At failure: no roster membership, no Draft rights/entry or ecosystem transition for this Player, and no market signing record. The transaction trail contained a prematurely written `contractExpired` transaction dated 2034-10-01.
- 22 bootstrap Players were reported with this same class of drift. Machine evidence: `C:/Temp/BS15I-contract-failure.json`.

## Authority and root cause

`WorldGenerator` first generates the professional Team rosters, then calls `generateInitialPlayerContract` for each rostered Player. This is the actual contract creation path. It preserves the existing Player and Person; there is no prior professional signing or previous Team movement to reconstruct for this bootstrap relationship.

`repairRosterContractIntegrity` accepts a coherent active contract and roster without requiring a signing transaction. It requires matching canonical market evidence only when attempting to reconstruct missing roster membership. Bootstrap contracts therefore do not violate a universal signing-transaction rule; no such universal rule exists in the current authority.

The defect was in the caller of expiry reconciliation. `startNextSeasonTransitionFor` creates a future season without moving `world.currentDate`, but it called `reconcileExpiredPlayerContracts` with `nextPrimary.startDate`. This removed roster membership and wrote future-dated expiry transactions while those contracts were still active on the actual world clock. The validator correctly refused to fabricate a roster afterward.

The fix reconciles at `staged.currentDate`. Daily `CalendarEngine` expiry reconciliation remains responsible for the actual expiry boundary. No cleanup job, signing transaction fabrication, or validator exemption was added.

## Contract gateway audit

- `PlayerContractGenerator`, used by `WorldGenerator` and `createAcbTestGame`: legitimate bootstrap relationship, generated with the initial roster; no individual signing transaction required.
- `MarketService.signFreeAgent`: creates the contract, roster insertion, and `signedFreeAgent` PlayerTransaction together.
- `FreeAgentSigningService.completeAcceptedFreeAgentSigning`: creates the contract, roster insertion, matching signing transaction, signed negotiation and governance execution together. AI accepted signings delegate here.
- `EcosystemTransitions.signUndraftedPlayerToNba`: delegates to the Market signing gateway and records the ecosystem transition.
- Draft/rookie gateways in `EcosystemTransitions`, including `signDraftRightsToNba` and the `createRookieContract` helper: legitimate specialized authority, with Draft rights linked to the contract, roster movement, and ecosystem transition.
- Professional cross-ecosystem gateways in `EcosystemTransitions`: legitimate specialized authority, with source-contract termination, destination contract, roster movement, and ecosystem transition.
- `RetentionSigningService`: legitimate successor authority, linked to the predecessor contract and signed retention/governance records, with continuing roster membership.
- `TradeNegotiationService` calls `createPlayerContract` to validate an existing snapshot, not to create a signing.

No missing Market signing transaction was found at a required Market creation gateway. The failing path was premature expiry during rollover.

## Additional five-year gate defect: injured minimum roster

The fresh run passed Year 3 and then stopped on 2035-10-05 at `schedule-generated-season-0023-game-0008`: `generated-team-0004` had five rostered Players but only four available. `generated-player-0039` had a canonical ankle-sprain injury from 2035-10-02. The original contract invariant did not recur.

`AiRosterMaintenance` counted roster membership for the five-player playable minimum. It therefore skipped the scheduled professional team despite its injury shortage. The gateway now uses actual competition availability for scheduled professional fixtures, filters unavailable free-agent candidates, and continues to use the existing affordable canonical Market signing command. Other roster contexts retain their existing count authority.

The exact saved-world regression passes with one additional contract and one matching signing transaction, unchanged Player/Person identity and injury state, no fabricated Player, an idempotent repeat, and Save V4 reload. Evidence is in `BS15I_AVAILABILITY_REPRO.json`; the fixture is reconstructed from the annual Year 3 Save and retained at `C:/Temp/BS15I-2035-10-05-repro-save-v4.json`.

The bounded continuation passed through 2035-12-04 (failure +60 days): 402.67 s, 904 Players and 672 completed Games. Its Save V4 is retained at `C:/Temp/BS15I-availability-bounded-save-v4.json`.

## Separate NCAA blocker in the five-year rerun

Continuation from the Year 3 Save failed on 2036-02-03 after 641.11 s, before the Year 4 checkpoint. Game `schedule-generated-season-0027-game-0005` has away Team `generated-team-0016`: seven rostered Players, only two eligible and available. Players `generated-player-0181` through `generated-player-0185` have `ACADEMIC_REQUIREMENT_NOT_MET`, with performance 70 through 74 against the effective CollegeRuleset minimum of 75. Their academic progress is 97 through 98, so performance is the failing condition. Other scheduled NCAA Teams have available counts 0, 4, and 4.

The term support records confirm that the AI assigned standard support. `progressAiAcademicSupport` ranks risk using `evaluateAcademicEligibility`, whose AcademicRules minima remain 60/55, while the effective college competition rules require 75/65. This is a distinct academic support/competition authority mismatch; it is not missing signing evidence or the professional injury defect. Resolving it requires a separate bounded academic policy change and replay before the affected term, rather than adding professional contracts to NCAA rosters or changing eligibility facts in the saved failing world.

Exact evidence is retained in `BS15I_ACADEMIC_BLOCKER_REPRO.json` and `C:/Temp/BS15I-2036-02-03-failed-save-v4.json`. No five-year PASS or Year 4/5 metrics are claimed. The contract invariant did not recur through this date.

The certification harness can continue from Save V4 by replaying the certification seed draws already consumed by completed Games. A focused comparison checks subsequent Games and match-stat logs against the continuous path. This is test-only support; it does not change production RNG or Save V4 semantics.

## Current annual measurements

The retained prefix is in `BS15I_CONTRACT_5_YEAR_PROFILE.json`. These costs are per year, obtained by subtracting cumulative `elapsedMs` values:

- Year 1, 2033-10-01: 243.80 s; 600 active Players; 182 completed Games; 56.52 MB Save V4; reload/deep integrity PASS.
- Year 2, 2034-10-01: 657.44 s; 752 active Players; 360 completed Games; 109.25 MB Save V4; reload/deep integrity PASS.
- Year 3, 2035-10-01: 1,383.52 s; 904 active Players; 538 completed Games; 181.76 MB Save V4; reload/deep integrity PASS.

The current cost is growing materially. The earlier 99–106 minute estimate for 30 years is not supported by these measurements. A flat extrapolation of the measured three-year mean gives 380.79 minutes for 30 years; a flat extrapolation of Year 3 alone gives 691.76 minutes. Neither is a validated forecast because annual cost is rising. Years 4 and 5 remain unmeasured; the ten-year gate stays CLOSED.

## Validation evidence

- Focused rollover regression: preserves roster and Player/Person through Save V4; expiry then produces exactly one departure transaction, and replay is idempotent.
- Contract lifecycle, roster integrity, ecosystem transitions, Draft, free-agent signing, and retention signing: 48 tests PASS.
- Bounded replay to 2034-01-09 (failure +60 days): PASS, 389.96 s; 747 Players and 338 completed games.
- Typecheck: PASS. Build: PASS, with the existing large-chunk advisory. Diff check: PASS.
- Initial full attempt hit the 30-minute watchdog at 2035-07-28 without recurrence; it did not complete the five-year gate.
- Current rerun uses a 120-minute watchdog and writes annual Save V4 checkpoints. Annual elapsed values are cumulative; yearly cost must be calculated by subtraction.

Latest validation rerun: 48 contract/lifecycle/gateway tests PASS; the exact professional saved-fixture regression PASS; three available annual checkpoint tests PASS (two future checkpoints not run); AI roster, seed-resume, Portal lifecycle, and College eligibility files PASS. Typecheck, build, and `git diff --check` PASS.

The expanded `startNextSeason.test.ts` run is **not green**: 5 PASS, 8 FAIL. Six failures exceed their existing 10-second per-test limits; two fail on rehabilitation dates preceding an injury and legacy Save V1 competition-rule round-trip differences. The new contract-expiry regression passes. These results are retained as additional unresolved validation findings, without assuming they were present before this closure or altering their expectations to hide them.

The first three annual Save V4 contract checks pass. Draft counts are 2/4/6, Recruiting cycle counts 4/6/8, and Portal ruleset counts 6/8/10. Portal entry counts are zero in this seed; these checkpoints prove retained Portal authority, not actual transfer execution. The focused Portal lifecycle tests cover the supported transfer operations separately.

Five-year completion and Year 4/5 Save V4 checks remain blocked by the academic availability failure. The 30-year values above are extrapolations only. No ten-year or thirty-year run, commit, push, merge, reset, or clean was performed.

## Files for this closure

Production changes: `src/app/game/startNextSeason.ts` (world-clock expiry reconciliation) and `src/app/market/AiRosterMaintenance.ts` (available professional roster minimum).

Focused regressions: `src/app/game/startNextSeason.test.ts`, `src/app/market/AiRosterMaintenance.test.ts`, `src/app/game/testSupport/BS15IAvailabilityRepro.test.ts`, `src/app/game/testSupport/BS15ICertificationResume.test.ts`, and `src/app/game/testSupport/BS15IContractCheckpoints.test.ts`.

Certification instrumentation: `src/app/game/testSupport/BS15I5YearProfile.test.ts` and `src/app/game/testSupport/TalentLongHorizonCertification.ts`.

Evidence: this report, `BS15I_CONTRACT_FAILURE_REPRO.json`, `BS15I_AVAILABILITY_REPRO.json`, `BS15I_ACADEMIC_BLOCKER_REPRO.json`, and `BS15I_CONTRACT_5_YEAR_PROFILE.json`. All earlier uncommitted BS15I changes remain preserved.
