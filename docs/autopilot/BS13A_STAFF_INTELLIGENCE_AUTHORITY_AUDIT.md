# BS13A — Staff Intelligence & Authority Audit

Audit baseline: canonical commit `c69d4ba24e94dc93c08e8e0acb7a713f0a84c0a4`

Branch: `bdm-stage2-bs13a-staff-intelligence-audit`

Scope: read-only code, persistence, lifecycle and UI audit. No production behavior changed.

> The supplied brief ends mid-sentence in §10 after “historical”. This report covers all 20 primary questions and the detailed scope visible in the supplied text; no missing instructions after that cutoff are inferred.

## Executive summary

BDM already has one broad Staff domain, not a small placeholder subsystem: canonical Staff profiles and assignments, a 31-role registry, 13 professional attributes, persisted job and contract lifecycle, generic responsibilities, delegated/advisory outcomes, workload and quality scoring, and substantial Staff human-state, culture, cohesion, conflict and politics systems. These are integrated into training, medical, scouting, recruiting, roster/market operations and trades. Staff is not yet a match-control system: match tactics, lineup/rotation selection and on-court decisions do not generally resolve through Staff responsibilities.

The central authority is `StaffPerson`/`StaffProfile` plus `TeamStaffAssignment`, `Responsibility`, and `GameWorld`. `Coach` remains a facade over Person + StaffProfile for the head coach. The generic Responsibility registry is the current responsibility authority. The old `trainingResponsibilitiesByTeamId` field is save-compatibility-only and is migrated into it.

The biggest future design risk is scope duplication across already substantial subsystems, not absence of a Staff foundation. Any next Staff milestone should extend these canonical boundaries and avoid creating a parallel role, attribute, employment, responsibility, personality, or career-history model.

## 1. Entities and actual role vocabulary

| Entity / concept | Current authority and behavior |
|---|---|
| Human identity | `Person` is the shared root. `StaffPerson` (aliased as `StaffProfile`) references `PersonId`; identity fields on the profile are compatibility mirrors. |
| Staff identity and capability | `StaffPerson` stores professional attributes plus optional market role, role family and specialisms. |
| Team role | `TeamStaffAssignment` is the canonical team/role link, with `assignedOn`. Role is singular per assignment. `headCoach` is backed by the Coach facade and matching StaffProfile. |
| Coach | Not a separate Staff role profile: the Coach gameplay/RPG facade uses the same canonical profile/person and is assigned as `headCoach`. |
| Employment and career | `StaffEmployment`, career-history entries, openings, candidacies, interviews, offers and firing decisions. |
| Compensation | `StaffContract` is a standard dated contract with annual salary, term and termination. Offer salary is optional until offer creation. |
| Responsibilities | One team/kind row in `GameWorld.responsibilitiesById`; a single Staff member can hold multiple different responsibilities, subject to capacity. |

The 31 registered roles are grouped as follows (`StaffRoleId.ts`, `StaffRoleRegistry.ts`):

- **Coaching (9):** head coach, associate coach, assistant coach, offensive specialist, defensive specialist, player-development coach, shooting coach, skills coach, big-man coach.
- **Performance (4):** strength-and-conditioning coach, performance coach, load-management specialist, development specialist.
- **Medical (4):** team doctor, physiotherapist, rehabilitation specialist, sports scientist.
- **Scouting (6):** head scout, regional scout, advance scout, college scout, international scout, pro scout.
- **Basketball operations (6):** general manager, assistant general manager, director of basketball operations, sporting director, analytics staff, cap/contracts specialist.
- **Recruiting (2):** recruiting coordinator and positional recruiter (NCAA-like gated).

There are no separate domain entities for “executive”, “youth staff”, or “front office”; front-office functions are represented by basketball-operations roles. No youth-specific role family is present. UI department names are not additional role authorities.

## 2. Attributes, ratings and staff development

The canonical professional profile contains exactly 13 persisted integer attributes in `StaffProfessionalProfile`, each validated 0–100:

`coaching`, `tacticalKnowledge`, `playerDevelopment`, `talentEvaluation`, `potentialEvaluation`, `medicalKnowledge`, `rehabilitation`, `analysis`, `leadership`, `communication`, `motivation`, `discipline`, `adaptability`.

