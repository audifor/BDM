# Staff System V2 — Canonical Specification

Status: **Specification only. No production code changed by this document.**
Branch: `issue-10-staff-v2`
Depends on (do not implement against unmerged code): none. Designed to be forward-compatible with the Entity Action System once Issue #6B merges.

---

## 1. Executive summary

BDM's Staff currently exists as a single flat identity record (`StaffPerson`) plus a team assignment (`TeamStaffAssignment`) with a derived role-proficiency score. Staff have no lifecycle (hiring/firing/contracts), no autonomy, no decisions, no workload, and no capability beyond a display-only role score. Several *other* subsystems (Scouting, Training, Coach Career, Coach RPG, Personality, Relationships, Memory) already treat `StaffPersonId` as a first-class actor reference and, in the scouting case, already model per-staff attribution of knowledge production. The Entity Action System already has a frozen `staff` catalog of eight intent roots, all stubbed `DOMAIN_MISSING`/`FUTURE_SYSTEM`, waiting for real domain support.

Staff System V2 turns `StaffPerson` from a database row into a genuine actor: extensible taxonomy, professional/personality/relationship integration (reusing existing generic systems, not duplicating them), a persisted Responsibility/Delegation model with four execution modes (user-controlled, delegated, advisory, organizational), a workload/capacity model, a hiring/contract/career lifecycle mirroring Coach Career, and defined (but not yet implemented) extension points into Training, Tactics, Scouting, Medical, Recruiting/Draft, and Finance. It is explicitly staged so each wave lands cleanly on the existing `updateGameWorld` / save-migration idioms already proven by Relationships v1, Personality v1, Memory v1, and Coach Career v1.

This document is implementation-ready: every reused type/function is cited by file and line, every new type is fully specified, and the phased waves are scoped to be executable by coding agents without further product clarification, except where an explicit `TO DECIDE` marker appears.

---

## 2. Audit of current repository state

All findings below were verified directly against `c:\BDM-issue10` on branch `issue-10-staff-v2` (HEAD `407dde9`).

### 2.1 Staff domain (today)

`src/domain/staff/StaffPerson.ts` (18 lines total, canonical):

```ts
export const STAFF_PROFESSIONAL_ATTRIBUTE_KEYS = [
  'coaching','tacticalKnowledge','playerDevelopment','talentEvaluation','potentialEvaluation',
  'medicalKnowledge','rehabilitation','analysis','leadership','communication',
  'motivation','discipline','adaptability',
] as const  // 13 keys — line 5

export type StaffProfessionalAttributeKey = typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number]
export const STAFF_ROLES = ['assistantCoach','scout','medical'] as const   // line 7
export type StaffRole = typeof STAFF_ROLES[number]

export interface StaffIdentity { readonly firstName:string; readonly lastName:string }              // line 9
export interface StaffProfessionalProfile { readonly attributes: Readonly<Record<StaffProfessionalAttributeKey,number>> }  // line 10
export interface StaffPerson { readonly id:StaffPersonId; readonly identity:StaffIdentity; readonly professional:StaffProfessionalProfile }  // line 11
export interface TeamStaffAssignment { readonly id:TeamStaffAssignmentId; readonly staffPersonId:StaffPersonId; readonly teamId:TeamId; readonly role:StaffRole; readonly assignedOn:GameDate }  // line 12

export const STAFF_ROLE_ATTRIBUTE_WEIGHTS: Readonly<Record<StaffRole, Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>>> = {
  assistantCoach: { coaching:.2, tacticalKnowledge:.18, playerDevelopment:.14, leadership:.1, communication:.1, motivation:.1, analysis:.07, discipline:.06, adaptability:.05 },
  scout:          { talentEvaluation:.25, potentialEvaluation:.25, analysis:.15, adaptability:.1, communication:.1, tacticalKnowledge:.05, playerDevelopment:.05, leadership:.05 },
  medical:        { medicalKnowledge:.35, rehabilitation:.3, analysis:.1, communication:.1, discipline:.05, adaptability:.05, leadership:.05 },
}  // line 13

// createStaffProfessionalProfile (line 14), createStaffPerson (line 15), createTeamStaffAssignment (line 16)
// calculateStaffRoleProficiency(person, role): number — weighted sum, rounded (line 17)
```

`GameWorld.staffPeopleById` / `teamStaffAssignmentsById` (`src/domain/world/GameWorld.ts:107-108`) are the two normalized collections. Query helpers live in `src/domain/world/staff.ts` (`getStaffPerson`, `getStaffAssignment`, etc., lines 4-9).

Generation: `src/engine/world/StaffGenerator.ts` creates one `assistantCoach`, one `scout`, one `medical` per generated Team — **fixture data**, not a vacancy or capacity rule (confirmed in `docs/ARCHITECTURE.md:499`). Legacy/NCAA backfill runs through `ensureStaffStructure()` in `src/engine/world/StaffStructureEnrichment.ts:4`, invoked unconditionally on every load (`src/save/GameWorldSaveV1.ts:334`).

Save: `src/save/GameWorldSaveV1.ts` lines 75-76 (shape), 196 (write), 296 (load), 397-398 (`readStaffAssignment`, `createLegacyProfessionalProfile`).

UI: `src/ui/screens/StaffScreen.tsx` (51 lines) — a two-pane list/detail view: table of team staff (name, role, role proficiency) plus a detail panel with role-evaluation-per-role and the 13 raw attributes. It already wires each row through `useEntityActions(createEntityRef('staff', id), ...)` (line 35), so it is already Entity-Action-aware at the row level, just with everything disabled. Presentation labels live in `src/ui/staffPresentation.ts`. Legacy PCB "Staff & Roles" mock UI exists at `src/ui/pcb-migrated/club/components/club/ClubStaffAssignments.jsx` (478 lines) and its pre-migration twin under `renderer/src/components/club/`; both use a disconnected, hardcoded taxonomy and are **not** wired to canonical `StaffPerson` — they are historical/reference only (see `docs/PCB_MIGRATION_CLOSURE.md`).

**No "responsibility" or "delegation" concept exists anywhere in the domain.** The only hit is the inert `staff.delegate` Entity Action stub.

### 2.2 Entity Action System (as merged on this branch — not 6B)

Architecture (`docs/entity-actions/ENTITY_ACTION_SYSTEM.md`, `ADDING-AN-ENTITY-TYPE.md`):

```
EntityRef → EntityActionRegistry (frozen catalogs) → useEntityActions (UI) → composer/quick actions
                                                    ↘ buildResult → EntityCommand | EntityActionHandoff
                                                                        ↓
                                                          EntityActionExecutorRegistry.execute(world, result, ctx)
```

- `src/app/entityActions/EntityRef.ts:12-25` — `KNOWN_ENTITY_TYPES = ['player','staff','team','coach','competition','match','contract','coachJobOffer']`, open protocol (`string & {}` fallback).
- `src/app/entityActions/ActionDefinition.ts:10-27` — `capabilityStatus: 'EXECUTABLE_NOW'|'HANDOFF_NOW'|'DOMAIN_MISSING'|'FUTURE_SYSTEM'`.
- `src/app/entityActions/staffActions.ts` — **today's full staff catalog**:
  - `StaffActionRoot = 'talk'|'assign'|'assess'|'develop'|'delegate'|'negotiate'|'release'|'compare'`
  - All 8 actions currently `DOMAIN_MISSING` or `FUTURE_SYSTEM`; `availability()` only checks the staff person exists, then always disables with a reason string; `buildResult` always produces a `handoff`, never a `command`.
  - Quick actions: `talk, assign, assess, develop`.
- `src/app/entityActions/productionRegistry.ts` — `productionEntityActionRegistry = new EntityActionRegistry([PLAYER_ACTION_CATALOG, STAFF_ACTION_CATALOG, TEAM_ACTION_CATALOG]).freeze()`.
- Executors: `src/app/entityActions/EntityActionExecutor.ts` currently registers only `player.release` and `player.substitute`. **No staff executor exists.**

This is the exact seam Staff V2 must respect: light up specific `staff.*` roots by (a) flipping `capabilityStatus` to `EXECUTABLE_NOW`/`HANDOFF_NOW`, (b) writing real `availability()` logic, (c) changing `buildResult` to `createEntityCommand` where appropriate, and (d) registering a matching executor — **without touching `EntityActionRegistry`, `ComposerEngine`, or catalog wiring**, and without depending on unmerged 6B work.

### 2.3 Adjacent systems already staff-aware

| System | File | Staff attribution today |
|---|---|---|
| Scouting | `src/domain/scouting/Scouting.ts` | `EvaluatorProfile.staffPersonId`, `ScoutingAssignment.evaluatorStaffId`, `EvaluatorReport.evaluatorStaffId` — **full attribution chain already exists** |
| Scouting engine | `src/engine/scouting/ScoutingEngine.ts:12` | `evaluatorProfile()` derives evaluator strength from `staff.professional.attributes.talentEvaluation`/`analysis` |
| Training | `src/domain/training/Training.ts:8` | `IndividualTrainingPlan.responsibleStaffId?: StaffPersonId` exists on the **legacy, non-auto-applied** plan type only; the live `ScheduledTrainingSession` (`src/domain/training/TrainingSchedule.ts:8`) has no staff field |
| GameWorld | `src/domain/world/GameWorld.ts:126` | `trainingResponsibilitiesByTeamId: Record<TeamId, Partial<Record<TrainingResponsibility, StaffPersonId>>>` — a responsibility-shaped map **already exists for training specifically**, pre-dating this spec; V2 must generalize this pattern, not fork it |
| Coach RPG | `src/domain/coachRpg/CoachRpg.ts`, `src/engine/coach/CoachSpecialization.ts:3` | Coach reuses `StaffProfessionalProfile`/`STAFF_PROFESSIONAL_ATTRIBUTE_KEYS` verbatim — **same type, not a parallel one** |
| Personality/Morale | `src/domain/world/GameWorld.ts:120-121` | `personalitiesByPersonId`/`moraleByPersonId` keyed by generic `string` id, already populated for `coaches + players + staffPeople` (`GameWorld.ts` construction path) |
| Relationships | `src/domain/relationships/Relationships.ts` | `RelationshipPersonId = string`, directed key `"${source}->${target}"` — works for any Coach/Player/StaffPerson id today, no type gate |
| Memory | `src/domain/memory/Memory.ts` | `MemoryOwnerKind` **already includes `'staff'`**, though no code path creates one yet |
| Coach Career | `src/domain/coachCareer/CoachCareer.ts`, `src/app/coachCareer/CoachCareerService.ts` | Full opening→candidacy→interview→offer→hire/fire state machine — **direct template** for Staff hiring/firing (see §13) |
| Coach Finances | `src/domain/coachFinances/CoachFinances.ts` | Personal-economy template (movements ledger, lifestyle, financial security bands) — reusable shape, not reusable data (Staff has no equivalent) |

