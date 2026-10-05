# BS14 Scouting Authority Map

Current map, reconciled through BS14H. This replaces the earlier BS14A snapshot below it in repository history.

## Canonical state

```text
Player truth (ratings and development ceilings)
  └─ Scouting generation only → uncertain, deterministic observation
       └─ evidenceById → evaluatorReportsById (historical)
            └─ consolidateOrganizationKnowledge → organizationKnowledge (current evaluation)

territory operation → organizationPlayerAwarenessById (identity/addressability only)

derivePlayerKnowledgeAccess(world, player)
  ├─ controlled roster → exact current ratings
  └─ external player → OrganizationKnowledge evaluations; unknown stays unknown

Staff role + employment + attributes + current workload
  └─ mission eligibility, selection, duration and estimate quality

organizationKnowledge → rating evaluation / organization valuation
  └─ profile, market, free agency, trade, draft, recruiting and AI acquisition consumers
```

| Concern | Sole authority | Boundary |
|---|---|---|
| Current player evaluation | `GameWorld.organizationKnowledge` | Organization and player scoped; ratings and potential remain distinct dimensions. |
| Discovery and identity | `organizationPlayerAwarenessById` | Grants addressability only; creates no ability or potential knowledge. |
| Historical observation | `evidenceById` and `evaluatorReportsById` | Immutable provenance and report history; never current mutable evaluation. |
| Unfinished player work | `scoutingAssignmentsById` | Queued/active/completed/cancelled lifecycle; terminal assignments are not reprocessed. |
| Territory work | `scoutingTerritoryAssignmentsById` | Active operations discover eligible current members; ending preserves awareness. |
| Staff suitability | employment + team assignment role + professional attributes + workload | No universal Scout overall; mission roles and capacity are checked by the engine. |
| External profile projection | `derivePlayerKnowledgeAccess` | Only estimates already present in the viewer organization's knowledge are rendered. |
| Acquisition evaluation | `getOrganizationRatingEvaluation` / `deriveOrganizationPlayerValuation` | Missing knowledge uses deterministic unknown priors and does not read hidden ratings. |
| Tactical opposition prep | `oppositionScoutingReportsById` | Separate team/game tactical artifact with explicit acceptance; not a player report. |
| Legacy knowledge | V1 `playerKnowledge` input | Converted at the save boundary to organization knowledge; no current runtime authority. |
| Recruitment intent | `scoutingRecruitmentFocusesById` | Organization need, criteria, assigned Scouts, priority, duration and lifecycle. Candidate results are derived, not stored. |
| Focus operations | `scoutingTerritoryAssignmentsById` with optional Focus attribution | Existing territory operation remains the sole discovery/workload authority; Focus priority orders daily territory capacity. |
| Candidate removal | `dismissedPlayerIds` on the owning Focus | Per-Focus disposition; does not delete awareness, reports or knowledge. |

## Lifecycle and causality

Human, delegated/advisory, territory and autonomous AI requests converge on the canonical assignment and territory operations. Calendar intake precedes territory discovery and delegated/advisory/AI planning; the later assignment phase advances accepted work. Completion writes evidence, one historical report and consolidated current knowledge. UI views are projections of this state.

Staff role, employment and professional attributes affect mission eligibility and evaluator quality. Workload affects assignment capacity and territory capacity. Reports retain the evaluator Staff ID, role attribution at report time, and their evidence; later Staff changes do not rewrite historical reports.

Recruitment Focuses create linked territory operations for employed, role-suitable Scouts. Position and age criteria bound each Focus operation's discovery pool; country/competition criteria are the territory itself. LOW/NORMAL/HIGH/URGENT order competing active territory operations before the existing daily discovery cap. Short (14 day), medium (42 day) and ongoing lifecycle states are canonical Focus duration choices; bounded expiry ends linked operations. Candidate fit and search level filters consume only `getOrganizationRatingEvaluation` over OrganizationKnowledge.

## Persistence authority

V2, V3 and V4 serialize OrganizationKnowledge and the Scouting runtime (evidence, reports, assignments, evaluator profiles, territory operations, Recruitment Focuses, awareness and related responsibility state). Older V2 territory/focus payloads default missing collections to empty. V1 legacy knowledge migrates deterministically into the current authority. Season rollover preserves valid Scouting collections; competition territory membership is resolved from current competition participants and current rosters.

## User-facing boundary audit

Player profile Overview, Attributes, Development, Scouting and comparison use the shared access projection. Market, free-agent, trade, draft and recruiting consumers use organization evaluation/valuation paths. Workspace and profile builders have regression checks that external projections do not serialize exact ratings. AI acquisition candidate selection uses public/contextual inputs plus the same organization valuation; awareness alone never adds rating knowledge.

Controlled-roster exact ratings remain intentional. Internal truth reads used only to generate uncertain observations remain intentional. Tendency scouting, personality and medical scouting are outside BS14.
