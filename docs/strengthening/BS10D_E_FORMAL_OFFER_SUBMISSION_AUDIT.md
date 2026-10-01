# BS10D-E Canonical Formal Offer Submission Audit

## Current mutation seam

`MarketEngine.openNegotiation` is the only formal OPEN mutation. Post-D2 it accepts required salary and term plus optional role and fee, looks up the deterministic negotiation ID, and advances only an exact CONTACTED record. It does not have a production Application caller. The D2 `FormalOfferPreparationService` only derives read-only preparations from freshly routed GM/BS10C intelligence.

## CONTACTED to OPEN behavior

For CONTACTED, the Engine validates team/organization, exact ID/opening/action/source identity, a positive `OPEN_TO_TALKS` response, current free-agent status, no other active team/player negotiation, affordable salary, and a valid offer actor. It spreads the contact, preserving `startedOn`, contact-response metadata, contact actor, source plan/proposal and keys. It writes salary, years, optional role/fee and offer actor, sets status OPEN and round 0. Missing role/fee stay absent.

## Actors and authority

The offer actor is checked against current `submitPlayerContractOffer`: USER is accepted only for a user-controlled team; AI requires the exact current eligible delegated staff holder. The contact actor is not replaced. A missing legacy contact actor blocks advancement; no historical actor is inferred. The offer use case must resolve this again immediately before calling Engine.

## Identity, dates, and round

The deterministic ID derives from organization, team, player and `actionKey`; `openingKey` is the same encoded tuple. D2 requires the existing source plan/proposal to match. `startedOn` currently means contact start and must not be overwritten. No field records the later formal-offer date. Add optional additive `offerSubmittedOn` for new OPEN records, set from current `GameWorld.currentDate`; legacy offers remain loadable without it. First formal offer enters round 0; existing `agentCounter` increments on later counter and should preserve the offer date.

## Payroll, idempotency, and lifecycle

Payroll is rechecked in Engine via `canTeamAffordAdditionalSalary`. Current Engine idempotency returns the unchanged world for matching OPEN **or COUNTERED** terms and attribution. D2 retries require exact same identity, source, terms, and offer actor; E must not replay after COUNTERED/ACCEPTED/REJECTED. Keep unchanged-world idempotency for exact OPEN only and report later lifecycle states truthfully at the Application boundary. Conflicting terms under the same submitted attempt remain rejected.

## AI integration choice and remaining gap

The canonical application day advance calls Calendar Engine, which processes due contact responses. Add a narrow Application checkpoint immediately after that response phase: inspect only AI contacts whose positive response was just recorded that day, then call the same live-recomputing submission use case. Do not poll every team daily, auto-delegate, or auto-submit user teams. There is no existing signal-ingress checkpoint for later market-knowledge changes; an already-positive AI contact that later gains missing term knowledge will wait for a future explicit planning/intelligence checkpoint.

## Remaining mutation gap

D2 prepared offers can be READY but nothing submits them. E must provide an Application use case which takes identifiers, not an authoritative stale preparation; rederive current plan, proposal, exact candidate, contact, preparation, actor and payroll; require READY; then delegate to `MarketEngine.openNegotiation`. Engine must independently validate player existence and all state invariants that do not require GM planning. Submission must persist only the updated `ContractNegotiation`, with no contract, transaction, roster, Governance, Finance, or MarketKnowledge effects.