# BS10D-A3 Negotiation Contact Authority

## Decision

The user can initiate non-binding contact for the user's club at the application boundary. AI clubs can initiate contact only through an explicitly delegated, valid `initiateNegotiationContact` staff responsibility. A staff title, an advisory `recommendSignings` recommendation, and `organizational` mode alone do not grant AI execution authority.

Initial contact is operational and does not require Governance approval in the current model. It asks about interest and creates no salary or contractual commitment. Formal offers and signings retain independent, unresolved authority boundaries.

## Responsibility audit and ownership

The existing Responsibility registry separates `userControlled`, `delegated`, `advisory`, and `organizational` modes. Delegated execution engines require an explicit row, eligible role, current staff/team assignment, and live holder. Advisory outcomes are recommendation-only. Organizational mode has no staff holder and no current contact execution consumer.

`recommendSignings` remains recommendation-only: it supports user-controlled, advisory, and organizational ownership, and has no delegated mode. `shortlistPlayers` curates candidates; `contractRecommendation` is not incoming-contact execution; `tradeRecommendation` concerns a separate route.

A new ecosystem-neutral `initiateNegotiationContact` responsibility is justified to represent this distinct operational step. Its eligible roles are General Manager, Assistant General Manager, Director of Basketball Operations, and Sporting Director. It supports the existing responsibility modes, defaults to user-controlled, and only `delegated` with a valid staff assignment authorizes AI contact. This responsibility conveys no offer or signing authority.

## Contact authority model

`resolveNegotiationContactAuthority` returns a derived, read-only projection containing team, authority status, execution mode, truthful staff ID/role when available, responsibility kind, Governance requirement, reasons, and blockers. Its statuses are `AUTHORIZED`, `USER_CONTROLLED`, `NO_EXECUTION_OWNER`, `BLOCKED`, and `UNKNOWN`. Governance is returned independently as `NOT_REQUIRED` for initial contact. Neither is persisted.

For an AI team:

- Valid delegated responsibility and assignment: `AUTHORIZED` with the exact staff holder and assigned role.
- Missing execution row, user-controlled, advisory, or organizational row: `NO_EXECUTION_OWNER`.
- Missing/mismatched staff record, team assignment, active date, or eligible role: `BLOCKED`.
- Staff seniority or job title alone: no authority.

For the user's club, the user is `USER_CONTROLLED` even when no AI staff execution holder exists. Contact does not need an AI staff holder for the user's action.

## Governance boundaries

Contact has `governanceRequirement = NOT_REQUIRED` and Governance status `NOT_REQUIRED`. The current Governance model has budget and planning decision types but no initial player-contact decision type. `PLAYER_BUDGET` and `BUDGET` remain budget authority; `EXTERNAL_ACQUISITION` remains planning context. None is silently promoted into contact authority.

Formal-offer Governance remains unknown/unresolved until a concrete offer authority is modeled. Signing Governance remains a later boundary. `AUTHORIZED` contact does not mean an offer may be opened or a player may be signed.

## Contact and formal-offer readiness

Contact readiness now requires the exact BS10C free-agent preferred candidate, a matching live GM plan for the same team and need with `EXTERNAL_ACQUISITION` selected, current free-agent status, no active club/player negotiation, no duplicate attempt, a stable attempt key, and user or valid delegated execution authority. A missing/stale plan blocks contact readiness.

Contact does not require expected salary, selected term, role, agent fee, or payroll affordability. This keeps non-binding contact distinct from negotiating an offer.

Formal-offer readiness is unchanged in purpose and remains `MORE_INFORMATION_REQUIRED` or otherwise blocked when salary, selected term, role, agent fee, offer responsibility, offer Governance, or affordability is unresolved. It may remain not ready while contact is ready.

## Attempt identity and retries

The market-intelligence projection owns derivation of the future caller's `actionKey` through pure `deriveNegotiationAttemptKey`. The identity consists of current plan ID, exact BS10C proposal ID, and a deterministic generation derived from matching closed history. No time, random UUID, retry count, or hidden player/market truth is used.

Unchanged plan/proposal/world history produces the same key on every retry. A new plan/proposal produces a different key. A renewed pursuit after a matching contact/offer closes increments the generation, so it is a new attempt even when the same plan/proposal is explicitly reused. Active `CONTACTED`, `OPEN`, or `COUNTERED` history blocks another contact for the same team/player. Closed history is retained and remains addressable.

Matching history requires team, player, source plan, and source proposal. Older closed rows that lack these source identifiers are not attributed to a modern attempt and do not block it. BS10D-B must save the derived `actionKey`, `sourcePlanId`, and `sourceProposalId` on the canonical contact so later closure can distinguish attempts.

## Legacy minimum-roster repair

The AI minimum-roster path runs through world repair and is bounded to restoring rosters below five, but it directly signs free agents using organizational candidate valuation and bootstrap market terms. It bypasses ordinary BS10B/BS10C proposal and contact authority. It is classified **C — ambiguous**: an emergency repair trigger with ordinary roster-building/signing behavior. A3 leaves this BS4 path unchanged; BS10 ordinary acquisition must not use it as its contact or offer route. Clarification remains P1.

## UI and persistence

The Analysis inspection now displays contact readiness, authority status, resolved contact owner when truthful, and that contact Governance is not required. It keeps formal-offer readiness and missing terms visible. There is no contact or offer action button.

Authority and attempt identity are derived only. A3 persists no `ContactAuthority`, `AttemptIntent`, `PendingContact`, contact, offer, contract, transaction, Governance request, or Finance proposal. The first persistent acquisition state remains the future canonical `ContractNegotiation` with status `CONTACTED`.

## BS10D-B mutation contract

BS10D-B may create exactly one canonical `CONTACTED` record only after revalidating the current team, organization, player free-agent status, current plan/proposal identity, no active team/player negotiation, current contact authority, and current attempt key. It must store the exact derived action key plus source plan/proposal and truthful `responsibleActor` (`USER` or the resolved staff ID). It must be idempotent for the same key and reject a different key while an active negotiation exists.

The contact record contains no salary, years, role, agent fee, contract, signing, transaction, trade, transfer, Governance request, or Finance proposal. It must not invoke formal-offer or signing seams. Contact authorization is not offer authorization or signing authorization.

## Deferred work and findings

- **P0:** none for this read-only authority milestone.
- **P1:** formal-offer and signing execution/Governance authority remain unresolved.
- **P1:** default AI responsibility rows do not provide autonomous contact ownership until delegated explicitly.
- **P1:** minimum-roster repair remains an ambiguous direct-sign overlap; preserve its repair scope and clarify before changing it.
- **P1:** legacy closed negotiations without source metadata cannot be mapped to a modern attempt generation.

Later milestones must separately decide formal-offer terms/role/fee authority, offer execution authority, signing conversion and Governance, counters, acceptance, and the relationship between repair and ordinary roster building.
