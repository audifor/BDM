# BS9B Club Needs Intelligence

## 1. Audit findings

Repository evidence and existing boundaries are recorded in [BS9B_CLUB_NEEDS_AUDIT.md](./BS9B_CLUB_NEEDS_AUDIT.md). Existing depth UI, market advice, minimum-roster repair, medical availability, contracts, NCAA eligibility and Finance V2 each have their own scope. No canonical club needs assessment existed.

## 2. Need authority

`assessClubNeeds(world, teamId, onDate?)` in `src/engine/clubNeeds` is the one deterministic, derived projection. It reads GameWorld truth and BS9A `ClubStrategicState`/`ClubStrategicAssessment`. It does not mutate the world and does not persist needs. The returned `needs` list includes an explicit one-based `priorityRank`.

## 3. Need model

Each `ClubNeed` exposes a stable ID, kind, rank, severity, urgency, confidence, strategic fit, affected area, optional canonical position or derived basketball function, related PlayerIds, typed evidence, an actual deadline when known, structural/temporary/opportunity scope, and separate Finance V2 posture context. Evidence uses codes and typed facts, not generated prose.

## 4. Categories implemented

- roster playable minimum and positional depth
- relative starter and backup quality gaps
- primary handling, spacing and rim-protection function gaps
- key-player contract continuity and key expiry clusters
- aging core and young-player development opportunity
- primary-position surplus
- temporary injury cover and modeled competition eligibility gaps
- Finance V2 distress pressure, separately reported from basketball needs

There is no general roster maximum, so BS9B does not claim an arbitrary total-roster surplus. It does not emit market-target, player-value or expendable-player valuation claims.

## 5. Strategic-state integration

Accepted BS9A mode is used when present; otherwise the engine uses the same current derived candidate mode that BS9A exposes for advisory teams. Strategic fit affects ordering after urgency and severity. For example, starter and bench upgrades fit `CONTEND` more strongly, youth opportunity fits `DEVELOP`/`REBUILD`, and position/contract surpluses fit `SELL`/`REBUILD`. `SURVIVE` keeps minimum-roster and structural gaps prominent while rating upgrades receive low fit. Strategy changes priorities, not basketball facts or need existence.

## 6. Roster/depth analysis

Roster membership comes only from `Team.rosterPlayerIds`; the five-player minimum is reused from the existing repair behavior as the known playable minimum. Canonical PG/SG/SF/PF/C positions and recorded secondary positions determine coverage. No coverage or one rostered player creates a structural positional-depth need. A missing lineup assignment alone does not.

The saved lineup identifies a usable named starter when available. If absent/unavailable, the best available position-eligible player by the existing `calculatePlayerImpact` projection is the deterministic fallback. Starter and backup are assessed separately against same-position players from teams sharing an active competition. A quality gap is emitted only with at least six comparison players and a bottom-quartile signal. `calculatePlayerImpact` remains one existing contextual signal, not a new or persisted Overall.

## 7. Contract analysis

The engine reads active canonical player contracts expiring within 365 days. A named starter, selected position starter, or B1-B3 rotation player with an expiry creates a continuity need with the exact expiry deadline. Expiry within 30 days is immediate; within 90 days is soon; later in the one-year window is planned. Three or more such expiries also create one cluster need. It does not infer contract market value, affordability, negotiations or renewal actions.

## 8. Age/timeline analysis

Age derives from canonical Person birth dates at the requested date. Three or more roster players aged 32+ surface an aging-core timeline need; three or more aged 23 or younger surface a development opportunity. Unknown birth dates are excluded and lower age-data confidence. This uses the distribution, not only BS9A's average age.

## 9. Surplus analysis

Four or more roster players whose primary position is the same create a low-severity position-surplus fact, with related player IDs and a mode-sensitive strategic fit. It is a monitoring signal only; it neither labels a particular player expendable nor authorizes a transaction. Flexible secondary-position coverage does not count as surplus at another player's primary position.

## 10. Medical/availability boundary

`isPlayerAvailable` and canonical `InjuryRecord.expectedReturnDate` provide availability. Short absences through 14 days do not create temporary cover needs. A position with at least two rostered players but fewer than two currently available can create temporary cover when the latest relevant return is more than 14 days away; fewer than five available rostered players has the same team-level cover check. A one-player roster position remains a structural depth issue. The assessment does not call medical risk scoring, alter injuries, or make cover permanent.

## 11. Finance boundary

Each need keeps Finance V2 posture as separate context, derived from the same BS9A financial assessment. Existing Finance V2 distress can also surface as a distinct financial-pressure need. Stress does not remove a basketball need or claim that acquisition is impossible. Legacy player salary budget and payroll affordability remain separate, and BS9B does not price targets or infer contract affordability.

## 12. Scouting boundary

The assessment does not read OrganizationKnowledge or scouting reports and never identifies candidate players as solutions. Related PlayerIds identify only affected members of the club's own roster or ineligible roster entries.

## 13. Competition/registration boundary

For active seasons, the engine uses the existing NCAA eligibility evaluator and can report when modeled eligibility restrictions or exhausted seasons reduce the available squad. An invalid/missing eligibility context remains unknown, not a fabricated registration failure. `CompetitionRules` has no universal roster registration cap, homegrown quota, or position-registration rule, so those remain unknown and are deferred.

## 14. Prioritization

Ordering is lexicographic and inspectable: urgency, severity, strategic fit, confidence, then kind/position/role/stable ID. The components and final one-based rank are returned. No opaque composite score is used.

## 15. Determinism

Needs derive from world, team, date and strategy only. Inputs and relevant player collections are sorted; IDs and comparison tie-breaks are stable. The engine uses no RNG and no `Math.random()`.

## 16. User-team behavior

The same `assessClubNeeds` function supports AI and user teams. It is advisory and read-only for both; the UI marks the user club as advisory. No AI or user action is invoked.

## 17. Inspection/observability

The existing Analysis strategy screen shows the top three needs per coached club, including the user club, with mode, rank order, severity, urgency, strategic fit, confidence, scope, financial context, deadlines and evidence facts. It is not a management action dashboard.

## 18. Deferred BS9C work

BS9C may combine needs with identified GM/staff style, responsibilities and scouting knowledge to produce explainable options. It should preserve needs-versus-solutions separation and explicit action authority.

## 19. Deferred BS10 work

Market valuation, player-target matching, salary/contract feasibility, trade packages, and transaction recommendations remain outside BS9B and belong to later decision/market scope.

## 20. P0/P1 findings

No new P0 finding was found. Existing P1 coordination risks remain: roster membership versus contract team references, Finance V2 versus legacy salary budget, different meanings of impact/role/scouting signals, partial NCAA-only eligibility, and the boundary between temporary injuries and structural depth. BS9B reads these authorities separately and does not repair or replace them.
