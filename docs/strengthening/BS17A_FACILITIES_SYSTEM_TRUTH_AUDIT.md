# BS17A Facilities System Truth Audit

## 1. Executive status

**BS17A audit: PASS. Facilities end-to-end System Truth: PARTIAL, not certified complete.**

Facilities is an existing canonical physical-asset subsystem, not greenfield. CFI1-CFI8, CFI2S, CFI6A and MX0 supply substantial models, validation, deterministic queries, deterioration, explicit development commands, Save V4 and a real canonical workspace. The shipped career does not generate those physical assets. Training, Medical and Talent do not consume the sporting context on this base. Maintenance has no manager execution loop or AI policy. Development has explicit commands but no construction-progress processor. CFI7 financial operations bypass the newer spending authority and do not prove cash settlement.

Evidence grades used throughout: **code** means inspected implementation/callers; **test** means the focused existing suite actually run; **inference** means a conclusion from those facts, not a simulated career. Historical certification documents establish lineage and original scope, not present production reachability. PASS in this document never turns an isolated fixture into shipped gameplay.

Maturity scale: 0 absent; 1 data skeleton; 2 functional but isolated; 3 integrated simulation; 4 robust System Truth; 5 fully manifested manager gameplay. Scores assess this exact base and do not average away missing links.

| Area | Score | Evidence / limiting fact |
| --- | ---: | --- |
| Facility core | 2 | Validated identities, temporal asset rights, anatomy; zero shipped asset generation |
| Condition/degradation | 3 | Real monthly Calendar processor and condition-dependent projection; no downstream sporting effects |
| Capacity | 1 | Stored physical/unit capacities and derived court count; no allocator or throughput enforcement |
| Maintenance | 2 | Threshold needs and explicit repair engine; no decision/authorization/execution gameplay loop |
| Projects | 2 | Real command transitions and physical completion; no planning/progress production loop |
| Training integration | 1 | Context seam exists; Training does not consume it |
| Medical integration | 1 | Context seam exists; Medical does not consume it |
| Youth integration | 0 | Labels/components only; no Facilities-to-Talent causal path |
| Sporting impact | 1 | Factual capability projection, not effects on sporting outcomes |
| Finance integration | 2 | Real commitments/recognitions/bindings in explicit calls; not spending authority or cash completion |
| Governance | 1 | Decision taxonomy and facility subjects; no Facilities command gate |
| AI | 0 | No Facilities management planner/executor found |
| Save | 4 | Validated V4 round-trip, empty defaults, identities and history; demonstrated by focused tests |
| Long horizon | 1 | Seeded known components can wear; shipped worlds have none and no renewal/investment cycle |
| MX/UI | 2 | Canonical workspace and explicit project actions; empty shipped careers and competing PCB fiction |
| Alerts/information | 1 | Calendar diagnostics and workspace warnings; no automatic Facilities attention/action loop |

No score of 5 is justified. Core and Save are stronger than the live career loop.

## 2. Audit base / lineage

- Canonical repository inspected: `C:/BDM`, branch `main`, clean at audit start.
- Canonical main / audit HEAD: `8a0b359e9ae48fe372668241788c9d5aa7a33b03`, `feat(finance): activate BS16E canonical authorization`.
- Isolated worktree: `C:/BDM-BS17-FACILITIES`; branch `bdm-stage2-bs17a-facilities-audit`; initially clean, same HEAD.
- Date: 2026-10-09. Dependencies reused through an ignored node_modules junction; no dependency installation.
- Authority read: repository AGENTS, `docs/ARCHITECTURE.md`, `docs/autopilot/PRODUCT_GUARDRAILS.md`, supplied BS17A contract. This is audit-only; normal implementation commit/build gates are explicitly narrowed by that contract.
- No canonical-main edit, checkout/reset/clean, merge, push or commit performed by BS17A. Other BS16 worktrees are outside the write scope.

Lineage inspected in Git and current files: CFI1 `467c8aa`; CFI2 `dddf529`; CFI2S `482e6ec`; CFI3 `83537eb`; CFI4 `42e9620`; CFI5 `2545053`; CFI6 `7f5e854`; CFI6A `a337991`; CFI7 `9da1826`; CFI8 `ee9e10b`; MX0 `b183a02`, `50f8659`, `7038c30`. These are historical anchors, not instructions to replay work.

**BS15 lineage constraint:** `git merge-base --is-ancestor a20ea25 HEAD` returns 1. The previously certified BS15 branch is not an ancestor of this canonical-main base. No `src/domain/talent` production implementation is present here. BS15 remains the user-accepted Talent authority; BS17 must depend on its eventual canonical-main integration instead of reimplementing player supply. This audit did not substitute the separate BS15 integration branch for the requested current main.

## 3. Current Facilities architecture

The canonical chain is `Facility/Place -> temporal ownership/control/operator/usage -> component anatomy -> condition/serviceability -> deterioration/needs -> explicit maintenance or project operation -> updated physical truth`. All are JSON-safe pure TypeScript. `GameWorld` indexes the source facts; Save V4 serializes them; `src/app/facilities/ClubFacilitiesReadModel.ts` derives club-scoped presentation. Zustand only bridges app commands. `src/ui-ng/applications/facilities/FacilitiesWorkspace.tsx` renders the projection.

`CalendarEngine.ts:182` calls `advanceFacilitiesConditionFromHistory` on the first of each month. This is the one discovered automatic Facilities simulation processor. It does not choose repairs, invest, advance construction phases or settle expenditures. The `CLUB_FINANCE_V2` phase is explicitly skipped on this base.

CFI8 produces a `TeamSportingFacilityContext`, composed from usage rights, components and component condition records. Its production consumer is the Facilities read model. It deliberately stops before Training/Development/Medical consequence. CFI7 is an explicit integration module, not the authority for all Finance operations or Governance decisions.

## 4. Authority map

| Question | Canonical answer | Actual consumers / boundary |
| --- | --- | --- |
| What is a Facility? | `Facility.ts`: independent branded ID, place, type, purposes, authored capabilities, lifecycle and physical facts | GameWorld validation, development engine, Save, read model |
| Who owns it? | `FacilityOwnershipInterest`: Organization or Person, nullable percentage, temporal interval | Ownership queries/read model; not corporate OrganizationOwnership |
| Who controls/operates it? | Separate `FacilityControlRight` / `FacilityOperatorAssignment` | Queries/read model; neither automatically grants sporting access |
| Shared use? | Multiple temporal `FacilityUsageRight`s; SHARED/NON_EXCLUSIVE/EXCLUSIVE, component scopes, Team and/or Organization beneficiaries | Conflict queries; no schedule allocator enforcing priority/exclusivity |
| Physical place? | `Facility.placeId -> Place.id`, optional geographic parent hierarchy | Validation/Save/inspector; Organization.primaryPlaceId is a separate location reference |
| Category? | `Facility.type`; component type determines `componentCategory` | Category is derived, not a parallel saved authority |
| Quality? | No canonical overall quality score; component condition record has nullable technical standard | Standard is descriptive, independent of physical condition and age |
| Capacity? | Facility.physical, component.capacity, optional unit-tagged specification | UI and validation; court count separately derived from accessible component IDs |
| Condition? | Dated `FacilityComponentConditionRecord`; facility-wide dimensional records separately | Deterioration/repair/renovation, serviceability queries, MX0/CFI8 |
| Project transitions? | Domain allowed-transition graph; `FacilityDevelopmentEngine` executes it | Club app commands/store/NG workspace; no automatic progress engine |
| Sporting effects? | Training, Injury/Medical and Development own their outcomes; CFI8 owns only physical context | No production causal consumer discovered |
| Finance receiver? | Operating cost facts, financial commitments/recognitions/ledger, cross-reference bindings | CFI7 calls existing Finance factories; missing FinancialAuthority reservation gate |
| Governance authorization? | Existing Governance bodies/grants/decision events in their own domain | No Facilities command consumes approval/rejection; organization equality is not Board authority |
| UI truth? | NG reads `buildClubFacilitiesWorkspaceModel`; PCB uses fixture levels/local balance | Two inconsistent reachable surfaces, detailed in section 25 |

