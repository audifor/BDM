# BS13C Coach/Staff Professional Profile Convergence Audit

## Scope and finding

This audit traces the two persisted professional attribute stores before any convergence
implementation. `StaffPerson.professional.attributes` and
`GameWorld.coachProfessionalProfilesByCoachId[coachId].attributes` have the same 13 keys and
0–100 integer range. Generated head coaches are initialized from the same generated profile into
both locations. They therefore represent the same professional fact, not two distinct Coach and
Staff concepts. Coach RPG, reputation, identity, employment, and career history are separate data
and are outside this convergence.

## Readers and writers

| Area | Current reader/writer | Observed behavior |
|---|---|---|
| Canonical Staff profile | `src/domain/staff/StaffPerson.ts` (`StaffPerson` / `StaffProfile`) | Defines and validates the 13 professional attributes. `src/domain/staff/StaffRoleRegistry.ts` derives role proficiency from these attributes and role-specific weights. |
| World state | `src/domain/world/GameWorld.ts` | Stores `staffPeopleById` and the parallel `coachProfessionalProfilesByCoachId`; validates both independently and has no equality invariant. `coachProfessionalProfilesByCoachId` is optional input but materialized as an empty map by `createGameWorld`. |
| Coach queries | `src/domain/world/queries.ts` | `getCoachProfessionalProfile`, `getUserCoachProfessionalProfile`, and `getCoachProfessionalProficiency` read the Coach-keyed map. Proficiency uses `calculateHeadCoachProfessionalProficiency`, a second head-coach weight definition in `src/domain/coachRpg/CoachRpg.ts`. |
| Default generation | `src/engine/world/CoachProfessionalProfileGenerator.ts`, called by `src/engine/world/WorldGenerator.ts` and `src/app/game/createAcbTestGame.ts` | Generates one professional profile per Coach; the same generated profile initializes the Coach's `StaffPerson`. The generated world then stores the original map as a second value. Coach RPG is generated separately. |
| New game assembly | `src/app/game/createNewGame.ts` | Rebuilds generated worlds while copying the Coach professional map as well as Staff people. This is forwarding of duplicate state, not a distinct consumer. |
| Save write | `src/save/GameWorldSaveV1.ts` | Serializes `coachProfessionalProfilesByCoachId` in Save V1. Staff people are serialized separately. |
| Save read / compatibility migration | `src/save/GameWorldSaveV1.ts` | Reads the Coach map; when omitted, creates a neutral legacy profile for each Coach. `migrateLegacyCoachStructure` seeds a missing Coach StaffProfile from that profile. If Staff already exists, it preserves that Staff professional profile while also retaining the Coach map; conflicting values can therefore continue to diverge after load. |
| Coach screen | `src/ui/screens/CoachScreen.tsx` | Reads the Coach-keyed map for the displayed professional attributes and for availability of the Coach profile page. |
| Coach application model | `src/ui-ng/applications/coach/coachOverviewModel.ts` and `src/ui-ng/applications/coach/CoachOpportunitiesScreen.tsx` | Reads the Coach's `StaffPerson` professional attributes through `staffProfileId`; this can disagree with the legacy Coach screen when stores diverge. |
| Staff UI | `src/ui/screens/StaffScreen.tsx`, `src/ui-ng/applications/staff/buildStaffPersonWorkspaceModel.ts`, `buildStaffDepartmentDetailModel.ts`, and `buildStaffDepartmentBoardModel.ts` | Reads `StaffPerson.professional.attributes`. No Coach map read. |
| Coach match experience | `src/engine/coach/CoachExperience.ts` | `applyCoachExperienceGain` computes attribute increases and XP residuals; `applyCoachExperienceToWorld` reads and writes the Coach map plus Coach RPG map. The attribute increase is professional truth, while XP residual/global progress/development points are Coach RPG state. |
| Match-result Coach experience | `src/engine/match/MatchResultApplication.ts` | After applying a canonical match result, independently applies the same experience function to both Coaches and writes the Coach map and Coach RPG map. This is a second caller of Coach professional mutation. |
| Coach skill/perk gates | `src/engine/coach/CoachSpecialization.ts` | Reads the Coach map to validate professional attribute prerequisites; writes only the distinct Coach RPG skills, perks, evidence, and development-point state. |
| Training | `src/engine/training/DelegatedTraining.ts` and `src/engine/staff/quality/trainingQuality.ts` | Read Staff professional values. The quality function uses derived proficiency for the actual assigned role. |
| Medical | `src/engine/staff/quality/medicalQuality.ts` plus injury advisory consumers | Reads Staff profile through `DecisionQualityContext`; role registry weights medical knowledge and rehabilitation for relevant roles. Medical owns the outcome. |
| Scouting / opposition scouting / Draft advice | `src/engine/scouting/ScoutingEngine.ts`, `src/engine/staff/quality/scoutingQuality.ts`, `src/engine/staff/quality/tacticsQuality.ts`, and Draft/scouting advisory consumers | Read Staff professional values and/or derived role proficiency from Staff. Reports use available knowledge/evidence; Staff attributes do not create hidden opponent or player truth. |
| Recruiting | `src/engine/staff/quality/recruitingQuality.ts` and `src/engine/recruiting/RecruitingAdvisory.ts` | Reads Staff profile through quality context; Recruiting retains action/commit/sign authority. |
| Basketball operations / Market / Trades | `src/engine/staff/quality/basketballOperationsQuality.ts`, `src/engine/roster/BasketballOperationsAdvisory.ts`, and the market/trade authority services | Uses Staff role proficiency / quality context for recommendations or actor authorization; legality and execution remain with the target domain. The quality function uses the canonical Staff profile. |
| Rotation / Coach tactics context | `src/engine/tactics/CoachRotationEngine.ts` | Reads the assigned Coach's `StaffPerson.professional` values for adaptability and tactical knowledge, not the Coach map. |
| Staff culture | `src/engine/staff/StaffCultureEngine.ts` | Reads Staff attributes as one input to culture/collaboration projections. It does not read Coach professional profiles. |
| World DB import | `src/app/game/WorldDbGameBootstrap.ts` | Imports an 80-value Staff vector, deterministically projects it to the canonical 13 Staff fields, and uses the selected head-coach Staff person as the Coach facade's `staffProfileId`. This path does not import a separate Coach professional profile or synthesize Coach attributes. |
| Fixtures and tests | `src/domain/world/testFixtures.ts`, `src/engine/world/CoachProfessionalProfileGenerator.test.ts`, `src/save/GameWorldSaveV1.test.ts`, `src/save/CoachRpgPersistence.test.ts`, Coach experience/specialization tests, Staff quality tests, and UI tests | Fixtures commonly construct Coach and Staff profiles separately at value 50. Existing generation tests assert that the two initial copies are equal; Save tests round-trip both; Coach RPG tests may directly construct a divergent Coach-map value. These tests encode the current duplicate shape and must be revised to assert one canonical source and explicit legacy migration instead. |

