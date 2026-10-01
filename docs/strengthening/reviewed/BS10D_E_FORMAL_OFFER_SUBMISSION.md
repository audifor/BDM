# BS10D-E Canonical Formal Offer Submission

## Mutation boundary

`submitPreparedFreeAgentOffer` is the Application use case. Its input is only `teamId`, `negotiationId`, and `expectedProposalId`; a caller cannot authorize mutation with a saved/stale preparation object. The service recomputes the routed proposal and `FormalOfferPreparation`, checks exact current negotiation identity, requires `READY_TO_SUBMIT_OFFER`, derives the current actor, and calls `MarketEngine.openNegotiation` for the only persistent transition.

The Engine independently checks team and organization, player existence/free-agent status, exact canonical CONTACTED record, source/action/opening identity, positive contact response, contact attribution presence, salary/term/optional fee shape, payroll, actor authority, and active negotiation uniqueness. It does not own GM planning. The Application caller is the authority for rebuilding that live route.

## Terms and contact history

A successful transition persists exactly the current D2 prepared annual salary and term years. It copies optional role and fee only when the current preparation supplies them; neither is defaulted. Governance approval is not requested for a nonbinding OPEN. `PLAYER_BUDGET` remains budget-envelope authority, and `PLAYER_CONTRACT_SIGNING` is not read or consumed.

The same negotiation record retains `contactResponsibleActor`, `contactResponse` including positive outcome/date/signal reference, `startedOn`, ID, `actionKey`, `openingKey`, `sourcePlanId`, and `sourceProposalId`. It gains `offerResponsibleActor` and `offerSubmittedOn`. `startedOn` remains the original contact date; `offerSubmittedOn` is the current game date at submission. A first offer uses round 0. Legacy offers can omit `offerSubmittedOn`; no date or missing legacy actor is inferred.

The Engine checks payroll again using the exact prepared salary immediately before mutation. It never regenerates salary, selects a fallback term, calls `getFreeAgentMarketTerms`, or reads hidden player ratings. It changes only the canonical negotiation; contracts, role promises, payables, roster, transactions, Governance, Finance, and MarketKnowledge remain untouched.

## Authority and lifecycle

For a user-controlled team, the explicit Application call records USER as offer actor; the user team is never auto-submitted. For an AI team, current `submitPlayerContractOffer` must resolve to an eligible delegated staff holder and that exact staff ID is persisted. Contact or recommendation authority alone does not suffice, and no delegation is created automatically.

The application day advance runs a bounded AI checkpoint immediately after the Calendar contact-response phase. It considers only AI CONTACTED records with positive responses recorded on the current game date, then invokes the same revalidating use case. It does not poll every team's plans each day or retry older positive contacts when unrelated market knowledge changes. A future market-knowledge ingress/checkpoint can explicitly retry those contacts. The direct Engine calendar primitive remains free of Application offer behavior.

This checkpoint adds no action-required breakpoint. It records only a transient phase diagnostic for an AI offer submitted; OPEN itself remains informational.

## Retry behavior

An exact current attempt already in OPEN returns `ALREADY_SUBMITTED` with the unchanged world when current routed terms, identity and recorded actor match. It creates no duplicate. Changed terms, actor, or identity under the same OPEN attempt return `LIFECYCLE_CONFLICT`; this is not a counteroffer. COUNTERED, ACCEPTED, REJECTED and CLOSED states are never reopened. Pending, refused or closed contacts return `CONTACT_NOT_POSITIVE`; stale routes, unavailable owner and insufficient payroll return their structured statuses without mutation.

## BS10D-F handoff

BS10D-F can add player/agent responses and counters against the same OPEN negotiation. It should retain contact response and offer attribution/date, preserve round progression, and permit counters to introduce explicit role/fee terms without inventing either. ACCEPTED/REJECTED must remain negotiation outcomes only. Contract creation, RolePromise/payable effects, `PLAYER_CONTRACT_SIGNING` approval and roster mutation remain a separate later signing boundary.

## Findings

- **P0:** None found in the canonical offer submission path.
- **P1:** AI clubs without explicit `submitPlayerContractOffer` delegation remain unable to submit, by design/configuration.
- **P1:** Existing Market UI direct signing and AI minimum-roster repair still bypass the formal offer/signing path; BS10D-E deliberately does not change `maintainAiTeamMinimumRosters`.
- **P1:** AI positive contacts that are not READY today are not automatically retried after later knowledge changes; a future explicit knowledge/planning checkpoint can cover that case.