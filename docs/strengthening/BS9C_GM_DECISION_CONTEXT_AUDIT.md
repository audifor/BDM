# BS9C GM Decision Context Audit

## Scope and source systems

This audit covers the reviewed BS9A/BS9B layers and the existing staff, responsibility, advisory, scouting, finance, and Governance systems that BS9C can read. BS9C must remain a derived inspection layer; it must not duplicate or invoke action-producing systems.

## 1. Existing decision-maker authorities

- `Responsibility` is the existing team-level assignment authority. Each row has a responsibility kind, mode, and optional staff holder. `responsibilityDefinition` provides role eligibility.
- Basketball operations responsibility kinds include `recommendSignings`, `shortlistPlayers`, `contractRecommendation`, and `tradeRecommendation`.
- A real holder is meaningful only when the `StaffPerson`, live `TeamStaffAssignment`, assigned role, and Personality exist. Existing `resolveAdvisoryResponsibility` performs those checks for advisory-mode responsibilities; `resolveDelegatedResponsibility` is a separate delegated-execution gate.
- Governance authority is separately represented by institutional bodies and dated `GovernanceAuthorityGrant` rows. A staff responsibility does not confer institutional or transaction authority.
- Board/job-security pressure is a distinct strategic signal. It is not a Governance grant.

## 2. Existing staff roles

`StaffRoleRegistry` defines `generalManager`, `assistantGeneralManager`, `directorOfBasketballOperations`, `sportingDirector`, analytics, and cap/contracts roles, alongside scouting, recruiting, coaching, and other staff. Role assignments are stored in `TeamStaffAssignment`; staff identity/profile is in `StaffPerson`. No single role is universally required by the data model.

## 3. Existing responsibility assignment

`src/domain/responsibility/Responsibility.ts` defines modes `userControlled`, `delegated`, `advisory`, and `organizational`. The existing registry allows different eligible role sets per decision responsibility. `src/domain/world/responsibility.ts` reads canonical rows and calculates workload. BS9C should report actual configured participants by responsibility, and must not infer a GM from title, seniority, or team ownership when no valid assignment exists.

## 4. Existing personality and philosophy signals

`Personality` contains ambition, professionalism, loyalty, resilience, temperament, team orientation, adaptability, and competitiveness. `StaffPerson` has professional attributes, role family, market role, and specialisms. There is no dedicated GM philosophy, roster-building preference, patience, veteran preference, or market-aggression model. `temperament` has an existing conservative/aggressive interpretation in medical advisory, but the trait is broad and should only be a modest contextual signal. BS9C must not create parallel style fields or an Overall.

## 5. Existing advisory systems

- `progressBasketballOperationsAdvisories` records advisory-mode outputs for signings, shortlists, contracts, and trades. It can select named players, derive valuation, rank known candidates, check salary budget, construct trade proposals, and persist `DelegationOutcome` rows with `applied: false`.
- Acceptance functions exist for selected advisory outcomes; those are explicit mutation seams.
- Recruiting, scouting, medical, contract, and trade advice have their own engines and acceptance/action boundaries.
- Club strategy (`assessClubStrategy`) and needs (`assessClubNeeds`) are pure derived assessments; `reviewAiClubStrategies` is a separate persistence path for AI strategy state.

BS9C must not call the market/advisory progress or acceptance functions. Reusing their selected targets would violate the broad-option boundary and could persist recommendations.

## 6. Existing scouting knowledge boundary

`GameWorld.organizationKnowledge` contains organization-scoped player knowledge with sparse dimensions, coverage, confidence, assessment date, provenance, estimates, and uncertainty. Scouting consolidation writes those canonical records. Existing scouting summaries derive coverage/freshness from organizational knowledge. `Player` ratings and potential remain truth; external-player truth cannot be used to judge market readiness. BS9C may aggregate existing organization-knowledge coverage for external players but must not return player identifiers, estimates, or target rankings.

## 7. Existing market recommendation boundary

`BasketballOperationsAdvisory` is the principal basketball-operations market recommendation path. It intentionally discovers and ranks external players from organization knowledge, market signals, finance snapshots, and trade validation, then freezes exact IDs in an advisory outcome. This is beyond BS9C scope. BS9C can state that external knowledge is sparse or broad coverage is present, without identifying candidates or asserting final affordability.

## 8. Governance and Board authority

Governance V2 models institutions linked to teams, bodies, appointments, authority grants by decision type, decisions, requests, meetings, and commitments. The grant graph is formal authority; role labels and Board pressure are not substitutes. Requests can carry broad categories such as strategy, budget, and roster. No generic “this response family requires approval” resolver is apparent from the option-level model. BS9C should surface only canonical, active, unresolved Governance constraints when it can associate them to the team institution and broad option category; it must not infer that missing grants automatically prohibit an option.

## 9. Duplicate-authority risks

- Treating a `generalManager` title as authority without a responsibility row.
- Treating a responsibility holder as having Board, budget, or legal transaction authority.
- Duplicating advisory target selection or salary/trade feasibility.
- Treating `OrganizationKnowledge` as external-player truth or reading hidden Player ratings.
- Turning board/job-security pressure into a formal approval or transaction right.
- Moving club strategic state onto a person, or persisting derived response options.

## 10. Actual gap BS9C needs to fill

BDM has club direction, club needs, role-specific responsibility assignments, broad personality signals, organizational knowledge, finance context, and separate Governance records. It lacks a read-only projection that brings those facts together and presents a small, explainable list of broad response families per important need. BS9C should fill that projection and inspection gap only. It must leave exact action selection to BS9D and later market/transaction systems.

## Architecture observations

- `ClubStrategicState` belongs to the club; staff can influence response preference only.
- `ClubNeed` already carries severity, urgency, confidence, strategic fit, affected area, evidence, temporal scope, related roster IDs, and financial posture.
- The reviewed BS9B `activeCompetitionPlayers` quality comparisons use `calculatePlayerImpact` on players across the active competition. Those aggregate comparisons can indirectly affect need presence/order for an AI club, even though they are not the OrganizationKnowledge scouting channel. BS9C does not add another external-truth evaluation path; this inherited boundary should be addressed before AI option selection is automated.
- `getTeamFinancialSnapshot` is a salary-budget snapshot used by existing contract/market logic; it is not a universal acquisition approval system. Strategy's Finance V2 pressure is suitable as broad context.
- The shared context engine should serve user and AI clubs identically. The inspection screen is advisory-only and must expose no mutation controls.
- All derived ordering must use explicit ordering and stable tie breaks.
