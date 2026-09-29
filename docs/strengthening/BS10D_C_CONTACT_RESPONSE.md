# BS10D-C Free-Agent Contact Response

## Response lifecycle audit and model

`ContractNegotiation` remains the only persisted lifecycle authority. The formal `OPEN`, `COUNTERED`, `ACCEPTED`, and `REJECTED` statuses remain offer states. A contact response is stored as optional `contactResponse` metadata on that same negotiation, with an outcome, response date, and the related market signal ID. `CONTACTED` remains term-free and active after a positive response; `CLOSED` records a contact refusal. A stale contact closed because the player is no longer a free agent has no player-response metadata. A legacy `CLOSED` record without response metadata remains valid.

The deterministic response rule uses the existing hidden `MarketReality.playerWillingness` value: 50 or above is `OPEN_TO_TALKS`, below 50 is `NOT_INTERESTED`. This is a deliberately small interpretation of the existing numeric willingness scale; the threshold is not a separately tuned player-behavior model.

## Hidden truth to observable knowledge

The response Engine may read `MarketReality` as world simulation. It writes the response to the canonical negotiation and sends an organization-scoped `MarketSignal` through `receiveMarketSignal`. BS10A, BS10B, and BS10C continue to read only organization-scoped `MarketKnowledge`, never `MarketReality` directly. User and AI contacts run through the same Engine rule; actor identity does not alter the outcome or disclosure.

If the player has no `MarketReality` row, no response is inferred and the contact remains pending. The model does not generate a `NO_RESPONSE` outcome. This keeps missing simulation data distinct from a refusal.

## Response timing and integration

A new `MARKET_CONTACT_RESPONSES` phase runs daily after `DATE_ADVANCE` and `EXPIRED_CONTRACT_RECONCILIATION`. A contact is eligible only when its `startedOn` precedes the current world date (a legacy contact without `startedOn` is eligible on the next processor run). This prevents a response on the contact-creation tick and checks current free-agent status before revealing expectations. The phase processes only due `CONTACTED` negotiations; it does not recompute market intelligence or GM planning.

If a due player is no longer a free agent, the contact moves to `CLOSED` with no response metadata or market signal. This prevents stale free-agent progression. The existing minimum-roster repair and direct-sign behavior are untouched.

## Outcomes and information revealed

- **`OPEN_TO_TALKS`:** the contact stays `CONTACTED` and is eligible for a future formal-offer workflow. The direct-contact signal reports `playerInterest` from the existing willingness truth and `expectedSalary` from `MarketReality`.
- **`NOT_INTERESTED`:** the contact becomes `CLOSED`. The signal reports player interest only; salary and years stay undisclosed.
- **No response:** not modeled as an outcome. Missing reality leaves the contact pending without a signal.

Salary expectation comes only from `MarketReality.expectedSalary`. The rating-derived `getFreeAgentMarketTerms` helper remains signing/bootstrap action logic and is not used to disclose salary. `MarketReality.expectedYears` is not disclosed by contact; there is no basis here for treating a non-binding conversation as a term discussion. The model has no player desired-role truth, so no role is communicated or promised. It has no canonical agent-fee expectation, so no fee is invented from agent abilities or personality. Player personality is not part of the current Player model, and agent attributes are not used to manufacture response behavior.

## Market knowledge and provenance

Each response creates one stable signal ID, `market-signal:contact-response:<negotiationId>`, with source `CLUB_CONTACT`, response date, and reliability `0.9` (90 confidence under existing consolidation semantics). The signal is scoped to the contacted organization's ID and updates only that organization's `MarketKnowledge`. It reveals player interest for either outcome, and salary only for a positive outcome. Expected years, availability, competition, seller willingness, role, and agent fee remain absent from this signal. Existing knowledge for omitted dimensions follows the repository's normal consolidation behavior.

A response is recorded on the negotiation before its signal is applied. Subsequent processing skips any negotiation with response metadata, and closed contacts are not eligible. Retrying therefore returns the same world without duplicating or refreshing the response signal or changing learned expectations. Reprocessing the same unresponded state produces the same deterministic result and stable signal identity.

## User behavior, AI behavior, and breakpoints

User and AI contacts receive the same response derivation and organization-scoped knowledge mutation. A response does not authorize an offer for either actor. The existing user-team breakpoint remains informational: an unanswered contact says it is waiting; a contact with a response reports the positive response or refusal. It does not become `ACTION_REQUIRED`, and AI contacts create no user breakpoint.

The Market breakpoint is the observable lifecycle surface in this milestone; it includes the response outcome/date and market route. No offer control, salary selection, term selection, role promise, fee selection, or new signing control is added.

## Persistence and downstream contract

Response metadata is additive within the existing `ContractNegotiation` record. Market signals and organization knowledge already persist through Save V2's market runtime; there is no new queue, parallel response record, duplicated knowledge snapshot, or schema version change. A later BS10B/BS10C assessment naturally sees the newly learned organization knowledge while its hidden-truth boundary remains unchanged.

BS10D-D may consume the same contact record, its response/date, and the club's current scoped knowledge when preparing formal-offer intelligence. Positive contact is not a submitted offer, selected term, promised role, agent fee, acceptance, contract, or signing.

## Findings

- **P0:** none found. Response state and disclosure stay within the canonical negotiation and organization-scoped knowledge paths; no formal offer or signing mutation is called.
- **P1:** the `playerWillingness >= 50` outcome threshold and 0.9 direct-contact reliability are initial deterministic calibration choices, not behaviorally tuned values. A later market-tuning pass can validate them.
- **P1:** no explicit agent response behavior, player desired role, or agent-fee expectation is modeled. BS10D-C leaves these unknown instead of deriving them from unrelated attributes.

## Focused verification

Focused tests cover positive and negative replies, bounded expectation disclosure, organization scope, provenance/confidence/date, deterministic retry and idempotency, missing reality, next-day timing, stale free-agent closure, non-contact/closed status exclusion, user/AI model parity, no contract/transaction/roster change, calendar phase order, and informational breakpoints. A contact-response integration test confirms the resulting `CLUB_CONTACT` salary and interest flow into later BS10B feasibility while unchanged hidden truth by itself remains invisible. Existing BS10A/B/C intelligence tests continue to assert that hidden `MarketReality` cannot directly affect club intelligence.
