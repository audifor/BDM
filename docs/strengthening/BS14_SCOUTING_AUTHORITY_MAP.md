# BS14 Scouting Authority Map

Snapshot: source `c52a21717a5973ee33d99a0df3000d405bcb9847` on `bdm-stage2-bs12c-medical-recovery-rtp`. See [BS14A audit](BS14A_SCOUTING_INTELLIGENCE_AUDIT.md) for formulas and limitations.

```text
Player truth
  ├─ Player.basketball.ratings (80 canonical values)
  └─ Player.development.ceilings
       │ read internally only to generate estimate + deterministic bounded error
       ▼
requestScouting / responsibility intake
  └─ GameWorld.scoutingAssignmentsById
       │ daily CalendarEngine progression, workload and mission duration
       ▼
GameWorld.evidenceById ──► GameWorld.evaluatorReportsById
                                 │ findings: estimate, uncertainty, confidence, coverage
                                 ▼
                 GameWorld.organizationKnowledge
                 (organization + subject + sparse dimension)
                    ├─ getOrganizationRatingEvaluation (lazy freshness/range)
                    ├─ roster / market / draft / recruiting projections
                    └─ OppositionScoutingReportEngine (tactical summary input)

StaffPerson.professional.attributes + TeamStaffAssignment.role
  ├─ evaluatorProfile (experience/perks/bias)
  ├─ mission duration, evaluator rank and report error/uncertainty
  └─ registry role proficiency → scoutingQuality → delegated selection/uncertainty

Player profile UI
  └─ derivePlayerKnowledgeAccess → own-roster truth OR current OrganizationKnowledge projection
       └─ external unknown remains unknown; no 80-rating expansion

Legacy PlayerKnowledgeRecord
  └─ Save V1 input payload only (team scoped, 7 old dimensions)
       └─ V1→V2 migration to sparse OrganizationKnowledge

Tactical opposition report
  └─ GameWorld.oppositionScoutingReportsById (team/game; tacticsQuality; separate artifact)
       └─ explicit acceptance → TeamGamePlan tactical override
```

## Authority details

| Data | Authority | Mutation/read path | Important boundary |
|---|---|---|---|
| True player ability/potential | Player domain | generation/import/development; `ScoutingEngine` reads to make estimates | Not a report and currently exposed by profile UI. |
| Staff professional quality | `StaffPerson.professional.attributes` | Staff construction and canonical Staff services | 13 keyed attributes; no universal overall. |
| Role and team holder | `TeamStaffAssignment.role` plus per-team `Responsibility` | Staff assignment and responsibility services | Market role on StaffPerson is not the assignment authority. |
| Player assignment | `scoutingAssignmentsById` | `requestScouting`; daily `progressScoutingAssignments` | Domain shape is player-specific; no region assignment. |
| Evidence and Player report | `evidenceById`, `evaluatorReportsById` | Created at assignment completion; immutable IDs | Evidence omits observed values; report omits PlayerTruth. |
| Consolidated current knowledge | `organizationKnowledge` | `consolidateOrganizationKnowledge` | This is the current consumer-facing player evaluation input. |
| Old knowledge | V1 `playerKnowledge` payload / `PlayerKnowledgeRecord` type | Save V1 parser and deterministic V1→V2 migration only | No runtime index, modern consumer, or current writer. |
| Displayed evaluation | derived by `getOrganizationRatingEvaluation` | roster, Scouting, Player scouting/potential, market/draft/recruiting | Mode/uncertainty/freshness are projections, not separately persisted. |
| Organization decision preference | `organizationEvaluationPoliciesById` | deterministic ID-based policy factory | A decision preference vector, not actual player knowledge. |
| Tactical opposition report | `oppositionScoutingReportsById` | `progressOppositionScoutingReports` | Uses tactics quality and OrganizationKnowledge; separate from evaluator reports. |

## Staff causality map

- `talentEvaluation`: evaluator experience; current-ability report error/uncertainty; default evaluator selection; relevant mission duration.
- `potentialEvaluation`: potential report error/uncertainty; potential mission duration/selection.
- `analysis` and `tacticalKnowledge`: evaluator experience/tactical-fitness duration and tactical findings; both enter role weights for relevant roles.
- `adaptability`, `communication`, leadership and other role weights: enter canonical proficiency and therefore role-based ranking/decision quality where used. No independent report-accuracy multiplier.
- Role proficiency is computed from `STAFF_ROLE_REGISTRY`; scouting quality also includes bounded professionalism/resilience personality effects, seeded jitter, and the shared overload penalty.
- Evaluator `experience`, role proficiency, decision `qualityScore`, report `confidence`, and organization finding `confidence` remain different values. There is no universal Staff overall.

## BS14B convergence

Current mutable scouting knowledge is only `GameWorld.organizationKnowledge`, keyed by the owning `Team.organizationId` and subject Player. Report completion consolidates findings there. Old `PlayerKnowledgeRecord` remains a V1 disk-input type; the V1 deserializer resolves each observer team through its required `organizationId`, merges records for teams sharing an organization, retains estimates, widens uncertainty to cover conflicts, and labels findings `legacyBaseline`. Repeated migration is deterministic and does not create duplicate organization/player entries.

Normal generated and WorldDB worlds start with empty `organizationKnowledge` and have no legacy runtime field. The ACB test-game path seeds its compatibility baseline directly into OrganizationKnowledge. `getOrganizationKnowledge` and current market presentation read the same canonical collection.

## BS14C visibility boundary

`derivePlayerKnowledgeAccess` is the Player UI permission projection: exact current ratings only for the user's controlled roster; external evaluation only from the viewer's `Team.organizationId` in `GameWorld.organizationKnowledge`; unknown information stays unknown. Same-organization sharing grants knowledge, not exact PlayerTruth. Public identity/context, contract and injury remain in their owning domains. Potential remains knowledge-aware, true 80-rating history is masked externally, and rating-level scouting is deferred to BS14D. See [BS14C Player Knowledge Visibility](BS14C_PLAYER_KNOWLEDGE_VISIBILITY.md).