Purpose-agnostic rights are an existing CFI2/CFI8 design choice, explicitly described in the CFI8 certification. Do not silently convert them to purpose-specific permissions. Organization-only rights are representable; CFI8 resolves Team rights directly and does not inherit them from Organization ownership or rights.

## 5. Facility inventory

Paths below are relative to the repository root. Grouping records with identical persistence/consumer behavior does not imply a new model. Every persisted Facilities collection is inventoried.

| Item / files | Authority | Consumers | Persistence | Gameplay manifestation |
| --- | --- | --- | --- | --- |
| `src/domain/facilities/Facility.ts`, `FacilityType.ts`, `FacilityLifecycle.ts` | Core asset identity/catalog/lifecycle | Factories, GameWorld, projects, Save, app | Facility saved; catalogs/constants not saved | NG inventory; no shipped assets |
| `Place.ts` | Location identity, geographic hierarchy | Facility/GameWorld validation, Save, inspector | places | Place name/ID; no gameplay location consequence |
| `FacilityNameHistory.ts`, `FacilityStatusHistory.ts` | Dated name/status records | resolveFacilityNameAt / facilityStatusAt, project engine | name/status records | Current/as-of name/status; incomplete project transition history |
| `FacilityOwnership.ts`, `FacilityControl.ts`, `FacilityOperator.ts` | Distinct asset interests/permissions/operator facts | Domain queries, club accessKinds | ownership/control/operator collections | Club association labels |
| `FacilityRelationship.ts`, `FacilityUsageRight.ts` | Structural org/team links versus actual usage entitlement | Queries, CFI8, club scope | org/team relationships and usage rights | Access labels, component scope; no scheduling enforcement |
| `FacilityConflict.ts`, `FacilityCompetitionApproval.ts` | Derived rights conflict; explicit administrative approval hook | Domain callers/tests | Conflict derived; approvals saved | No Match/Competition gate consuming approvals found |
| `FacilityComponent.ts`, `FacilityComponentCategory.ts` | Anatomy, hierarchy, active interval; derived category | Deterioration/projects/CFI8/read model | components; category reconstructed | Component identity/type, capacity and readiness |
| `FacilityComponentCapability.ts`, `FacilityComponentSpecification.ts` | Derived component capability and physical specification | Domain queries/CFI8 | specification saved in component; capability derived | Context displays capabilities; no sporting output multiplier |
| `FacilityCondition.ts` | Component condition/serviceability/technical standard; separate building dimensions | Engine, queries, Save, app/CFI8 | two condition-record collections | Known average/worst, limitations, unknown preserved |
| `FacilityDeteriorationPolicy.ts`, `FacilityUsageLoad.ts` | Wear profiles/thresholds; transient utilization input | Deterioration engine | Neither policy nor load persisted | No actual schedule-to-utilization consumer |
| `FacilityMaintenanceNeed.ts`, `FacilityMaintenanceAction.ts` | Need/status and explicit executed action/outcome | Engine/CFI7/queries/read model | needs/actions | Tables/history; no maintenance execution button |
| `FacilityInspection.ts`, `FacilityOperationalIncident.ts` | Recorded inspection/incident facts and references | Validation/queries/tests | inspections/incidents | Inspector count; no automatic discovery/damage process |
| `FacilityDevelopmentProject.ts`, `FacilityDevelopmentProjectScope.ts`, `FacilityDevelopmentProjectPhase.ts` | Project graph, typed physical scope, optional phase records | Development engine/app/Save | projects/phases/scope/prior lifecycle | Explicit start/pause/resume/cancel/complete; phases displayed |
| `FacilityFinancialBinding.ts` | Physical-fact-to-Finance reference; not a financial balance | CFI7 queries/GameWorld/Save | bindings | Project committed/recognized/paid breakdown |
| `FacilityQueries.ts`, `FacilityValidation.ts`, `index.ts` | Pure projections and referential/temporal constraints; barrel only | Engines/integration/app/Save | Derived outputs not saved | Read model foundation |
| `src/engine/facilities/FacilityDeteriorationEngine.ts` | Deterministic time loss, condition records, need opening, explicit repair application | Monthly Calendar; CFI7 funded maintenance | Writes source records, not summaries | Condition changes visible after seeded-world advance |
| `FacilityDevelopmentEngine.ts`, engine `index.ts` | Physical project commands and scope realization | Club app commands/CFI7 | Updates source assets/projects/history | Action consequences in NG seeded fixtures |
| `src/integration/facilitiesSporting/SportingFacilityContext.ts`, `index.ts` | Team/date physical capability context | Facilities read model, tests | Never persisted | Effects tab is context, not simulated outcomes |
| `src/integration/facilitiesFinance/FacilityFinanceOrchestration.ts`, `FacilityFinanceQueries.ts`, `index.ts` | Composition of physical commands and existing Finance facts; derived sums | Club funded start; tests; read model | Finance facts + bindings; outcomes not saved | Funded start records commitment; missing authorization/payment loop |
| `src/app/facilities/ClubFacilitiesReadModel.ts`, `FacilityProjectCommands.ts`, `index.ts` | Team->Organization club scope; guarded engine command bridge | Zustand/NG | No read model persistence | Project controls and blocker text |
| `src/stores/gameStore.ts` | UI/app bridge, no independent physical simulator | NG buttons | Saves resulting GameWorld through save flow | Applies authorized app commands as currently defined |
| `src/domain/world/GameWorld.ts`, `src/save/GameWorldSaveV4.ts` | Fact indexing/validation and serialization | All canonical runtime paths | All 21 Facilities/Place collections | Loaded world reproduces inventory/commands |
| `src/engine/calendar/CalendarEngine.ts` | Monthly invocation and transient diagnostics | Career advance | Condition/needs saved; report not saved | No automatic Facilities breakpoint route |
| `src/ui-ng/applications/facilities/FacilitiesWorkspace.tsx`, `facilitiesPresentation.ts` | Presentation of app model | WorkspaceHost/start menu/taskbar | UI selection/notices only | Canonical empty state and seeded actions |
| `src/ui-ng/workspace/workspaceApps.ts`, `WorkspaceHost.tsx`, system menu/taskbar | Navigation registry | NG desktop | No physical truth | Facilities navigable |
| `src/ui/pcb-migrated/club/ClubPcbPage.tsx`, `components/club/ClubFacilities.jsx`, declarations, `fixtures/clubFixtures.ts` | Legacy UI-local levels/costs/bonuses | DesktopAppHost club surface | React state, not GameWorld/Save | Reachable misleading upgrades; separate local money |
| `src/app/game/GoldenMasterQueries.ts` | Old operational-capability DTO | Self wrapper and tests; no external production call found | Not persisted | Training plan/staff presence called Facilities; not real assets |
| `src/ui/match/court/arena/ArenaCourtProfile.ts`, `ArenaPerimeterLayout.ts`, `ArenaPerimeterRenderer.ts`, `CourtLightingRenderer.ts` | MatchViewer visual archetype/rendering | Court renderer | Presentation profile, not physical asset truth | Venue visual style; no seating/ticket/training authority |
| Training/injury/development engines; `RevenueEngine.ts` | Existing sporting/revenue authorities | Calendar/gameplay | Their own source state | No canonical Facilities condition/capacity consumer found |
| GovernanceDecision/Governance/Expectations; `BoardGovernanceReadModel.ts`, `BoardGovernanceCommands.ts` | Existing decision types/subjects/events | Board UI and supported unrelated commands | Governance facts in existing save flow | Facility subject readable; Facilities commands not approval-gated |
| `ShippedUniverseFacilities.test.ts`; domain/engine/integration/app/UI/Save tests | Coverage, not production authority | Vitest only | Fixtures only | 368 existing focused tests PASS; list in section 26 |
| `docs/autopilot/CFI1_*` through `CFI8_*`, including CFI2S and CFI6A; ARCHITECTURE Facilities section | Historical scope and architectural documentation | Human review | Documentation only | Does not establish career generation/effects |