These are source ratings, not an overall. `STAFF_ROLE_REGISTRY` assigns role-specific attribute weights and `calculateStaffRoleProficiencyByRoleId` derives a 0–100 role proficiency. This derived score is shown in the Staff UI and feeds quality functions. A deprecated three-role (`assistantCoach`/`scout`/`medical`) proficiency helper and legacy mapping remain for compatibility; they are not a second canonical rating set. No persisted Staff overall exists.

| Field / family | Persisted? | Derived / consumed? | UI |
|---|---|---|---|
| 13 professional attributes | Yes | Role proficiency and relevant quality functions consume weighted subsets. There is no general skill-improvement or decline transition. | Attribute and role views in Staff department/person workspaces. |
| Role proficiency | No | Derived from profile attributes and registered role weights; consumed by quality functions. | Yes, as a role-specific “Proficiency” measure. |
| Age | No numeric age; optional date of birth is persisted | Age is derived. Staff human career stage is derived from age, with neutral PRIME when age is unknown. | Identity displays are built from world profile data. |
| Personality | Yes, shared `Personality` keyed by `PersonId` (8 dimensions) | Consumed by delegation quality, career autonomy, appraisal, culture, cohesion and reactions. | Dynamics/workspace projections. |
| Reputation | Separate persisted Staff reputation profile/history | Reputation queries derive/use it in career and candidate contexts; it is not an overall skill score. | Staff profile/status UI. |
| Workload/capacity | Assignment and responsibility capacity costs are canonical inputs; current workload/utilization is derived | Consumed by quality overload penalties, human-state workload signals and UI. | Utilization/workload shown. |
| Experience / potential | No Staff experience rating or Staff potential field | Career history and age can describe tenure/career stage; neither is a Staff growth engine. `potentialEvaluation` is a skill for evaluating players, not Staff potential. | Career history is shown; no Staff potential score. |
| Temperament | No separate field | Shared personality has `temperament`; it is consumed through Staff human/personality behavior, not a second Staff attribute. | Through personality/dynamics surfaces where exposed. |

No canonical Staff attribute-improvement/decline engine was found. Reputation, human state, career history and Staff skills are separate authorities.

## 3. Employment, contracts, vacancies and lifecycle

- Employment is persisted as `employed` with team, role and optional start date, or `unemployed` with no active team/role/start date. A Staff person can have only one current employment/role; same-team promotion/reassignment updates the role and records a history appointment.
- Career history records appointment and departure entries with dates and reasons. It is canonical and persisted, not reconstructed solely from current assignment.
- Hiring has an explicit opening → candidacy → interview → offer → accept/decline/withdraw lifecycle. User commands expose these transitions. Staff career autonomy can create requests, but a user-facing accept/grant seam resolves those requests; autonomy is not a blanket AI hiring authority.
- Firing and resignation/other-job departure update employment and history; Staff contracts carry term and annual salary and have explicit termination semantics. Calendar validity is determined by `isStaffContractActiveOn`.
- Team assignment records one role. Multiple simultaneous roles are not modeled for one Staff person; one person may hold multiple responsibility kinds within that role. Temporary appointments are not represented as a distinct employment kind.
- Vacancies are meaningful: openings can be open/filled/closed; a team may have no assignment for a role, and responsibilities may be user-controlled/organizational with no holder. Responsibility resolution safely falls back when a delegated holder is absent or invalid.
- Default contract/employment/reputation enrichment populates missing structures for generated/legacy worlds. This is distinct from historical evidence that an actual hiring action occurred.
- Staff annual salaries are consumed by financial contract schedules as `STAFF_SALARY`, so Staff is connected to finance. The Staff contract has one annual salary and does not provide player-contract style yearly compensation detail.

## 4. Responsibility and delegation authority

`Responsibility` is team-scoped, one row per kind, and supports `userControlled`, `delegated`, `advisory`, and `organizational` modes where allowed by its registry definition. Delegated/advisory rows require a valid holder; role eligibility is checked against the live `TeamStaffAssignment`. User assignment goes through `setTeamResponsibility` and the Staff Responsibilities UI. Generic default rows are enriched for teams, generally as `userControlled`; there is no universal automatic reallocation across roles. Some domain engines make deterministic AI decisions for AI teams through their own cadence.

