# F6 Gameplay Changes

## Player contract response

Changed `derivePlayerTermsResponse` in `src/engine/market/MarketEngine.ts` to evaluate the total guaranteed package (`annual salary × contract years`) against the player’s canonical expected package. When another organization has a real OPEN or ACCEPTED offer for the player, its guarantee can raise the required package. This does not reveal the competing club or its offer: the player-side response uses market reality, while club decision-making continues to use organization-scoped `MarketKnowledge`.

A represented player can counter with enough years and a salary rounded up to cover the required guarantee; agent negotiation traits add pressure to the counter. An unrepresented player rejects an under-guarantee offer. Due offers are evaluated strongest package first, so a later lower offer cannot erase an already accepted stronger offer. Counter signals disclose the countered salary and years as terms communicated to that organization.

`TransferEngine` supplies the buyer organization to the shared response model. This enables organization-scoped offer context on that path. Active competing transfer negotiations are not included in the competing-offer scan, which currently covers `world.negotiationsById`.

## Demonstrated effects

Focused tests cover salary/term package differences, competition from a real open offer, represented-agent counter behavior, and shared response paths. They test the canonical market response function and adjacent flows; they do not certify a complete GUI signing workflow or persistence round-trip.

Role remains excluded from acceptance valuation because the current role-promise data has no established consumer that enforces an offered role. No hidden player truth was added to club-side recommendation or exposed through market knowledge.

## Known remaining gap

Trade rival readiness still returns `MORE_INFORMATION_REQUIRED`. F6 did not add an autonomous trade policy because the existing code explicitly lacks a defensible organization-knowledge-bounded response rule. See `F6_GAMEPLAY_AUDIT.md`.
