# BS15C · Club Youth, Academy and Registration

## Delivered slice

The canonical `Player` produced by BS15B can enter a configured youth `Team` from a finite `TalentCohort`, play through the existing Team/Competition schedule and match pipeline, train through the normal Team training roster, and move to a configured reserve or senior Team. The Player and Person are never recreated. `YouthPathwayService` exposes configure, intake, inspect, roster, promote, release and age-out query operations to future UI and AI.

## Authorities

- `Team.rosterPlayerIds` remains the sole current-roster projection. Pathway registrations are historical records, not a second roster.
- `TeamPathwayRelation` explicitly associates a Team with its Organization and senior destination, role (`senior`, `reserve`, `youth`), optional category and allowed upward targets. Team names do not define the ladder.
- `PlayerRegistration` records Player, Team, Organization, effective interval, optional Competition/Season, cause and source action. One canonical movement gateway updates roster and history together. The world validator rejects an active history record that conflicts with its roster.
- Simultaneous Team registration is unsupported. The gateway rejects contradictory current rosters and only permits same-organization pathway moves. Release leaves the canonical Player and Person intact.
- Competition `rules.playerAgeEligibility` owns optional minimum/maximum ages. Age is calculated from the canonical DOB and current game date (calendar birthday boundary); the Team role/name is not consulted. A registration command entering a Competition checks participants and age before committing any world change.
- A configured youth Player over a participant Competition's maximum age appears in `AGE_OUT_REQUIRES_DECISION` read results. No automatic move or release occurs.

## BS15B intake and knowledge boundary

Accepted intake identifies one explicit cohort candidate index at the Organization's configured primary Place, checks that the youth Team participates in the chosen age-rule Competition, materializes through `materializeTalentCandidate`, and registers the returned PlayerId. Candidate capacity bounds intake and candidate-key materialization makes retries resolve to the same Player. Decline creates no Player and exposes no Player Truth. Intake does not create Scouting awareness or knowledge; controlled-roster knowledge continues to follow the existing BS14 rules.

## Existing systems reused

Youth Teams are ordinary Teams. They use the existing Competition schedule and game infrastructure, Team roster, Staff assignment, Training execution, Facilities and annual PlayerDevelopment paths. No MatchEngine, PlayerDevelopment or Training engine was forked. Existing generic systems do not yet attribute a separate youth-specific opportunity/minutes factor. Youth-only Staff responsibilities and exclusive facility access are not currently modeled, so this slice adds neither a magic Academy quality nor new Staff/Facility scores.

## Persistence and compatibility

Save V4 adds optional `teamPathwayRelations` and `playerRegistrations` arrays. Their absence in previous V4 saves defaults to empty collections; current rosters already persisted on Teams remain authoritative. Competition age rules are optional additions to canonical Competition rules and are reconstructed through the existing Competition factory. The same Player, materialization record, roster and dated pathway history survive a V4 round trip.

## Scenarios and validation

Focused coverage exercises male and female pathways through accept, idempotent intake retry, Save V4 round trip, promotion to senior, preserved history and release. It also proves over-age intake rejects without materializing or changing a roster. BS15B TalentSupply regression, focused save migration/round-trip tests, targeted Competition/Training/Development tests, typecheck, build and diff checks are recorded in the milestone completion report.

## Deferrals and handoff

Loans, cross-organization academy transfers, dual registration, training with another Team, separate minutes-based growth, youth-specific Staff/Facility privileges, AI academy policy, polished UX and automatic season rollover decisions remain deferred. The age-out read model makes the required action visible; a future gameplay surface must present authorized promotion/release choices. BS15D handoff: consume these dated registration/pathway records for enrollment and eligibility evidence only after a separately approved NCAA rules authority exists; do not alter BS15C's club movement causes or infer NCAA rules from Team role.
