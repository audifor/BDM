# BS10D-C Free-Agent Contact Response Audit

## Scope

BS10D-C begins from the reviewed BS10D-B contact path. It must process only canonical `CONTACTED` negotiations, surface a delayed response and bounded information to the contacted organization's market knowledge, and leave formal-offer and signing authority untouched.

## Existing negotiation-response lifecycle

`ContractNegotiation` is persisted in `GameWorld.negotiationsById`. The contact-only union branch contains `CONTACTED | CLOSED` and forbids salary, years, role, agent fee, and round. The formal-offer branch contains `OPEN | COUNTERED | ACCEPTED | REJECTED` and requires those terms. `isActiveNegotiation` treats `CONTACTED`, `OPEN`, and `COUNTERED` as active. `agentCounter` only changes an `OPEN` offer into `COUNTERED`; it does not process contacts.

`openNegotiation` is the formal offer authority. It either creates a term-bearing `OPEN` offer or transitions a matching `CONTACTED` record to `OPEN`. It must not be used to represent a response. There is no existing contact-response processor, outcome field, or persisted response event stream. `CLOSED` is an available contact-only terminal state, but existing records do not encode why they closed.

## Market truth and observation authority

`GameWorld.marketRealityByPlayerId` is world-level hidden truth. `MarketReality` has `availability`, `expectedSalary`, `expectedYears`, `playerWillingness`, `sellerWillingness`, and `competition`. Market agent initialization deterministically seeds this record for players. No other canonical player-interest truth was found; `playerWillingness` is the available source for simulating a response.

`MarketKnowledge` is scoped by both organization and player. It has optional `availability`, `expectedSalary`, `expectedYears`, `playerInterest`, `sellerWillingness`, and `competition`, plus `confidence`, `assessedAt`, and source. The current source vocabulary includes `CLUB_CONTACT`. `receiveMarketSignal` is the existing mutation seam: it appends a `MarketSignal` and consolidates only that organization's knowledge. Consolidation preserves omitted fields, updates assessed date/source, and sets confidence to the maximum of prior confidence and rounded signal reliability times 100.

Signals do not have a negotiation reference field. A deterministic signal ID can link a contact's persisted response to its observation without adding a parallel response log. `receiveMarketSignal` itself has no duplicate-ID guard; response application therefore must first check canonical negotiation response state and must not emit a second signal on retry.

## Player, agent, and expectation authority

`Player` has no canonical personality or desired-role field. A separate general `Personality` model is not associated with players for this lifecycle. `PlayerRepresentation` records player, agent, trust, and start date. `Agent` has abilities and personality, but no contact-specific response or fee-expectation contract. No agent fee truth exists here, and agent skill/personality must not be turned into a fee expectation.

`MarketReality.expectedSalary` and `expectedYears` are the canonical hidden market expectation fields. `getFreeAgentMarketTerms` is not a substitute: it estimates action/bootstrap salary from Player ratings and seeded variance and derives contract years independently. Its output is used by signing and is not a contact-disclosed expectation authority. Club intelligence in BS10A/B/C already consumes only organization-scoped `MarketKnowledge`; existing tests explicitly verify hidden `MarketReality` changes do not affect those projections.

## Timing, stale status, and breakpoint authority

The world clock advances one date in `CalendarEngine`'s `DATE_ADVANCE` phase. Expired contracts are reconciled daily in `EXPIRED_CONTRACT_RECONCILIATION`; no market response lifecycle currently follows it. This gives a narrow daily contact-response checkpoint after date advancement and free-agent reconciliation. Requiring `startedOn` to precede the current date prevents same-tick replies. This does not require daily BS10A/B/C recomputation or polling across every club's intelligence pipeline.

`isPlayerFreeAgent` is the canonical current status check. If the contacted player is no longer a free agent when the response is due, the contact should be closed as obsolete without asserting a player response or publishing stale free-agent expectations.

The breakpoint system currently surfaces user-club `CONTACTED` negotiations as `INFO` while awaiting an external response; `COUNTERED` is `IMPORTANT`, and open offers are informational. A contact response does not resolve a formal user decision. A surfaced contact outcome can remain informational and must not become `ACTION_REQUIRED`. AI contact responses require no user breakpoint.

## Response semantics and current gap

Formal `ACCEPTED`/`REJECTED` are semantically reserved for formal offers and cannot express contact interest. Contact refusal must remain distinct from formal offer rejection. The smallest lifecycle extension is response metadata on the existing contact-only negotiation record while preserving `CONTACTED` for a positive, pre-offer discussion and using `CLOSED` for refusal or obsolescence. A closed legacy row with no response metadata remains valid. A response outcome needs only distinguish `OPEN_TO_TALKS` from `NOT_INTERESTED`; a player signing elsewhere is stale-contact closure, not `NO_RESPONSE` or rejection.

The missing behavior is one deterministic, delayed, idempotent world lifecycle that derives a contact outcome from hidden `MarketReality`, applies only the resulting bounded disclosure to the contacted organization's `MarketKnowledge`, and records that a response was processed on the canonical negotiation. No formal offer, contract, roster mutation, transaction, Governance, or Finance action is part of this gap.

## Boundary and implementation constraints

The Engine may read `MarketReality` to decide the player's response. The only route from that hidden value into club-facing state is the response plus `receiveMarketSignal`; BS10A/B/C must continue not to read `MarketReality`. User and AI contacts use the same processor. Repeated daily processing must return an unchanged world after one response and one deterministic signal. Missing reality does not imply refusal and should leave the contact pending without fabricated knowledge.

The contact response may disclose `playerInterest` and, only on a positive response, the `MarketReality.expectedSalary` expectation. `expectedYears` remains undisclosed at this stage to keep the response partial and avoid making an unsupported term commitment. No role, agent-fee, or promised-role value is generated. Signal provenance uses `CLUB_CONTACT`, with a stable signal ID tied to the negotiation, the current response date, and bounded high-but-not-perfect reliability. This response is evidence from direct contact, not a guarantee or a copy of hidden truth into BS10A/B/C.
