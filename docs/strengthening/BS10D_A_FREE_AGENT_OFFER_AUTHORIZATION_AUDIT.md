# BS10D-A Free-Agent Offer and Transaction Authorization Audit

Audited the reviewed BS10C base (`9a9115439d47afc360b43b881023db0e52898d1e`) before implementation. This milestone can prepare read-only offer intelligence, but the inspected authorities do not currently support opening a negotiation autonomously.

## 1. Canonical negotiation creation authority

`src/engine/market/MarketEngine.ts` exports `openNegotiation(world, input)`. It creates an `OPEN` `ContractNegotiation` at round zero and writes it through `updateGameWorld`. It is the canonical creation seam and is out of bounds for BS10D-A. The UI market workflow uses other actions; BS10D-A will only assess readiness and will not call this seam.

## 2. Required negotiation fields

`ContractNegotiation` in `src/domain/market/Market.ts` requires organization ID, player ID, salary, years, one of `STAR | STARTER | ROTATION | DEPTH`, and integer-like numeric `agentFee`; `agentId` is optional. The creation function derives ID as `negotiation:${organizationId}:${playerId}:${currentDate}`, status `OPEN`, and round `0`. The world rejects duplicate IDs, but `openNegotiation` itself performs no existing-negotiation or idempotency check.

## 3. Salary authority

The current free-agent bootstrapping function `getFreeAgentMarketTerms` in `src/app/market/MarketService.ts` reads hidden Player ratings through `calculateBootstrapAbilityProxy`, derives salary, and deterministically generates years. `signFreeAgent` consumes those terms directly. Neither is a truthful source for this intelligence layer.

BS10C carries organization-scoped `MarketKnowledge.expectedSalary` with source, confidence and date. BS10D-A can carry that exact expectation as prepared salary evidence, but must preserve its status as a market expectation and must not read `MarketReality` or ratings. If the club has no known expected salary, salary remains unknown and cannot be passed to the negotiation seam.

## 4. Term authority

`MarketKnowledge.expectedYears` is a legitimate organization-scoped signal, and BS10C exposes it separately as `expectedTermYears`. The negotiation schema requires an exact integer `years`, but no inspected policy selects an offer term from an expectation. The seed-based years in `getFreeAgentMarketTerms` are not club knowledge or offer authority. BS10D-A will keep expected years as evidence and selected negotiation term unknown; it will not default to a term.

## 5. Role authority

The canonical negotiation role vocabulary is `STAR`, `STARTER`, `ROTATION`, `DEPTH`. `MarketKnowledge` has no role field. `contractRecommendation` in `BasketballOperationsAdvisory` concerns an existing roster player's renewal/hold decision; it does not assign a role to an incoming target. BS9 need/fit and roster depth are not a canonical contract-role mapping. No safe incoming role authority was found, so the proposed role remains unknown.

## 6. Agent-fee authority

`PlayerRepresentation` can identify the player's agent. `ContractNegotiation.agentId` is optional, but `agentFee` is required. There is no fee field or fee schedule on `Agent`, `Agency`, `PlayerRepresentation`, or `MarketKnowledge`. `agentCounter` changes a fee using agent negotiation ability after an OPEN negotiation exists; it does not establish a truthful opening fee and depends on agent attributes. BS10D-A will not treat that formula as the opening-fee authority and will leave the fee unknown.

## 7. Responsibility authority

The `recommendSignings`, `shortlistPlayers`, and `contractRecommendation` responsibility definitions are in `src/domain/responsibility/Responsibility.ts`. Their eligible roles and supported modes are explicit. `recommendSignings` is the closest responsibility for an incoming free-agent target; it supports `userControlled`, `advisory`, and `organizational`, but not `delegated`. Shortlist is candidate curation, while contractRecommendation is retention-oriented in current advisory logic.

