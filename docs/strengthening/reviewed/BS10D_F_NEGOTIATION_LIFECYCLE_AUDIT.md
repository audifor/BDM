# BS10D-F Negotiation Lifecycle Audit

**Audited base:** `64c0954df401bcaa3db517298cf0ff194525a37a` (BS10D-E plus the required archival commit).

## 1. Existing response semantics

`ContractNegotiation` is the canonical persisted lifecycle. CONTACTED/CLOSED records have no formal terms; OPEN/COUNTERED/ACCEPTED/REJECTED have salary, years, and round, with optional role and fee. `isActiveNegotiation` considers CONTACTED, OPEN, and COUNTERED active. `GameWorld` rejects multiple active negotiations for one team/player. Save V2 already round-trips this collection as JSON.

There is no formal-offer response processor. The only formal transition is the pure Domain helper `agentCounter`, which accepts OPEN only, raises salary by `round((negotiation + aggressiveness + opportunism) / 30) * 10,000`, increments round, and changes status to COUNTERED. It preserves years and role. It increases fee only if one was already present, by `round(original salary * agent negotiation / 10,000)`. It does not record a date or origin, does not check free-agent status/payroll/authority, does not append history, and is not called by the lifecycle.

## 2. World truth, expectations, and outcomes

The response Engine may read the player's `MarketReality.expectedSalary`, `expectedYears`, and representation/Agent to simulate the player's side. Those are hidden world facts. Existing BS10A/B/C intelligence reads only organization-scoped `MarketKnowledge`; club-side counter decisions must continue to use that surface and public current club facts, never `MarketReality` or Player ratings.

The smallest deterministic response rule supported by current truth is salary-driven: accept an OPEN offer when its salary meets or exceeds the hidden expected salary; otherwise, a represented player receives the existing deterministic `agentCounter`, while a player without a resolvable agent rejects the offer. A positive contact only means the player is open to talks; it does not guarantee salary acceptance. Contact `playerWillingness` remains the contact-stage threshold and is not applied a second time to formal response.

`expectedYears` is named and used as an expectation signal, but the canonical model defines no minimum, maximum, or exact-match tolerance. BS10D-C deliberately does not disclose it, BS10D-D uses matching a club-known signal as a preparation policy rather than a player commitment, and `agentCounter` does not change years. F therefore does not infer that a term mismatch alone requires rejection or an exact match. A response preserves the submitted years; changing years requires an explicit club revision. Optional role and fee also remain as proposed/countered terms only when present; no response fabricates either.

Agent negotiation ability and aggressiveness/opportunism affect only the existing counter formula. A new formal offer responds through its persisted `agentId`; a legacy offer without that snapshot falls back to the current `PlayerRepresentation`. Loyalty, patience, reputation, market-knowledge, network, client-management, and media-influence have no current counter consumer and will not be assigned new effects here. Without a resolvable offer Agent, no agent-generated counter is fabricated.

## 3. Timing, stale players, and idempotency

Calendar Engine already runs `MARKET_CONTACT_RESPONSES` after date advance and expired-contract reconciliation. Add formal responses to that narrow phase, processing only OPEN offers whose `offerSubmittedOn` is earlier than the current date. A new offer cannot receive a same-tick response. A legacy OPEN record without that additive date becomes due on the first processor pass, which necessarily runs after a date advance. Missing `MarketReality` leaves an offer OPEN and unchanged; it does not imply rejection.

Every processed OPEN round changes lifecycle status and receives at most one response. The round response records outcome, date, and PLAYER/AGENT origin. Deterministic signal IDs use negotiation ID and round, so retries cannot duplicate MarketSignals. Before response, the Engine rechecks free-agent status. If the player is unavailable, the negotiation is closed as stale with a reason/date, without fabricating a player response or counter.

## 4. Terms, counter attribution, and history

Acceptance changes only status/response metadata; current salary, years, optional role/fee are the unambiguous agreed terms for BS10D-G. Rejection remains a formal player/agent rejection and is distinct from a refused term-free contact (`CLOSED`). An agent counter records origin `AGENT`, response date, round, and its resulting terms. A counter signal may expose only the explicit counter salary to the contacted organization's MarketKnowledge through `receiveMarketSignal`; it does not copy hidden expectation, years, role, or fee. Acceptance and rejection reveal no exact expectation and create no signal.

The current negotiation fields alone lose the prior club salary when `agentCounter` overwrites it. Add a small immutable per-offer-round history: the submitted terms/date/actor, the player-side response and any counter terms, and any club disposition. A revised club offer is a new entry at the current counter round, on the same negotiation ID/action/opening identity; the next agent response advances the existing round. No parallel workflow or general event log is needed.

## 5. Club response to counters and authority

The existing `submitPlayerContractOffer` responsibility is the only specific negotiation execution responsibility. It can own accepting observed counter terms or submitting revised terms because both commit the club to a further nonbinding negotiating position. Use the same current user-vs-delegated-staff resolution as BS10D-E; title alone is not authority. Rejection/withdrawal also uses that executor rather than introducing a new responsibility. Every accepting/revised action rechecks free-agent status and payroll for exact current terms. Repeated exact actions return the existing result without adding a round/history entry; changed action/terms after a response conflict.

Expose explicit Application actions to the user team for accept counter, decline counter, and revise terms. For AI, use the same narrow application checkpoint after formal responses. The AI may accept a counter only when the current BS10C route still selects the same player/proposal and exact counter salary remains payroll-feasible; otherwise it declines the counter. It first requires a current delegated offer owner. This policy uses only current acquisition selection, observed counter terms, payroll, and current authority. It does not read hidden reality or rebuild candidate ranking. With no current executor, AI leaves COUNTERED unchanged.

The existing user breakpoint already surfaces COUNTERED as IMPORTANT on the Market route and allows day advancement. No current executable Market command or decision-detail surface exists, so do not promote it to ACTION_REQUIRED or add UI/signing controls in this milestone. OPEN remains informational; ACCEPTED and terminal states cease to create pending negotiation breakpoints.

## 6. Boundaries and remaining gap

Formal response updates only the canonical negotiation plus one legitimate organization-scoped counter MarketSignal/MarketKnowledge observation. Club actions update only that negotiation. No contract, roster, PlayerTransaction, RolePromise, fee payable, Finance, signing Governance, `signFreeAgent`, or minimum-roster repair behavior belongs here. `PLAYER_CONTRACT_SIGNING` is reserved for the later binding contract transition.

**P0:** None found in the audited response/club-action seam.

**P1:** Existing direct-sign Market UI and AI minimum-roster repair remain separate paths that bypass this lifecycle. AI teams without explicit `submitPlayerContractOffer` delegation cannot automatically resolve a counter. Term acceptance semantics and response calibration are intentionally conservative: salary expectation is the only modeled player-side acceptance threshold; richer role/term preference truth needs a separate canonical source.

## 7. BS10D-G handoff

ACCEPTED is an agreement on the current exact salary, years, and optional role/fee; it does not sign. BS10D-G must take the exact accepted negotiation ID and terms, recheck player availability, payroll and current institutional signing authority, require an approved `PLAYER_CONTRACT_SIGNING` Governance decision, and atomically create the contract, roster transition, PlayerTransaction, any agreed RolePromise, and an accounted payable for any agreed agent fee. It must use those agreed terms without hidden recalculation or `signFreeAgent`, and preserve the negotiation/history. Until that boundary is implemented and validated, signing is not safe through this path.
