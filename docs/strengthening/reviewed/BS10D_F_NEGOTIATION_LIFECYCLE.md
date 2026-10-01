# BS10D-F Formal Offer Response and Negotiation Lifecycle

## Response model

`progressFormalOfferResponses` processes only due canonical OPEN free-agent negotiations. `deriveFormalOfferResponse(world, negotiationId, date)` is deterministic and runs on the world side: if the player is still a free agent and the offer meets `MarketReality.expectedSalary`, the response is ACCEPTED. Otherwise, a represented player receives the existing deterministic `agentCounter`; without a resolvable Agent, the response is REJECTED. Missing MarketReality leaves the OPEN offer pending. Positive contact means open to talks, not guaranteed acceptance.

The model deliberately does not use `playerWillingness` a second time after contact. `expectedYears` is not treated as an exact-match, minimum, or maximum preference: the source truth does not define a term tolerance, BS10D-C does not disclose it, and `agentCounter` has no term-changing rule. Player-side outcomes are therefore salary-driven; years remain the exact submitted term unless the club explicitly revises them. The optional role and fee are preserved only when explicitly present.

## Agent counters and round history

`agentCounter` increases salary by the existing negotiation/aggressiveness/opportunism formula, increments the existing round, and changes an agent fee only when a fee already exists. It preserves years and role. No other Agent attribute is assigned a new behavior. A counter records origin AGENT, response date, counter terms, and the counter round. New offers use the `agentId` persisted on that offer; legacy offers without one fall back to the current `PlayerRepresentation`. If no offer Agent resolves, the player rejects an under-expectation offer rather than receiving fabricated agent terms.

`roundHistory` preserves each club offer with its exact terms, submission date and actor, the player/agent response and any counter terms, and a later club action. Revised offers reopen the same negotiation at the current counter round with a new `offerSubmittedOn`; the next external response advances the same round counter. Legacy negotiations can omit the additive fields; their first due response is processed on the first daily response checkpoint.

## Timing and hidden-truth boundary

Calendar order is date advance, expired-contract reconciliation, term-free contact responses, then formal offer responses. A new offer cannot receive a same-day response. Stale OPEN or COUNTERED negotiations close with `PLAYER_NO_LONGER_FREE_AGENT`, date, and history where it exists. A stale counter cannot receive a club response.

Only the player-side Engine reads MarketReality and representation truth. A counter emits one deterministic organization-scoped MarketSignal for the explicit counter salary through `receiveMarketSignal`; it does not copy expected years, role, fee, or hidden willingness. Acceptance/rejection reveal no exact expectation. The AI club sees only the existing current BS10C proposal, the observed counter, current payroll, and its executor authority. Hidden Player ratings and MarketReality do not influence its decision. User and AI offers use the same player response processor.

## Club response and authority

`respondToNegotiationCounter` is the Application boundary for explicit user decisions and bounded AI decisions: ACCEPT_COUNTER, DECLINE_COUNTER, or REVISE_OFFER. It resolves the current user actor or exact delegated `submitPlayerContractOffer` staff holder; a title or contact-only responsibility is insufficient. The Engine independently checks negotiation/team identity, current COUNTERED round, free-agent status, actor authority, exact terms, and payroll for an accepted or revised salary.

AI responds only at a narrow post-calendar checkpoint. If the exact source player/proposal remains a current FREE_AGENT_OFFER and the counter salary is affordable, AI accepts the counter. Otherwise AI declines it. If no current executor exists, AI leaves it COUNTERED. User counters remain user-controlled. Exact club action retries are unchanged-world `ALREADY_APPLIED`; changed action/terms for that round conflict. Club decline is `WITHDRAWN`, distinct from player-side `REJECTED`.

## Agreement, observability, and persistence

ACCEPTED exposes the exact current salary, years, optional role and optional fee as agreed terms for BS10D-G. Accepting a counter changes only the negotiation status/action metadata. It does not create a contract, role promise, payable, roster entry, transaction, or Governance request.

OPEN remains informational. A user COUNTERED negotiation is surfaced as IMPORTANT on the existing Market breakpoint route, with current salary, years and round; it does not block advancing. A user ACCEPTED agreement is also IMPORTANT and explicitly says the player is not signed. No signing button or new UI workflow is added. The modern Market workspace's direct-sign action is a separate existing P1 path and remains outside this milestone.

Persistence is the canonical `ContractNegotiation` round/status/response fields and, for an explicit counter, its canonical MarketSignal/MarketKnowledge update. There is no parallel negotiation record. Save V2 round-trips the additive data without a schema bump.

## Signing boundary and BS10D-G

BS10D-F never calls `signFreeAgent`, changes a roster, creates a PlayerContract/PlayerTransaction/RolePromise/payable, or consumes `PLAYER_CONTRACT_SIGNING`. Acceptance is agreement only.

BS10D-G must consume the exact ACCEPTED negotiation and agreed terms; recheck current free-agent status, payroll, and institution-specific signing authority; require an approved `PLAYER_CONTRACT_SIGNING` decision; and atomically create the contract, roster transition, PlayerTransaction, any explicitly agreed RolePromise, and accounted payable for any agreed agent fee. It must not recalculate terms or call the existing direct-sign helper. Signing is not safe through the negotiation path until those checks and effects exist.

## Findings

- **P0:** None found in the formal response and club counter-action path.
- **P1:** The existing direct-sign Market workspace and AI minimum-roster repair still bypass formal negotiation/signing Governance. AI clubs without explicit `submitPlayerContractOffer` delegation cannot resolve counters automatically. Term preference remains unmodeled until canonical tolerance/role/fee truth exists.

## Focused validation

Focused verification covers due timing and all three player outcomes; hidden world response truth versus club intelligence; deterministic agent counter terms; no fabricated role/fee; round/date/history progression; stale-player closure; explicit user counter revision and retry; AI authority, affordability, and hidden-truth isolation; nonblocking counter/agreement breakpoints; calendar phase order; and Save V2 round-history persistence. Full suite and UI build are outside this milestone's authorized test policy.
