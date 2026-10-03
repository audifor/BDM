# BS14G · Scouting Gameplay UX

## User workflow

The Scouting workspace exposes Players / Knowledge, Assignments, Reports, Coverage and Opposition. Candidate search is limited to the team's roster, organization awareness and knowledge, market/free-agent context, scheduled opponent context, draft ecosystem and the user's recruiting board.

Request Scouting is a shared modal used by the workspace and Player profile. It offers Quick Look, Full Report, Skill Evaluation, Potential Evaluation, Tactical Fit and Live Game, with mission-relevant fields, eligible employed Scouts, Auto selection and canonical priority. Requests flow through `ScoutingOperationsService` into the canonical assignment pipeline. Priority changes and cancellation preserve assignment history.

Assignments show status, Scout/role, mission, priority, expected date, workload and origin. Completed `EvaluatorReport` records open in a read-only modal with confidence, coverage, uncertainty, evidence, broad/potential findings and rating findings grouped by the eight canonical skill families.

Coverage lists active and ended territory operations. Add Coverage uses valid country/competition context, eligible Scout roles and workload capacity; End Coverage preserves awareness and knowledge. Coverage is derived from the domain service rather than saved UI percentages.

## Knowledge presentation policy

- Candidate state is projected as not scouted, discovered, Quick Look, partial or detailed from awareness and OrganizationKnowledge.
- Identity discovery never implies rating knowledge. External ratings remain masked; own-roster access remains unchanged.
- Strengths require a known rating estimate of at least 65 with confidence >= 0.55. Weaknesses require at most 40 at the same confidence. The sets are disjoint and are allowed to be empty.
- Archetype labels require at least four reliable broad dimensions and mean confidence >= 0.60. Otherwise the profile says “Insufficient scouting information.” No PlayerTruth input is used.
- Current coverage is sourced from the shared knowledge summary. Potential remains a distinct knowledge area; unsupported personality and medical scouting are not implied.
- A single evaluator is labeled “Scout assessment”; consensus is reserved for multiple evaluator rows.
- Player profile actions reflect current assignments and report history, and use the same request and report-detail flows as the workspace.

## Manual visual validation checklist

1. On an addressable external Player, request Quick Look, advance days, and confirm broad knowledge only.
2. Request Full Report for that Player, advance, inspect Attributes and report detail for individual rating ranges grouped by skill family.
3. Request Skill Evaluation for one family and confirm only that family expands.
4. Request Potential Evaluation and confirm estimated potential appears without true ceilings.
5. Request Live Game for a Player with an upcoming scheduled game and confirm the report identifies that game; confirm no-game cases cannot submit.
6. Create an assignment, raise its priority, cancel another, and verify status/history and prior knowledge.
7. Add country or competition coverage, advance several days, verify discovery/coverage changes, then end coverage.
8. On the Player profile, verify Request Report and Assign Scout open the shared modal; increase priority and end scouting reflect real assignment state; detailed report opens the latest existing report.
9. Check that strengths and weaknesses never repeat a dimension, archetype stays gated with sparse knowledge, overall coverage agrees with known sections, and one Scout is not called a consensus.

## Certification boundary

BS14G is technically ready after focused checks and build. A person must complete the checklist in the running BDM UI before visual certification; BS14H owns final certification. No merge or push is part of this milestone.