### 2.4 Explicit non-existence confirmed by search

- No `StaffContract`, no staff salary field anywhere (`TeamStaffAssignment` has no compensation field; `TeamFinances` has only `playerSalaryBudget`).
- No `StaffEmployment`, `StaffCareer`, staff job-opening/candidacy/offer types.
- No `StaffReputation`.
- No "Training V2" or "Tactics V2" beyond what ARCHITECTURE.md calls V1 — `ARCHITECTURE.md:351` explicitly defers "scouting, tactical AI" for tactics to a later overhaul, and `:363` names "staff insights" during live coaching as an unimplemented, but anticipated, seam.
- No opposition/advance-scouting report type.
- No medical decision/recommendation logic distinct from plain `InjuryRecord` lifecycle (`src/domain/injury/Injury.ts`).
- `RecruitProfile` and `Draft`/`DraftPick` reference no `StaffPersonId` today.
- `PlayerKnowledgeRecord` (Team-owned, legacy) is distinct from `OrganizationKnowledge` (org-owned, dimension/provenance-based, already implemented in `src/domain/knowledge/OrganizationKnowledge.ts`) — the latter is the correct integration point for staff-sourced knowledge, not the former.

---

## 3. What already exists and should be reused (do not duplicate)

1. **Professional attribute vocabulary** — `STAFF_PROFESSIONAL_ATTRIBUTE_KEYS` / `StaffProfessionalProfile`. Coach RPG already depends on this exact type. Any new attribute must be added here once, for both Staff and Coach.
2. **Personality** — `src/domain/personality/Personality.ts`. 8 dimensions (`ambition, professionalism, loyalty, resilience, temperament, teamOrientation, adaptability, competitiveness` — note ARCHITECTURE.md prose undercounts this as 6; code has 8). Generic `generatePersonality(personId: string)`. Already generated for every `StaffPerson` today.
3. **Morale** — `src/domain/morale/Morale.ts`. Generic `moraleByPersonId`, already populated for staff.
4. **Relationships** — `src/domain/relationships/Relationships.ts` + `src/domain/world/RelationshipEvents.ts:6` (`applyRelationshipEventToWorld`). Directed, generic string-keyed. Use directly for Coach↔Staff, Staff↔Staff, Staff↔Player relationships.
5. **Memory** — `src/domain/memory/Memory.ts` + `src/engine/memory/MemoryEngine.ts` (`recordMemory`, `decayMemoriesForMonth`). `MemoryOwnerKind` already accepts `'staff'`.
6. **Coach Career state machine** — `src/domain/coachCareer/CoachCareer.ts` + `src/app/coachCareer/CoachCareerService.ts`. Structural template for Staff hiring/firing (opening → candidacy → interview → offer → accept/decline/withdraw, plus a separate fire path). Do not import Coach types directly; mirror the pattern with Staff-scoped types.
7. **Coach Finances shape** — `src/domain/coachFinances/CoachFinances.ts`. Reuse the *shape* (movements ledger, idempotent monthly processing pattern) for a future `StaffContract`/compensation model; do not reuse the *data* (it's per-Coach personal economy, semantically different from a staff employment contract).
8. **Scouting attribution chain** — `EvaluatorProfile`, `ScoutingAssignment`, `EvaluatorReport`, `ScoutingEngine.evaluatorProfile()`. Staff V2 responsibilities for scouting must call into this, not reinvent evaluator strength.
9. **`OrganizationKnowledge`** — the correct target for "the organization knows X because a staff member observed it." Already has a `provenance` enum (`'ownObservation'|'scoutReport'|...`) and `evidenceIds`/`reportIds`. Extend provenance/attribution, don't fork the knowledge model.
10. **`trainingResponsibilitiesByTeamId`** — an existing, narrow responsibility map. V2's general Responsibility model should be designed so this can be expressed as one instance of the general model (see §9.5), and eventually migrated onto it — but migrating existing data is out of scope for the waves below unless explicitly staged.
11. **`updateGameWorld` boundary** — `src/domain/world/GameWorld.ts:447` (`updateGameWorld(world, patch)`). New Staff V2 collections should be threaded through as already-indexed `Record<Id,T>` patch fields (the "no `collectionPatchTargets` entry needed" path used by `evaluatorProfilesByStaffId`, `coachReputationProfilesByCoachId`, etc.) — the additive, least-invasive integration pattern.
12. **Legacy-save enrichment pattern** — `ensureStaffStructure()` / `ensurePlayerKnowledge()` in `src/engine/world/*Enrichment.ts`: pure `(GameWorld) => GameWorld`, computes only missing records, no-ops when nothing to add, commits via `updateGameWorld`, invoked from the tail of `deserializeGameWorldV1`. Every new Staff V2 collection needs exactly one such function.
13. **Entity Action catalog/executor pattern** — `staffActions.ts` + `productionRegistry.ts` + `EntityActionExecutor.ts`. Already staff-shaped; V2 lights up specific roots wave by wave.

---

## 4. Gaps in the current Staff implementation

1. Staff is a static fixture, not a lifecycle: no hiring, firing, contracts, salary, free agency, or promotion.
2. Staff cannot act: no responsibility system, no delegation, no autonomous decisions, no recommendations.
3. Staff has no capacity model: unlimited responsibilities could theoretically stack on one person with no consequence (moot today since none exist).
4. Staff taxonomy is exactly three roles (`assistantCoach`, `scout`, `medical`) with no department/seniority/specialization structure and no support for NBA-like/NCAA-like/FIBA-like organizational variation.
5. Staff has no reputation, no career history, no cross-team movement, no AI-driven staff market.
6. Staff professional attributes never change (no staff-specific experience/development system — Coach has one via Coach RPG, Staff does not).
7. Staff produces no output: no recommendations, no reports beyond the scouting evaluator chain (which is itself not wired to any Staff lifecycle — a `ScoutingAssignment.evaluatorStaffId` can reference a `StaffPerson` who could be fired mid-assignment with no consequence modeled).
8. All 8 Entity Action roots are stubbed with no executor.
9. No integration between Staff professional attributes and any simulation outcome (training quality, tactical prep, medical recovery) — only the scouting evaluator strength calculation currently consumes `StaffProfessionalProfile` values for an actual effect.

---

## 5. Canonical Staff domain model

### 5.1 Design decision: extend, do not fork

`StaffPerson` stays the canonical identity + professional-attribute record. All new concerns are added as **new normalized GameWorld collections keyed by `StaffPersonId`**, exactly matching how Coach state is spread across `coachProfessionalProfilesByCoachId`, `coachRpgProfilesByCoachId`, `coachFinancesByCoachId`, `coachReputationProfilesByCoachId`, `coachEmploymentByCoachId`, etc. rather than one giant `Coach` object. This keeps `StaffPerson` itself stable (identity is forever) while every optional/growable concern (career, contract, reputation, workload, responsibilities) lives in its own sparse map, consistent with `updateGameWorld`'s additive-collection pattern (§3.11).

`StaffPerson` itself gains exactly one new field in Wave 1 — nothing else changes on the base record:

```ts
// src/domain/staff/StaffPerson.ts — extend, do not replace
export interface StaffIdentity {
  readonly firstName: string
  readonly lastName: string
  readonly dateOfBirth?: GameDate      // new, optional — mirrors Player.bio.dateOfBirth pattern; age is a derived projection, never stored
  readonly nationality?: string        // new, optional — free-form country identifier, mirrors existing Player/Coach nationality conventions
}
```

`TO DECIDE`: whether `nationality` should reference a canonical country/region enum shared with Player/Coach nationality, or remain free-form. Existing Player/Coach nationality representation should be checked and matched exactly at implementation time — this spec does not introduce a new nationality taxonomy.

Languages and career history are **not** added as fields on `StaffIdentity`. Career history is derived from the new `staffCareerHistoryByStaffId` collection (§13, mirroring `coachCareerHistoryByCoachId`); languages are deferred (no current system consumes them — see §26 risk list) until a concrete gameplay use (e.g., international scouting familiarity) is scoped.

### 5.2 New collections (all optional/sparse, all additive to `GameWorld`)

Each is specified fully in its owning section. Summary table:

| Collection | GameWorld key | Keyed by | Section |
|---|---|---|---|
| Department/seniority/specialization | `staffRoleProfilesByStaffId` | `StaffPersonId` | §7 |
| Responsibilities | `responsibilitiesById` | `ResponsibilityId` | §9 |
| Delegation outcomes | `delegationOutcomesById` | `DelegationOutcomeId` | §10 |
| Workload | *(derived, not stored — see §11)* | — | §11 |
| Staff contracts | `staffContractsById` | `StaffContractId` | §13 |
| Staff employment | `staffEmploymentByStaffId` | `StaffPersonId` | §13 |
| Staff career history | `staffCareerHistoryByStaffId` | `StaffPersonId` | §13 |
| Staff job openings/candidacies/interviews/offers | `staffJobOpeningsById` etc. | respective IDs | §13 |
| Staff reputation | `staffReputationProfilesByStaffId` | `StaffPersonId` | §13.5 |

Professional attributes, personality, morale, relationships, and memory use **existing** collections — no new maps.

---

## 6. Staff taxonomy

### 6.1 Canonical principle

The taxonomy is **data, not code**. A `StaffRole` is extended from a closed 3-value union into a registry of role *definitions* that can vary by ecosystem/competition-universe configuration, matching how `SportsEcosystem.kind` (`fibaLike`/`nbaLike`/`ncaaLike`) already drives structural variation elsewhere (salary cap presence, draft presence, conference structure) without branching core engines.

### 6.2 Canonical department enum (closed, small, stable)

```ts
export const STAFF_DEPARTMENTS = ['coaching', 'performance', 'medical', 'scouting', 'basketballOperations', 'recruiting'] as const
export type StaffDepartment = typeof STAFF_DEPARTMENTS[number]
```

Departments are the stable organizational grouping used for UI sectioning, workload aggregation, and capability gating. They do not vary by ecosystem.

### 6.3 Canonical role registry (open, data-driven, extensible)

```ts
export interface StaffRoleDefinition {
  readonly id: StaffRoleId                          // e.g. 'assistantCoach', 'shootingCoach', 'headScout', 'strengthConditioningCoach'
  readonly department: StaffDepartment
  readonly seniority: 'junior' | 'standard' | 'senior' | 'director'
  readonly attributeWeights: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>
  readonly applicableEcosystemKinds?: readonly SportsEcosystemKind[]  // undefined = universal
  readonly capacityCost: number                      // default workload units consumed per assignment, see §11
}

export const STAFF_ROLE_REGISTRY: Readonly<Record<StaffRoleId, StaffRoleDefinition>>
```

`StaffRoleId` replaces the closed `STAFF_ROLES` union with a wider, still-closed-at-compile-time union covering the full canonical catalogue below, so exhaustiveness checks remain possible while the *behavioral definition* of each role (weights, department, seniority, capacity cost, ecosystem gating) lives in data (`STAFF_ROLE_REGISTRY`), not in branching logic. Adding a role in the future means adding one registry entry, never a new switch arm — satisfying the extensibility requirement in the issue brief.

`calculateStaffRoleProficiency` (§2.1, `StaffPerson.ts:17`) is generalized to read from `STAFF_ROLE_REGISTRY[roleId].attributeWeights` instead of the closed `STAFF_ROLE_ATTRIBUTE_WEIGHTS` map; the existing map becomes the seed data for the first three registry entries, so the change is additive and the existing three roles' proficiency scores are byte-identical after migration.

### 6.4 Canonical role catalogue (Wave 1 registry contents)

**Coaching** (`department: 'coaching'`)
`headCoach`* , `associateCoach`, `assistantCoach`, `offensiveSpecialist`, `defensiveSpecialist`, `playerDevelopmentCoach`, `shootingCoach`, `skillsCoach`, `bigManCoach`

*`headCoach` is not a `StaffPerson` — it remains the existing `Coach` entity. It is listed in the registry only so shared code (e.g. department aggregation, responsibility eligibility) can reason about "who coaches this team" uniformly; assigning `headCoach` responsibilities routes to `Coach`/`CoachRpg`, not to a `TeamStaffAssignment`. `TO DECIDE` at implementation: whether `StaffRoleId` includes `headCoach` as a marker value or whether Head Coach eligibility is expressed through a separate `eligibleParticipant: 'staff' | 'coach'` field on `Responsibility` (§9) instead. This spec recommends the latter (cleaner type separation) — see §9.2.

**Performance/Training** (`department: 'performance'`)
`strengthConditioningCoach`, `performanceCoach`, `loadManagementSpecialist`, `developmentSpecialist`

**Medical** (`department: 'medical'`)
`teamDoctor`, `physiotherapist`, `rehabilitationSpecialist`, `sportsScientist`

**Scouting** (`department: 'scouting'`)
`headScout`, `regionalScout`, `advanceScout`, `collegeScout`, `internationalScout`, `proScout`

**Basketball Operations** (`department: 'basketballOperations'`)
`generalManager`, `assistantGeneralManager`, `directorOfBasketballOperations`, `sportingDirector`, `analyticsStaff`, `capContractsSpecialist`

**Recruiting** (`department: 'recruiting'`, `applicableEcosystemKinds: ['ncaaLike']`)
`recruitingCoordinator`, `positionalRecruiter`

Existing roles `assistantCoach`, `scout`, `medical` remain valid `StaffRoleId` values (mapped to `assistantCoach`, `regionalScout`... `TO DECIDE`: exact 1:1 legacy mapping — recommended: `scout → regionalScout`, `medical → physiotherapist`, since these are the most general member of each department) so existing saves need no data rewrite, only a registry lookup change.

### 6.5 Ecosystem gating

`applicableEcosystemKinds` lets `recruiting` department roles exist only where `SportsEcosystem.kind === 'ncaaLike'`, while `generalManager`/`capContractsSpecialist` are most meaningful under `nbaLike` (soft/hard cap present) but are not hard-gated — an FIBA-like club may still have a GM. Only Recruiting is hard-gated in Wave 1 because it is the one department with zero meaning outside NCAA-like today (no NIL/eligibility/recruiting systems exist for other ecosystem kinds).

---

## 7. Professional attribute model

### 7.1 Reuse, extend the vocabulary only if a real consumer needs it

The 13 existing keys already cover coaching, medical, scouting, and soft-skill dimensions well. This spec does **not** add new attribute keys in Wave 1. `analyticsStaff` and `capContractsSpecialist` (new Basketball Ops roles) are scored using `analysis` (already present) plus a new negotiation-flavored key introduced in Wave 4 alongside Contracts:

```ts
// Wave 4 addition only, once StaffContract negotiation exists:
// append to STAFF_PROFESSIONAL_ATTRIBUTE_KEYS: 'negotiation'
```

`TO DECIDE`: whether `negotiation` is added in Wave 1 (cheap, no behavior yet) or deferred to Wave 4 (when it has a real consumer). This spec recommends deferring — adding attribute keys with no consumer risks exactly the "fake capability" anti-pattern the issue brief warns against (§ Data Integrity in the issue). Every attribute key added must have a computed consumer in the same wave.

### 7.2 Attribute-to-role weighting stays in the registry

Per §6.3, `STAFF_ROLE_REGISTRY[roleId].attributeWeights` is the sole source of role proficiency weighting, replacing the closed `STAFF_ROLE_ATTRIBUTE_WEIGHTS` constant (which becomes generated seed data for exactly the 3 legacy roles, kept for backward-compatible unit tests).

### 7.3 No FM-style attribute copy

Consistent with the issue brief, this spec deliberately does not import Football Manager's ~30-attribute-per-role model. Thirteen basketball-native attributes shared with Coach RPG is the correct scope: it is already proven (Coach RPG reuses it verbatim), keeps one vocabulary for cross-role comparison ("could this scout become a good assistant coach"), and avoids attribute sprawl that has no simulation consumer.

---

## 8. Personality / relationship integration

No new personality or relationship types. Concretely:

- **Personality**: `generatePersonality(staffPersonId)` already runs for every `StaffPerson` (confirmed in `GameWorld` construction path). No change needed to generate it; Wave 1 only needs to **expose it in the Staff domain query layer** (`src/domain/world/staff.ts`) alongside professional attributes, and Wave 4 exposes it in `StaffScreen`.
- **Morale**: same — already generated; Wave 5 (Autonomy) is the first wave to actually *emit* morale events for staff (e.g., "denied a promotion", "responsibility revoked"), reusing `MoraleEventSource` (extend the closed union with `'responsibilityEvent'` — the only new value needed) and `applyMoraleEvent`.
- **Relationships**: reuse `applyRelationshipEventToWorld(world, sourceId, targetId, event)` directly for Coach↔Staff and Staff↔Staff relationship deltas. New `RelationshipEventSource` value needed: `'staffInteraction'` (extends existing closed union, one value). Examples: assigning a responsibility a staff member wanted improves Coach→Staff and Staff→Coach relationship; denying one repeatedly degrades it.
- **Memory**: `MemoryOwnerKind` already includes `'staff'`. Wave 5 adds staff-owned memories for: hired, fired, promoted, responsibility granted/revoked, using `recordMemory()` directly. New `MemoryType` values needed: `'promoted'`, `'responsibilityGranted'`, `'responsibilityRevoked'` (extends existing closed union — `hired`/`fired` already exist and are reused as-is for staff, mirroring Coach Career's existing `hired`/`fired` memory calls in `CoachCareerService.ts`).

No duplicate personality, relationship, or memory system is introduced anywhere in this spec, satisfying the Data Integrity constraint in the issue brief.

---

## 9. Responsibility / delegation architecture

This is the structural core of Staff V2.

### 9.1 Canonical Responsibility type

```ts
export const RESPONSIBILITY_DOMAINS = ['training', 'tactics', 'scouting', 'roster', 'recruiting', 'medical'] as const
export type ResponsibilityDomain = typeof RESPONSIBILITY_DOMAINS[number]

export const RESPONSIBILITY_KINDS = [
  // training
  'createTeamTrainingPlan', 'assignIndividualDevelopment', 'manageRecovery', 'determineIntensity', 'recommendWorkloadChange',
  // tactics
  'oppositionScouting', 'defensiveGamePlan', 'offensivePreparation', 'rotationPlanning', 'matchupRecommendation',
  // scouting
  'assignScouts', 'prioritizeRegions', 'oppositionReport', 'prospectReport',
  // roster / personnel
  'recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'tradeRecommendation',
  // recruiting
  'prospectIdentification', 'recruitEvaluation', 'recruitingPriorities',
  // medical
  'treatmentRecommendation', 'returnToPlayRecommendation', 'riskAssessment',
] as const
export type ResponsibilityKind = typeof RESPONSIBILITY_KINDS[number]

export const RESPONSIBILITY_MODES = ['userControlled', 'delegated', 'advisory', 'organizational'] as const
export type ResponsibilityMode = typeof RESPONSIBILITY_MODES[number]

export interface ResponsibilityDefinition {
  readonly kind: ResponsibilityKind
  readonly domain: ResponsibilityDomain
  readonly eligibleRoleIds: readonly StaffRoleId[]   // which StaffRoleId values (from §6.3) may hold this responsibility
  readonly eligibleParticipant: 'staff' | 'coach'    // headCoach-only responsibilities (e.g. final rotation call) route to Coach, not StaffPerson
  readonly defaultMode: ResponsibilityMode
  readonly capacityCost: number                      // workload units, see §11
}
export const RESPONSIBILITY_REGISTRY: Readonly<Record<ResponsibilityKind, ResponsibilityDefinition>>

export interface Responsibility {
  readonly id: ResponsibilityId
  readonly teamId: TeamId
  readonly kind: ResponsibilityKind
  readonly mode: ResponsibilityMode                  // may differ from defaultMode — user can change delegation posture
  readonly holderStaffId?: StaffPersonId              // undefined when mode is 'userControlled' or 'organizational', or when 'delegated'/'advisory' but currently vacant
  readonly assignedOn?: GameDate
}
```

`GameWorld.responsibilitiesById: Readonly<Record<ResponsibilityId, Responsibility>>` — one row per (team, responsibility kind). Responsibilities are **persisted canonical world state**, never UI-local settings, per the issue brief's explicit requirement.

### 9.2 The four execution modes

1. **`userControlled`** — the user performs the action directly through existing UI/Application flows (e.g. today's manual training plan editing, manual tactical plan selection). No `holderStaffId`. This is the default for every responsibility until the user explicitly delegates it — Staff V2 changes no default gameplay behavior on introduction.
2. **`delegated`** — a `holderStaffId` performs the action autonomously. The *quality* of the delegated outcome depends on the holder's professional attributes/personality/context (§10). The user does not review before it applies, but sees the result (via Inbox, mirroring the existing `InboxItem` pattern for job offers).
3. **`advisory`** — a `holderStaffId` produces a recommendation (a `DelegationOutcome` with `applied: false`); the user decides via existing UI (accept/reject), never auto-applied. This is the correct mode for anything touching irreversible/high-stakes actions (contract offers, trades) per the issue brief's caution around decision quality.
4. **`organizational`** — no staff holder; the game processes the responsibility through deterministic organizational rules (e.g., a small team with no scout still gets *some* opposition report, generated by a fixed/lower-quality organizational baseline function, exactly like AI roster maintenance today has no "GM" but still functions via `signFreeAgent`). This preserves gameplay continuity for teams (especially AI teams) that never hire specialized staff.

`eligibleParticipant: 'coach'` responsibilities (e.g., "final say on starting five") are **not** delegable to Staff in Wave 1–3; they exist in the registry only so the model can express "this decision belongs to the Head Coach" uniformly next to "this decision can be delegated to an Assistant." Whether Head Coach responsibilities become delegable to, e.g., an Associate Coach acting as interim decision-maker is explicitly deferred (`TO DECIDE`, not in scope for the phases below).

### 9.3 Persistence and legacy saves

New collection `responsibilitiesById`, threaded through `updateGameWorld` via the additive/no-indexer path (§3.11). Legacy-save enrichment function `ensureResponsibilityStructure(world)` (mirrors `ensureStaffStructure`) creates one `Responsibility` row per `(team, RESPONSIBILITY_KIND)` pair at `mode: defaultMode` (i.e. `'userControlled'` for everything in Wave 1, since nothing is delegable yet) for every team missing them — a no-op change in observable behavior, satisfying the "must not change product behavior" autopilot rule for any wave that ships before delegation execution exists.

### 9.4 Wave gating (see §27 for full wave plan)

- Wave 1 ships `Responsibility` as **pure data** — every responsibility exists, defaults to `userControlled`, and can be reassigned to a `holderStaffId` in mode `delegated`/`advisory`, but **no delegated execution logic runs yet**. This is intentionally inert: it proves the persistence/UI seam without behavior risk.
- Wave 2 ships real delegated/advisory execution for the `training` domain only (smallest, best-understood integration surface — see §14).
- Wave 3 extends execution to `scouting` (already has the evaluator attribution chain) and `tactics` (opposition scouting/advance-scout report, filling the explicit ARCHITECTURE.md gap).
- Wave 4 extends to `roster`/`recruiting`/`medical` advisory recommendations, gated behind Contracts (§13) because `recommendSignings`/`contractRecommendation` need a Staff-independent decision context (existing Contract/FA domain) that is being wired in the same wave.

### 9.5 Relationship to `trainingResponsibilitiesByTeamId`

The pre-existing `trainingResponsibilitiesByTeamId: Record<TeamId, Partial<Record<TrainingResponsibility, StaffPersonId>>>` (`GameWorld.ts:126`) is a narrower, training-only precursor of this exact concept (`TrainingResponsibility = 'teamTraining'|'individualDevelopment'|'physicalLoad'` maps directly onto three of the new `ResponsibilityKind` values). Wave 2 (Training integration) **migrates this map onto the general `Responsibility` model** rather than maintaining two parallel responsibility concepts — see §14 for the exact mapping and a one-time save migration.

---

## 10. Autonomy and decision-quality model

### 10.1 Principle

Delegation must not silently reproduce the user's own choice. A `DelegationOutcome` is a canonical, persisted record of what a staff member actually decided, separate from the responsibility itself (which just says *who* decides).

```ts
export interface DelegationOutcome {
  readonly id: DelegationOutcomeId
  readonly responsibilityId: ResponsibilityId
  readonly staffId: StaffPersonId
  readonly decidedOn: GameDate
  readonly kind: ResponsibilityKind
  readonly applied: boolean                 // false for 'advisory' outcomes awaiting user decision
  readonly qualityScore: number             // 0-100, deterministic function of staff attributes/personality/context — never the "correct" answer, a bounded proxy
  readonly payload: Readonly<Record<string, string | number | boolean>>  // domain-specific decision content, JSON-safe
  readonly rationale?: string               // short deterministic template string for UI display, not free text generation
}
```

### 10.2 Quality function — extension point, not simulation

```ts
export interface DecisionQualityContext {
  readonly staff: StaffPerson
  readonly roleId: StaffRoleId
  readonly personality: Personality
  readonly relationshipToCoach?: RelationshipProfile
  readonly workload: StaffWorkloadSnapshot          // see §11
}
export type DecisionQualityFn = (context: DecisionQualityContext, seed: string) => number  // 0-100, via RandomSource per AGENTS.md rule
```

Each `ResponsibilityDomain` registers exactly one `DecisionQualityFn` in Wave 2/3 (never a monolithic switch — one function per domain module, e.g. `src/engine/staff/quality/trainingQuality.ts`). The function is a pure, deterministic, seeded computation: base = role-weighted proficiency (reusing `calculateStaffRoleProficiency`), adjusted by personality (e.g., low `adaptability` increases variance under high workload — see §11), then perturbed by a small `RandomSource`-driven noise term keyed `staff-decision-quality-v1:${responsibilityId}:${gameDate}` so outcomes are reproducible and never use `Math.random()` per `AGENTS.md`.

This spec defines the **extension point and its exact signature**, not the tuning constants — those are an implementation-time decision per domain (Wave 2/3), reviewed the same way MatchEngine's provisional constants are labeled "prototype" in ARCHITECTURE.md.

### 10.3 Concrete behavioral hooks named in the issue brief (mapped to the model)

| Issue brief example | Model expression |
|---|---|
| Strong development coach → better individual development recs | `trainingQuality` weights `playerDevelopment` heavily; higher `qualityScore` narrows the stimulus-variance band applied in `TrainingPlayerResult` (Wave 2) |
| Poor scout → noisier evaluations | Already representable today via `EvaluatorProfile`/`EvaluatorFinding.uncertainty` in the existing Scouting domain — Wave 3 wires `qualityScore` into `EvaluatorProfile.experience`-adjacent uncertainty inflation, not a new noise system |
| Conservative medical professional → longer recovery recommendations | `medicalQuality` (Wave 4) biases a `returnToPlayRecommendation` `DelegationOutcome.payload.recommendedExtraDays` upward when `personality.temperament` is low / `discipline` is high — extension point only, no tuning committed here |
| Aggressive performance coach → tolerates more workload | Same shape as above, `performance` department, Wave 4+ |
| Ambitious assistant dissatisfied when denied responsibility | `personality.ambition` feeds a morale/relationship event when a `Responsibility` reassignment away from a staff member occurs (Wave 5, §8) |

None of these are implemented behaviorally by this spec — each is a named, typed extension point with an owning wave.

---

## 11. Workload / capacity model

### 11.1 Derived, not stored

Workload is **never persisted** — it is a pure projection over `responsibilitiesById` and `teamStaffAssignmentsById`, consistent with the architecture-wide rule "do not persist derived values when they can be reconstructed" (`AGENTS.md`).

```ts
export interface StaffWorkloadSnapshot {
  readonly staffId: StaffPersonId
  readonly totalCapacityUsed: number     // sum of capacityCost across held responsibilities + role assignment base cost
  readonly capacityLimit: number          // derived from role seniority (director > senior > standard > junior) — a small closed lookup table, not a stored field
  readonly utilization: number            // totalCapacityUsed / capacityLimit
  readonly overloaded: boolean            // utilization > 1
}
export function calculateStaffWorkload(world: GameWorld, staffId: StaffPersonId): StaffWorkloadSnapshot
```

`capacityCost` per responsibility/role comes from `RESPONSIBILITY_REGISTRY`/`STAFF_ROLE_REGISTRY` (§6.3, §9.1) — data, not a hardcoded per-call number.

### 11.2 Overload consequence (extension point, Wave 3+)

`overloaded: true` degrades `DecisionQualityFn` inputs (§10.2) — a capped quality penalty, not a hard block — and is surfaced in the UI (§23) as a warning. Adding staff to a department increases aggregate department capacity by construction (more `StaffPerson` rows sharing the same responsibility pool), satisfying the issue brief's requirement that "the architecture should allow adding more staff to improve organizational capacity" without any special-case code — it falls out of the derived-projection model automatically.

---

## 12. Staff knowledge / organization knowledge integration

### 12.1 Reuse `OrganizationKnowledge`, extend provenance attribution

`OrganizationKnowledge`/`OrganizationKnowledgeDimension` (`src/domain/knowledge/OrganizationKnowledge.ts:6-8`) already has:

```ts
provenance: 'legacyBaseline' | 'public' | 'ownObservation' | 'scoutReport' | 'inferred'
evidenceIds?: readonly string[]
reportIds?: readonly string[]
```

No new knowledge type is introduced. Wave 3 adds exactly one thing: a query helper that, given a `reportIds` list on a dimension, resolves back to the originating `EvaluatorReport.evaluatorStaffId` (already present, §2.3) — i.e., "why does the org know this" already terminates at a `StaffPersonId` today; Staff V2 only needs to **surface** that chain in UI (§23), not build it.

### 12.2 Non-scouting staff knowledge (e.g. "an assistant knows an opponent")

New, narrow addition in Wave 3: `provenance` gains one more value, `'staffFamiliarity'`, produced when a `Responsibility` of kind `oppositionScouting`/`advanceScout`-flavored kinds resolves — the holder's prior `EvaluatorReport`/assignment history against that opponent organization increases `coverage`/`confidence` on relevant `OrganizationKnowledge` dimensions for future match-prep responsibilities. This is a bounded, deterministic contribution (never omniscience, per the issue brief's explicit prohibition) — a staff member who has scouted a team before produces marginally better opposition prep, expressed purely as a `coverage`/`confidence` adjustment on existing dimensions, never a new "hidden truth reveal."

---

## 13. Contracts and career integration

### 13.1 Direct structural mirror of Coach Career

New domain module `src/domain/staffCareer/StaffCareer.ts`, mirroring `src/domain/coachCareer/CoachCareer.ts` 1:1 in shape (not by import — Staff and Coach remain distinct entity kinds per `docs/ARCHITECTURE.md:596`, "Coach and StaffPerson technical identities also remain distinct for now"):

```ts
export type StaffEmploymentStatus = 'employed' | 'unemployed'
export interface StaffEmployment { readonly status: StaffEmploymentStatus; readonly teamId?: TeamId; readonly roleId?: StaffRoleId; readonly startedOn?: GameDate }

export type StaffAppointmentReason = 'initialAppointment' | 'hired' | 'promoted' | 'reassigned'
export type StaffDepartureReason = 'fired' | 'resigned' | 'acceptedOtherJob' | 'retired'
export interface StaffCareerAppointmentEntry { readonly kind: 'appointment'; readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly roleId: StaffRoleId; readonly date: GameDate; readonly reason: StaffAppointmentReason }
export interface StaffCareerDepartureEntry { readonly kind: 'departure'; readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly date: GameDate; readonly reason: StaffDepartureReason }
export type StaffCareerHistoryEntry = StaffCareerAppointmentEntry | StaffCareerDepartureEntry

export type StaffJobOpeningStatus = 'open' | 'filled' | 'closed'
export interface StaffJobOpening { readonly id: StaffJobOpeningId; readonly teamId: TeamId; readonly roleId: StaffRoleId; readonly status: StaffJobOpeningStatus; readonly createdOn: GameDate }

export type StaffJobCandidacyStatus = 'identified' | 'interviewing' | 'rejected' | 'offered' | 'withdrawn' | 'hired'
export interface StaffJobCandidacy { readonly id: StaffJobCandidacyId; readonly jobOpeningId: StaffJobOpeningId; readonly staffId: StaffPersonId; readonly status: StaffJobCandidacyStatus; readonly createdOn: GameDate }

export type StaffJobOfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'
export interface StaffJobOffer { readonly id: StaffJobOfferId; readonly jobOpeningId: StaffJobOpeningId; readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly annualSalary?: number; readonly createdOn: GameDate; readonly status: StaffJobOfferStatus }

export type StaffFiringReason = 'performance' | 'budgetCuts' | 'roleEliminated'
export interface StaffFiringDecision { readonly staffId: StaffPersonId; readonly teamId: TeamId; readonly date: GameDate; readonly reason: StaffFiringReason }
```

Same pure state-machine function shapes as `CoachCareer.ts` lines 47-95: `createStaffEmployment`, `createStaffJobOpening`, `transitionStaffJobCandidacy` (identical transition table), `transitionStaffInterview`, `decideStaffJobOffer`, `appointStaffToTeam`, `fireStaff`, `staffLeaveForAnotherJob`.

Application boundary `src/app/staffCareer/StaffCareerService.ts` mirrors `CoachCareerService.ts` function-for-function: `createStaffJobOpeningForTeam`, `getOpenStaffJobs`, `identifyStaffCandidate`, `startStaffInterview`/`completeStaffInterview`, `createStaffJobOffer`, `acceptStaffJobOffer` (full hire transaction: transitions, handles simultaneous departure from prior team, `appointStaffToTeam`, rejects competing candidacies, records `hired`/`leftClub`-equivalent memories, news item), `declineStaffJobOffer`/`withdrawStaffJobOffer`, `fireStaffFromTeam` (full fire transaction mirroring `fireCoachFromTeam`), `runStaffHiringProcessForOpening` (AI autopilot).

### 13.2 GameWorld additions

```ts
staffEmploymentByStaffId: Readonly<Record<StaffPersonId, StaffEmployment>>
staffCareerHistoryByStaffId: Readonly<Record<StaffPersonId, readonly StaffCareerHistoryEntry[]>>
staffJobOpeningsById: Readonly<Record<StaffJobOpeningId, StaffJobOpening>>
staffJobCandidaciesById: Readonly<Record<StaffJobCandidacyId, StaffJobCandidacy>>
staffInterviewsByCandidacyId: Readonly<Record<StaffJobCandidacyId, StaffInterview>>
staffJobOffersById: Readonly<Record<StaffJobOfferId, StaffJobOffer>>
```

All additive, no-indexer-needed patch fields (§3.11). `TeamStaffAssignment` (existing) becomes the "currently filled" projection — `StaffEmployment.status === 'employed'` should always correspond to exactly one `TeamStaffAssignment` row; Wave 4 adds a validation rule to `validateWorld` enforcing this invariant, mirroring the existing Coach↔Team bidirectional validation already present for `Team.coachId`.

### 13.3 Staff contracts (new — no existing template covers compensation, only Coach personal finance and Player contracts, both semantically different)

```ts
export type StaffContractKind = 'standard'
export interface StaffContractTerm { readonly startsOn: GameDate; readonly expiresOn: GameDate }
export interface StaffContractCompensation { readonly annualSalary: number }
export interface StaffContract {
  readonly id: StaffContractId
  readonly staffId: StaffPersonId
  readonly teamId: TeamId
  readonly kind: StaffContractKind
  readonly term: StaffContractTerm
  readonly compensation: StaffContractCompensation
  readonly termination?: { readonly effectiveOn: GameDate; readonly reason: StaffFiringReason | 'resigned' }
}
```

This deliberately mirrors `PlayerContract`'s shape (`src/domain/contract/PlayerContract.ts:6`) rather than `CoachFinanceProfile` — a staff contract is an *employment obligation* (like a player contract), not a *personal economy* (like Coach Finances, which additionally tracks investments/lifestyle/debts irrelevant to an employee record). `TO DECIDE`: whether Wave 4 needs cap-hit/guaranteed-money granularity like `PlayerContract.compensation.years` — this spec recommends **no**, since no salary-cap system currently applies to staff and none is proposed here; a flat `annualSalary` is sufficient until a concrete reason to model staff cap impact exists.

### 13.4 Finance integration

```ts
// TeamFinances (src/domain/finance/TeamFinances.ts:2) gains one field:
export interface TeamFinances { readonly teamId: TeamId; readonly playerSalaryBudget: number; readonly staffSalaryBudget: number }
```

A new derived `TeamStaffPayroll` projection (mirrors `TeamPayroll` for players) sums active `StaffContract.compensation.annualSalary` for a team — never stored, always computed, per the existing Salary Engine's "derived projection only" rule (`ARCHITECTURE.md:867`). No new financial system is introduced; this is one additive field plus one derived query function.

### 13.5 Staff Reputation (Wave 4/5)

Mirrors `CoachReputationProfile` in shape but with department-relevant dimensions rather than Coach's four:

```ts
export const STAFF_REPUTATION_DIMENSIONS = ['competence', 'reliability', 'publicStanding'] as const
// values 0-1000, default 200, same band derivation curve as CoachReputation (unknown..legendary)
export interface StaffReputationProfile { readonly values: Readonly<Record<StaffReputationDimension, number>>; readonly events: readonly StaffReputationEvent[] }
```

`TO DECIDE`: exact dimension count/naming — three is the recommended minimum (a role-competence signal, a "how much can you rely on their delegated output" signal, and a public-facing signal reused by future media integration), deliberately smaller than Coach's four since Staff reputation has fewer current consumers. Do not implement Staff Reputation before Wave 4 — it has no consumer until the staff job market (candidate ranking, mirroring `rankCoachCandidates`) exists.

---

## 14. Training integration

### 14.1 Migrate `trainingResponsibilitiesByTeamId` onto the general Responsibility model

Mapping (Wave 2, one-time):

| Old `TrainingResponsibility` | New `ResponsibilityKind` |
|---|---|
| `'teamTraining'` | `'createTeamTrainingPlan'` |
| `'individualDevelopment'` | `'assignIndividualDevelopment'` |
| `'physicalLoad'` | `'determineIntensity'` |

Migration function `migrateTrainingResponsibilities(world)`: for each `(teamId, TrainingResponsibility, StaffPersonId)` entry in the legacy map, create one `Responsibility` row with `mode: 'delegated'`, `holderStaffId` set. Then the legacy map is retired — **not kept as a parallel source of truth** (satisfies "no duplicate delegation results" from the issue brief's Data Integrity section). Existing `IndividualTrainingPlan.responsibleStaffId` field is deprecated in favor of resolving the holder through `Responsibility` lookup at execution time; the field is left in place (harmless, unused) rather than removed, since `IndividualTrainingPlan` itself is already noted as legacy/non-auto-applied (`CalendarEngine.ts:18-21`) — removing it is out of scope and would touch save compatibility unnecessarily.

### 14.2 Delegated execution (Wave 2)

When a `createTeamTrainingPlan` or `assignIndividualDevelopment` responsibility is `mode: 'delegated'`, the calendar's existing `executeScheduledTrainingSessions` pipeline (`CalendarEngine.ts`) consults the `Responsibility` holder before falling back to the user's manually-set plan:

1. Resolve responsibility for `teamId` + kind.
2. If `userControlled` or vacant → existing behavior, unchanged.
3. If `delegated` with a holder → call `trainingQuality(context, seed)` (§10.2) to bound a `TrainingPlayerResult.stimulus` variance multiplier (higher quality narrows variance toward an idealized plan; lower quality widens it) — the plan *content itself* (intensity/focus/module) is still chosen deterministically by a bounded heuristic reading the holder's `playerDevelopment`/`coaching` attributes, not invented free-form.
4. Record one `DelegationOutcome` per execution with `payload` summarizing the chosen plan parameters, for UI transparency (§23).

This is the **only** wave that touches simulation-affecting behavior for training; it is scoped narrowly (variance bound + deterministic plan choice) specifically so it cannot silently change existing balance for teams that keep everything `userControlled` (the default, per §9.3).

---

## 15. Tactics integration

Wave 3 fills the explicitly-named ARCHITECTURE.md gap ("scouting" and "staff insights" during live coaching, `ARCHITECTURE.md:351,363`) without touching `MatchTacticalPlan`, `MatchSession`, or any in-match RNG stream.

### 15.1 Opposition scouting report (new, pre-match only)

```ts
export interface OppositionScoutingReport {
  readonly id: string
  readonly teamId: TeamId               // the team receiving the report
  readonly opponentTeamId: TeamId
  readonly gameId: GameId
  readonly authoredByStaffId: StaffPersonId
  readonly generatedOn: GameDate
  readonly qualityScore: number          // from DecisionQualityFn, §10.2
  readonly recommendedDefensiveEmphasis?: 'interior' | 'perimeter'
  readonly recommendedPaceAdjustment?: -2 | -1 | 0 | 1 | 2
  readonly flaggedPlayerIds: readonly PlayerId[]   // opponent players to feature defensively, bounded list
}
```

A `oppositionScouting` responsibility in mode `advisory` produces one `OppositionScoutingReport` per upcoming scheduled game (generated at a fixed lead time, e.g. the calendar day the game becomes "next scheduled"), surfaced pre-match exactly like today's manual `MatchTacticalPlan` selection UI, as a *suggested* plan the user can accept (copies its fields into their `TeamTacticalInstructions`) or ignore. It never auto-applies (advisory only in Wave 3); `delegated` mode for this responsibility, if ever added, is explicitly deferred past this spec's phases.

This is additive: `MatchTacticalPlan`/`TeamTacticalInstructions` gain no new fields; the report is a separate, pre-match-only advisory artifact that a user flow copies from.

### 15.2 "Staff insights" during live coaching

Deferred past Wave 5 (`TO DECIDE`, explicitly out of scope). `ARCHITECTURE.md:363` names this as unimplemented; this spec does not commit to an in-match design because `MatchSession`'s live-coaching boundary is orthogonal to Staff V2's scope and touching it risks the sporting-history-immutability invariants documented in ARCHITECTURE.md ("Coaching decisions may alter the future simulation trajectory but must never rewrite already-resolved sporting history"). A future Issue should scope this specifically once Staff V2's advisory/delegation plumbing exists to draw from.

---

## 16. Scouting integration

Wave 3. No new scouting types — the full attribution chain already exists (§2.3, §12). Concretely:

1. `assignScouts`/`prioritizeRegions` responsibilities, when `delegated` to a `headScout`, call into the **existing** `requestScouting()`/`progressScoutingAssignments()` (`ScoutingEngine.ts:20,41`) instead of requiring direct user action — the headScout's own `evaluatorProfile()` strength plus a small allocation heuristic (prioritize by `RecruitProfile.tier`/public rank, deterministic) decides which prospects/opponents get assignments each cycle, up to the department's aggregate capacity (§11).
2. `oppositionReport`/`prospectReport` responsibilities produce `EvaluatorReport`s exactly as today's manual flow does — Staff V2 adds no second report type; it only adds *who triggers report creation* (delegated staff vs. manual user request).
3. `DecisionQualityFn` for scouting reads `EvaluatorProfile.experience` and role proficiency to bound `EvaluatorFinding.uncertainty` — a lower-quality holder produces reports with wider uncertainty bands, directly satisfying the issue brief's "poor scout produces noisier evaluations" example using the existing uncertainty field, not a new one.

---

## 17. Medical integration

Wave 4. `InjuryRecord` (`src/domain/injury/Injury.ts:5`) gains no new fields. A `returnToPlayRecommendation`/`treatmentRecommendation` responsibility, when `advisory`, produces a `DelegationOutcome` with `payload.recommendedExtraDays: number` — a bounded adjustment the user may accept to shift `InjuryRecord.expectedReturnDate` later (more conservative) or, within a smaller allowed band, earlier. The existing deterministic injury generation/recovery pipeline (`recoveryDaysForSeverity`, `injuryReturnDate`) remains the sole source of the *base* recovery window; medical staff can only apply a bounded, personality-influenced adjustment on top, never override the base injury model. `riskAssessment` responsibility surfaces a UI-only warning (e.g., "high fatigue + minor injury history" flag) with no domain-state effect in Wave 4 — a pure read/derived-projection responsibility, safest to ship first for this domain.

---

## 18. Recruiting/Draft integration

Wave 4, NCAA-like ecosystems only (matches the existing `applicableEcosystemKinds` gating, §6.5). `RecruitProfile`/`Draft`/`DraftPick` gain no new fields. `prospectIdentification`/`recruitEvaluation`/`recruitingPriorities` responsibilities, when held by `recruitingCoordinator`/`positionalRecruiter`, feed the **existing** Recruiting Engine action boundary (contact/pitch/visit/offer, `ARCHITECTURE.md:832`) using the same capacity/history mechanics already in place — Staff V2 only determines *which staff member's attributes bound the AI recruiting heuristic's quality*, not a new recruiting action set. Draft evaluation (`potentialEvaluation`-weighted) reuses `OrganizationKnowledge`/`EvaluatorReport` exactly as pro scouting does (§16) — no separate draft-specific staff knowledge concept.

---

## 19. Finance integration

Covered in §13.3–13.4. No new financial engine. `staffSalaryBudget` is one additive `TeamFinances` field; `StaffContract` mirrors `PlayerContract` shape; a derived `TeamStaffPayroll` projection sums active contracts. Staff contracts never interact with `SalaryRules`/cap/apron systems (those are NBA-like player-payroll-specific, `ARCHITECTURE.md:858-882`) — staff salaries are outside any salary cap by design, matching how real-world coaching/front-office staff salaries are typically cap-exempt.

---

## 20. Memory/Narrative/Media integration

Covered in §8. Wave 5 adds staff-owned memories (`hired`, `fired`, `promoted`, `responsibilityGranted`, `responsibilityRevoked`) via the existing `recordMemory()` boundary. Dynamic Narratives and Media/Inbox/News integration follow the exact existing pattern used by Coach Career (`InboxItem` for pending offers, `NewsItem` for hire/fire events, `ARCHITECTURE.md:745-750`) — Wave 4's `StaffCareerService` emits the same two item kinds for staff hiring/firing events, reusing `InboxItem`/`NewsItem` types verbatim with no new fields.

---

## 21. Save schema and migration strategy

### 21.1 Schema versioning

All new collections are added under the current `GameWorldSaveV2` envelope (`src/save/GameWorldSaveV2.ts:13-14`) as new optional fields — no `schemaVersion` bump is required for Wave 1–3 (purely additive optional collections, following the same pattern `organizationKnowledge`/`scoutingRuntime`/`marketRuntime` already used to extend V1→V2). If Wave 4's `StaffContract`/`staffSalaryBudget` addition to `TeamFinances` is judged non-additive to the *existing* `TeamFinances` shape (it changes an existing interface, not just adding a new top-level collection), a `GameWorldSaveV3` step is the correct boundary — `TO DECIDE` at Wave 4 implementation time, following the exact `migrateGameWorldSaveV1ToV2` precedent (`GameWorldSaveV2.ts:27`).

### 21.2 Enrichment functions required (one per new sparse collection, mirroring `ensureStaffStructure`/`ensurePlayerKnowledge`)

| Wave | Function | Behavior on legacy load |
|---|---|---|
| 1 | `ensureResponsibilityStructure(world)` | Backfill one `Responsibility` row per team per `RESPONSIBILITY_KIND`, `mode: defaultMode` (`userControlled`), no holder |
| 2 | `migrateTrainingResponsibilities(world)` | One-time: convert legacy `trainingResponsibilitiesByTeamId` entries into `Responsibility` rows, then the legacy map is left empty going forward (still read for saves that predate Wave 2, per §14.1) |
| 4 | `ensureStaffEmploymentStructure(world)` | For every existing `TeamStaffAssignment`, backfill a matching `StaffEmployment{status:'employed', teamId, roleId}` and one `StaffCareerAppointmentEntry{reason:'initialAppointment'}` if missing — mirrors the exact Coach Career legacy-enrichment precedent (`ARCHITECTURE.md:754`, "Legacy saves enrich assigned coaches with an initial appointment") |
| 4 | `ensureStaffContractStructure(world)` | Backfill a deterministic default-salary `StaffContract` for every employed staff person missing one — mirrors `TeamFinances` legacy enrichment (`ARCHITECTURE.md:465-469`) |

Every function follows the exact five-step pattern documented in §3.12: pure `(GameWorld) => GameWorld`, compute only missing records, no-op if nothing missing, commit via `updateGameWorld`, invoked from the tail of the deserialize pipeline.

### 21.3 Determinism of backfilled data

Any backfilled numeric value (e.g. default salary) uses a deterministic seeded stream keyed by stable IDs (`staff-contract-backfill-v1:${staffId}`), exactly matching `ensurePlayerKnowledge`'s `SeededRandomSource(hashStringToSeed(...))` precedent — never `Math.random()`.

---

## 22. Determinism requirements

- No `Math.random()` anywhere in Staff V2 code, per `AGENTS.md`. All `DecisionQualityFn` implementations and any backfill/generation code must accept or construct a `RandomSource` keyed by stable IDs.
- `DelegationOutcome.qualityScore` and any generated plan/report content must be reproducible: same world state + same seed inputs (staff id, date, responsibility id) ⇒ same output, exactly like `player-potential-v1:${playerId}` and `match-decisions-v1:${gameId}` precedents.
- Responsibility execution during calendar advancement must be **order-independent** across teams (processing Team A's delegated training before Team B's must not change either team's outcome) — mirrors the existing per-player/per-rating independent-seed rule for Player Development (`ARCHITECTURE.md:675`).

---

## 23. UI / view-model integration plan

No visual redesign. `StaffScreen.tsx` (§2.1) already has the right shape (list + detail, Entity-Action-aware rows) — Wave 4 extends it, does not replace it:

1. **Staff list** (existing table) gains department/seniority columns once `STAFF_ROLE_REGISTRY` exists (Wave 1) — additive columns only.
2. **Staff detail** (existing panel) gains new sections, each conditionally rendered only when the backing data exists (graceful for legacy saves mid-migration):
   - Responsibilities held (Wave 1+, from `responsibilitiesById` filtered by `holderStaffId`)
   - Workload (Wave 3+, from `calculateStaffWorkload`)
   - Contract summary (Wave 4+, from `staffContractsById`)
   - Relationships involving this staff member and the user coach (Wave 5+, reusing the existing Coach relationship display pattern, `ARCHITECTURE.md:715-718`)
   - Recent recommendations/`DelegationOutcome`s (Wave 2+)
3. **Department view** (new screen or new tab on the existing screen, `TO DECIDE` at Wave 4 implementation — recommendation: a tab within `StaffScreen`, not a new top-level screen, to avoid navigation sprawl) — groups staff by `StaffDepartment`, shows aggregate workload per department.
4. **Responsibilities view** (new tab) — lets the user see/reassign the `mode`/`holderStaffId` for each `Responsibility` row for their team. This is the UI surface for "delegate this to my assistant" — a simple select-per-row form, no new design system components needed (reuses existing table/panel patterns visible in `StaffScreen.tsx`).
5. **Hiring/search** (Wave 4) — mirrors the existing Coach job-market/offer UI patterns (`ARCHITECTURE.md:758`, "Coach UI presents current employment, chronological history, active processes and pending offers") applied to Staff job openings.

All new UI reads canonical queries/derived selectors; it must not reimplement role weights, quality functions, or business rules client-side, per the existing Staff v1 presentation rule (`ARCHITECTURE.md:525-526`).

---

## 24. Future Entity Action integration

Not implemented in this branch (Issue #6B owns the Entity Action system's evolution). This spec only records the **intended mapping**, so a future wave can light it up without redesigning `staffActions.ts`:

| Root | Wave that unlocks it | New `capabilityStatus` | `buildResult` becomes |
|---|---|---|---|
| `assess` | 1 | `EXECUTABLE_NOW` | `createEntityCommand('staff.assess', { staffId })` → opens/returns role-evaluation view (already computable via `calculateStaffRoleProficiency`, no new domain logic) |
| `assign` | 1 | `EXECUTABLE_NOW` | `createEntityCommand('staff.assign', { staffId, responsibilityId, mode })` → calls a new `assignResponsibility(world, ...)` Application function |
| `delegate` | 1 | `EXECUTABLE_NOW` | same executor family as `assign`, `mode: 'delegated'`/`'advisory'` |
| `develop` | 2/3 | `HANDOFF_NOW` | opens a staff development/attribute-history view once staff experience exists (deferred — see §26 open risk) |
| `talk` | 5 | `HANDOFF_NOW` | opens a relationship/conversation surface reusing existing Coach interaction patterns |
| `negotiate` | 4 | `EXECUTABLE_NOW` | wraps `createStaffJobOffer`/contract renegotiation |
| `release` | 4 | `EXECUTABLE_NOW` | wraps `fireStaffFromTeam` |
| `compare` | 4 | `HANDOFF_NOW` | opens a multi-staff comparison view (pure UI over existing queries) |

None of this requires changes to `EntityActionRegistry`, `ComposerEngine`, or the catalog composition pattern — only `staffActions.ts` availability/capability/buildResult edits plus new `EntityActionExecutorRegistry.register('staff.<root>', ...)` calls, exactly the seam identified in §2.2. This table is the hand-off contract for whichever wave implements it; it deliberately does not touch `src/app/entityActions/*` in this branch.

---

## 25. Extensibility rules

1. **New role** = one new `STAFF_ROLE_REGISTRY` entry (id, department, seniority, attributeWeights, capacityCost, optional ecosystem gating). Never a new switch/if-chain.
2. **New responsibility** = one new `RESPONSIBILITY_REGISTRY` entry plus (if it needs real execution) one new domain-specific `DecisionQualityFn` module under `src/engine/staff/quality/`. Never modifies the `Responsibility`/`DelegationOutcome` shape itself.
3. **New ecosystem kind** (a hypothetical future universe) needs no Staff V2 code change unless it wants ecosystem-specific roles — then it adds registry entries with `applicableEcosystemKinds` set, exactly like Recruiting today.
4. Adding a role or responsibility must never require touching: `StaffScreen.tsx` shell, `GameWorld`'s save/load boundary function bodies (only its type + one new optional field), or any other staff type's registry entries.
5. Every new `DecisionQualityFn` must be a pure function accepting `DecisionQualityContext` + a seed string — no direct `GameWorld` mutation, no direct RNG access outside the injected `RandomSource` pattern.
6. No responsibility may bypass Contracts/Salary/Recruiting/Eligibility/Trade authorities — mirroring the existing NCAA enforcement rule ("Enforcement... never decides [outcomes], only creates canonical restrictions consumed by their true authority," `ARCHITECTURE.md:973-977`). A `tradeRecommendation` responsibility, e.g., only ever produces an advisory `DelegationOutcome`; it never calls `TradeEngine.execute` directly.

---

## 26. Known risks / architectural decisions

1. **`headCoach` role identity** (§6.4): resolved by keeping Head Coach responsibilities on a separate `eligibleParticipant: 'coach'` marker rather than folding `Coach` into `StaffPerson`. Risk: some future responsibility genuinely needs "either a Head Coach or an Associate Coach" eligibility — the model supports this today only by listing both `eligibleParticipant` values as a to-be-added union if that need arises; not built speculatively now.
2. **Personality dimension count mismatch**: ARCHITECTURE.md prose says 6 dimensions; code (`Personality.ts`) has 8 (`adaptability`, `competitiveness` additionally). This spec follows the code as ground truth (§3.2) — the ARCHITECTURE.md prose is stale and should be corrected in a future doc-only commit, out of scope here.
3. **Staff experience/development system does not exist** (unlike Coach RPG). This spec deliberately does **not** propose a `StaffRpgProfile` mirroring `CoachRpgProfile` — professional attributes for Staff remain static (bootstrap truth) through all 5 waves, exactly as today. Adding staff progression is a natural Wave 6+ candidate but is out of scope: it would require its own product decision (should staff attributes grow through delegated-responsibility outcomes? through a paid-education analog to Coach's future course system?) that is not "already approved" per `AGENTS.md`'s stop-condition rule.
4. **`negotiation` attribute deferral** (§7.1): risk of Wave 4 discovering it's needed earlier than planned if `capContractsSpecialist`/GM responsibilities get implemented before contracts negotiation logic exists. Mitigated by explicit wave ordering (§27) putting Contracts and Basketball-Ops responsibility execution in the same wave.
5. **`trainingResponsibilitiesByTeamId` migration** (§9.5, §14.1, §21.2) is a one-time, one-directional migration. Risk: a save mid-migration (partially Wave-1, partially Wave-2 code) could see stale data if the migration function isn't idempotent. Mitigated by requiring `migrateTrainingResponsibilities` to be safely re-runnable (checks for existing equivalent `Responsibility` rows before creating new ones, same idempotency discipline as `recordMemory`'s semantic-key dedup).
6. **Save schema version boundary for Wave 4's `TeamFinances` change** (§21.1) is explicitly left `TO DECIDE` — implementers must check whether the additive-optional-field convention is sufficient or whether a `GameWorldSaveV3` following the exact V1→V2 migration precedent is warranted, and should not guess silently (per `AGENTS.md` stop conditions on "a DECIDED source-of-truth rule would need to change").
7. **AI teams and responsibility defaults**: this spec assumes AI teams remain fully `userControlled`-equivalent (i.e., processed via the same organizational/AI logic that exists today, e.g. `AI roster maintenance v1`) unless/until a future wave explicitly gives AI teams delegated staff behavior. Wave 1–3 must confirm AI-team simulation paths are unaffected by the mere *existence* of `Responsibility` rows defaulting to `userControlled` — this needs a regression check, not a design change, at implementation time.

---

## 27. Proposed Issue #10 implementation scope and waves

Recommended scope for the *next* implementation issue(s) following this spec — four waves, each independently shippable, clean-commit, and non-breaking to existing saves/behavior.

### Wave 1 — Domain + Persistence (taxonomy, responsibilities-as-data, base identity fields)
- `STAFF_ROLE_REGISTRY` (§6.3–6.4), generalize `calculateStaffRoleProficiency` to read from it; verify legacy 3-role proficiency values are byte-identical.
- `StaffIdentity.dateOfBirth?`/`nationality?` additive fields (§5.1).
- `Responsibility`/`ResponsibilityDefinition`/`RESPONSIBILITY_REGISTRY` (§9.1) as pure data + persistence; **no execution logic**.
- `responsibilitiesById` GameWorld collection + `ensureResponsibilityStructure` legacy enrichment (§21.2).
- `StaffWorkloadSnapshot`/`calculateStaffWorkload` derived projection (§11), unused by any UI yet but unit-testable.
- Unit tests: registry proficiency parity, responsibility default-mode enrichment idempotency, workload calculation math.
- **Acceptance**: existing Staff behavior (proficiency scores, UI, save/load) is bit-for-bit unchanged for any save that predates this wave; new collections are present and empty/defaulted.

### Wave 2 — Training delegation (first real delegated execution)
- `DecisionQualityFn` signature (§10.2) + `trainingQuality` implementation.
- `DelegationOutcome` type + `delegationOutcomesById` collection.
- Training responsibility execution hook in `CalendarEngine`'s existing training pipeline (§14.2), gated so `userControlled` (default) is unaffected.
- `migrateTrainingResponsibilities` one-time migration retiring `trainingResponsibilitiesByTeamId` as a second source of truth (§14.1, §21.2).
- Tests: delegated-vs-user-controlled parity when quality is neutral; determinism (same seed ⇒ same stimulus); migration idempotency.
- **Acceptance**: a team with a `delegated` training responsibility produces deterministic, seeded, staff-attribute-influenced `TrainingPlayerResult`s; a team that never delegates sees zero behavior change.

### Wave 3 — Scouting + Tactics integration, Staff Knowledge surfacing
- Scouting responsibility execution wired to existing `ScoutingEngine`/`EvaluatorProfile`/`EvaluatorReport` (§16).
- `OppositionScoutingReport` type + advisory-only tactics integration (§15.1).
- `OrganizationKnowledge.provenance` gains `'staffFamiliarity'`; staff-attribution surfacing query (§12).
- Workload overload penalty wired into `DecisionQualityFn` inputs (§11.2).
- Tests: scout quality → `EvaluatorFinding.uncertainty` correlation; opposition report generation determinism; overload degrades quality monotonically.
- **Acceptance**: delegated scouting/opposition-prep responsibilities produce advisory artifacts a user can accept/ignore, with zero forced auto-application of tactical changes.

### Wave 4 — Career, Contracts, UI, Medical/Recruiting advisory
- `StaffCareer` domain + `StaffCareerService` Application boundary (§13.1–13.2), full hire/fire/promote lifecycle.
- `StaffContract`, `TeamFinances.staffSalaryBudget`, `TeamStaffPayroll` derived projection (§13.3–13.4); resolve the save-schema-version question (§21.1, §26.6).
- `StaffReputationProfile` (§13.5) — only once the job market/candidate-ranking consumer exists.
- Medical (`riskAssessment` read-only, then `returnToPlayRecommendation`/`treatmentRecommendation` advisory, §17) and Recruiting (§18) advisory responsibilities, NCAA-like-gated.
- UI: Staff list/detail extensions, Responsibilities tab, Department view, Hiring/search surface (§23).
- Legacy enrichment: `ensureStaffEmploymentStructure`, `ensureStaffContractStructure` (§21.2).
- Tests: full hire→fire lifecycle parity with Coach Career test patterns; contract backfill determinism; UI selector purity (no client-side business logic).
- **Acceptance**: a user can hire, assign, delegate to, negotiate with, and fire a staff member entirely through UI, backed by persisted canonical state; AI teams run an equivalent autopilot hiring process mirroring `runCoachHiringProcessForOpening`.

### Wave 5 — Autonomy, Morale/Relationship/Memory consequences, Narrative hooks
- Personality-driven morale/relationship events for responsibility grant/revoke, promotion denial, firing (§8, §10.3).
- Staff-owned `MemoryRecord`s for career events (§20).
- Ambition-driven dissatisfaction signal (read-only surface first: a UI flag on the staff detail panel; any staff-initiated resignation behavior is a further `TO DECIDE` follow-up, not committed here to avoid speculative AI-driven churn without a tuning pass).
- Tests: relationship/morale event determinism and idempotency; memory semantic-key dedup for repeated career events.
- **Acceptance**: delegating/revoking responsibilities and hiring/firing staff produces visible, explainable relationship/morale/memory consequences using only existing generic systems — no new parallel personality/relationship/memory concept introduced.

Waves 1–3 are the recommended scope for an initial Issue #10 implementation PR sequence (foundation + first real delegated behavior + the two subsystems — scouting and tactics — that most directly address the issue brief's headline goals). Waves 4–5 (career/contracts/UI and autonomy/narrative) are substantial enough to warrant their own follow-up issue(s), consistent with the "one milestone per run" autopilot discipline in `AGENTS.md`.

---

## 28. Detailed acceptance criteria (cross-wave, Definition of Done overlay)

In addition to the per-wave criteria in §27, every wave must satisfy the existing repository Definition of Done (`AGENTS.md`) unmodified:
- `npm test`, `npm run typecheck`, `npm run build`, `cargo fmt --check`, `cargo check` all green.
- Zero `Math.random(` occurrences introduced in `src/`.
- No React/Zustand/Tauri imports introduced into `src/domain` or `src/engine`.
- No opportunistic refactor of unrelated Staff v1/Coach Career/Scouting code beyond the specific integration points named in this document.
- Every new persisted collection has an accompanying legacy-save enrichment function and a test proving it is a no-op on already-migrated saves.
- Every new `RESPONSIBILITY_REGISTRY`/`STAFF_ROLE_REGISTRY` entry has at least one unit test asserting its `attributeWeights` sum to a sane bounded range (mirrors the implicit convention visible in `STAFF_ROLE_ATTRIBUTE_WEIGHTS`, where weights sum to ≈1.0 per role).
- `git diff` review before commit confirms no accidental persistence of a derived value (workload, payroll) as stored state.

---

## 29. Testing strategy

1. **Domain unit tests** (pure functions, no world): registry lookups, state-machine transition tables (`transitionStaffJobCandidacy` etc. — copy Coach Career's existing transition-table test structure), `DecisionQualityFn` determinism (same inputs ⇒ same output across repeated calls).
2. **World-boundary tests**: `updateGameWorld` patches for each new collection preserve unrelated state exactly (the existing "every productive transformation unrelated to Staff must preserve staffPeopleById exactly" pattern, `ARCHITECTURE.md:502`, generalized to every new collection).
3. **Save/load round-trip tests**: serialize → deserialize → structural equality, for every new collection, plus explicit legacy-save fixture tests (a fixture predating each wave loads and gets correctly enriched, idempotently, twice in a row).
4. **Calendar integration tests**: delegated training/scouting responsibilities execute exactly once per applicable calendar checkpoint, order-independent across teams (§22).
5. **Determinism regression tests**: fixed seed + fixed world state reproduces identical `DelegationOutcome`/report content across repeated runs and across different iteration orders of the same collections.
6. **Entity Action stub tests**: confirm `staffActions.ts` continues to report accurate availability reasons as capabilities are incrementally unlocked wave over wave (extend the existing catalog test pattern referenced in `ADDING-AN-ENTITY-TYPE.md`'s `testFutureEntity` example).
7. **UI selector tests**: new Staff UI sections derive purely from canonical queries; no business logic duplicated in components (matches existing Staff v1 presentation test discipline).

---

## 30. Summary of conflicts/dependencies discovered

- **No blocking conflict with Issue #6B**: the Entity Action System's `staffActions.ts`/`productionRegistry.ts`/`EntityActionExecutor.ts` seam is stable and already merged; this spec's §24 hand-off table can be implemented by whoever owns 6B's continuation, or by a later Staff V2 wave, without needing 6B's unmerged work product.
- **Soft dependency on Contracts (Wave 4) before Basketball Operations responsibilities are meaningful** (§7.1, §26.4) — sequencing risk only, not a hard blocker, addressed by wave ordering.
- **`trainingResponsibilitiesByTeamId` is a pre-existing, narrower version of this spec's core concept** — discovered mid-audit, not previously known; Wave 2 must treat this as a migration, not a fresh green field (§9.5, §14.1).
- **ARCHITECTURE.md prose/code drift on Personality dimension count** (§26.2) — a minor, pre-existing documentation debt unrelated to Staff V2, noted for future correction but not fixed in this spec (out of scope: this document does not edit `ARCHITECTURE.md`).
