# BS10D-D2 Formal Offer Semantics and Commitment Authority

## Lifecycle decision

The market domain can represent `OPEN`, `COUNTERED`, `ACCEPTED`, and `REJECTED`, but only `agentCounter` currently advances a formal negotiation. No canonical acceptance-to-signing service consumes these statuses. Direct user and AI signing paths bypass this negotiation lifecycle. D2 defines `OPEN` as the club's nonbinding formal proposal within an ongoing negotiation. It creates no contract, payroll schedule, transaction, or Governance request.

**Path B is selected:** role and agent fee are not required in the first formal offer. The domain permits either to remain absent until negotiation establishes an explicit proposal or agreement.

## Terms and commitments

- `salary` is required at OPEN as annual proposed compensation. It must be a positive safe integer and pass current payroll feasibility.
- `years` is required at OPEN as the proposed duration. It must be a positive safe integer. Preparation continues to use `MATCH_KNOWN_EXPECTATION` and `MATCH_KNOWN_EXPECTED_YEARS`; unknown salary or term stays a blocker, with no fallback value.
- `role` is optional and, when present, means a club role proposal. It is not the player's requested role, a gameplay assignment, or a contract field. `RolePromise` is a separate accepted promise. A later signing path should create it only if the parties actually agreed to a role commitment. D2 adds no hidden-rating role selector.
- `agentFee` is optional. The current numeric value is not represented in PlayerContract, a payable, or the salary finance schedule, and has no lifecycle consumer beyond the counter formula. It therefore cannot imply a demand or a committed cost. No default zero, salary percentage, or ability-derived fee is created. A later signing path must record and account for any fee the parties agree to before signing.

PlayerContract creation requires player, team, contract dates, and positive annual salary; duration is expressed by its dates. Role is only needed for an agreed RolePromise. An agreed agent fee must also become a canonical accounted cost before binding signature. Neither commitment is fabricated when absent.

## Governance and responsibility

The first offer is nonbinding and operational when the current payroll can support it and its executor has `submitPlayerContractOffer` responsibility. D2 does not add an offer Governance decision. That responsibility is separate from contact initiation and from final institutional approval.

`PLAYER_BUDGET` remains a budget-envelope decision with a `BUDGET` subject. It does not approve an individual offer or signing, and it does not waive payroll feasibility. D2 adds ecosystem-neutral `PLAYER_CONTRACT_SIGNING` for the distinct binding signature decision. It uses a generic negotiation reference and `EFFECT_REQUIRED`. Authority comes only from explicit institution-specific Governance grants; no grant/default permission is added to existing or new saves. A future signing effect must require an approved decision and link its canonical contract effect.

The same signing decision key works for professional clubs, NBA/WNBA organizations, NCAA programs, and federations; each institution's existing grant graph defines who may act. No universal owner, president, or GM authority is presumed.

## Actors and canonical transition

A negotiation now separates `contactResponsibleActor` from `offerResponsibleActor`. New contact records capture the contact actor. Advancing CONTACTED to OPEN preserves that actor and records a separately validated offer actor. A USER actor is valid only for the user-controlled team. An AI offer actor must be the current eligible holder of delegated `submitPlayerContractOffer`; title alone is insufficient. No automatic delegation is created.

The transition updates the exact existing negotiation in place, preserving its ID, `actionKey`, and `openingKey`. It requires a positive current `OPEN_TO_TALKS` response, matching organization/team/player and source plan/proposal, current free-agent status, feasible payroll, and an authorized offer actor. A new or alternate attempt is not created. The application caller must rebuild and revalidate the live GM/BS10C route immediately before the engine operation.

Legacy `responsibleActor` remains optional for old save records. Existing contact attribution can be read as contact responsibility, but D2 does not invent missing historical offer attribution. Existing legacy OPEN records remain loadable; ambiguous actor attribution stays ambiguous.

## Preparation and counters

Formal offer preparation is read-only and reports READY only when the exact current positive contact, free-agent state, known valid salary and years, affordable payroll, and a valid user or delegated offer owner exist. Role and fee remain visible as proposed or `NOT_YET_PROPOSED`, and deferral is reported separately from missing required information. Readiness does not submit the offer.

`agentCounter` may increase salary when fee is absent. It changes the fee only when a fee was explicitly present on OPEN; it does not invent a fee. This preserves the existing salary counter behavior without completing the broader counter lifecycle.

## Save compatibility and future contract

Actor, role, and fee changes are additive optional fields in the JSON-safe negotiation record. Save V2 round-trip coverage includes the separated actors and a legacy OPEN record; no save-version bump or invented migration is needed.

**BS10D-E submission contract:** immediately rederive the current BS9/BS10A/BS10B/BS10C route; require the exact canonical positive CONTACTED record and current free-agent status; validate salary, term, payroll, and current offer actor; then update that same ID/action/opening key to nonbinding OPEN. Do not require or synthesize role or fee. Do not create a contract, transaction, Governance request, or finance proposal. Keep ACCEPTED-to-signing separate: require explicit approved `PLAYER_CONTRACT_SIGNING` authority, current payroll and contract terms, and canonical cost/RolePromise effects for any agreed fee or role.

## Findings

- **P0:** None in the read-only preparation path audited here.
- **P1:** Existing Market UI and AI minimum-roster direct-sign paths bypass negotiation and signing Governance. A separate milestone must route or constrain them.
- **P1:** No canonical ACCEPTED-to-contract path exists yet; signing authority and agreed fee accounting must be enforced before implementing it.
- **P1:** AI clubs without explicit `submitPlayerContractOffer` delegation cannot autonomously submit. This is intentional; configuration must grant it where desired.