`resolveAdvisoryResponsibility` and `resolveDelegatedResponsibility` in `src/engine/staff/resolveDelegatedResponsibility.ts` require a matching responsibility row, requested mode, holder, StaffPerson, current TeamStaffAssignment on the team, and a Personality record. The domain assignment validator supplies role/mode eligibility. A role title alone does not establish a live responsibility. Advisory resolution only establishes advisory ownership; the closest responsibility kind does not support delegated mode, and no responsibility mode is connected to `openNegotiation` execution authority. `userControlled` and `organizational` rows have no staff holder. BS10D-A will expose the actual responsibility mode/holder where resolvable without equating it to transaction permission.

## 8. Governance authority

Governance V2 contains `PLAYER_BUDGET` and generic budget decisions, but no player-signing, contract-offer, or player-acquisition decision type. `PLAYER_BUDGET` has a `BUDGET` subject and formal Governance grants/participation rights; that domain does not establish authority for a concrete free-agent negotiation. BS9 maps only financial containment to `BUDGET`; broad `EXTERNAL_ACQUISITION` planning authority is explicitly not transaction authority. The concrete signing authority therefore remains `AUTHORITY_UNKNOWN`; BS10D-A will not manufacture a decision or request.

## 9. Budget and Finance authority

`canTeamAffordAdditionalSalary` re-derives current team payroll from active contracts and dead-money charges and compares it with `playerSalaryBudget`. BS10B's affordability is a useful snapshot but can become stale after roster/payroll changes, so a current known prepared salary should be checked again against canonical payroll before reporting financial readiness. This answers whether the team can pay under the current legacy budget model; it does not authorize committing the salary.

Finance V2 posture is surfaced separately by BS10B as context. No inspected policy makes stressed/constrained Finance V2 context alone a signing prohibition. BS10D-A will preserve it as context rather than treat it as a block.

## 10. Existing negotiation, idempotency and lifecycle

Negotiation state is stored in `GameWorld.negotiationsById`. `OPEN` and `COUNTERED` are active states for duplicate-opening prevention; accepted/rejected records are not active attempts. No lookup or duplicate guard exists in `openNegotiation`. The deterministic ID omits an attempt nonce and uses organization, player and date, so a second opening on the same date collides even after a negotiation closes; `updateGameWorld` rejects duplicate IDs. BS10D-A must report an existing active negotiation distinctly and must never call creation. BS10D-B will need to revalidate active state and account for same-day ID collision before using the canonical seam.

## 11. Hidden-truth risks

`MarketReality` contains true expected salary/years, player willingness and seller willingness. The bootstrap market terms use hidden Player ratings and seeded defaults. Agent ability/personality can affect counter/fee changes after negotiation. Offer intelligence must use the exact BS10C result and its club-known evidence, plus explicit current-state checks (free-agent status, payroll, existing negotiation, responsibility assignment, Governance grants). Hidden ratings, potential, personality, MarketReality and agent ability must not fill salary, term, role or initial fee.

## 12. Actual BS10D-A gap

BS10C returns a free-agent approach with known expected salary, expected-term signal, player interest, affordability and unknown transaction authority; it does not resolve concrete negotiation fields, current payroll readiness, live responsibility ownership, existing-negotiation state, or a transaction-specific Governance rule. Several required fields have no source today: selected term, incoming contract role, and opening agent fee. Governance also lacks a signing decision type. BS10D-A should make those gaps explicit and block readiness instead of filling them with convenience constants.

## Readiness conclusion

`READY_TO_OPEN_NEGOTIATION` is permitted only if every required value has a truthful source, current payroll is affordable, no active negotiation or ID collision exists, and transaction-specific execution authority is resolved. Given the current term, role, fee and Governance gaps, an otherwise healthy candidate should remain `MORE_INFORMATION_REQUIRED` or `AUTHORITY_REVIEW_REQUIRED`. That is a truthful result, not a milestone failure. The future action seam remains exclusively BS10D-B.