No Facilities AI implementation or dedicated Facilities alert producer was found. FinanceAI and AiMedicalLifecycle do not substitute for those missing systems.

## 6. Facility types

Existing catalog contains exactly these 15 broad types. The table records purpose equivalents, not mandatory type-to-purpose rules: Facility.purposes is independent and may contain multiple values. No type automatically supplies a room, quality, condition or effect.

Common properties for **every row**: Facility physical nullable opening/seat/standing/total/court/accessibility facts; component optional capacity or unit specification; no overall quality; component technical standard is nullable; dated condition/serviceability independent of administrative lifecycle. Common maintenance: CFI5 operates on active components with known condition. Common projects: CFI6 scope-driven operations, not type-specific cost/upgrade rules. Common UI: NG type/purposes/physical facts/components/readiness; no shipped examples generated.

| Existing type | Purpose equivalent / anatomy examples already in catalog | Capacity/quality/condition and consumers | Actual effect / maintenance / projects / UI |
| --- | --- | --- | --- |
| ARENA | Match hosting; MAIN_COURT, spectator/media/hospitality components | Physical seats/court facts; common condition/standard; domain/read model | No venue/ticket consequence; common component maintenance/projects; NG inventory |
| STADIUM | Match hosting, broad non-basketball classification | Same physical model, no special stadium engine | Data taxonomy; common engine and NG |
| TRAINING_CENTER | Training, practice/strength/cardio/film components | Component capacity and serviceability; CFI8 training context | Capability availability displayed; Training unchanged; common engine/NG |
| PRACTICE_FACILITY | Training/practice; PRACTICE_COURT/SHOOTING_COURT | Accessible court count derived, not simultaneous groups | Basketball context only; common engine/NG |
| PERFORMANCE_CENTER | Strength/cardio/performance/analysis components | Standard facts, no performance quality multiplier | CFI8 performance projection; common engine/NG |
| MEDICAL_CENTER | Medical treatment; clinic/examination/imaging/physio | Treatment-station specification representable, not enforced | CFI8 medical projection; injury treatment unchanged; common engine/NG |
| ACADEMY_CENTER | Academy development; ACADEMY_COURT and academy rooms | Player/bed/court capacity representable; no intake allocation | No Talent/player creation consequence; common engine/NG |
| YOUTH_CENTER | Youth/academy development | Same anatomy, no independent youth throughput authority | No Youth causal effect; common engine/NG |
| HEADQUARTERS | Administration; staff/office infrastructure | Generic or unit capacity; no staff effectiveness consequence | Readable asset only; common engine/NG |
| ADMINISTRATIVE_OFFICE | Administration | Generic/unit capacities; no organization operating constraint | Readable asset only; common engine/NG |
| DORMITORY | Lodging; DORMITORY/PLAYER_ROOM components | BEDS capacity representable; CFI8 support context | Residential capability only, no admissions/housing allocator; common engine/NG |
| MULTI_SPORT_COMPLEX | Multiple independent purposes/shared rights | Physical/component hierarchy; no cross-sport scheduling | Shared infrastructure representable; common engine/NG |
| COMMUNITY_CENTER | Community engagement; community rooms | Same optional physical/capacity data | No community/fan consequence; common engine/NG |
| STORAGE | Storage/logistics/equipment support | Generic/unit capacity | No equipment stock or shortage consequence; common engine/NG |
| OTHER | Explicit fallback, not a missing-data bonus | Same validated facts | No special effect; common engine/NG |

Rehabilitation and recovery exist as component categories/capabilities and usage purposes, **not** dedicated FacilityType enum values. Basketball operations, office and equipment infrastructure exist through component anatomy. Absence of a dedicated broad type is not itself a gameplay defect. The authoritative full component/type/category/capability catalogs are `FacilityComponent.ts`, `FacilityComponentCategory.ts`, `FacilityComponentCapability.ts`; court specifications and capacity units are in `FacilityComponentSpecification.ts`.

Existing capacity units: SIMULTANEOUS_PLAYERS, LOCKERS, TREATMENT_STATIONS, SEATS, BEDS, PARKING_SPACES, SPECTATORS, OTHER. Existing technical standards: BASIC, CONVENTIONAL, ADVANCED, SPECIALIST. None establishes a scalar overall quality rating.

## 7. Lifecycle matrix

Classifications describe actual production reachability. BACKEND_ONLY can be correct intentional foundation; TEST_ONLY describes shipped existence, not all code. DUPLICATED means competing presentation or vocabulary, not permission to delete it.

| Required link | Classification | Observed truth / missing production link |
| --- | --- | --- |
| Facility existence | TEST_ONLY | Real fixture/save assets; creation engine exists, no shipped initial generation or user commissioning |
| Organization ownership/access | BACKEND_ONLY | Valid temporal rights and shared use; no shipped assets |
| Facility category | PASS | Catalog and validation; independent purpose |
| Physical/functional characteristics | PASS | Canonical anatomy/specification; UI reads facts |
| Capacity | PARTIAL | Data/display/count, no throughput constraint |
| Quality | PARTIAL | Technical standard only; no sporting-quality authority |
| Condition | PASS | Canonical dated records, unknown preserved |
| Age | PARTIAL | Opening dates; no automatic obsolescence/age consumer |
| Usage | PARTIAL | Rights exist; no real session utilization/load source |
| Degradation | PASS | Monthly deterministic processor, seeded known records only |
| Maintenance need | PASS | Threshold opening/deduplication and persisted records |
| Maintenance decision | ABSENT | No manager or AI need->action policy |
| Maintenance authorization | ABSENT | Neither Board nor spending authority gate in the execution seam |
| Financial obligation | BACKEND_ONLY | Explicit cost fact/commitment; incomplete payable/settlement path |
| Maintenance execution | BACKEND_ONLY | Explicit completed action application/CFI7, no career command surface |
| Operational availability | PARTIAL | Component serviceability controls context; no downstream operations gate |
| Sporting/business effect | ABSENT | No Training/Medical/venue/ticket/Talent outcome consumer |
| Identified limitation/opportunity | PARTIAL | Context constraints/readiness visible; no capacity-demand or opportunity planner |
| Development proposal | ABSENT | Project factory/scope, no production proposal/commissioning command |
| Development authorization | ABSENT | APPROVED optional; no binding Board decision required |
| Financing/funding state | PARTIAL | Bound commitments/debt, derived underfunded heuristic; not funding permission |
| Project start | BACKEND_ONLY | App/store/UI explicit start for existing canonical projects; fixture reachability |
| Construction/renovation progress | ABSENT | Optional phases/dates are records, no processor advances work |
| Temporary disruption | PARTIAL | Facility-wide lifecycle markers; no lost sporting throughput or relocation |
| Project completion | BACKEND_ONLY | Explicit physical scope command, no elapsed duration gate |
| Resulting Facility state | PASS | Real scope changes, lifecycle restoration, identities preserved |
| Future degradation/maintenance cycle | PARTIAL | Known condition wears; automatic repair/reinvestment cycle absent |

The separate PCB levels/bonuses are UI_ONLY and DUPLICATED relative to canonical NG; they do not fill any missing link above.

## 8. Condition / degradation

