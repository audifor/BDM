# BS13E · Staff Gameplay Manifestation

Status: **TECH READY / AWAITING VISUAL VALIDATION**

## 1. Baseline

- Branch: `bdm-stage2-bs13e-staff-gameplay-manifestation`
- Start: `1d3d5243305bc1b1d795c3613af1ffd2763fb3bb` (validated BS13C)
- BS13D remains unauthorized and was not started.

## 2. Player-facing problem

Staff quality affected Training and advice, but completed Training history exposed a raw execution multiplier and did not preserve/display the executor role or explain delegated workload context. Advisory rows also showed numeric quality and could resolve Staff role from the current assignment, rewriting historical attribution after a role change.

## 3. Evidence sources

The UI now projects from completed `ScheduledTrainingSession.execution`, immutable `DelegationOutcome` records, canonical Staff career role history, and existing target-domain consequences. No global event stream or performance rating was added.

## 4. Training manifestation

Completed session history names executor(s) and their role at execution, shows qualitative execution contribution, separates planned from effective module/intensity, and summarizes recorded development stimulus, participation, and injuries. Linked plan/intensity outcomes identify the responsible Staff, decision-time role, quality band, and whether workload was overloaded.

## 5. Training A/B validation

The strong/weak/overloaded manual experiment is documented in `BS13E_MANUAL_STAFF_VALIDATION.md`. Responsibility assignment, session definition, intensity, participants, and executor must stay fixed except for the specific variable under test.

## 6. Medical manifestation

Medical recommendations retain the existing accept/dismiss authority. The recommendation surface now shows Staff name, decision-time role where recorded, qualitative quality, recommendation details, and explicit status. Accepted recommendations continue through Medical-owned transitions.

## 7. Scouting manifestation

Scouting reports identify the evaluator and role from Staff career history as of the report date. Existing findings and knowledge limits remain the source of uncertainty; this change does not reveal hidden player ratings. Opposition report quality is shown as a band, not a raw score.

## 8. Opposition scouting manifestation

The existing opposition report recommendation identifies its Staff source/role and quality band. The advisory board continues to distinguish informational, accepted, and dismissed outcomes. Accepting the report follows the existing defensive emphasis/pace path into `TeamGamePlan`; no live match behavior was added.

## 9. Recruiting manifestation

Existing Recruiting advice remains in the Staff Advisory Board. Decision-time role and qualitative quality are surfaced there, with the existing recommendation payload and disposition. Recruiting remains authoritative for contact, offer, and signing.

## 10. Basketball operations manifestation

Existing signing, shortlist, contract, and trade advice remains attributed through its `DelegationOutcome` in the Staff Advisory Board. Decision-time role and qualitative quality are displayed. No GM decision engine was added.

## 11. Market/trade manifestation

Market negotiation history now names the recorded contact and offer actor, resolving Staff names and dated roles from career history when available. Trade negotiation history names the recorded action actor and dated role. Advisory quality is not treated as trade legality or market authority.

## 12. Staff Recent Impact

The selected Staff person’s overview derives a rolling 30-day summary and up to six recent entries from completed Training and that person’s recorded outcomes. It shows Training sessions, actionable recommendations, accepted recommendations, role, activity, and result.

## 13. Staff performance evidence

Counts and recorded outcomes only; there is no cross-role aggregate score or ranking. Reputation remains unchanged because no canonical performance-to-reputation event seam exists.

## 14. History immutability

New Training execution records snapshot executing Staff roles. New delegated outcomes snapshot decision-time role and overload state. Old saves remain readable; missing snapshots stay unknown rather than being reconstructed from mutable ratings. Scouting report role presentation uses dated career history.

## 15. Reason vocabulary

Player-facing quality uses `LOW`, `FAIR`, `GOOD`, `VERY GOOD`, or `EXCELLENT`. Training contribution has a separate qualitative band. The UI names the role and flags recorded overload; it does not claim an unsupported attribute-level formula explanation.

## 16. User agency

Advisories retain `PENDING`/`INFORMATIONAL`/`ACCEPTED`/`DISMISSED` states. Displaying an unapplied outcome does not mutate its target domain.

## 17. AI boundary

Evidence is shown for the Staff person inspected by the user and for user-team advisory/training surfaces. No per-AI-club activity stream was added.

## 18. MatchEngine boundary

No MatchEngine behavior changed. Staff evidence does not claim a live possession effect.

## 19. Tactics boundary

Existing opposition recommendations remain visible and actionable through the existing TeamGamePlan path. `offensivePreparation` and `matchupRecommendation` remain deferred.

## 20. Save

Structured historical fields are additive. Save V1 parsing preserves new outcome role/overload snapshots and Training execution role/planned-module snapshots. Old Training evidence defaults to no recorded executor roles and its known module as the planned module. No presentation strings are persisted.

## 21. UI changes

Training history, Staff person overview, Staff Advisory Board, Medical recommendations, Scouting reports, and opposition report rows now show qualitative evidence. Existing target-domain ownership remains unchanged.

## 22. Debug aid

None added; ordinary UI contains the relevant evidence.

## 23. Manual validation steps

Exact click paths and expected observations are in `BS13E_MANUAL_STAFF_VALIDATION.md`. This milestone is not visually validated yet.

## 24. P0

No known P0 remains in the implemented Training/advisory/profile evidence path. Required A/B, recent-impact, and advisory checks still require manual confirmation.

## 25. P1

- Persist evaluator role directly on scouting report history if career history cannot resolve a legacy report’s role.
- Add structured positive/negative factor detail only where a target engine supplies those exact inputs; current quality band is intentionally not a formula explanation.

## 26. Remaining BS13 scope

BS13E is awaiting the user’s visual checks. BS13D development/career progression remains out of scope. No future Staff subsystem was started.
