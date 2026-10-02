# BS13 Staff Authority Map

Each row names the current authority, not an aspirational design. Compatibility copies are called out explicitly.

| Concern | Canonical authority | Compatibility / derivation / boundary |
|---|---|---|
| Human identity | `Person` in `GameWorld.personsById` | `StaffPerson.identity` is a compatibility mirror; stable PersonId roots the Staff profile. |
| Staff professional identity | `StaffPerson` / `StaffProfile` | Coach is a facade that references the profile; no second Staff entity. |
| Role vocabulary | `StaffRoleId` and `STAFF_ROLE_REGISTRY` | Deprecated closed `StaffRole` union is a three-role compatibility helper; legacy values map at load. |
| Team assignment | `TeamStaffAssignment` | One active assignment per Staff person is enforced by `GameWorld`; this is the role/team relation used for responsibility eligibility. |
| Professional attributes | `StaffPerson.professional.attributes` | The single persisted professional truth for all 13 canonical attributes. Legacy Coach-keyed values are read only during Save V1 migration. |
| Role proficiency | `calculateStaffRoleProficiencyByRoleId` + registry weights | Derived, role-context-specific, not stored and not an overall. Deprecated three-role proficiency function is compatibility-only. |
| Employment status | `staffEmploymentByStaffId` / `StaffEmployment` | Lifecycle state machine owns employed/unemployed and hire/departure transitions. Team/role repeat assignment data and are checked against it. |
| Staff contracts | `staffContractsById` / `StaffContract`; `isStaffContractActiveOn` | One canonical active-date predicate. Contract term/salary/termination are separate from current assignment. |
| Openings/candidacies/interviews/offers | StaffCareer domain + StaffCareerService | The state machines and world invariants own transitions; UI is a command surface. |
| Career history | `staffCareerHistoryByStaffId` | Append-only appointment/departure entries; separate from current employment and reputation. |
| Staff reputation | StaffReputation domain/profile/events | Not an attribute, overall or career-history substitute. |
| Personality | Shared `Personality`, keyed by canonical `PersonId` | Eight shared human dimensions; Staff systems consume it through specified engines. |
| Morale | Shared `Morale` model keyed by PersonId | A human condition projection, not a professional skill/role rating. |
| Relationships | Relationships domain and relationship-event API | Directed shared relation authority for coach/player/Staff; domain consumers choose whether they use it. |
| Human state / expectations / reactions | StaffHumanState, appraisal, reaction and workload tracking domains | Separate from Personality and professional ratings. |
| Culture | StaffCulture domain/engine | Team-scoped culture state and Staff fit/consequences. |
| Cohesion | StaffUnitCohesion domain/engine | Unit-specific cohesion state; not the same as team culture. |
| Conflicts | StaffConflict domain/engine | Conflict lifecycle and triggers. |
| Politics | StaffPolitics domain/engines | Cases, positions, actions, alliances and factions; not governance's final authority. |
| Workload/capacity | Role registry capacity cost + Responsibility registry cost + `calculateStaffWorkload` | Utilization is derived; Staff human workload tracking records sustained consequences. No separate persisted universal workload total. |
| Responsibilities | `responsibilitiesById` + `RESPONSIBILITY_REGISTRY` | Canonical generic authority; registry disposition gates new assignment, default enrichment, resolution, workload, and active UI visibility. Retired/deferred kinds remain parseable for old saves; target domains retain all final mutations. |
| Delegation resolution | `resolveDelegatedResponsibility` | Sole shared gate for delegated Staff holder/context; caller owns the target action. |
| Advisory outcomes | `DelegationOutcome` + StaffRecommendation application service | Advisory quality/payload and accepted/dismissed state; consumer owns accepted mutation. |
| Training Staff resolution | Training consumer + generic Responsibility resolver | Scheduled execution chooses team vs individual kind and resolves `determineIntensity`; PlayerDevelopment owns later rating transition. |
| Medical Staff recommendation | Injury/medical advisory engines + generic Responsibility resolver | Medical engine owns assessment/RTP/treatment state; Staff provides eligible quality/advice. |
| Scouting Staff resolution | Scouting engines + generic Responsibility resolver | Scouting engine owns assignments/knowledge/report records; Staff supplies authorized decisions/quality. |
| Recruiting Staff resolution | Recruiting Advisory + generic Responsibility resolver | Recruiting Engine exclusively owns contact/action/offer/commit/sign. |
| Market/contract Staff action | Market authority services (`NegotiationOfferAuthority`, `SigningExecutionAuthority`, contact authority) | Role/responsibility may authorize an actor; market/contract engines own legality and binding transition. |
| Trade Staff action | Trade negotiation/governance services + TradeEngine | Staff actor can handle delegated operational steps; TradeEngine owns validation and atomic execution. |
| Draft Staff advice | `DraftProspectAdvisory` / scouting quality | Draft Engine owns order, AI pick and selection. |
| Staff salary Finance exposure | `ContractFinancialSchedule` | Reads StaffContract as `STAFF_SALARY`; Finance owns schedule/accounting. |
| Save persistence | Save V1 plus nested Staff career runtime | Serializes Staff roots, assignments, responsibilities/outcomes, career/contracts, human/culture/politics state; legacy migration enriches old worlds. |
| Staff UI projection | `src/ui-ng/applications/staff` query/build models and commands | React is read/action projection; canonical state remains GameWorld and application/domain boundaries. |
| Facilities | Facilities domain | No Staff staffing or Staff quality consumer. BS17 owns facility gameplay. |
| Youth/Newgens | None | No Staff authority; BS15 owns youth ecosystem. |
| Media | None | No Staff media authority identified. |