`FacilityCondition.ts` defines physical condition 0-100 or null, serviceability FULL/LIMITED/SEVERELY_LIMITED/OUT_OF_SERVICE and technical standard. Unknown physical condition is never defaulted to 100. Missing serviceability record resolves to FULL; this operational default does not prove known physical health. Facility-wide records describe STRUCTURAL_INTEGRITY, BUILDING_ENVELOPE, UTILITIES and ACCESSIBILITY_INFRASTRUCTURE, not a persisted overall average. CFI5 deteriorates component records, not those building dimensions.

`conditionAfterElapsedPeriod` computes:

`round(startingCondition - baseRate * (1 + utilizationRatio) * elapsedDays / 30.436875)`, clamped to 0-100.

Rates per month: LOW .15, NORMAL .4, HIGH .75, VERY_HIGH 1.2. Category defaults and outdoor/parking/imaging overrides are centralized in `FacilityDeteriorationPolicy.ts`. **Actual default utilization is 1, hence multiplier 2**, despite comments describing a neutral/base-rate default. This is documentation/model-calibration inconsistency, not proof of real measured usage. No RNG, wall-clock date or calendar-age multiplier enters this calculation.

Thresholds <=60 open a need on crossing; <=45 LIMITED; <=25 SEVERELY_LIMITED; <=10 OUT_OF_SERVICE. Existing serviceability can only worsen until explicit repair. Unknown condition remains null and does not wear. Records are written on material rounded change, closing the previous record on the preceding day. `advanceFacilitiesConditionFromHistory` uses each latest applicable record date, so short no-change intervals can accumulate elapsed time; it does not permanently reset unknown/unchanged records each month.

Determinism is established for the same inputs. Partition invariance is **not** established: rounding after each material change can produce a different result from one long elapsed call. This is a targeted future physical-truth regression candidate, not a new 30-year test request.

Completed maintenance explicitly supplies resulting condition/serviceability, can close a SUCCESSFUL related need, and preserves technical standard. It does not continuously slow the wear rate. Renovation/replacement supply explicit resulting condition and may update standard/specification. Inspections and incidents are recorded facts; no automatic damage/random-failure generator or incident-to-condition processor was found. Calendar age/openedOn remains historical data, not an obsolescence model.

Actual consumers: deterioration, repair/project commands, readiness/condition summaries, CFI8 and NG. Training, Injury, Recovery and Match operations do not read condition. Thus restricted/unavailable is meaningful **inside the physical projection**, not yet an enforced sporting constraint.

## 9. Capacity / throughput

| Capacity concept | Classification | Actual trace |
| --- | --- | --- |
| Arena total/seated/standing seats | DISPLAY VALUE / UNUSED DATA | Validated physical counts; totalCapacity shown in NG; no attendance/ticket cap consumer |
| Physical courtCount | DISPLAY VALUE | NG inspector; not the count used by CFI8 |
| Accessible usable courts | DERIVED METRIC | CFI8 counts accessible component records whose serviceability is not OUT_OF_SERVICE |
| Component.quantity / capacity | DISPLAY VALUE | Read model/table; court count does not sum quantity or capacity |
| SIMULTANEOUS_PLAYERS | UNUSED DATA | Unit specification saved; Training does not allocate players or groups from it |
| Treatment stations | UNUSED DATA | TREATMENT_STATIONS representable; no queues/treatment scheduling gate |
| Rehab capacity | DERIVED METRIC, limited label only | REHABILITATION_CAPACITY_LIMITED means some capability is LIMITED, not demand versus station capacity |
| Academy/youth beds/players/courts | UNUSED DATA | No intake, registration or development throughput enforcement |
| Staff/office/analysis capacity | UNUSED DATA | Anatomy/specification only; no staff workload cap based on premises |
| Priority/exclusivity/shared conflicts | DERIVED METRIC | Conflict query, no automatic scheduling allocator |

**No REAL CONSTRAINT on sporting/business throughput found.** CFI8 declares INSUFFICIENT_CAPACITY and UNKNOWN_SPECIFICATION reason codes but does not emit them. TRAINING_CAPACITY_INSUFFICIENT is a zero-usable-courts/no-strength-capability inference, not a workload capacity comparison. LIMITED capabilities still count as usable. Do not equate these labels to a capacity simulator.

## 10. Training integration

Available seam: `trainingFacilityContextForTeamAt`/`basketballFacilityContextForTeamAt`/`performanceFacilityContextForTeamAt`. `sportingFacilityContextForTeamAt` is called by the Facilities app read model; search across `src/engine/training`, `src/domain/training`, `src/engine/development` found no physical Facilities consumer.

`executeScheduledTrainingSessions` and the scheduled session calculation use canonical plans/modules, participation, fatigue and staff execution quality. `ScheduledTrainingEngine.ts` applies staff execution multipliers to development/recovery/cohesion. `TrainingPlanning.ts` uses fixture density/fatigue. These are legitimate existing Training rules, not concealed facility bonuses.

Facility-caused training availability, quality, number of groups, intensity, development stimulus, coach effectiveness, individual/team split and schedule constraint are **ABSENT**. The canonical capability projection is **BACKEND_ONLY** for this integration. A future consumer must use existing Training authority and approved rules; this audit chooses no numerical multiplier or missing-facility fallback policy.

## 11. Medical / recovery integration

Available physical context covers examination/imaging, physiotherapy, hydrotherapy/cryotherapy and strength/cardio rehab support. No Facilities consumer was found in `src/engine/injury`, `src/domain/injury` or Career Fatigue. `InjuryCreation.ts` uses canonical severity recovery-day ranges and injected RNG. `InjuryRisk.ts` applies existing injury-history modifiers. `MedicalAdvisory.ts` uses staff responsibility/quality/personality and deterministic recommendations. `Rehabilitation.ts` uses injury/fatigue/fixtures/recommendations. Scheduled recovery module effectiveness is staff/Training-driven.

Diagnosis/treatment availability, prevention risk, rehabilitation duration, RTP, recovery/fatigue and medical throughput are **not caused by Facilities**. CFI8 medical/recovery constraints are visible facts without a medical action gate. No canonical facility-independent 'medical building rating' was discovered in these engines. Existing injury ranges, history modifiers, staff-quality rules and recovery loads must not be mislabeled as Facilities effects. PCB recovery-lab percentage is presentation fiction described in section 25.

## 12. Youth / academy integration

ACADEMY_CENTER/YOUTH_CENTER, ACADEMY_COURT and academy components, ACADEMY/YOUTH usage purposes and HOSTS_ACADEMY_PROGRAMS are canonical physical vocabulary. They do not form an intake/materialization/registration pipeline. No Facilities-to-academy capacity, youth intake, player creation, pathway, registration, staffing or development causal consumer was found on this base. CFI8 has no separate Talent intake authority.

BS15 is already accepted as Talent authority, but absent from this main lineage. Future BS17 integration may provide physical availability/throughput/development context **to BS15 and existing Training**, after accepted authority is on the implementation base. It must not create Players, a second youth pool, annual intake RNG or alternative registration rules. This is a dependency and boundary, not an approval of a new Talent product rule.

## 13. Sporting effects

| Existing chain | Downstream system | Actual consequence |
| --- | --- | --- |
| Accessible court -> component/status/condition -> basketballContext -> Facilities read model | MX0 Effects tab | Visible court availability and source identity; no training cancellation/group allocation |
| Strength/cardio component -> best serviceability/standard -> training/performance context | MX0 Effects tab | AVAILABLE/LIMITED/UNAVAILABLE explanation; no player stimulus change |
| Medical clinic/imaging -> component capability and serviceability -> medical context | MX0 Effects tab | Displayed medical capability; no diagnosis or recovery change |
| Physio/hydro/cryo -> capability/serviceability -> rehab/recovery context | MX0 Effects tab | Displayed limitation facts; no rehab queue or fatigue effect |
| Film room -> VIDEO_ANALYSIS -> analysis/performance context | MX0 Effects tab | Capability display; no tactics/scouting/staff effectiveness bonus |
| Dining/residential components -> support capability -> support context | MX0 Effects tab | Capability display; no wellbeing/housing/Talent allocation consequence |
| Component repair/renovation -> condition/serviceability/standard -> rebuilt context | Physical queries/MX0 | Real physical state and context change, covered by tests |
| Arena -> physical seats/court/competition approval -> queries | No Match/Competition/Revenue consumer found | No venue selection, homologation, ticket cap or business effect |

