# BS11B Existing Implementation Audit

## Review disposition

**Outcome: PASS.** Source review found the intended separation between canonical contract need, derived review candidate, and persisted user intent. No source-level P0/P1 behavior defect was confirmed. The focused tests and typecheck now pass; the existing BS11B implementation is accepted as canonical prior work for the next BS11B stage.

This is not a recommendation to reimplement BS11B. Do not build a second contract-review system.

## Scope and lineage

- Review branch: `bdm-stage2-bs11b-review-convergence`.
- Reviewed implementation commit: `34dc2abcc5ffeec3e16a6c4160d6d3f236d52c56` (`feat(strengthening): add contract review decision lifecycle`).
- Immediate parent: `eac52b3b5dd5619fcaafa2e4c8635c6054e05943` (`docs(strengthening): archive reviewed contract roster planning`).
- Reviewed pre-BS11A base: `32493210db55a30a94a4cefb65bf2aadf5f4dd41`, an ancestor of the implementation commit.
- The archive parent moves BS11A documents; the implementation commit’s own change is the 20-file BS11B delta listed below. No unrelated implementation changes were found in that delta.
- Master capability authority was read from commit `67811994e48137ec77579ae3dcaa273e8a680c37` before source review: registry, master audit, contract deep audit, reuse-first directive, authority conflicts, and cross-system integration matrix. Those documents are authority references; they are not copied into competing files.

## Exact BS11B delta

The implementation commit adds or changes these 20 files:

- Documentation: `docs/strengthening/BS11B_CONTRACT_REVIEW_DECISIONS.md`, `docs/strengthening/BS11B_CONTRACT_REVIEW_DECISIONS_AUDIT.md`.
- Application: `src/app/contractReview/ContractReviewService.ts`, `src/app/contractReview/ContractReviewService.test.ts`, `src/app/contractReview/index.ts`.
- Domain: `src/domain/contract/ContractReviewDecision.ts`, `src/domain/contract/index.ts`, `src/domain/world/GameWorld.ts`.
- Engine: `src/engine/clubNeeds/ContractReviewEngine.ts`, `src/engine/clubNeeds/ClubNeedsEngine.ts`, `src/engine/clubNeeds/index.ts`.
- Breakpoints: `src/app/game/SimulationBreakpoints.ts`, `src/app/game/SimulationBreakpoints.test.ts`.
- Save: `src/save/GameWorldSaveV4.ts`, `src/save/GameWorldSaveV4.test.ts`.
- Store and UI: `src/stores/gameStore.ts`, `src/ui-ng/applications/analysis/ClubStrategyScreen.tsx`, `src/ui-ng/applications/analysis/ClubStrategyScreen.test.tsx`, `src/ui/App.tsx`, `src/ui/desktop/DesktopAppHost.tsx`.

No trade, market, finance, Governance, roster mutation, or contract execution module is changed by this commit.

## Reuse and authority map

- BS9 `assessClubNeeds` remains the authority for `CONTRACT_CONTINUITY`, `CONTRACT_CLUSTER`, and other club needs. Review candidates are projected from the `CONTRACT_CONTINUITY` need’s `KEY_PLAYER_CONTRACT_EXPIRY` evidence and its canonical contract ID. BS11B adds no second needs engine.
- BS11A `ContractRosterPlanning` supplies derived expiry context, including current role, position, age when known, development stage, RolePromise status, annual salary at expiry, and season payroll context. The review projection does not persist that context.
- Existing `SimulationBreakpoints` owns the horizon signal. There is no second breakpoint engine.
- Existing GameWorld Save V4 owns persistence; only explicit `ContractReviewDecision` intent records are added.
- Existing Analysis/Club Strategy is the manifestation surface. `DesktopAppHost` passes an optional action callback to the screen; there is no new Contract Hub.
- BS10 retains free-agent, negotiation, signing, trade, and release transaction authority. Finance retains compensation/payroll authority. Governance retains binding institutional approval and signing authority.
- The actually new state is a nonbinding, user-authored contract-review intent and, for `DEFER`, a revisit date. Candidate, status, need evidence, and expiry context remain derived.