| Domain | Canonical responsibility kinds | Eligible actor / current integration |
|---|---|---|
| Training | `createTeamTrainingPlan`, `assignIndividualDevelopment`, `manageRecovery`, `determineIntensity`, `recommendWorkloadChange` | Role-restricted Staff. Planning and scheduled-session execution consume selected kinds; other kinds are registered but not all are wired as full decision paths. |
| Tactics | `oppositionScouting`, `defensiveGamePlan`, `offensivePreparation`, `rotationPlanning`, `matchupRecommendation` | Staff can advise/produce scouting reports for some paths. `rotationPlanning` is explicitly Head-Coach-only and cannot hold a Staff person. Defensive/offensive plan and matchup responsibilities are not equivalent to live match authority. |
| Scouting | `assignScouts`, `prioritizeRegions`, `oppositionReport`, `prospectReport` | Staff can execute delegated scout assignment/region priority and produce advisory reports. |
| Roster / personnel | `recommendSignings`, `initiateNegotiationContact`, `submitPlayerContractOffer`, `executePlayerContractSigning`, `shortlistPlayers`, `contractRecommendation`, `tradeRecommendation`, `negotiatePlayerTrade`, `executePlayerTrade` | Staff are operational actors for delegated market/trade steps and advisors for recommendations; final legal execution still uses market/trade/governance boundaries. |
| Recruiting | `prospectIdentification`, `recruitEvaluation`, `recruitingPriorities` | NCAA recruiting advisory/quality paths consume Staff. Recruiting Engine remains the action/signing authority. |
| Medical | `treatmentRecommendation`, `returnToPlayRecommendation`, `riskAssessment` | Staff produces advisory recommendation/assessment quality; medical and availability engines retain their own mutation/availability authorities. |

The current model supports vacancy and explicit mode choices. It does not guarantee that every registered responsibility is consumed by a corresponding gameplay flow. `RESPONSIBILITY_REGISTRY` eligibility and supported modes are the canonical assignment rules.

### Responsibility duplication seam

`GameWorld.trainingResponsibilitiesByTeamId` is legacy save compatibility only. `migrateTrainingResponsibilities` deterministically validates and transfers legacy holders into generic `responsibilitiesById`, then clears the legacy map. Save V1 still reads/writes the compatibility field for old data. Avoid consuming it as a second live authority. No parallel medical-responsibility map was found in the current canonical path.

## 5. Decision authority matrix

| Classification | Current Staff behavior | Examples / limits |
|---|---|---|
| **Decision maker** | Yes, but only within explicit delegated workflows; “Staff” is not globally the decision authority. | Delegated training can select effective module/intensity; delegated scouting can assign/prioritize; Staff actors can respond in delegated trade negotiations and contract/signing flows. AI training has a weekly cadence and can schedule sessions. |
| **Advisor** | Yes. Advisory outputs are recorded separately and are not automatically applied. | Medical recommendations, scouting/tactical reports, recruiting assessments and basketball-operations recommendations. `DelegationOutcome.applied` plus the accept/dismiss seam distinguishes advice from applied decisions. |
| **Modifier** | Yes. | Role proficiency, personality, relationships and derived workload feed bounded training/medical/scouting/tactics/recruiting/basketball-operations quality functions. The result quality changes; these values do not replace the target system’s decision or mutation boundary. |
| **Display only** | Some data is display-only where there is no consumer. | A role label, specialism, date of birth or attribute is not automatically a gameplay modifier merely because the Staff UI displays it. The 13 attributes are selectively consumed via role/quality logic. |
| **Unused / registered only** | Several responsibilities have no evidence of a connected end-to-end caller, despite being valid in the registry. | `recommendWorkloadChange`, `defensiveGamePlan`, `offensivePreparation`, `matchupRecommendation`, `shortlistPlayers`, and some medical/recruiting kinds should be treated as partial/registered until a caller is traced. Do not infer active behavior from the registry alone. |

Staff does not directly select player actions in `MatchEngine`, set match lineups from staff quality, or run a general-purpose GM who autonomously decides all roster actions.

## 6. System consumer matrix

Status reflects Staff-specific connection, not whether the named domain exists.