No canonical global bonus multiplication exists in the inspected Facilities production chain. The PCB shooting/playmaking/recovery/ticket bonuses are not canonical sporting effects. CFI8's tests explicitly preserve the absence of direct player-rating, injury/fatigue and MatchEngine stat mutations. That is valid scope preservation, not end-to-end sporting certification.

## 14. Maintenance

Real source chain: seeded known component condition -> monthly deterioration threshold -> persisted OPEN need -> NG need/readiness display. Chain stops before decision. `createFacilityMaintenanceAction` represents planned/in-progress/completed action data; `applyFacilityMaintenanceAction` applies only a completed action with outcome. SUCCESSFUL can close its referenced open need; PARTIAL/UNSUCCESSFUL do not fabricate need resolution. Component condition/serviceability restoration is explicit, not automatically 100.

`executeFundedMaintenanceAction` can atomically create/apply a completed action and record its CFI7 financial consequences when called explicitly. It is not called by a production manager maintenance command or AI. Inspection/incident references can identify produced needs, but no processor generates those records automatically.

| Step | Current status |
| --- | --- |
| Need/threshold | Real engine + monthly invocation |
| Discovery | Workspace on manual navigation; no automatic manager attention |
| Repair versus renovation decision | Absent |
| Institutional authorization | Absent Facilities gate |
| Financial authorization | Caller-decided CFI7 fact; not FinancialAuthority evaluation |
| Finance source/recognition | Explicit backend operation, not a recurring cost generator |
| Payable/settlement | Not materialized by CFI7 maintenance orchestration |
| Execution | Real explicit completed-action application, backend only |
| Result | Condition/serviceability and related need persisted |

Money is not metadata when the backend is called: commitments/recognitions/ledger facts are real. This does not prove cash movement or a live career maintenance economy. The maintenance financial command/policy, payable and settlement integration is **DEFERRED_INTEGRATION_AFTER_BS16**. Replay uses duplicate-ID guards; a repeated repair may be rejected rather than return an idempotent no-op. Do not promise stronger retry semantics than the implementation proves.

## 15. Development projects

Domain: seven statuses and 11 coarse project types; transition graph in `FacilityDevelopmentProject.ts`. APPROVED is optional: PLANNED can start directly. Proposal/evaluation/Board approval are not automatic and have no production project-creation UI. Scope kinds: CREATE_FACILITY, ADD_COMPONENT, EXPAND_FACILITY, REPLACE_COMPONENT, RENOVATE_COMPONENT, REMOVE_COMPONENT, RECONFIGURE_FACILITY, DEMOLISH_FACILITY.

App `FacilityProjectCommands.ts` enforces user club Organization equality and graph/status/money-input shape, then delegates to the engine/CFI7. It offers physical-only start or caller-supplied commitment. No production cost estimator, duration estimator, funding sufficiency gate or Governance check exists. Project has planned/actual dates, reason, external reference, organization/facility IDs, typed scope and restoration state; money is held in Finance bindings, not duplicate cost fields.

`startFacilityDevelopmentProject` creates a new Facility for CREATE_FACILITY. **It hardcodes purposes ['TRAINING'] regardless of facility type**, supplies no physical openedOn/profile, ownership/usage right, and creates no opening condition records. New/added component blueprints may therefore remain condition-unknown and never deteriorate until commissioned with known condition by an explicit operation. New Facility completion changes status to ACTIVE and adds components; it does not automatically grant its sponsoring club sporting access.

Completion realizes the whole scope immediately when IN_PROGRESS and actual dates are valid. It does not check plannedCompletionDate, accumulated work or phase completion. Optional phases are saved/read records; engine command transitions do not advance phase progress. Pause/resume/cancel work on project status; no automatic delayed/resumed progress. Cancellation retains project history and CFI6A restores prior Facility lifecycle where captured. It does not release financial commitments/reservations or model sunk construction work/refunds.

Renovation preserves component identity and updates explicit specification/equipment/condition/standard. Replacement closes the old component and creates a new one; removal/demolition preserves historical IDs. ADD/EXPAND add components without automatically recomputing the Facility physical seat/court profile. Project state/current dates and condition/status records provide some history; full project transition-event history is absent.

Direct mutation search: the engine is the canonical scope realization path; GameWorld update remains a lower-level data seam used by fixtures/explicit integration. The reachable PCB upgrade bypasses the whole project system but only mutates local React state. Multi-component reconfiguration/concurrent-project and same-day record collision risks need focused coverage before declaring the project engine robust; see section 27.

## 16. Temporary disruption

Facility-wide RECONFIGURE/DEMOLISH may mark UNDER_RENOVATION and capture the prior lifecycle. Single-component works do not close the whole Facility. CFI6A restores the exact captured prior status on completion/cancellation unless the target is terminal, preserving a pre-existing closure rather than assuming ACTIVE. No automatic N-day rating increase exists: completion is an explicit full-scope command, and elapsed construction work is absent.

Component serviceability supports partial/full unavailability through condition records. CFI8 access resolution does not consult Facility lifecycle status; an ACTIVE component with valid Team usage rights can remain in context while its Facility is UNDER_RENOVATION. No automatic component work-window outage, reduced station/court throughput, temporary-home assignment, relocated training or venue-use gate was found. `requiresTemporaryRelocation` is returned outcome data, not relocation execution. Pause does not restore the physical lifecycle marker.

Thus disruption is **PARTIAL physical metadata/projection**, with no enforced Training/Medical/Match consequence. Any future closure rules must preserve approved lifecycle-versus-serviceability distinctions and existing purpose-agnostic rights; this audit does not choose closure policy.

## 17. Finance boundary

Finance was read only. Base includes BS16E FinancialAuthority/FinancialAuthorization/FinanceActivation. Canonical spending permission comes from approved period/category budgets, ledger liquidity, obligations and reservations. Activation requires an existing OrganizationFinancialProfile and currently seeds PLAYER_SALARY/STAFF_SALARY only, not Facilities. No profile/currency/account/budget may be invented by BS17 to bypass this.

| Existing physical source -> Finance chain | Actual support | Dependency |
| --- | --- | --- |
| Completed maintenance action -> AuthorizedOperatingCostFact | Real FACILITY operating fact with explicit caller amount/date | READY_WITH_CURRENT_FINANCE for source representation/read queries |
| Same call with immediate recognition -> commitment -> ExpenseRecognition -> ledger | Real expense/liability posting; no payable created by CFI7 | DEFERRED_INTEGRATION_AFTER_BS16 for live spending/recognition integration |
| Project -> prepareFacilityProjectFinance -> commitment + binding -> optional physical start | Real obligation, not funding permission or available cash | READY_WITH_CURRENT_FINANCE for explicit source/binding representation; execution authorization deferred |
| executeFacilityProjectCapitalPayment -> new payment commitment -> recognition -> ledger + three bindings | Despite name, expense recognition only; no cash account/treasury application | DEFERRED_INTEGRATION_AFTER_BS16 |
| Existing DebtInstrument -> binding -> project funding projection | References Finance-owned instrument/drawdowns, no second debt engine | READY_WITH_CURRENT_FINANCE for read-only provenance; funding decisions deferred |
| Facility OperatingCostSource/fact -> OperatingCostEngine | Finance has scheduler/materialization seam, no Facilities recurring OPEX generator | DEFERRED_INTEGRATION_AFTER_BS16 for sanctioned source policy/live processing |
| Bound recognition -> payable -> treasury application -> paidFacilityExpenditureAt | Query reads settled amounts if those canonical facts exist | READY_WITH_CURRENT_FINANCE for query; CFI7 does not supply the missing payable/settlement chain |
| Facility budget/cash checks -> FinancialAuthority/reservation | Authority exists but CFI7/app funded start does not call it | DEFERRED_INTEGRATION_AFTER_BS16 |

