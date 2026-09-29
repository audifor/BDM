# BS9D-B · AI GM option selection

## Audit findings

The audit in `BS9D_B_AI_OPTION_SELECTION_AUDIT.md` found no per-team, per-need broad-response memory. Club strategy records store accepted direction; narrative memories, delegation/advisory outcomes, match plans, and market or Governance workflow records each have different ownership and authority. BS9D-B therefore adds a separate minimal `GMPlanState` collection.

## Selection authority and algorithm

`reviewGMPlans` calls `assessGMDecisionContext` once and passes its ordered options to the pure `selectGMPlans` function. BS9D-B does not reconstruct needs, strategy, financial or scouting feasibility, staff style, knowledge, or Governance policy. It groups the options by need and picks the first `planningEligibility === 'SELECTABLE'` option in BS9C order. It creates no plan for needs BS9C did not give options, and selects at most one option per need.

Execution readiness is not a candidate filter. `UNKNOWN_AUTHORITY` and `REQUIRES_APPROVAL` remain selectable, and their current values appear on derived recommendations. `NOT_SELECTABLE` options are excluded. A need with no selectable option has no plan.

## Plan model and persistence

`GMPlanState` stores a stable Team/need key, response family, selection and last-review dates, the selection reason, readiness at selection, strategy at selection, and original BS9C option priority. It stores no need body, context, alternatives, ratings, action, approval status, player ID, valuation, or target. This is active planning memory and is not a transaction or pending action.

The collection is additive in Save V4. V4 serialization writes the plans; V4 deserialization accepts missing `gmPlanStates` as empty and strips the field before V3 compatibility parsing. Save V1-V3 loads also start with no plans. Save schema version remains 4.

## Inertia, invalidation, and review triggers

A routine review retains a prior plan while its source need/options remain, the chosen family remains selectable, and strategy is unchanged. Reordering options or unrelated world changes do not replace it. The current readiness and explanation are reconstructed from the current context, while readiness and priority in the stored state remain historical selection facts.

The selector drops a plan when the need disappears, its option disappears, or it becomes blocked. A strategy change or explicit material trigger causes deterministic reselection from the current eligible options. Reasons identify initial selection, retention, source resolution, option removal/blocking, strategy change, material context change, or no selectable option. If no alternative is eligible, no stale state is returned.

The explicit trigger contract includes routine review, strategy transition, material roster change, major injury, contract deadline escalation, material financial change, Governance change, and explicit reevaluation. Calendar advancement does not call the review function. A future caller such as BS9E decides when a review is due.

## User and AI authority

For an AI club, the application service replaces only that team's plan collection with the selected broad preferences. For the user club, the same context/selector returns `USER_RECOMMENDATION` output and returns the original world unchanged. The service has no action resolver and does not create a pending action.

The output includes need ID, chosen family, original priority, planning eligibility, current execution readiness, selection reason, the existing BS9C alignment factors, and unselected response-family alternatives. It includes no exact player target. No Analysis UI consumer for BS9C was present in the audited code, so this milestone exposes the review/inspection API result; a UI can consume it later without receiving a mutation control.

## Governance, action, and BS9E boundaries

`UNKNOWN_AUTHORITY` permits a plan and remains visible for BS9E. `REQUIRES_APPROVAL` permits a plan but creates no request or approval. A blocked family cannot remain selected. `WAIT_AND_MONITOR` and `SCOUTING_EXPANSION` are ordinary broad plan choices; neither triggers work here.

Review changes only `gmPlanStatesById`. Transactions, contracts, Governance records, rosters, finances, scouting assignments, and delegation outcomes are not changed. BS9E must use the selected response family and need as routing context, re-resolve the present authority/readiness, and then decide whether an approval, action workflow, or wait is appropriate. Readiness stored at selection time is historical and never authorizes later execution.

## Multiple needs, determinism, and coordination

Each qualifying need can hold one plan. Plans are emitted in stable need-ID order; option selection uses BS9C order and has no random draw or additional score. The same context, trigger, and existing plans produce the same result. No cross-need conflict policy is introduced; future orchestration can sequence legitimate plans.

## P0/P1 findings

- **P0:** None found in the BS9D-B selection and persistence boundary.
- **P1:** The result API exists, but no existing Analysis surface consumes BS9C, so recommendation visibility in the application UI remains future integration work.
