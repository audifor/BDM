# BS10D-B Free-Agent Contact Creation Audit

## Scope

BS10D-B adds one canonical application/Engine path that creates a term-free `CONTACTED` negotiation after recomputing current GM workflow, BS10C proposal, player status, and A3 contact authority. The existing formal-offer path, signing path, market knowledge, repair route, and Governance remain separate.

## Mutation seam and authority

`ContractNegotiation` already has a `CONTACTED` union branch with no salary, years, role, agent fee, or round. The Domain constructor `createNegotiationContact` builds the immutable record and its ID from the A2 opening identity, but accepts no GameWorld and cannot verify club, player, free-agent, actor, or active-attempt invariants. It is a record constructor, not a mutation authority.

`MarketEngine.openNegotiation` is the existing canonical formal-offer mutation. It requires offer terms, checks affordability, transitions a matching CONTACTED record to OPEN, and enforces active team/player uniqueness for a new offer. It is not suitable for this milestone because it either creates an OPEN offer or transitions a contact to one.

The canonical A3 execution check lives in `resolveNegotiationContactAuthority`; A3's `deriveNegotiationAttemptKey` derives the exact stable action identity. BS10D-B composes those read-only authorities with one new GameWorld-aware Engine contact mutation, called only through an explicit Application service. The record retains the raw A3 `actionKey` verbatim and the existing composite `openingKey` used for canonical negotiation identity.

## World validation, idempotency, and active uniqueness

`GameWorld` indexes negotiations by ID and enforces one active negotiation per player/team (falling back to organization for legacy rows). It does not currently validate negotiation references or distinguish contact authority. The Engine mutation validates team and organization, player existence/current free-agent status, command shape/source IDs, truthful actor, action key, and active uniqueness before updating the world.

For the deterministic negotiation ID derived from the exact action key, an exactly matching existing `CONTACTED` record is `ALREADY_EXISTS` and returns the same `GameWorld` reference. New records retain the raw A3 `actionKey` and the composite `openingKey`; pre-B contact records with a matching `openingKey` remain retry-compatible. An active record under another key is `ACTIVE_NEGOTIATION_EXISTS`; an occupied ID that does not represent the same contact is blocked. Closed records are retained and do not prevent the A3-derived later key from creating another contact.

## Save, events, breakpoints, and observability

Save V2 already serializes the Market runtime's negotiations, and focused Save V2 coverage round-trips a term-free contact alongside a formal offer. No schema or migration change is needed.

There is no negotiation/contact event stream today. The negotiation record itself already carries start date, opening key, actor, and source plan/proposal, which is sufficient traceability without a parallel event authority. Simulation breakpoints do not currently inspect negotiations. Autonomous AI contact requires no user decision, so it should not create an `ACTION_REQUIRED` breakpoint. The existing Analysis panel already surfaces negotiation lifecycle status; it can minimally display the canonical contact date/actor and that no offer has been submitted.

## Application and lifecycle integration

`assessRoutedFreeAgentOfferIntelligence` recomputes the current routed proposal chain from current GM workflow and current world data. The Application mutation service accepts a team and the caller's expected proposal ID as an identity selector, then recomputes current state; it never accepts a stale proposal or readiness object as authorization. For user calls, the service remains explicit and is not invoked by simulation.

`reviewClubManagementPlanning` is the existing material GM planning checkpoint, called at setup/preseason, explicit review, roster changes, injuries, and contract changes. `initializeAiClubManagementPlanning` is the career-construction checkpoint. These attempt ready AI contacts after current plans are established. Ordinary `advanceGameDay` does not run this checkpoint without a material trigger. A checkpoint retry is safe because the application result is idempotent and the world itself rejects duplicate active attempts.

AI execution remains opt-in per club: only a valid delegated `initiateNegotiationContact` row with a current eligible staff assignment can act. No responsibility is automatically created or changed. Default AI teams without delegation remain unable to contact; this is a P1 configuration gap, not a reason to bypass A3.

## Duplicate mutation risks and boundaries

The domain record constructor is public and `GameWorld` can be rebuilt by any application boundary, so every production contact caller must converge on the new Application service and the Engine mutation. The checkpoint integration has one helper invoked from explicit planning lifecycle paths, with no daily polling. It does not call `openNegotiation`, `signFreeAgent`, create Governance/Finance state, or update `MarketKnowledge`.

The minimum-roster repair path remains a separate ambiguous repair behavior. BS10D-B does not modify or reuse `maintainAiTeamMinimumRosters`.

## Findings

- **P0:** none in the existing term-free record or Save V2 representation.
- **P1:** default AI responsibility configuration does not delegate contact; those clubs will correctly remain unable to contact.
- **P1:** formal-offer and signing authority/Governance remain unresolved and are not implied by contact.
- **P1:** the minimum-roster direct-sign repair path remains an ambiguous, separate overlap.