`Recognition.ts:274` forbids CASH offsets and posts expense versus liability/payable ledger account. CFI7's `FACILITY_PAYMENT_MADE` outcome is therefore an overclaim: no treasury settlement or cash movement occurs in those calls. `paidFacilityExpenditureAt` is stricter and normally returns no paid amount for their unlinked recognitions. Capital 'payment' also adds another commitment rather than allocating recognition/payment against the initial capital commitment; read-model outstanding/underfunded totals can mislead about the project obligation.

`isFacilityProjectUnderfundedAt` compares commitment amounts to recognized expense plus bound debt drawdowns; expense recognition is not secured money. The implementation is not a liquidity/authorization decision. Its comment suggests unknown for cross-currency cases, but missing matching currency can return true. Do not convert this heuristic into permission.

Maintenance immediate-recognition binding points to OPERATING_COST_FACT only; its direct recognition lacks the OperatingCostEngine reference dimensions used by `getOperatingExpenseByFacility`. Consequently the general facility OPEX query need not include that direct recognition. Costs in the current app are project money rows, not a comprehensive maintenance/OPEX/cash report. These are audit findings, no Finance repair was attempted.

No automatic project cancellation financial release, CAPEX asset/depreciation authority or approved Facilities category budget provisioning is established here. Accounting treatment/economic rules remain Finance-owned and require the BS16 complete authority plus approved product policy.

## 18. Governance boundary

Canonical Governance can name FACILITIES/CAPITAL_EXPENDITURE decisions and FACILITY subjects, resolve bodies/rights, and display their status. `GovernanceDecision.ts` treats those types as FORMAL_ONLY. `BoardGovernanceCommands.ts` offers record commands for supported signing/trade decisions and execution for coach firing; Facilities returns DECISION_TYPE_NOT_ACTIONABLE. These generic facts do not gate physical project commands.

| Action | Who proposes/decides today | Actual execution gate | Rejection / AI |
| --- | --- | --- | --- |
| Maintenance | Caller constructs action; no manager proposal workflow | Completed action shape/reference validity; CFI7 caller amount | No Governance rejection consumer; no AI planner |
| Upgrade/renovation | Existing project supplied by caller | Club Organization equality + project graph | Approval/rejection not required/read |
| New construction | CREATE_FACILITY backend scope | Same graph; PLANNED can start | No initiating Board body or decision link |
| Cancellation | User club app command for nonterminal own project | Organization equality + nonterminal status | No cancellation authority grant/rejection gate |
| Major CAPEX/funded start | Manager supplies amount or caller uses CFI7 | Positive integer/currency input, Finance factories, project graph | No formal Board or FinancialAuthority permission check |

Actual governing body cannot be named generically: it depends on a real institution/body/grant profile, not an assumed universal Board. No shipped institution population or Facilities-specific authority assignment is established. Future human and AI commands must share canonical Governance and spending authority; body/threshold/action rules not already DECIDED remain product decisions, not audit choices.

## 19. AI Facilities management

No production Facilities AI planner or consumer of needs/context for physical investment was found. AI cannot currently identify weak assets or genuine demand shortage, compare repair/upgrade, prioritize sporting/financial investment, request Governance approval, start/delay/pause/cancel projects or replace assets autonomously. All classify ABSENT, not scripted unconditional upgrades.

Existing FinanceAI, medical autonomy and Training scheduling do real work in their own authorities and do not manage Facilities. No Facilities AI omniscience violation is demonstrated because the policy does not exist. The future policy must derive legitimate Organization information from canonical queries, select actions through the same command gates as the user and never create money or Players to fix a shortage.

## 20. Save / persistence

`GameWorldSaveV4.ts:261` serializes core physical facts; subsequent lines serialize operations, projects and bindings. Deserialization defaults missing old V4 collections to [], parses factories, applies physical/operations/project state before Finance and bindings, and invokes GameWorld referential validation. V3 compatibility processing is reused; no default Facility content is fabricated.

The 21 Facilities/Place collections are: places, facilities, facilityComponents, facilityNameRecords, facilityOwnershipInterests, facilityControlRights, facilityOperatorAssignments, facilityOrganizationRelationships, facilityTeamRelationships, facilityUsageRights, facilityCompetitionApprovals, facilityStatusRecords, facilityComponentConditionRecords, facilityConditionRecords, facilityMaintenanceNeeds, facilityMaintenanceActions, facilityInspections, facilityOperationalIncidents, facilityDevelopmentProjects, facilityDevelopmentProjectPhases and facilityFinancialBindings. Separately governed Finance collections referenced by bindings retain their own authority; they are not additional physical collections.

Capacity/specification/technical standard travel with their canonical component/condition records. Projects preserve IDs, scope, planned/actual/cancelled dates, phase records and `facilityLifecyclePriorStatus`; no fictional progress percentage is reconstructed. Stored name/status/condition/need/action records preserve history. Financial relationships are IDs resolved against canonical facts. There is no new Facilities-specific Governance link to round-trip.

Derived categories/capabilities/readiness/condition averages/context/money sums/underfunded values/UI selection are not persisted. Authored Facility.capabilities and derived component capabilities intentionally coexist as distinct concepts; a new consumer must not confuse authored declaration with current physical availability.

Save tests cover old missing collections, rich anatomy/condition/operations/project worlds, invalid references/duplicates and post-load deterioration/commands. Duplicate IDs are rejected. This is strong save authority for existing records, not proof of sufficient long-term history, cash completion or all accepted BS15 schemas on this main.

## 21. Long-horizon truth

No 30-year certification was run. Conclusions below are code/test inference:

- Shipped career starts with zero Facilities; no later autonomous creation path is discovered. Aging/maintenance/investment remain absent throughout unless external explicit canonical content is introduced.
- Known seeded components lose condition on monthly evaluation and open needs. Without a repair policy/user action, they can remain limited/out of service. Unknown condition remains unknown forever unless explicitly recorded; new component creation does not automatically commission known condition.
- Opening dates do not produce an age/obsolescence rule. Technical standard does not become obsolete automatically. Usage is defaulted, not sourced from real sessions.
- Repairs, renovation, new construction, expansion, replacement and demolition can be executed explicitly and persist results. They are not naturally chosen or progressed by AI/calendar.
- Capacity does not evolve in response to sporting demand. Projects can remain planned/in-progress/paused indefinitely; a user can also complete immediately without elapsed work.
- Condition/history records grow with material changes; world validation/canonical indexes are reused. No new pathological scaling defect was benchmarked or claimed. This audit does not reopen the passed BS15 performance program.

The honest verdict is **no autonomous 20-30-year Facilities ecosystem**. Future certification should use small lifecycle/reload/cadence probes first, then the approved BS17 horizon gate after physical, decision, financial and sporting links exist; no replay of BS15 certified years is required.

## 22. MX / gameplay manifestation

NG Facilities is registered/navigable through workspace navigation, start menu and taskbar. It reads canonical club data and honestly reports no recorded Facilities for shipped careers. Existing project buttons call the app/store/engine, with canonical blocked reasons and local success notices. Tests demonstrate seeded fixture action and reload behavior, not real career commissioning.

