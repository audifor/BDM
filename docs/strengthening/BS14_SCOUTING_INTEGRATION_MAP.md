# BS14 Scouting Integration Map

Snapshot: source `c52a21717a5973ee33d99a0df3000d405bcb9847`.

## Executable flows

### Human Player scouting

```text
ScoutingWorkspace Knowledge tab
  → gameStore.requestScoutingAssignment(playerId)
  → regionalScout lookup on user's team
  → requestScouting(QUICK_LOOK, HEAD_COACH)
  → CalendarEngine daily SCOUTING_ASSIGNMENTS
  → evidence + EvaluatorReport + OrganizationKnowledge
  → assignments/reports/knowledge UI projections
```

The board target set is the user's own roster plus subjects already present in organization knowledge. The button requests one QUICK_LOOK, normal priority, fixed regional scout. There is no unscouted-player discovery route in this board.

### Delegated/advisory Player scouting

```text
SCOUTING_INTAKE
  ├─ progressDelegatedScouting: assignScouts (+ optional prioritizeRegions)
  │    → next scheduled opponent's unknown roster
  │    → selects evaluator and creates QUICK_LOOK
  └─ progressAdvisoryScoutingReports
       ├─ oppositionReport → next opponent's first unknown player, FULL_REPORT
       └─ prospectReport → recruiting board's first unknown player, FULL_REPORT
  → SCOUTING_ASSIGNMENTS progresses those requests the same date if capacity permits
```

Assignments use shared `ScoutingEngine` execution. Delegated assignment outcomes are marked applied. Advisory requests are recorded as `applied: false` recommendations; they are not a second report producer.

### Tactical opposition preparation

```text
SCOUTING_INTAKE
  → progressOppositionScoutingReports
  → advisory `oppositionScouting` holder and next scheduled opponent
  → report from OrganizationKnowledge and existing report familiarity
  → Scouting workspace Opposition tab
  → explicit acceptOppositionScoutingReport
  → existing TeamGamePlan tactical override
```

This report has its own `OppositionScoutingReport` store, uses `tacticsQuality`, and is keyed once per team/game. It does not create a Player report or share Player evidence/report lifecycle.

### Acquisition

```text
OrganizationKnowledge ─→ getOrganizationRatingEvaluation ─→ roster/market/draft/recruiting display
                     └→ deriveOrganizationPlayerValuation
                           ├─ AI draft choice/advisory
                           ├─ AI recruiting target ranking
                           ├─ AI minimum-roster free-agent ranking
                           └─ market candidate/trade intelligence
```

Unknown scouting dimensions use deterministic ID-based prior estimates with UNKNOWN mode and zero confidence. The investigated acquisition rankings do not fall back to true Player ratings. Other inputs (public position, roster need, salary/market facts) are separate from Player rating knowledge.

## Integration gaps

- Player profile overview, attributes, development, scouting and comparison consume the canonical permission projection; external exact 80-rating scouting remains a BS14D gap.
- Scouting assignment findings cover seven groups/eight potential dimensions; the 80-value rating catalogue is not the report schema.
- Legacy `PlayerKnowledgeRecord` exists only as a V1 payload parser/migration type; runtime readers/writers and acquisition inputs have been removed.
- Normal generated and WorldDB bootstrap paths do not seed current organization knowledge, evidence, assignments, or reports.
- `prioritizeRegions` connects a Region-named responsibility to nationality grouping, with no geographic entity, assignment, or coverage effect.
- AI responsibilities default to userControlled. AI acquisition paths use current organization knowledge or UNKNOWN priors, but no default AI scouting cadence populates that knowledge.
- Listed evidence sources such as public statistics/combine/workout/prior knowledge have no broad ingestion workflow in the automatic assignment completion path.
- Player profile personality, roles, fit, comparison, contract/injury intelligence and market value are not generally produced by Player Scouting. Some are independently exposed by their owning domains.

## Save integration

`GameWorld` holds OrganizationKnowledge, evidence, evaluator profiles, assignments, reports, responsibility/outcome state, and tactical opposition reports. Save V1 accepts legacy team knowledge in its input payload and the V1 reader converts it to OrganizationKnowledge using `Team.organizationId`; the V1 serializer emits an empty legacy field. Save V2 persists current OrganizationKnowledge and `scoutingRuntime`; V3/V4 preserve that payload and the tactical opposition-report store. No persistent geography/coverage/discovery object currently exists.

## BS14B consumer certification

Scouting report completion, organization/player evaluation, market, draft, recruiting, AI free-agent/draft/recruiting ranking, and tactical opposition preparation use OrganizationKnowledge. Market workspace's knowledge badge was the remaining active legacy read and now queries the organization's knowledge. Tactical opposition reports remain a distinct team/game artifact and may use OrganizationKnowledge as an input; they are not evaluator reports and do not own player findings.

## BS14C profile integration

`derivePlayerKnowledgeAccess` now projects exact-own-roster, scouted-external and unknown-external access for Player workspace, overview, attributes, development, scouting, comparison and compact profile surfaces. Shared Market, Draft, Recruiting and external roster links therefore preserve the same mask at the workspace builder. External view models do not carry individual truth ratings or their history; aggregate and potential displays use the viewer organization's freshness-adjusted OrganizationKnowledge. ACB baseline knowledge follows the same route. See [BS14C Player Knowledge Visibility](BS14C_PLAYER_KNOWLEDGE_VISIBILITY.md).

## BS14D rating-level integration

Full Report writes up to 80 `rating:<CANONICAL_KEY>` findings through the existing EvaluatorReport → OrganizationKnowledge completion path. Quick Look remains two broad current-ability findings; Skill Evaluation uses the selected canonical family. The Player access projection now exposes known per-rating evaluations to external Attributes while preserving unknown rows and controlled-roster exact ratings. Development history remains masked.

The Domain catalogue owns eight scouting families and seven aggregate member sets. Shared evaluation derives an aggregate from known member ratings once coverage reaches 0.60, widening uncertainty for missing evidence; below that threshold, stored aggregate findings remain readable. Market/draft/recruiting continue through shared valuation helpers, and Trade Package knowledge now uses the same OrganizationKnowledge evaluation helper. V2/V3/V4 preserve rating dimensions as generic OrganizationKnowledge; old aggregate-only knowledge does not fabricate individual findings. Potential stays separate and tendencies are deferred. See [BS14D Rating-Level Scouting](BS14D_RATING_LEVEL_SCOUTING.md).
