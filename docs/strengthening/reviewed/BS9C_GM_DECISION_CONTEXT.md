# BS9C GM Decision Context

## 1. Audit findings

BDM already models basketball operations staff roles, team responsibility assignments, advisory engines, organization-specific scouting knowledge, Finance V2, and Governance V2. The gap was a read-only projection connecting those systems to BS9A club strategy and BS9B needs. See [the audit](BS9C_GM_DECISION_CONTEXT_AUDIT.md).

## 2. Responsible decision-maker resolution

The engine reads the canonical team responsibilities for signings, shortlists, contracts, and trades. A participant is included only when the recorded holder, `StaffPerson`, live team assignment, and role eligibility agree. Multiple real participants are listed with their role and responsibility kinds. A missing or invalid assignment yields `ORGANIZATIONAL_FALLBACK`; no GM identity is synthesized. This identifies configured advisory participants and does not grant execution or institutional authority.

## 3. Organizational strategy boundary

Strategy comes from the same BS9B needs assessment (accepted club mode, with its existing candidate fallback). It remains attached to the club. Staff traits only affect staff-style alignment. Financial, strategy, or Governance constraints cannot be raised by a staff preference.

## 4. Staff-style inputs

The model reuses existing `Personality` ambition, competitiveness, and temperament values for modest, transparent response-style signals. Market-facing options use ambition/competitiveness; patient internal-development or monitoring options use the existing conservative/aggressive temperament signal. No new GM philosophy fields or GM Overall are introduced. Missing personality data is `UNKNOWN`.

## 5. Needs integration

`assessClubNeeds` is called directly for both user and AI teams. High/critical and immediate/soon needs receive options; an actual positional surplus also receives options for SELL/REBUILD strategy. Need evidence, dates, confidence, urgency, temporal scope, and financial posture remain separate from response feasibility.

## 6. Response option model

Each option has a stable ID, source need ID, broad family, priority within that need, strategic alignment, staff-style alignment, feasibility, confidence, knowledge readiness, financial context, structured reason codes, and blockers. Priority is generated from the visible rating order (strategy, feasibility, staff style, knowledge, then fixed family order); it is not an opaque score or an action selection.

## 7. Implemented response families

- `INTERNAL_ROLE_REALLOCATION`
- `INTERNAL_DEVELOPMENT`
- `EXTERNAL_ACQUISITION` (no target selection)
- `SHORT_TERM_COVER`
- `CONTRACT_RETENTION_REVIEW`
- `SUCCESSION_PLANNING`
- `OUTGOING_MARKET_REVIEW` (no outgoing player selection)
- `FINANCIAL_CONTAINMENT`
- `SCOUTING_EXPANSION`
- `WAIT_AND_MONITOR`

Families are emitted only for compatible need kinds; this does not represent a pending action.

## 8. Finance context

The engine reuses BS9A/BS9B financial pressure and posture. Stressed or constrained posture lowers external acquisition feasibility but never deletes the need. Internal options use roster depth already surfaced by BS9B. BS9C does not calculate salary, contract affordability, cap space, or a transaction budget.

## 9. Governance and approval boundary

Open, unresolved Governance V2 requests associated with the team’s institution and broad roster/strategy/budget categories appear as blocker codes. This is a warning that canonical Governance work is pending, not a new approval rule. BS9C does not derive permission from Board pressure or the absence of a grant, and it cannot grant authority.

## 10. Scouting knowledge integration

External knowledge readiness is aggregated from the club organization’s existing `OrganizationKnowledge` coverage dimensions for non-own roster subjects. Readiness uses broad coverage bands and produces no subject IDs, estimates, player rankings, or named targets. Sparse knowledge raises the alignment of `SCOUTING_EXPANSION`; its high feasibility places it ahead of external acquisition when the other visible factors tie.

## 11. Hidden-truth protection

Response options do not read external `Player` ratings or potential, and do not invoke the target-selecting `BasketballOperationsAdvisory` or its valuation/market routines. The focused test changes an external player’s truth ratings and confirms that the context’s knowledge-readiness signal stays tied to the same organization knowledge. The underlying BS9B assessment still performs its existing competition-relative impact comparisons; removing any indirect influence of those comparisons requires a separate needs-model decision and is recorded as P1 below.

## 12. Prioritization

Urgency and need severity remain in the needs layer. Within each need, options sort by strategic alignment, feasibility, staff-style alignment, knowledge readiness, and stable family order. Thus staff traits can distinguish close responses but cannot turn low-feasibility external acquisition into a high-feasibility option.

## 13. Determinism

Responsibilities, participants, requests, and options use explicit stable ordering. No random source is used. The same canonical inputs return the same response ordering.

## 14. Persistence decision

The context is reconstructed on demand. It is not added to `GameWorld`, save serialization, outcomes, or simulation cadence. Only future accepted decisions/actions should create persistence.

## 15. User vs AI behavior

Both use `assessGMDecisionContext`. The Analysis surface labels the user club as advisory; AI clubs receive the same option model. Neither context call nor the UI executes or accepts options.

## 16. Inspection surface

The Analysis club strategy/needs screen now shows the decision participants or organizational fallback, and broad options under each important need with alignment, feasibility, knowledge, reasons, and Governance blockers. It adds no action buttons or standalone GM dashboard.

## 17. Deferred BS9D work

BS9D may select among options for AI simulation. It must use this same context and must not reconstruct strategy, needs, or staff style.

## 18. Deferred BS9E work

BS9E may route an accepted choice through existing actions and approval paths. BS9C contains no transaction, contract, release, hiring, promotion, or rotation execution.

## 19. Deferred BS10 work

Exact player matching, player valuation, market availability, contract affordability, and trade package construction remain in Market/Trade scope. BS9C emits no external target identity.

## 20. P0/P1 findings

- **P0:** None introduced. No action execution, persistence, target selection, new authority, or Overall field was added.
- **P1:** The inherited BS9B need engine uses competition-wide player impact values for some starter/bench comparisons. BS9C does not interpret those values as scouting knowledge, but they can indirectly affect which needs exist or their order. A follow-up product/architecture decision should decide whether those comparisons need organization-knowledge bounds before AI option selection is automated. Governance currently has no general family-to-approval resolver; open requests are surfaced, while formal approval policy remains unresolved.