## Compatibility seams

- **Coach facade:** `Coach` points to a canonical Person + StaffProfile and has the `headCoach` role assignment. It is not a second Staff entity.
- **Legacy Coach-keyed professional map:** Save V1 accepts `coachProfessionalProfilesByCoachId` on read to migrate older saves. It is omitted from runtime GameWorld and newly written saves. If the matching Staff professional profile exists, it wins; for a missing legacy Coach Staff profile, the old Coach value seeds it. No conflict averaging or invented recency is used.
- **Three-role helper:** deprecated `STAFF_ROLES`, `StaffRole`, and `calculateStaffRoleProficiency` remain compatibility surfaces. Current assignment/role weighting uses the 31-role registry.
- **Legacy training responsibility map:** `trainingResponsibilitiesByTeamId` is save-only input/output compatibility. Load migration validates/moves it into `responsibilitiesById` and clears it; no second live authority.
- **Legacy save materialization:** Save V1 may deterministically materialize compatibility Staff roots/assignments for legacy Coach data. Canonical GameWorld construction requires the profile and matching head-coach assignment.
- **Employment/assignment duplication:** `StaffEmployment` and `TeamStaffAssignment` both encode current team/role. They have distinct responsibilities (lifecycle state versus operational assignment), and `GameWorld` rejects mismatches. This is a guarded duplicated fact, not an unresolved choice of consumer authority.

## Authority rules for future work

1. Add roles only through `StaffRoleId`/registry and add professional source attributes only once to `StaffProfessionalProfile`.
2. Add team responsibilities only to the generic Responsibility authority; do not revive the training compatibility map.
3. Let the target domain own final mutations (Training, Medical, Recruiting, Market, Trade, Draft, Match, Governance).
4. Keep advice (`applied: false`) distinct from delegated execution and from the accepted target-domain action.
5. Keep legacy Coach professional-profile handling as read-only Save V1 migration; do not restore a second runtime authority.

## BS13E evidence authority clarification

- `TrainingExecutionEvidence` remains attached to the canonical completed scheduled session and captures execution-time Staff roles and planned module name. `DelegationOutcome` remains authority for decision-time Staff role, quality, overload fact, payload, and user disposition.
- Staff Recent Impact is a read-only projection over those records and is never authority for hiring, reputation, player development, Medical state, Recruiting, Market, Trade, or tactics.
- Save V1 parsing carries optional snapshots for backward compatibility; no UI-derived narrative or global Staff score is persisted.
- Market and Trade keep their own operation actors/validation as authoritative. Showing advisory source does not make Staff quality a legality or execution rule.