| System | Status | Finding |
|---|---|---|
| Training | **CONNECTED** | Planner responsibility, delegated plan execution/quality, delegated intensity and AI weekly planning are integrated. Staff execution applies to scheduled sessions; daily Training V1 progression remains its own shared team pipeline. |
| Medical | **CONNECTED** | Treatment, return-to-play and risk assessment can resolve Staff expertise/advice. Injury/availability transitions remain in injury/medical engines. |
| Match / coaching | **PARTIAL** | Coach remains a canonical Staff-backed head-coach facade; opposition reports and coach contexts exist. Staff skills are not a general MatchEngine input or live action selector. |
| Rotation | **PARTIAL** | `rotationPlanning` exists but is Head-Coach-only; no delegated assistant-staff rotation authority was found. Lineup/rotation state is not generally derived from staff proficiency. |
| Tactics | **PARTIAL** | Staff quality affects opposition reports and advisory preparation seams; it does not generally control live tactics or MatchEngine behavior. |
| Scouting | **CONNECTED** | Staff-attributed evaluators, delegated scout assignment/regions, reports and quality uncertainty paths. |
| Contracts | **CONNECTED** | Staff can hold submit-offer/signing responsibilities; Staff employment contracts and salary are independently canonical. |
| Free agency | **CONNECTED** | Signing/contact authority and recommendations consult Staff responsibilities. Market and contract engines retain validation and execution authority. |
| Trades | **CONNECTED** | Trade recommendation, negotiation response and operational execution can be Staff-backed/delegated; governance/TradeEngine remain authoritative. |
| Draft | **PARTIAL** | Draft prospect scouting/advisory can use Staff evaluation; AI pick choice and selection authority remain Draft Engine decisions. |
| Recruiting | **CONNECTED** | Staff quality/advisory for identification, evaluation and priorities; Recruiting Engine is the only action/commit/signing authority. |
| NCAA | **PARTIAL** | Recruiting Staff roles are NCAA-gated and used in recruiting. Staff does not own academic eligibility, NIL, booster, enforcement or competition availability. |
| Youth / newgens | **ABSENT** | No youth Staff domain/role path was identified; development roles do not establish an academy/youth authority by themselves. |
| Finance | **CONNECTED** | Staff contracts feed organization financial contract schedules as salary expenses. No separate Staff personal-finance system was found. |
| Governance | **PARTIAL** | Staff political positions/actions, career requests and organizational/trade governance links exist. This is not one universal Staff governance decision engine. |
| Facilities | **ABSENT** | Facilities documentation explicitly leaves staff assignment/staffing and facility modifiers out of scope; no Staff facility consumer was found. |
| Board | **PARTIAL** | Governance/trade contexts can involve Staff actors, but Staff authority is not a general board/ownership decision rule. |
| Human RPG | **CONNECTED** | Staff human contexts/states, expectations/appraisal, reactions, autonomy, politics, culture, cohesion and conflict are persisted systems. This is distinct from the coach RPG facade. |
| Media | **ABSENT** | No Staff media/news authority or media-specific Staff responsibility found. |
| Player development | **PARTIAL** | Staff can affect training plan/module quality and thereby training stimulus; player development remains the PlayerDevelopment transition and Staff themselves do not improve/decline. |
| Morale / relationships | **PARTIAL** | Shared Personality, Morale and Relationships support Staff; Staff culture/conflict/human-state systems consume them. No universal Staff-to-player morale effect was found. |

## 7. AI behavior and user actions

- AI behavior is domain-specific and deterministic, not a single Staff AI. Examples include weekly AI training planning, responsibility-aware delegated training/scouting/medical/recruiting workflows, Staff career-autonomy state and requests, and Staff culture/cohesion/conflict/politics cadence.
- The AI planner uses team training context and fatigue/schedule rules to choose session dates, modules and intensity; a valid delegated plan holder can be assigned to the resulting session. This does not imply that Staff autonomously own all AI-team operations.
- Staff career autonomy creates career requests such as role/responsibility progression, influenced by personality and context. User-facing grant/decline commands resolve requests; the engine does not silently promote/fire staff through that surface.
- User commands expose hiring workflow, offers, firing, responsibility assignment, recommendation acceptance/dismissal, Staff career request decisions, and training module scheduling/assignment.

## 8. Persistence, history, and UI

Save V1 serializes Staff profiles, team assignments, responsibilities/outcomes, employment, career history, contracts, reputation, human contexts/states, expectations/reactions, culture, cohesion, conflicts, career autonomy/requests, politics and related records. Staff personality is persisted through the shared `personalitiesByPersonId` data. Save migration can materialize compatibility Staff roots for legacy coaches; canonical `GameWorld` construction requires the profile and head-coach assignment rather than silently fabricating it.

