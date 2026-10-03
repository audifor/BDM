# BS14 Scouting Capability Matrix

Current state through BS14H. Status means the behavior is present in the runtime unless marked otherwise.

| Capability | Status | Canonical authority and user/AI effect | Persistence or limit |
|---|---|---|---|
| Quick Look | REAL | Two broad current-ability findings through the normal report pipeline. | Assignment, evidence, report and knowledge persist. |
| Full Report | REAL | Rating-level findings for the canonical 80 rating keys. | Historical report plus consolidated current knowledge persist. |
| Skill Evaluation | REAL | Writes only the selected canonical rating family. | Same report and knowledge lifecycle. |
| Potential Evaluation | REAL | Writes uncertain potential-domain estimates, not true ceilings. | Potential remains distinct from current ability. |
| Tactical Fit | REAL | Evaluates a player in a team/tactical context. | Assignment/report lifecycle. |
| Live Game | REAL | Requires a scheduled game involving the player; report preserves game provenance. | Evidence references the actual game. |
| Staff suitability and quality | REAL | Employed Staff, team role, attributes, proficiency and workload drive eligibility, selection, duration and quality. | Role/Staff attribution remains on assignment and report. |
| Human scouting | REAL | Shared workspace/profile request flow, eligible evaluator selection, priorities, cancellation, reports and detail. | All canonical state is saved. |
| Human delegated/advisory scouting | REAL | Existing responsibility path requests canonical assignments; advisory outcomes remain unapplied recommendations. | Equivalent active work is suppressed. |
| Territory operations | REAL | COUNTRY and COMPETITION coverage discovers current eligible members and creates awareness. | Active/ended operations and awareness survive V2/V3/V4; ending does not erase awareness. |
| Recruitment Focus brief | PARTIAL | User can define positions, age range, territory, current/potential evidence targets, Scout(s), priority and duration. | Active/completed/cancelled Focus and linked operations persist in V2/V3/V4. Criteria editing/resume UI is outstanding. |
| Focus discovery and candidates | PARTIAL | Territory discovery progressively surfaces matching identities; candidate list derives awareness/knowledge and shows unknown-aware fit/reasons. | Reuses awareness, OrganizationKnowledge and existing missions; no automatic Quick Look or shortlist. |
| Player Search | PARTIAL | Addressable identity search supports name, position, age, club, country, competition, market presence, knowledge, scouting state and known-evaluation thresholds. | Does not scan unseen Players or use UNKNOWN evaluation priors; Search can seed a Focus. |
| Focus workload and history | PARTIAL | Focus workload is charged through linked territory operations; Scout view summarizes focuses, Player missions, territory ops and reports. | Active/completed/cancelled Focus history is inspectable; durations use fixed 14/42 day windows. |
| Scouting Centre | PARTIAL | Combines recent discoveries/reports, active Focus progress, estimated strong matches, stale knowledge and overloaded Scout alerts from canonical state. | No canonical recruitment recommendation object exists; no authored recommendation feed is fabricated. |
| Autonomous AI scouting | REAL | Bounded AI planning creates territories and reports for AI-controlled teams only. | Uses the same territory, assignment, knowledge and calendar lifecycle as human work. |
| OrganizationPlayerAwareness | REAL | Identity discovery and addressability. | Does not contain ability/potential ratings. |
| OrganizationKnowledge | REAL | Sole mutable current player evaluation, organization scoped. | Generic dimensions, including rating findings, persist through supported save versions. |
| Evidence and EvaluatorReport | REAL | Historical provenance, findings and immutable evaluator attribution. | Persist and are not rewritten by later Staff changes. |
| Consensus and summary gates | REAL | Multiple evaluator rows are required for consensus; Strengths/Weaknesses and archetype require sufficient knowledge/confidence. | Derived from current OrganizationKnowledge. |
| Knowledge freshness | REAL | Evaluation projection reduces certainty as findings age without mutating the original observation. | Assessed dates remain historical. |
| External player fog of war | REAL | Shared profile projection exposes only known OrganizationKnowledge estimates; unknown rows stay unknown. | Controlled-roster exact ratings remain allowed. |
| AI acquisition fairness | REAL | Draft, recruiting, free-agent and trade valuation consume organization evaluation, not hidden PlayerTruth. | Missing knowledge uses deterministic unknown priors. |
| UI projections after reload | REAL | Workspace, report, profile and coverage views derive from canonical world state. | Save reload restores the state from which projections are rebuilt. |
| Legacy save support | REAL | V1 legacy player knowledge migrates into OrganizationKnowledge; older V2 territory omissions default empty. | V2/V3/V4 current Scouting state is covered by regression tests. |
| Season rollover | REAL | Valid knowledge/history/work/awareness/territory collections survive the season transition. | Competition membership remains derived from current membership. |
| Narrative ingestion and evidence variety | DEFERRED | No broad ingestion workflow for statistics, combine or workouts and no authored narrative system. | No extra source or narrative subsystem in BS14. |
| Tendencies, personality and medical scouting | DEFERRED | No corresponding scouting dimensions or missions. | Outside the current 80-rating and potential contract. |
| Travel and scouting finance | DEFERRED | No travel simulation or per-assignment financial budget/cost. | Workload remains the operational constraint. |
| Initial generated-world knowledge | OUTSIDE | Normal new worlds start without fabricated Scouting history. | ACB test fixtures may supply an explicit baseline. |

## Closure notes

Calendar order is `SCOUTING_INTAKE` before `SCOUTING_ASSIGNMENTS`; discovery/planning can create work before the assignment phase progresses it on that date. Completed and cancelled assignments are terminal. Territory operations marked ended no longer discover Players. See [BS14H final certification](BS14H_SCOUTING_FINAL_CERTIFICATION.md) for exact commands, results, and any external regression.