| Truth | VISIBLE | ALERTED | ACTIONABLE | CONSEQUENTIAL | NAVIGABLE |
| --- | --- | --- | --- | --- | --- |
| Identity/type/place/ownership association | Yes in seeded world | No event attention | No asset creation/edit workflow | Physical identity only | Yes, NG inspector |
| Capacity | Total/component values and court count | No true demand-shortage alert | No capacity planning command | No throughput consequence | Yes |
| Quality/technical standard | Component standard; no overall quality | No obsolescence alert | Existing renovation scope only | Physical descriptor only | Yes, component/context |
| Condition/serviceability | Known average/worst, component state | Inline need/readiness warning only | No repair execution button | Context changes, no sporting outcome | Yes |
| Maintenance needs/actions/history | Yes | Manual navigation only | Explicit UI states missing maintenance execution | Backend repair possible | Yes |
| Projects/scope/dates/phases/blockers | Yes | Delayed/underfunded inline labels | Start/pause/resume/cancel/complete existing projects | Physical scope command changes world | Yes |
| Costs | Project committed/recognized/paid/outstanding per currency | Inline underfunded heuristic | Funded start amount input | Commitment only, not cash or permission | Yes |
| Sporting effects | Capability context and source component | Inline constraint text | No linked Training/Medical action | No sporting consequence | Yes, Effects tab |
| Governance requirements | No linked Facilities requirement view | Generic Board attention only if decision exists | Facilities decision commands absent | No approval gate | Board separately navigable |
| Future consequences | Dates/delay/state only | No work completion/maintenance attention loop | Manual completion | No construction forecast or capacity-demand effect | Partial |

Affordance risks: funded-start naming can suggest affordability/permission it never evaluates; complete button can suggest work is finished without progress; 'Effects' tab can suggest sporting consequences beyond capability facts. PCB offers stronger fictional bonuses/upgrades. Backend inspections/incidents, full ownership/right details, unit specifications and all maintenance economics are not comprehensively explainable/actionable in current manager flow.

## 23. Alerts / information loop

Actual deterioration -> Calendar FACILITY_CONDITION_CHANGED / FACILITY_MAINTENANCE_NEED_OPENED diagnostic -> returned lifecycle report. EVENT_COLLECTION flattens diagnostics without persisting an event stream. No production Facilities-specific inbox/breakpoint/attention candidate was found in `SimulationBreakpoints.ts`, inbox or caller search. Diagnostics are not a routed manager decision.

Needs/delays/underfunding/readiness -> NG inline warnings on manual workspace navigation. Project command -> local applied/blocked notice -> updated world. This closes explicit button feedback, not discovery/attention. Generic Governance decision/request attention can route to Board if those facts exist; no Facilities proposal creates them.

Capacity reached, approval needed, project delayed/completed, unavailable component, budget blocker and Governance blocker lack a canonical Facilities event -> manager breakpoint -> target action -> durable result loop. Future alerts should derive from existing source facts and identify owned assets/project/need, without a second persisted event or rule authority unless the canonical information system requires it.

## 24. Production-world coverage

| World / creation path | Observed Facilities content | Evidence strength |
| --- | --- | --- |
| Prototype createNewGame | Zero Places/Facilities/components/rights/needs/projects | Existing production-path test run PASS |
| Configured prototype | Same zero content; real club Organization remains | Existing production-path test run PASS |
| ACB test universe | Same zero content | Existing production-path test run PASS |
| World DB Spain | bootstrap maps Organization.primaryPlaceId but supplies no Places/Facilities; match facility metadata not mapped to canonical venue operations | Code audit of WorldDbGameBootstrap/GameBootstrap; no live DB claim |
| NBA-like / WNBA-like generation | WorldGenerator uses shared empty physical defaults; no Facilities generation authority | Code audit, not separately live-career simulated |
| NCAA-like / other ecosystem generation | Same absence of shared Facilities provisioning | Code audit; university shared assets only domain fixtures |
| Rich Facilities fixtures | Owned/rented/shared assets, components, condition, projects and ledger accounts explicitly supplied | TEST_ONLY scenarios, not shipped world content |
| Separate accepted BS15 integration | Not present in audited-main ancestry | Git ancestry proof; not substituted for requested audit base |

World DB physical references, MatchViewer arena archetypes and Staff presence are not evidence that canonical assets exist. The roadmap must first make real content reachable without inventing financial profiles/currency, fictional ownership precision, arbitrary technical standard or perfect condition.

## 25. Dead / duplicate / legacy systems

| Candidate | Classification | Evidence / treatment |
| --- | --- | --- |
| CFI1-CFI8 domain/engine/Save + NG MX0 | CANONICAL | Real validated source state; strengthen, do not replace |
| Authored Facility.capabilities versus component-derived usable capabilities | CANONICAL distinct concepts | Explicit CFI4/CFI8 boundary; not interchangeable authority |
| Facility current status plus dated status records | CANONICAL current/history convention | Queries may resolve historical status; retain, examine caller consistency |
| ClubPcbPage/ClubFacilities catalog and local facility levels/balance | LEGACY + UI_ONLY competing surface | DesktopAppHost still renders club page; upgrades subtract fixed 50000 and change local level, independently of displayed exponential costs |
| PCB rules.facilities/window.pcbasket fetch seam | LEGACY / UNCLEAR external availability | Fallback catalog is live; external native endpoint existence not assumed or tested |
| GoldenMasterQueries getClubFacilities/getMedicalFacilities | LEGACY; external production use DEAD on this base | Maps training plan/physiotherapist to fake infrastructure IDs; wrapper and tests only in caller search |
| ArenaCourtProfile/lighting/perimeter | CANONICAL presentation | MatchViewer appearance only, not duplicate physical/capacity authority |
| Organization.primaryPlaceId / World DB source facility references | COMPATIBILITY / integration seam | Location/source metadata; bootstrap omits physical assets; do not delete references |
| CFI8 INSUFFICIENT_CAPACITY/UNKNOWN_SPECIFICATION labels | DEAD branches / unused vocabulary | Declared but not returned in implementation |
| Phase records and relocation outcome | CANONICAL data seam, BACKEND_ONLY/unconsumed execution | No work/relocation processor; do not confuse data with behavior |
| CFI certification documents | Historical evidence | Their PASS applies to original scope; not whole shipped Facilities truth |

Nothing was deleted. Removing/redesignating a legacy surface is a future narrow milestone with routing/coverage checks. No global no-op or fixture removal is used to conceal missing canonical behavior.

## 26. Test coverage

Focused command selected all existing `src` test files whose names match Facilities/Facility/SportingFacilityContext, excluding unrelated Arena rendering. Result: **21 files, 368 tests PASS, no skipped/failing tests**. JSON report: `C:/Users/jorge/AppData/Local/Temp/BS17A-focused-tests.json` (support outside the worktree).

| Files | Tests | What they establish |
| --- | ---: | --- |
| Facilities.test.ts / FacilitiesOwnershipAccessRights.test.ts | 18 / 35 | Identity, owned/rented/shared, temporal access/conflict/reference validity |
| FacilityAnatomyCapabilities.test.ts / FacilityConditionServiceability.test.ts | 21 / 23 | Hierarchy/specification, capability derivation, unknown condition and serviceability |
| FacilityMaintenanceOperations.test.ts / FacilityDevelopmentProjects.test.ts | 19 / 23 | Domain operation/project facts and invalid shape/reference checks |
| FacilityDeteriorationEngine.test.ts | 26 | Deterministic elapsed condition/threshold/need/repair application |
| FacilityDevelopmentEngine.test.ts / FacilityDevelopmentLifecycleRestoration.test.ts | 23 / 12 | Scope realization, transitions, prior-lifecycle restoration |
| FacilityFinanceIntegration.test.ts | 33 | Explicit money facts/bindings/queries/atomic failures, not spending-authority/live settlement certification |
| SportingFacilityContext.test.ts | 42 | Reachable capability/serviceability/context; explicitly no player/injury/fatigue mutation |
| GameWorldSaveV4.Facilities / .FacilityAnatomy / .FacilityCondition / .FacilityOperations / .FacilityDevelopment | 30 / 5 / 5 / 9 / 9 | Round-trip, missing old V4 defaults, references, saved operations/projects |
| ClubFacilitiesReadModel / FacilityProjectCommands / FacilityGameplayPersistence | 11 / 9 / 4 | Club scope, command reasons, resulting canonical state and reload |
| ShippedUniverseFacilities.test.ts | 3 | Actual new-game paths intentionally contain no canonical assets |
| FacilitiesWorkspace.test.tsx | 8 | Render/seeded controls/store feedback and honest empty state |

