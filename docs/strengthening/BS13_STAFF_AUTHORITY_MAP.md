# BS13 Staff Authority Map

Each row names the current authority, not an aspirational design. Compatibility copies are called out explicitly. Where runtime consumers expose competing professional values, the report marks the source-of-truth question unresolved rather than choosing silently.

| Concern | Canonical authority | Compatibility / derivation / boundary |
|---|---|---|
| Human identity | `Person` in `GameWorld.personsById` | `StaffPerson.identity` is a compatibility mirror; stable PersonId roots the Staff profile. |
| Staff professional identity | `StaffPerson` / `StaffProfile` | Coach is a facade that references the profile; no second Staff entity. |
| Role vocabulary | `StaffRoleId` and `STAFF_ROLE_REGISTRY` | Deprecated closed `StaffRole` union is a three-role compatibility helper; legacy values map at load. |
| Team assignment | `TeamStaffAssignment` | One active assignment per Staff person is enforced by `GameWorld`; this is the role/team relation used for responsibility eligibility. |
| Professional attributes | `StaffPerson.professional.attributes` | 13 persisted values; see **unresolved Coach profile seam** below for parallel Coach-keyed use. |
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
| Responsibilities | `responsibilitiesById` + `RESPONSIBILITY_REGISTRY` | Exactly one row per team/kind; validates holder against live assignment and role. |
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
- **Coach-keyed professional projection (unresolved):** `GameWorld.coachProfessionalProfilesByCoachId` is a second persisted map with the same attribute shape. `CoachExperience` and Coach UI read/update it, while Staff-based responsibility quality reads `StaffPerson.professional`. World validation does not enforce equality between these maps. The architecture states StaffProfile carries the professional role, but runtime consumers maintain both. **Canonical authority for a coach's shared Staff skill values is unclear in current runtime behavior.** Keep StaffProfile as the identity/assignment authority; do not silently decide how/when the Coach-keyed projection should synchronize. This is a P1 convergence gap, not a new profile proposal.
- **Three-role helper:** deprecated `STAFF_ROLES`, `StaffRole`, and `calculateStaffRoleProficiency` remain compatibility surfaces. Current assignment/role weighting uses the 31-role registry.
- **Legacy training responsibility map:** `trainingResponsibilitiesByTeamId` is save-only input/output compatibility. Load migration validates/moves it into `responsibilitiesById` and clears it; no second live authority.
- **Legacy save materialization:** Save V1 may deterministically materialize compatibility Staff roots/assignments for legacy Coach data. Canonical GameWorld construction requires the profile and matching head-coach assignment.
- **Employment/assignment duplication:** `StaffEmployment` and `TeamStaffAssignment` both encode current team/role. They have distinct responsibilities (lifecycle state versus operational assignment), and `GameWorld` rejects mismatches. This is a guarded duplicated fact, not an unresolved choice of consumer authority.

## Authority rules for future work

1. Add roles only through `StaffRoleId`/registry and add professional source attributes only once to `StaffProfessionalProfile`.
2. Add team responsibilities only to the generic Responsibility authority; do not revive the training compatibility map.
3. Let the target domain own final mutations (Training, Medical, Recruiting, Market, Trade, Draft, Match, Governance).
4. Keep advice (`applied: false`) distinct from delegated execution and from the accepted target-domain action.
5. Record unresolved Coach professional-profile synchronization as a product/architecture choice before any migration or runtime merge.