The current Staff UI (`src/ui-ng/applications/staff`) is data-backed: department/people boards, responsibility assignment, person profile, workload/proficiency/reputation/contract, career history and dynamics surfaces build from `GameWorld`. The old `docs/STAFF_SYSTEM_V2.md` is explicitly a historical “specification only” document and contains pre-implementation claims (for example, no Staff contracts/career/workload); those claims are stale against current code and should not be used as a current inventory. Legacy three-role helpers and training compatibility data remain in code, but are explicitly marked/developed as compatibility seams rather than canonical UI truth.

## 9. Training integration detail (BS12)

| Question | Finding |
|---|---|
| Planner responsibility | `createTeamTrainingPlan` resolves an eligible delegated Staff holder in planning context. The weekly AI planner uses this resolution when attributing the AI-created sessions. |
| Individual planner | `assignIndividualDevelopment` is the canonical responsibility selected for scheduled individual-scope sessions. |
| Execution responsibility | `createTeamTrainingPlan` or `assignIndividualDevelopment` is resolved by scheduled execution according to session scope; `determineIntensity` is resolved separately. |
| Execution quality | `trainingQuality` uses the actual assigned-role proficiency, professionalism/adaptability, deterministic jitter and derived workload overload penalty. It bounds the score 0–100. |
| Effect | Quality can select/effect the effective scheduled module/intensity and contributes through session execution/stimulus. It does not directly write Player ratings; canonical PlayerDevelopment consumes stimulus. |
| History | Delegated outcomes are recorded with responsibility, staff, date, quality and session payload. BS12F adds training/development history records. This is outcome history, distinct from Staff career history. |
| Fallback | Missing, vacant, invalid or non-delegated holders resolve to `undefined`; scheduled execution retains the ordinary path. No caller-supplied role can impersonate the actual assignment. |
| Boundary | The legacy training responsibility map is migration/save compatibility, not a second live owner. Medical recommendations use the generic Responsibility system. |

## 10. Duplicate-authority and gap register

1. **Training compatibility mirror:** old map exists in `GameWorld`/Save V1, but migration clears it and generic Responsibility rows are live authority. Preserve this distinction.
2. **Legacy role/proficiency vocabulary:** three-role aliases/helper remain for migration/backward compatibility; the 31-entry role registry and `StaffRoleId` own current assignments and role proficiency.
3. **Coach / Staff profile:** Coach has its own gameplay facade, but Staff identity/professional profile is canonical for person/assignment/rating data. Do not add a second coach-skills model.
4. **Registered does not mean connected:** the Responsibility registry is broader than concrete callers. Verify each responsibility end-to-end before exposing it as consequential.
5. **Staff system breadth:** lifecycle, human RPG, politics, culture, cohesion and conflict are separate existing systems. Future “Staff intelligence” must specify which authority owns each new choice and how it affects these systems rather than add another generic Staff state blob.
6. **Not implemented as Staff systems:** Staff skill growth/decline, Staff potential/experience ratings, multi-role/temporary employment, youth Staff, media authority, universal live-match coaching, and universal workload-change recommendation behavior.

## Primary code evidence

- Models and role catalogue: `src/domain/staff/StaffPerson.ts`, `StaffRoleId.ts`, `StaffRoleRegistry.ts`.
- Responsibilities and quality context: `src/domain/responsibility/Responsibility.ts`; `src/engine/staff/resolveDelegatedResponsibility.ts`; `src/engine/staff/quality/`.
- Lifecycle and contracts: `src/domain/staffCareer/StaffCareer.ts`, `src/domain/staffContract/StaffContract.ts`, `src/app/staffCareer/StaffCareerService.ts`.
- World/save: `src/domain/world/GameWorld.ts`, `src/save/GameWorldSaveV1.ts`, `src/domain/world/migrateTrainingResponsibilities.ts`.
- Training: `src/engine/training/TrainingPlanning.ts`, `ScheduledTrainingEngine.ts`, `src/engine/staff/quality/trainingQuality.ts`.
- UI and legacy specification: `src/ui-ng/applications/staff/`, `docs/STAFF_SYSTEM_V2.md`.
