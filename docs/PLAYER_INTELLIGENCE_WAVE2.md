# Player Intelligence — Wave 2

Scouting uses sparse, observer-owned knowledge. Canonical player ratings are read only inside the evaluation engine and are never copied into Evidence, reports, or consumer summaries.

Evidence is partial and source-tagged. The V1 sources are PUBLIC_DATA, STATISTICS, LIVE_SCOUTING, VIDEO_SCOUTING, OPPONENT_GAME, OWN_TEAM_OBSERVATION, STAFF_PRIOR_KNOWLEDGE, COMBINE and WORKOUT. `recordEvidence` is the bounded integration point for sources that are not created by a scouting assignment.

An evaluator is an existing StaffPerson plus a persisted profile: experience, functional perks, and persistent biases. Assignments progress from QUEUED to ACTIVE to COMPLETED; completing one atomically records Evidence, an immutable report, and a sparse OrganizationKnowledge update. Calendar progression processes assignments only, never a whole knowledge matrix.

Knowledge queries derive freshness lazily from dates. Coverage is historical and does not decay. Existing report provenance prevents the same Evidence from receiving full consolidation weight repeatedly. Save V2 persists the runtime under `scoutingRuntime`; older V2 saves receive empty runtime collections.
