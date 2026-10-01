# BS10E-C Trade Negotiation Audit

Status: audit decision — add a separate persisted, nonbinding club-to-club negotiation with immutable package revisions. This milestone does not execute assets.

## Inspected areas

Inspected `TradePackageIntelligence`, `TradeProposal` / `TradeRecord`, trade assets and rules, `tradeRecommendation`, `negotiatePlayerTrade`, `executePlayerTrade`, organization and market knowledge, organization-scoped player evaluation, GM needs and outgoing review, responsibility resolution, breakpoints, Save V2/V3/V4 layering, free-agent offer/counter patterns, Trade Center, TradesWorkspace, and staff recommendation acceptance.

`ContractNegotiation` persists a player/agent contract discussion and signing path. It is not a club-to-club negotiation and is not reused. `TradeProposal` remains an ephemeral validation/execution command. `TradeRecord` remains completed asset history.

## Decisions

1. **Negotiation identity.** Keep a stable `pursuitId` separate from negotiation and package-revision identities. `TradePackageIntelligence` already distinguishes pursuit from package composition.
2. **Revision identity.** Each package revision has its own deterministic identity and composition identity over sorted participants, directed movements, retention, exceptions and active contract snapshots. Revisions append; prior facts remain unchanged.
3. **Participant model.** Persist a participant array and require explicit acceptance from every participant. The production initiation path is two-team because current package intelligence is 1:1; the domain is not narrowed.
4. **Actor authority.** A USER actor is valid only for the team controlled by `userCoachId`. A STAFF actor must be the team's current eligible delegated `negotiatePlayerTrade` holder. Resolve authority independently for every action.
5. **Proposal semantics.** PROPOSED is one exact, nonbinding package presented to counterparties. It is not acceptance, Governance approval or execution. Persist only package facts and active player contract snapshots needed for live revalidation.
6. **Rejection semantics.** A counterparty rejection appends an attributed action and ends the negotiation as REJECTED. Retain history and create no TradeRecord.
7. **Counter semantics.** A counter appends a newly validated revision inside the same negotiation and pursuit, with the same participant set. Previous acceptance remains historical and never carries to the new revision.
8. **Agreement semantics.** AGREED requires one ACCEPT action from every participant on the exact current revision. Agreement moves no asset and creates no Governance decision.
9. **Multi-team implications.** The persisted participant and acceptance collections naturally generalize to N clubs. The first application entry point explicitly supports two clubs only.
10. **Multi-asset implications.** Revisions preserve arbitrary directed trade movements, retention and exception uses. Cash is rejected as `CASH_SETTLEMENT_UNAVAILABLE` because settlement is unsupported.
11. **Counterparty evaluation authority.** Each club uses only its own `negotiatePlayerTrade` responsibility. The proposer actor cannot act for the counterparty; team A cannot borrow team B's authority.
12. **AI acceptance-policy evidence.** There is no defensible autonomous accept/reject/counter policy. `deriveOrganizationPlayerValuation` uses synthetic priors for unknown dimensions and is not a fairness model. GM needs and outgoing review do not establish another club's willingness.
13. **Knowledge boundaries.** Organization and market knowledge are scoped. Do not inspect global `MarketReality`, truth ratings or other organizations' estimates to decide a club response.
14. **Timing.** Proposals, counters and acceptances revalidate current season/ecosystem, open trade window, assets, active contracts, eligibility, retention and exceptions. Closed or unconfigured windows block progress while preserving the negotiation as history.
15. **Idempotency.** Deterministic negotiation/revision/action identities and exact request-content checks prevent duplicates. A conflicting retry or stale revision returns without mutation.
16. **Persistence.** Add an optional `tradeNegotiations` collection in market runtime. Missing legacy collections default to empty; present records are strictly parsed. Keep the save schema version unchanged.
17. **User interaction.** Trade Center can submit a package, inspect negotiation state and revisions, and accept, reject, withdraw or counter with the currently built package. Store actions derive the controlled team and use USER attribution; the screen cannot choose another acting team.
18. **AI interaction.** No autonomous response caller is added. Non-user response readiness is `MORE_INFORMATION_REQUIRED`; proposals remain pending absent an authorized explicit action.
19. **Governance handoff.** An AGREED negotiation exposes the exact `negotiationId` and `currentRevisionId` for future approval. Commitment Governance remains a separate authority from negotiation.
20. **Exact remaining execution gap.** BS10E-D must authorize the exact agreed revision through every participating club's Governance, revalidate the complete package and atomically mutate rosters, contracts, picks, rights, retention, exceptions and completed history. Finance ledger settlement must precede any cash support.
