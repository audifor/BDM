# BS9B Club Needs Audit

Audit base: `a54f8d0d763a6553d8d3e78d9d54960f0251dcf7` on `bdm-stage2-bs9b-club-needs`, after the separate BS9A reviewed-document archive commit.

## Existing authorities

| Concern | Existing authority | BS9B boundary |
|---|---|---|
| Team roster | `Team.rosterPlayerIds`; GameWorld validates a player belongs to at most one team roster. | Read this as roster membership; do not create another roster or repair inconsistencies. |
| Position | `BasketballPosition` PG/SG/SF/PF/C and `Player.basketball.primaryPosition`; the player schema also accepts `secondaryPositions`, which existing rotation code uses when present. | Use the canonical positions and recorded eligibility only; do not invent positions or infer flexibility. |
| Current lineup and bench | `TeamLineup` persists five position starters and B1-B7 bench assignments. | Use it to distinguish named starter/bench evidence where populated; do not treat an empty lineup as proof of a roster hole. |
| Player signals and team evaluation | `PlayerTruthRatings` is canonical. `calculatePlayerImpact` is a derived 16-rating projection used for deterministic starter selection, team-strength display, and positional league stars in the roster UI. `CoachRotationEngine` derives match-context role fit from larger rating groups, tactics, opponent, coach, fatigue and availability. | Use the existing contextual impact only as one relative signal for starter/backup comparison. Do not persist it, call it Overall, or copy match-context role-fit logic into a second authority. |
| Roster depth UI | `buildRosterDepthChart` groups by primary position, uses lineup slots for starter/rotation/bench labels, and ranks same-position players by the contextual impact projection. Its league reference comes from `currentSeasonId`. | Reuse the meaning of its inputs, not its UI model or its implicit single-current-season context. Needs remain a world-derived Engine projection. |
| Minimum playable roster repair | `maintainAiTeamMinimumRosters` fills AI rosters below five with affordable, same-gender free agents and leaves user rosters unchanged. It is an action in the application market boundary. | Reuse five only for the established playable-minimum signal. BS9B reports the need and never calls repair/signing. |
| Basketball operations advice | `BasketballOperationsAdvisory` ranks known signings by `max(0, 2 - primary-position roster count)`, valuation and staff quality; it can record signing/shortlist/contract/trade recommendations, with market and transaction boundaries. Outgoing advisory prefers lower-need, lower-valued contracted players. | This is staff-authored market advice with candidate/asset and feasibility context, not canonical needs. Do not search targets, create staff outcomes, or reuse its narrow position-count formula as the needs authority. |
| Contracts | `PlayerContract` owns player/team, term, annual salary/year compensation, and termination. `getPlayerContractStatus` gives scheduled/active/expired/terminated status. `RosterContractIntegrity` reconciles only drift proved by transaction evidence. | Read active contracts and exact expiry dates for continuity risk; do not calculate value, renew, or reconcile roster state. |
| Availability and medical | `InjuryRecord` owns injury and expected return dates; `isPlayerAvailable` / `getAvailableRosterPlayers` are canonical date-based availability. `getMedicalRiskAssessments` is a separate derived risk warning from injury history and fatigue; `MedicalAdvisory` records unapplied staff recommendations. | Read canonical availability and return dates. Do not duplicate medical risk scoring or modify an injury. Mark injury-only coverage as temporary. |
| Finance | Finance V2 `getFinancialHealthSnapshot` derives organization financial facts and objective distress indicators. Legacy `getTeamFinancialSnapshot` separately models configured player salary budget and payroll; market actions use it for affordability. | Expose Finance V2 posture and distress as a separate need/context without erasing basketball needs. Do not invent salary-cap, payroll feasibility or valuation rules, or equate legacy budget and Finance V2. |
| Competition eligibility | `evaluatePlayerEligibility` and `getAvailablePlayersForCompetition` enforce current NCAA eligibility profiles/restrictions. Other current ecosystems return eligible. | Where an active season exposes this existing check, report an eligibility-constrained roster gap. No universal registration, homegrown, squad-limit, or position registration rules were found in `CompetitionRules`. |
| Scouting / player knowledge | Scouting and `OrganizationKnowledge` project what a club knows about specific players; market advisory uses that knowledge to shortlist named candidates. | BS9B identifies the missing roster function only. It does not query knowledge, discover targets, or describe who can fill a need. |

## Reusable roster analysis

- `getTeamRoster`, `getAvailableRosterPlayers`, and `getTeamLineup` provide canonical membership, date-based injury availability, and explicit starter/bench assignments.
- `BASKETBALL_POSITIONS`, primary position and recorded secondary positions provide the position coverage vocabulary.
- `calculatePlayerImpact` and the roster-depth chart's same-position league percentile provide an existing non-persisted signal to distinguish a weak starter from a depth shortage or weak backup. Its meaning is limited to the existing 16-rating projection; it is not a universal player grade.
- Canonical Player Truth ratings and height/weight/reach can support explicit functional evidence where a stable existing grouped function applies. No separate persisted team needs/holes/surplus authority was found.
- Lineup data can be empty or stale relative to availability; fallback selection must be deterministic and should not turn missing lineup assignments alone into a need.

## Actual gap BS9B fills

BDM has local roster presentation, a minimal positional count used to order market advice, a five-player repair action, contract/medical/eligibility facts and club strategic memory. It has no unified, derived, explainable assessment that combines those facts with the club's accepted strategy, separates structural holes from temporary availability, recognizes surpluses, and orders needs without selecting a player or executing an action. BS9B will add that read-only projection and expose it in the existing Analysis view.

## Coordination risks

1. **P1 — roster versus contract membership:** GameWorld permits a rostered player without a contract in non-professional contexts; professional integrity repair requires transaction evidence and may leave ambiguous states untouched. Needs must not reconcile these authorities.
2. **P1 — player impact versus role fit:** player impact, rotation role fit, scouting estimates, and visible truth ratings answer different questions. A needs assessment must state its evidence and never collapse them into Overall.
3. **P1 — Finance V2 versus salary budget:** Finance V2 organization distress and legacy team payroll affordability are separate. Needs and acquisition feasibility stay separate.
4. **P1 — competition constraints are partial:** NCAA eligibility exists, but general roster registration limits and homegrown/position quotas do not. Report only modeled eligibility constraints and defer absent rules.
5. **P1 — availability and structure:** injuries are temporary dated records; a short absence cannot become a permanent roster hole. Use expected return date and the underlying roster to distinguish cover from structural depth.
