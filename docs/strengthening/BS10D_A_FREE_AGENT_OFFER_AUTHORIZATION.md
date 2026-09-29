# BS10D-A · Free-Agent Offer and Transaction Authorization Intelligence

**Status:** Implemented for review
**Scope:** Read-only offer preparation and transaction-readiness assessment for the exact preferred free agent returned by current BS10C intelligence.

## 1. Outcome and authority audit

The boundary findings are recorded in [BS10D_A_FREE_AGENT_OFFER_AUTHORIZATION_AUDIT.md](./BS10D_A_FREE_AGENT_OFFER_AUTHORIZATION_AUDIT.md). The canonical creation seam is `MarketEngine.openNegotiation`; it persists `ContractNegotiation` and is reserved for BS10D-B. BS10D-A consumes current BS10C output, assesses the exact player and reports whether all inputs and authorities exist. It never opens the negotiation.

The required persisted negotiation inputs are organization, player, salary, years, role and agent fee; agent ID is optional. The canonical role vocabulary is `STAR`, `STARTER`, `ROTATION`, and `DEPTH`. Negotiation ID is derived from organization, player and current date. The creation seam has no duplicate guard, while duplicate IDs are rejected by GameWorld construction.

## 2. Prepared fields and source authority

Salary is copied from BS10C's organization-scoped `MarketKnowledge.expectedSalary` evidence with source, confidence and date. It is described as an expected market signal and is rechecked against current payroll. Unknown salary remains absent and makes negotiation opening incomplete. No Player ratings, `MarketReality`, or `getFreeAgentMarketTerms` are read.

Expected years are preserved as a signal, but the selected offer term remains unknown because no term-selection authority exists. The incoming contract role remains unknown: need fit, depth, and current `contractRecommendation` behavior do not assign a role to an acquired player. `PlayerRepresentation` may identify an agent, but no canonical initial agent-fee policy exists; the required fee stays unknown. The later `agentCounter` formula is not an opening-fee authority.

Player interest is carried as evidence only; it does not imply acceptance and is not treated as a mandatory negotiation field. Finance V2 context remains separate from current payroll affordability.

## 3. Current payroll and readiness

`canTeamAffordAdditionalSalary` rechecks the known expected salary against current active player payroll, dead money, and the current player salary budget. This is reported as `payrollAffordability`; BS10B's original affordability is retained separately. A changed payroll can therefore turn a prior BS10B affordable estimate into `FINANCIAL_BLOCK`. Finance V2 stress alone is not a prohibition.

`assessNegotiationOpeningReadiness` distinguishes `READY_TO_OPEN_NEGOTIATION`, `MORE_INFORMATION_REQUIRED`, `AUTHORITY_REVIEW_REQUIRED`, `FINANCIAL_BLOCK`, `UNSUPPORTED`, `NEGOTIATION_ALREADY_EXISTS`, and `NEGOTIATION_ID_COLLISION`. It checks free-agent status, affordability, required inputs, negotiation state, Governance authority and responsibility authority. In the current architecture, missing selected term, incoming role, opening fee and signing-specific Governance authority prevent a ready result.

## 4. Responsibility and Governance

The `recommendSignings` row is used as the closest responsibility for a free-agent target. BS10D-A preserves its actual mode. A staff holder is resolved only when the responsibility row, holder, StaffPerson, live team assignment, assignment date and eligible role agree. `userControlled` and `organizational` are represented without inventing a staff holder. `shortlistPlayers` remains a curation responsibility; `contractRecommendation` currently handles existing-player retention.

A resolved `advisory` holder owns that responsibility only; `recommendSignings` does not support delegated mode. Neither recommendation ownership nor a staff title authorizes opening a negotiation. Governance V2 has a `PLAYER_BUDGET` decision domain, but no contract, signing or player-acquisition decision type. A broad plan or player-budget grant is not treated as permission to create a negotiation. Transaction Governance and responsibility opening authority therefore remain `UNKNOWN`.

## 5. Existing negotiation and duplicate prevention

An `OPEN` or `COUNTERED` negotiation for the same organization and player yields `NEGOTIATION_ALREADY_EXISTS`. The exact ID that `openNegotiation` would derive is also checked. If that ID is already occupied by a closed same-day record, readiness is `NEGOTIATION_ID_COLLISION`, since the canonical seam would collide even though the older attempt is no longer active. Results remain derived; no duplicate intent record is stored.

## 6. BS10C, user, AI, trade and transfer behavior

The application handoff obtains current BS10C proposal intelligence and passes that exact result into the offer assessor. It does not rediscover the target, need, fit, route, salary, affordability, or interest. A `FREE_AGENT_APPROACH` yields free-agent offer intelligence. A `TRADE_ENQUIRY` remains read-only with `TRADE_PACKAGE_INTELLIGENCE_REQUIRED`. A BS10C no-action result stays no-action; unsupported transfers remain unsupported.

The user club receives recommended offer preparation for review; AI clubs receive readiness data but no autonomous action. Both use the same derived engine. Repeated assessment is deterministic and changes to hidden ratings or `MarketReality` do not alter output when BS10C evidence is unchanged.

## 7. Analysis UI and persistence

Analysis shows the preferred player, expected salary provenance, expected term signal versus unknown selected term, unknown role and fee, current payroll affordability, separate Finance V2 context, resolved recommendation responsibility/mode, Governance authority, readiness, missing information, blockers and any existing negotiation. User-club presentation is explicitly advisory. No action buttons are added.

Offer intelligence is not persisted. BS10D-A creates no `OfferIntent`, negotiation, contract, player transaction, Governance request or Finance proposal. The existing `ContractNegotiation` remains the next canonical persistent state, created only by BS10D-B.

## 8. BS10D-B contract and trade deferral

BS10D-B must revalidate all BS10D-A fields, current payroll, current free-agent status, responsibility and authorization, and duplicate/ID-collision state immediately before calling `openNegotiation` with exact prepared values. It must remain blocked until term-selection, role, opening-fee and transaction Governance/responsibility authorities are supplied truthfully. The current implementation is not sufficient to begin mutation safely.

Trade package/value intelligence, outgoing asset selection, transfer fees and trade execution remain deferred to separate milestones. BS10D-B must not progress trade enquiries.

## 9. Review findings

### P0

- No P0 defect found in the read-only implementation. Unknown required fields and authorization remain blocking; no convenience defaults are introduced.

### P1

- There is no safe selected-term authority for an incoming negotiation.
- No current source assigns an incoming player's contract role.
- A player representation identifies an agent but no truthful opening-fee schedule exists.
- Governance V2 lacks a signing-specific decision type, and staff recommendation responsibility does not grant negotiation-opening permission.
- The canonical negotiation ID uses only organization, player and date; BS10D-B must handle both active attempts and closed same-day ID collisions.

These gaps are surfaced as blockers and require canonical authority work before BS10D-B can safely mutate negotiation state.
