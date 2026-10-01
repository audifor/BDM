# BS11B Contract Review Decisions

## Purpose and audit

BS9 owns club needs; BS11B records a club's explicit intent about an eligible contract need. A `CONTRACT_CONTINUITY` need means that a contract needs attention. It does not mean that the club has chosen to retain the player. The audit and current ownership findings are in [BS11B_CONTRACT_REVIEW_DECISIONS_AUDIT.md](./BS11B_CONTRACT_REVIEW_DECISIONS_AUDIT.md).

`contractRecommendation` and `recommendSignings` remain advisory. No safe AI responsibility accepts contract recommendations as retention decisions, so this milestone records only user decisions for the user's controlled club. No new responsibility or staff proxy is introduced.

## Eligibility and identity

A review is derived for each canonical BS9 `CONTRACT_CONTINUITY` need whose evidence identifies an active, unresolved key-player contract expiry. The player must remain on that contract's team roster, and no continuous same-team successor contract may already cover the expiry. BS9 `CONTRACT_CLUSTER` remains an aggregate need; its eligible player contracts create separate review candidates.

The deterministic decision identity is `teamId + playerId + current contractId`. Repeated decisions replace the existing record for that unresolved contract. A successor contract creates a new identity. Candidate status, BS11A roster/contract horizon, role, continuity risk and need evidence are derived at read time; none is cached in the save.

## Intent categories

| Intent | Meaning | Does not do |
| --- | --- | --- |
| `PURSUE_EXTENSION` | The club wants to attempt retention beyond the current term. | Create terms, salary, a negotiation, approval or a successor contract. |
| `ALLOW_EXPIRY` | The club currently does not intend to pursue a successor contract. | End the current contract early or suppress succession needs. |
| `REVIEW_RELEASE` | Consider whether to end the active contract early. | Call `releasePlayer`, terminate a contract or start outgoing-market activity. |
| `DEFER` | Revisit the decision at the next actual season start/end checkpoint for the team. | Permanently dismiss the review or mutate the contract. |

The defer date is selected from canonical Season start/end dates after the decision date and no later than expiry. If none exists, expiry is the revisit/closure date. On that date the same review becomes actionable again. The four values are intent, not execution authority.

## Ownership and information boundary

Only the coach controlling the requested team may submit a decision through the application command. AI teams show derived evidence but receive no persistent autonomous intent: existing recommendation responsibility is advisory, and there is no truthful decision owner for this action. Missing ownership therefore fails closed.

Review context is limited to current own-club information: contract and roster truth, BS9 strategy/need evidence, BS11A role/use, age/development, continuity and Finance payroll context. Role/use does not imply renewal value; age/development does not forecast future ratings; Finance does not price unknown terms. No hidden future ratings, universal renewal score, external MarketReality, generated salary demand or affordability estimate for unknown terms is used.

## BS9, BS10, Finance and Governance

BS9 remains the needs authority. Neither pursuit nor allow-expiry resolves `CONTRACT_CONTINUITY`; a real successor contract is required to remove the unresolved expiry. Allow-expiry may coexist with succession or acquisition planning. This layer creates no BS10 contact, offer, trade or signing action. `REVIEW_RELEASE` remains separate from outgoing-market review and from the explicit `releasePlayer` mutation.

Finance remains authority for actual salary/payroll. No new compensation is inferred. Planning intents create no Governance decision and do not consume `PLAYER_CONTRACT_SIGNING`; any future binding signing path remains separate.

## Timing, invalidation and breakpoint

BS11B uses the existing BS9 365-day contract review horizon, including its established urgency bands; it adds no arbitrary interval. Ordinary material planning triggers could miss the day a contract first enters that horizon, so the user club gets one deterministic `IMPORTANT` breakpoint at exact horizon crossing. It is nonblocking, aggregated per team/date and does not trigger a daily planner recomputation. A due deferred review also produces an `IMPORTANT` notice.

Review projection closes or marks old intent historical when a successor appears, the player leaves the team, the contract expires or terminates, or canonical BS9 evidence no longer identifies the live need. Role/strategy changes refresh evidence; they do not silently overwrite an explicit decision. Stale records cannot enable negotiation or release.

## Persistence and observability

Save V4 persists only explicit intent: team, player, current contract, intent, decision date, user coach and (for `DEFER`) revisit date. Save V4's collection is optional for backward compatibility; older V4 payloads load with no decisions. Candidate projections and review readiness are reconstructed from source-of-truth state.

Analysis shows a contract outlook for each team. The user's eligible reviews expose the four decision controls when the application callback is present. AI cards display no controls and indicate that autonomous intent is unavailable. Status and expiry evidence are advisory; no salary terms or negotiation UI is presented.

## BS11C handoff and findings

BS11C may consume persisted `PURSUE_EXTENSION` as a trigger for a separately governed negotiation lifecycle. It must define negotiation participants, information access, term/salary proposal authority, player response/counters, signing Governance, contract activation, and cleanup on withdrawal, expiry or successor creation. The other intents remain planning only until their separate actions are explicitly modeled.

- **P0:** None found in the reviewed contract-review lifecycle.
- **P1:** Extension/re-sign negotiation and its salary, player response, signing and activation lifecycle remain unimplemented. AI contract-intent decision ownership also remains unavailable. These are outside BS11B and are explicit BS11C/future planning gaps.
