# BS14 Scouting Integration Map

Current integration through BS14H; earlier BS14A-D prose is superseded by this map.

## Daily loop

```text
SCOUTING_INTAKE
  ├─ human/manual and delegated/advisory request intake
  ├─ bounded AI plan for AI-controlled organizations
  └─ active territory discovery → OrganizationPlayerAwareness

SCOUTING_ASSIGNMENTS
  └─ queued/active assignment progression
       └─ evidence → EvaluatorReport → OrganizationKnowledge consolidation
            └─ workspace, Player profile and acquisition projections
```

The intake phase precedes assignment progression. Assignment completion creates one historical report/evidence set and updates the canonical current knowledge. Completed/cancelled work is terminal; stable IDs and replay tests cover idempotence. Advisory scouting requests create canonical assignments and `applied: false` outcomes, not a second report type. Advance Scouts can cover broad opposition Full Reports and contextual missions, while focused player evaluation follows player-scout roles.

## Territory and AI

Human territory commands and AI territory planning call the same territory service. COUNTRY and COMPETITION membership comes from current world teams, rosters and competition participants. A discovery adds organization/player awareness only; the Player remains unknown for ability until a report adds OrganizationKnowledge. Ending an operation stops new discovery and retains already-discovered identity. AI planning is cadence-gated, bounded to a small number of operations/requests, and excludes user-controlled teams.

## Knowledge consumers and fog boundary

```text
derivePlayerKnowledgeAccess
  ├─ controlled roster → exact current ratings
  └─ external player → only viewer OrganizationKnowledge estimates

OrganizationKnowledge → getOrganizationRatingEvaluation → profile/market/trade/draft/recruiting
                      └→ deriveOrganizationPlayerValuation → AI acquisition ranking
```

Overview, Attributes, Development, Scouting, comparison and report detail use canonical or stored derived projections. Market/free-agent, trade, draft and recruiting valuation paths use the organization evaluator; missing knowledge yields a deterministic unknown prior, not hidden truth. AI target selection uses public/contextual candidate sources and the same knowledge authority. Tactical `OppositionScoutingReport` remains a distinct team/game artifact that can consume current knowledge and requires explicit acceptance.

## Recruitment Focus and Search

Human Recruitment Focuses create existing territory operations with a Focus reference and priority. The territory engine still resolves membership, Staff quality, workload, daily discovery cap and awareness writes. Focus status/duration advances in daily intake and ends linked operations on completion or cancellation. AI continues to plan territory operations directly; convergence on Focus entities is deferred.

`ScoutingRecruitmentFocus` stores intent, territory, Staff assignments, priority and lifecycle. Candidate lists are derived from matching territory membership, addressable identities, awareness and OrganizationKnowledge. Player Search stays within the organization's currently addressable identity set; current/potential thresholds require a non-UNKNOWN `getOrganizationRatingEvaluation` result. Search criteria can create a Focus without selecting a Player.

## Staff and historical attribution

Employed Staff with a live team role must be eligible for the mission and have capacity. Professional attributes and role proficiency influence evaluator quality, selection and duration; active assignment and territory workloads share the workload calculation. Assignment and report records retain evaluator identity and role attribution from the observation. Later Staff changes do not edit existing evidence or report findings.

## Save, reload and season

| Boundary | Scouting state behavior |
|---|---|
| V1 | Legacy team knowledge is deterministically converted to organization knowledge; current V1 writer does not re-emit runtime legacy authority. |
| V2 | Persists current knowledge and runtime; missing old territory/awareness fields default to empty. |
| V3 | Preserves Scouting runtime collections through the extended envelope. |
| V4 | Preserves knowledge and runtime state, including in-flight work. |
| Mid-assignment reload | Active work resumes and completes through the ordinary progression; same-date replay does not duplicate output. |
| Mid-territory reload | Active operation resumes discovery using its canonical state; ended operation remains stopped and awareness persists. |
| Season rollover | Knowledge, reports, evidence, assignments, awareness and territory operations are retained. Competition membership remains derived from current participants. |

Targeted persistence and rollover outcomes are in [BS14H final certification](BS14H_SCOUTING_FINAL_CERTIFICATION.md). Tendency, personality/medical scouting, travel, per-assignment financial cost, broad evidence ingestion and narrative authoring remain intentionally deferred.