## Derived proficiency and specialization

Staff role proficiency is derived by `calculateStaffRoleProficiencyByRoleId` from the assigned
role's `STAFF_ROLE_REGISTRY` weights. Coach-specific proficiency is also derived, but currently
uses the separate `HEAD_COACH_PROFESSIONAL_ATTRIBUTE_WEIGHTS` table. This is a duplicate
head-coach scoring definition, not a distinct stored attribute concept. Specificity is already
represented by role weights and `StaffRoleId`; no additional generic specialism bonus is needed
for this milestone. Imported `specialismIds` describe imported Staff metadata and are not currently
read by the identified Coach professional consumers.

## Compatibility and migration evidence

Save V1 already has a single explicit legacy Coach structure boundary. It can deterministically
materialize a missing Staff profile from an old Coach-keyed profile. Current generated Coach data
already has the matching Staff profile. Therefore, the evidence supports a single canonical Staff
profile: when a saved Coach has a Staff profile, that profile is authoritative; when the Coach
Staff profile is missing, the legacy Coach-keyed profile seeds it; when both legacy profile forms
are absent, retain the existing neutral legacy defaults. A conflicting duplicate should not be
averaged or inferred from recency because no authoritative timestamps exist.

The compatibility payload may continue to read the optional old Coach-keyed field. The canonical
world and new Save writes should no longer carry a mutable duplicate. Coach RPG, reputation,
finance, employment, history, relationships, and identity remain separate and unchanged.

## Pre-implementation conclusion

The two attribute maps are semantically duplicate. Repository architecture, generation, Staff
quality consumers, Coach/Staff identity, and existing Save migration all support
`StaffPerson.professional.attributes` as the sole canonical mutable professional source. Coach
must remain a facade over its linked Staff profile. The Coach experience writer, Coach skill/perk
attribute gates, Coach UI, Coach proficiency query, Save compatibility path, and world-generation
assembly must converge on that source. This conclusion does not merge Coach RPG state into Staff
and does not authorize target-domain behavior changes.