## Candidate eligibility and invalidation

`contractReviewNeedForContract` fails closed unless the contract exists, belongs to the requested team, is active, the player is on that team’s roster, has no continuous successor, and BS9 currently emits the matching contract-continuity need. The outlook creates one candidate for each such need and separately projects prior decisions as history.

A continuous successor resolves the old review. Player departure/trade resolves it as `RESOLVED_PLAYER_LEFT`; expiry and termination resolve it as `RESOLVED_EXPIRED` and `RESOLVED_TERMINATED`. A record whose contract is absent, or whose active situation no longer has a matching live need, is `STALE`. A new ContractId yields a new review identity; an old decision remains attached to the prior ContractId and is not copied to the new situation. A deferred item becomes reviewable again when its revisit date is due, retaining the same identity. Decision state is never applied as a contract mutation.

The existing global `Team.rosterPlayerIds` versus active `PlayerContract.teamId` integrity/recovery authority gap remains unresolved. BS11B adds no roster or contract mutation and does not repair or guarantee that invariant. This pre-existing P0 remains a mandatory BS11C precondition before extension execution; review eligibility is not a substitute for full roster/contract integrity validation.

## Identity and intent semantics

Decision IDs are deterministic from `teamId + playerId + contractId`. Repeated writes filter/upsert that identity, so a retry does not create a second record. The persisted record stores those IDs, intent, decision date, deciding user coach, and optional revisit date; Save parsing verifies canonical IDs and duplicate identities. The identity is contract-bound, not a free-standing player intent.

The four implemented categories are `PURSUE_EXTENSION`, `ALLOW_EXPIRY`, `REVIEW_RELEASE`, and `DEFER`:

- `PURSUE_EXTENSION` records only a club intention to attempt retention. It creates no terms, salary, negotiation, player acceptance, successor contract, or Governance approval.
- `ALLOW_EXPIRY` leaves the active contract and BS9 need unchanged; normal contract lifecycle owns expiry.
- `REVIEW_RELEASE` records a review intention and does not call `releasePlayer` or initiate an outgoing market action.
- `DEFER` stores a later season start/end checkpoint for a participating season, capped at contract expiry; if none exists, expiry is the revisit date. At revisit, the same candidate reopens for user review.

The command checks `team.coachId === world.userCoachId`; otherwise it returns `TEAM_NOT_USER_CONTROLLED`. No staff responsibility or AI decision owner is invented. AI clubs may display derived facts but have no decision controls and explicitly report that AI intent is unavailable. This is a fail-closed behavior consistent with the advisory-only recommendation authority.

## Information and subsystem boundaries

The review is derived from the club’s canonical active contract, roster membership, BS9 need evidence, BS11A roster planning context, and existing club strategy context. The projection does not add hidden external player truth, generated future ratings, universal player value, market fairness, or invented salary demands. Role, age, development stage, usage, RolePromise, and payroll are evidence only; they do not create a valuation or renewal terms.

The application command updates only the `contractReviewDecisions` collection. Its source imports no BS10 market, Finance, Governance, or release executor. The UI text states that intent creates no salary terms, negotiation, successor contract, release, or Governance decision. No `PLAYER_CONTRACT_SIGNING` event, finance commitment/payroll change, or release call is created by intent selection. The existing contract and roster records remain unchanged.

## Horizon and breakpoint

The existing BS9 rule used a literal 365-day window for unresolved active key-player expiries. BS11B extracts that same rule as `CONTRACT_REVIEW_HORIZON_DAYS` in `ClubNeedsEngine` and uses the shared constant for its signal; there is one canonical 365-day review horizon in this path, not a second magic policy. The existing 30/90-day need urgency tiers are preserved.