Coverage categories: Domain PASS; condition PASS for existing deterministic model; maintenance backend PASS; projects backend PASS; Save PASS; Finance explicit-fact seam PASS; Governance Facilities gate ABSENT; sporting physical projection PASS but outcomes ABSENT; AI ABSENT; long-horizon renewal/cadence/concurrency UNPROVEN; production-world generation intentionally absent; MX fixture manifestation PASS.

Test titles are not source authority. `SportingFacilityContext.test.ts:217`, titled 'component capacity is preserved on the court status', asserts only that the court has an `isFullCourt` property; it proves neither preservation of a numeric capacity nor simultaneous-player enforcement. No test was deleted or changed.

Initial JSON-only run executed but failed at report publication: EPERM opening `C:/BDM-BS17A-focused-tests.json`. Classification **UNRELATED environment/report path**, not Facilities defect; rerun with writable Temp path and default + JSON reporters exited 0. No current test failure requires CURRENT_DEFECT/STALE_TEST/PREEXISTING_BASELINE classification. Source-audit gaps remain gaps even with a green suite.

`npm run typecheck`: PASS (exit 0). Build/full npm test/Rust gates not run: contract explicitly requires focused Facilities tests, typecheck and diff check only.

## 27. Risks

| Priority | Finding / evidence | Classification and focused future proof |
| --- | --- | --- |
| Critical | No shipped physical asset provisioning | CURRENT_DEFECT in overall gameplay closure, intentional earlier-stage limitation; new-game content/source-truth tests |
| Critical | Training/Medical/Youth/venue consumers absent | Missing integration; outcome tests must distinguish changed physical context from unchanged sporting authority |
| Critical | CFI7 bypasses FinancialAuthority/reservations; PAYMENT_MADE is only recognition | Deferred integration + misleading outcome vocabulary; BS16-owned authorization/payable/settlement tests |
| High | Reachable PCB upgrades use fictional local levels/money/bonuses | DUPLICATED UI_ONLY authority; routing/local-state versus GameWorld regression |
| High | Completion has no work-duration/phase gate | Intentional explicit CFI6 command seam, incomplete gameplay; early completion/pause/resume/save tests |
| High | New Facility always TRAINING purpose; no opening physical facts/rights/condition commissioning | Code-audit physical fidelity gap; per-type creation/access/known-versus-unknown condition tests |
| High | Lifecycle UNDER_RENOVATION not consumed by CFI8; no work-window outages | Missing agreed disruption semantics; approved scoped closure/availability tests |
| High | Multiple RECONFIGURE replacements derive identical `facility-component:${projectId}:replacement` ID | CURRENT_DEFECT candidate by code inspection; two-replacement scope probe required, no production fix here |
| High | Same component/date condition IDs and facility/date status IDs can collide across operations | Unproven concurrency/retry limitation; repair+deterioration/parallel project same-day probes |
| High | Concurrent facility-wide projects can restore lifecycle while another remains active | Code-inferred overlap risk; overlapping start/cancel/complete test required before policy selection |
| Medium | Maintenance recognition binding/reference dimensions do not close OPEX reporting trace | Source-audit reporting gap; physical-source -> recognized -> paid query agreement |
| Medium | Capital payment adds separate commitment; underfunded treats expense as secured resources | Finance interpretation gap; allocation/reconciliation tests after BS16 |
| Medium | Default utilization comment says base rate but code multiplies by 2; rounding cadence varies | Documentation/model fidelity gap; elapsed partition tests under approved wear policy |
| Medium | Organization-only rights not inherited, and rights purpose intentionally descriptive | Consumer contract seam; no silent product policy change; explicit team/org/shared-right tests |
| Medium | Club inventory scope checks Organization associations/rights, while CFI8 checks Team rights | A Team-only right without an Organization association can contribute to sporting context without the same asset appearing in club inventory; query-composition proof needed |
| Medium | New/added components can remain unknown condition and never wear | Honest unknown-state persistence; source-backed commissioning policy needed, not universal 100 |
| Medium | History can grow; full project events/work history absent | Long-horizon inference only; no new scaling defect measured |

These findings are not claimed failing regressions from the 368-test suite. Audit-only prohibits implementing repairs. New gameplay constants, missing-data policies, body authority thresholds, cost/duration and obsolescence rules remain proposals until established by approved source of truth.

## 28. Deferred integrations

**DEFERRED_INTEGRATION_AFTER_BS16:** Facilities economic source adapters into the completed financial command boundary; formal financial permission/reservation; Facilities category authorization/profiles/currency/account mapping; CAPEX accounting treatment; maintenance/recurring OPEX provisioning; payable/settlement/cash; project cancellation/release/reconciliation; financial blocker/report truth; AI investment affordability/funding. Existing primitive/read query availability does not remove these dependencies.

**READY_WITH_CURRENT_FINANCE:** read-only binding/source representation, multi-currency-separated committed/recognized/paid queries, existing Finance-owned debt reference, inspection of established Finance authority. No write-policy fallback is proposed while BS16 runs.

Other dependencies: accepted BS15 canonical-main integration before Youth/Talent consumer implementation; approved physical initialization/missing-data/content policy before provisioning; existing Governance authority and approved action/body/threshold rules before approval gates; approved sporting constraint/effect policy before changing Training/Medical outcomes. Audit roadmap sequence is a proposal for strengthening, not a new DECIDED product rule.

## 29. Final System Truth verdict

**PASS for BS17A audit deliverables; PARTIAL for Facilities System Truth.** Preserve CFI1-CFI8/CFI2S/CFI6A/MX0. Do not restart Facilities or the completed BS15 performance program. The strongest evidence is identity/access/anatomy validation, deterministic condition progression, real physical scope commands, Save and an honest canonical workspace. The missing chain is real-world content -> demand/use -> decision/authorization -> executable maintenance/progress -> sporting/business consequence -> manager attention, with Finance and Governance authoritative throughout.

Final audit checks: 368/368 focused tests across 21 files PASS; typecheck exit 0; `git diff --check` PASS. Both untracked documents also pass independent trailing-whitespace/newline checks and `git diff --no-index --check -- NUL <document>` emits no whitespace errors (exit 1 denotes the new-file difference). The audit has exactly 29 numbered sections; all five roadmap milestones contain the eight required fields and dependency category. A focused read-only review independently confirmed recognition/payment labeling, the funded-command authority bypass, multi-replacement ID collision and absent lifecycle consumption. Purpose-agnostic rights remain the documented accepted CFI8 contract, not an audit-authorized defect repair.

Canonical `C:/BDM` remains clean at the same `8a0b359e9ae48fe372668241788c9d5aa7a33b03`. The isolated worktree has only these two new documentation files and no tracked production diff. No commit, push or merge was created.

Recommended next action is the evidence-derived BS17B physical/content and canonical-surface foundation in the companion roadmap. No BS17B implementation is part of this run. BS17A leaves two documents only, no production modifications and no commit/push/merge.
