# BS9D-B AI option selection audit

## Existing decision and plan authorities

- `assessClubNeeds` and `assessClubStrategy` derive needs and strategy. `assessGMDecisionContext` composes them with staff style, knowledge, Governance policy, execution readiness, and BS9C's stable response ordering. It is a read-only projection and is the required selection input.
- `ClubStrategicState` stores an accepted club direction and its review/transition memory. It is strategy-level state and cannot identify a preferred response family for an individual need.
- `TeamGamePlan` is match tactics. It is separate from broad roster, contract, scouting, or financial management.
- `CalendarEngine.advanceDay` coordinates multiple daily processors, but BS9D-B has no reviewed cadence contract that justifies invoking GM selection each day. The new review API remains explicit for a future caller.

## Persistent recommendation and decision memory

- `MemoryRecord` is owner-perspective narrative and relationship memory. It is not a current management preference and its decay/relevance semantics are unsuitable for an active plan.
- `DelegationOutcome` records staff recommendations, commonly with concrete targets and acceptance/application seams. Reusing it would conflate broad AI planning with an advisory or accepted action.
- Recruiting boards, recruiting advisories, medical advisories, and finance decision proposals are workflow- or domain-specific and can carry exact targets, proposals, or action authority. They are not broad GM plan memory.
- No existing per-team/per-need response-family selection memory was found.

## Action intents, pending work, and approvals

- Transaction, negotiation, contract, recruiting, and Governance request/event collections represent concrete actions, proposals, or formal approval workflows. They must remain untouched by broad plan selection.
- `AiRosterMaintenance` signs free agents as an AI recovery action. It is a separate action authority and is not a planning selector.
- BS9D-A2's `planningEligibility` and `executionReadiness` already distinguish whether a broad option may be selected from whether a later concrete action is authorized. BS9D-B must preserve both values and must not create requests, approvals, or actions.

## Reuse opportunities and duplicate-authority risks

- Reuse exactly the ordered `GMDecisionContext.options` output. Its option order already reflects BS9C's alignment, feasibility, staff-style, knowledge, and stable-family ordering.
- Persist only a small `GMPlanState` keyed by team and need. Do not copy the context, need, factors, alternatives, or any external player information.
- Reusing narrative memory, strategic state, advisory outcomes, a match plan, or a transaction/request record would introduce a second meaning or an unintended workflow authority.
- The Save V4 serializer appends explicit additive collections to the V3 compatibility payload. Its deserializer strips V4-only fields before V3's exact-key parser, then attaches the optional collections. This supports an optional `gmPlanStates` collection while keeping Save V4 and defaulting older V4 and prior saves to no plans.

## Gap BS9D-B fills

There is no canonical broad management response selection for an AI club, no per-need plan inertia, and no explicit review seam. BS9D-B will provide a pure deterministic selector and an application review function. The application function persists selected plans for AI teams only; for the user's team it returns recommendations without changing plan memory. It does not wire daily orchestration or resolve concrete actions.