For the user team, `SimulationBreakpoints` emits an `IMPORTANT` `contractReviewHorizon` item on the day a review enters the 365-day horizon, and on a deferred revisit date. It is intentionally nonblocking: `mayAdvance` remains true and Continue/Simulate Until behavior is preserved. The route is `analysis`; the user can open Contract review in Club Strategy and select one of the four intents. This is a narrow crossing signal, not a new deadline lock.

## UI and persistence

Analysis shows player, contract expiry, available role/position context, current review status, prior intent, and revisit timing. BS11A’s Contract outlook separately shows season horizons and unresolved expiry context. User-team choices appear only when the explicit action callback is connected. AI cards have no controls. The display disclaims binding terms and outcomes.

Save V4 adds the optional `contractReviewDecisions` collection. Serialization writes only decision records; derived candidates and BS11A projection are not saved. Deserialization defaults a missing field to an empty list, and the added Save test covers round-trip plus the pre-field V4 shape. No contract fields are duplicated into review state.

## Contract anatomy and BS11C handoff

Canonical existing contract capabilities remain identity, start/end, annual salary and yearly cash/cap/guaranteed values, agent representation, partial RolePromise lifecycle, retained salary, dead money, salary exceptions, scheduled future contract, release, transaction history, and Governance signing. Renewal/extension, team/player/mutual options and decision windows, guarantee/vesting dates, bonuses/incentives, conditional salary triggers, no-trade/player-consent clauses, buyout/release clauses, broad agent-fee settlement, and broad RolePromise fulfillment consequences remain missing or partial. None belongs in BS11B-R.

BS11C should first resolve the roster/contract invariant authority before execution, then define an explicitly approved extension lifecycle: negotiation ownership/participants, permitted information and market signals, term and salary generation authority, offers/counters/player response, Governance/signing boundary, atomic activation of successor contract, and cleanup/resolution of `PURSUE_EXTENSION` on signing, withdrawal, expiry, or invalidation. Real-world clauses remain proposals until the project’s product authority marks them decided.

## Tests and findings

Focused test suites requested and selected:

1. `src/app/contractReview/ContractReviewService.test.ts`
2. `src/engine/clubNeeds/ClubNeedsEngine.test.ts`
3. `src/app/game/SimulationBreakpoints.test.ts`
4. `src/save/GameWorldSaveV4.test.ts`
5. `src/ui-ng/applications/analysis/ClubStrategyScreen.test.tsx`

The source tests cover canonical BS9 candidate derivation, all four intents without contract/roster/transaction/Governance mutation, successor coverage, user-team authority, AI rejection, defer/revisit, player departure, expiry and termination, Save round-trip/old V4 default, nonblocking breakpoint, and user-only UI controls.

`npm ci` installed locked dependencies into this isolated checkout’s ignored `node_modules`; `package.json` and `package-lock.json` remained unchanged. The final focused name-filtered run across the five files above reported **16 passed, 0 failed, 44 skipped**, duration **12.81 seconds**. Running all tests in those same five selected files also reported **60 passed, 0 failed**, duration **105.69 seconds**; an existing annual-development Save V4 test took 84.715 seconds in that file-level run. The full project suite was not run.

`npm run typecheck`: **PASS**. Build was not run because no UI/source file was changed during review or validation. `git diff --check` passed.

- BS11B-introduced P0 findings: none confirmed.
- BS11B-introduced P1 behavior findings: none confirmed.
- Existing separate P0 roster/contract invariant: open; mandatory BS11C precondition, unchanged by BS11B.
- Validation status: focused tests and typecheck pass; BS11B is certified PASS.

## Recommendation

Accept `34dc2ab` as canonical prior BS11B work; reimplementation is not indicated. Focused validation passed without production changes. Carry the roster/contract integrity authority gap forward as a mandatory BS11C precondition, then define extension execution and contract-anatomy scope only under explicit product authority.
