# BS10D-D Formal Offer Preparation

## Decision and audit

This milestone derives a formal-offer preparation from the exact current BS10C free-agent proposal after its matching canonical contact has a positive `OPEN_TO_TALKS` response. It does not open or persist an offer. The source audit is in [BS10D_D_FORMAL_OFFER_PREPARATION_AUDIT.md](./BS10D_D_FORMAL_OFFER_PREPARATION_AUDIT.md).

The audit found no existing truthful incoming-role mapping, opening agent-fee schedule, or Governance decision for an individual player offer. The implementation leaves those authorities unknown and exposes them as required gaps.

## Offer fields and policies

- **Salary:** When the current routed BS10C intelligence contains a valid club-known expected salary, the preparation proposes that exact value under the explicit `MATCH_KNOWN_EXPECTATION` policy. The expectation evidence and club proposal are separate fields. Missing or invalid evidence produces no salary proposal. Current payroll is checked against the proposal.
- **Term:** When current intelligence contains a positive integer expected term, the preparation proposes that value under `MATCH_KNOWN_EXPECTED_YEARS`. There is no default term. This is an explicit matching policy, not an assumption that expectation inherently equals offer.
- **Promised role:** Unresolved. Need categories and roster depth describe the club, but the repository defines no reliable incoming contract-role mapping. No external hidden rating is used.
- **Agent fee:** Unresolved. Representation and agent negotiation attributes do not define an opening fee.

## Contact, responsibility, and authority

The exact same canonical negotiation must still be `CONTACTED`, match team, organization, player, source plan, source proposal, A3 `actionKey`, and composite `openingKey`, and have `contactResponse.outcome === 'OPEN_TO_TALKS'`. Pending, refused, stale, mismatched, or closed contacts cannot proceed. The routed application service rebuilds current GM workflow and BS10C intelligence before assessment, then the preparation rechecks free-agent status, active negotiation conflicts, payroll, responsibility, and available contact evidence.

Formal-offer execution is distinct from `initiateNegotiationContact` and recommendation responsibilities. The new `submitPlayerContractOffer` responsibility supports user-controlled or explicitly delegated execution by eligible roster leadership/cap-contract staff. Normal responsibility enrichment creates its vacant user-controlled row without delegating an AI holder. A user-controlled team receives a distinct USER preparation owner; an AI team requires a current, eligible delegated holder. The prior contact owner does not authorize the offer.

Governance remains `UNKNOWN`. `PLAYER_BUDGET` is budget authority/context and does not prove approval of an individual player's proposed contract. This milestone creates no Governance request or decision type. Payroll affordability is a separate hard constraint; Finance V2 remains contextual and does not block based only on `STRESSED` or `CONSTRAINED`.

## Model and readiness

`FormalOfferPreparation` is an immutable derived result exposed through `assessRoutedFormalOfferPreparations`. It is not saved. The model reports the same negotiation ID, offer proposals and their authority labels, unresolved role and fee, current payroll affordability, formal-offer owner, unknown Governance authority, missing information, blockers, and reasons.

Readiness reports `STALE`, `CONTACT_NOT_POSITIVE`, `NO_EXECUTION_OWNER`, `FINANCIAL_BLOCK`, `BLOCKED`, or `MORE_INFORMATION_REQUIRED` as applicable. It never reports ready while role, fee, Governance, or any other mandatory field/authority is unknown. `READY_TO_SUBMIT_OFFER` is reserved for a future state in which all required offer fields, affordability, execution owner, Governance, positive contact, current availability, and conflict checks pass.

## Lifecycle and boundaries

The A3 action key and composite opening key are retained on the existing contact. BS10D-E must advance that exact `CONTACTED` negotiation to `OPEN`, revalidate all source and authority state immediately before mutation, and preserve the distinct contact actor and offer actor. No second acquisition attempt should be created. `agentCounter` accepts the same salary, years, role, and fee field shape; counter behavior remains out of scope.

No UI action was added because the inspected Analysis view has no existing route for this preparation model. The derived application service is available for a later presentation. No offer intent, draft, Governance request, Finance proposal, OPEN negotiation, counter, acceptance, signing, contract, roster change, or player transaction is created here. Hidden external ratings and `MarketReality` are not read by the offer preparation; only current club-known evidence is used.

## Findings and next step

- **P0:** None found in the reviewed read-only path.
- **P1:** Incoming role, opening agent fee, and individual-offer Governance authority remain unresolved and block readiness.
- **P1:** BS10D-E must resolve `openNegotiation` actor attribution so an independently authorized offer owner can submit against the contact while retaining the original contact actor. It must also preserve the same action/opening identity and reject unknown mandatory fields or authority.

BS10D-E is not yet safe to submit an offer: the role, fee, and Governance authority are intentionally unresolved. The preparation proves exactly what the club can currently propose from its knowledge (salary and term where known), and keeps that distinct from affordability, execution responsibility, and institutional approval.
