# BS10D-A3 Contact Authority Audit

## Scope and sources

This audit covers who may initiate a non-binding free-agent contact. It does not grant formal-offer, contract, signing, trade, or transfer authority. The implementation was checked against the Responsibility domain and holder validation, staff roles and assignments, delegated/advisory consumers, user-facing market action boundaries, Governance V2 decision types, BS10D-A2 negotiation lifecycle, and AI minimum-roster repair.

## Responsibility architecture

`ResponsibilityDefinition` records a kind's domain, eligible staff roles, supported modes, default mode, and workload cost. `TeamStaffAssignment` is the canonical current staff-to-team/role fact. A role title alone is not a responsibility assignment and carries no action authority. Holder resolution must check the responsibility row, mode, staff person, current team assignment, assignment date, and role eligibility. The `resolveDelegatedResponsibility` helper adds personality/workload context for existing delegated engines; that context is not itself action authority.

Acquisition-related responsibilities before A3:

- `recommendSignings` permits `userControlled`, `advisory`, and `organizational`; it does not permit `delegated`. Basketball Operations produces advisory recommendations only. It does not open a negotiation or sign a player.
- `shortlistPlayers` is candidate curation, not contact execution.
- `contractRecommendation` is a recommendation surface, currently associated with retention rather than incoming contact or signing.
- `tradeRecommendation` is advisory and has a distinct trade path; it does not authorize free-agent contact.

In this architecture, `delegated` is the explicit staff execution mode consumed by delegated engines. `advisory` resolves a staff author but is surfaced for a decision, not applied as execution. `userControlled` routes action to the user. `organizational` has no individual holder and current consumers do not interpret it as a contact executor. Therefore organizational mode is not sufficient evidence of autonomous contact execution.

`recommendSignings` remains recommendation-only. Reinterpreting its advisory holder as an executor or its organizational mode as an autonomous executor would silently change its definition. A distinct `initiateNegotiationContact` responsibility is justified: the model already separates recommendation from delegated execution, no existing acquisition responsibility truthfully expresses contact execution, its eligible basketball-operations roles are ecosystem-neutral, and it does not duplicate Governance's institutional decision rights. It supports the established modes, but only a valid `delegated` row authorizes AI contact.

## Governance

Governance V2 decision types include `BUDGET`, `PLAYER_BUDGET`, and `STRATEGIC_PLAN`, among others, but have no player-contact, player-contract-offer, or player-signing decision type. `PLAYER_BUDGET` authorizes a budget domain; it does not approve a particular contact or transaction. `EXTERNAL_ACQUISITION` is GM planning and does not itself confer institutional authority. Existing mappings do not establish an initial non-binding contact gate.

The A3 decision is that initial contact is operational and **not Governance-gated**. Contact asks whether the player is interested and commits no salary or terms. There is no supported existing Governance decision type to gate it truthfully. No request or new decision type is created. Formal-offer approval and signing Governance remain separate and unresolved; contact authority never implies either.

## User and AI authority

The application identifies the user's club through `userCoachId` and that coach's team. The user is the explicit actor at the application boundary. User contact authority does not require a staff execution holder; staff responsibilities shape recommendation/delegation, not the user's ability to decide. The Analysis surface remains inspection-only in A3 and has no contact button.

An AI club is authorized only when `initiateNegotiationContact` is set to `delegated` and its named staff holder has a current `StaffPerson` and eligible `TeamStaffAssignment` for that club. General Manager, Sporting Director, and Basketball Operations titles do not authorize action without this assignment evidence. Missing responsibility/holder yields `NO_EXECUTION_OWNER`; a broken or role-ineligible assignment is `BLOCKED`. Advisory, organizational, or user-controlled rows do not authorize AI execution.

This yields an independently inspectable contact authority projection with responsibility evidence and a separate Governance requirement/status. A3 does not persist the projection.

## Negotiation and attempt identity

`CONTACTED` is pre-offer state and carries no salary, term, role, or agent fee. `OPEN` is a formal offer with those fields. `ACCEPTED` is not signing authority. The existing `ContractNegotiation` remains the only persistent negotiation lifecycle; A3 creates none.

The A2 `actionKey` had no canonical caller owner. A3 derives it in the read-only market-intelligence boundary from the current plan ID, exact BS10C proposal ID, and a generation count of closed negotiations whose team, player, source plan, and source proposal match. It uses no date, retry counter, random UUID, hidden ratings, or `MarketReality`. A retry against unchanged state has the same key. A different selected plan/proposal has a different identity. Explicit renewed pursuit after a matching attempt closes advances the generation while preserving the closed row in history.

The future caller must pass this derived key and preserve `teamId`, `playerId`, `sourcePlanId`, and `sourceProposalId` on the canonical contact. Legacy closed negotiations without those source fields remain addressable history but cannot be attributed to a modern plan/proposal generation; they do not permanently block a new attempt. Any active negotiation for the same club/player blocks duplicate contact, regardless of attempt key.

## Legacy AI minimum-roster repair

`maintainAiTeamMinimumRosters` runs through `WorldRepairCoordinator` and is bounded to restoring AI rosters below five players. It directly calls `signFreeAgent`, ranks candidates using organization player valuation, and derives bootstrap salary/term inputs from `getFreeAgentMarketTerms`. It can create a contract and transaction without BS10B/BS10C proposal, contact, or `initiateNegotiationContact` ownership.

Classification: **C — ambiguous**. Its trigger and report place it in minimum-playable-roster repair, but its candidate selection and direct ordinary signing semantics overlap roster-building acquisition. A3 leaves BS4 repair unchanged and does not route normal BS10 acquisition through it. This remains a P1 boundary to clarify before BS10D-B or a later repair milestone changes either route.

## Findings

- **P0:** none found for read-only contact authority and attempt identity.
- **P1:** formal-offer authority, offer Governance, and signing Governance remain unresolved and separate from contact.
- **P1:** AI teams with default `userControlled`/vacant contact responsibility have no autonomous execution owner until explicit delegation is assigned.
- **P1:** the legacy minimum-roster direct-sign repair path remains an ambiguous overlap with ordinary acquisition.
- **P1:** legacy closed negotiations without source metadata cannot contribute to the modern matching-attempt generation count; they remain preserved and non-blocking.
