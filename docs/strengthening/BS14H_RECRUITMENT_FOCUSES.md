# BS14H Recruitment Focuses & Player Search

## Outcome

**BS14H core loop: USER VALIDATED. Full final certification: OPEN for BS14I.** The user confirmed that the core Recruitment Focus gameplay loop works. This does not claim that every BS14H visual scenario or the final BS14I responsibility/search/history scenarios passed.

Validated core loop:

- create a Recruitment Focus from a management need without a Player ID
- set Player profile criteria and Scout capacity
- advance simulation time and receive discovered candidates
- inspect candidate knowledge and request deeper evaluation

BS14I is responsible for responsibility convergence, public Player search, lifecycle/history, save/load, workload edges, AI/human coherence and final product-gap certification.

## FM-reference gap comparison

The [FM scouting gap audit](BS14H_FM_SCOUTING_GAP_AUDIT.md) identified the missing core loop: describe a need without knowing a Player ID, assign Scout capacity, discover candidates progressively, inspect evidence and move selected candidates into existing reports.

| FM-like need | BDM implementation | Status |
|---|---|---|
| Define a target independently of a Player | `ScoutingRecruitmentFocus` stores basketball positions, age bounds, country/competition territory, knowledge state, optional known current/potential evaluation thresholds, Scout IDs, priority, duration and lifecycle. | Implemented |
| Assign Scout(s) or Auto | Focus creation accepts multiple suitable employed Scouts; the workspace can select multiple Scouts or Auto-select one with available capacity. | Implemented |
| Explore a bounded area over time | Focus operations reuse COUNTRY/COMPETITION territory assignments, existing membership, staff quality, real workload and awareness-only discovery. | Implemented |
| Priority affects work | Focus priority is copied to linked territory operations and orders them before the existing daily discovery throughput. | Implemented |
| Review candidates and fit | Candidate view derives from matching territory, addressability, awareness and OrganizationKnowledge. Public position/age fit is explained; requested level evidence is UNKNOWN until observed. | Partial: no near-match category or automatic Quick Look |
| Request deeper evaluation | Candidate opens the existing Full Report request flow; reports continue through the canonical assignment/evidence/knowledge pipeline. | Implemented |
| Search Players without hidden ratings | Player Search covers only current addressable identities and public/contextual filters. Evaluation thresholds require a non-UNKNOWN OrganizationKnowledge evaluation. | Partial: not a full public world directory |
| Continue from search to brief | Current position/age/territory/evaluation filters can seed a new Focus. | Implemented |
| Manage history/workload | Active/completed/cancelled Focuses remain visible; assignments show a Scout workload summary across Focuses, Player missions, territory work and reports. | Implemented |
| Scouting Centre | Combines recent canonical discoveries and reports, active Focus progress, higher-confidence estimated matches, stale knowledge and overloaded Scout alerts. | Partial: no canonical recruitment recommendation object exists, so the Centre does not invent one |

## Authority and safety

- Focuses store intent and lifecycle only. Candidate pools are derived; no Player result list is copied into Focus state.
- Territory operations remain the discovery and workload authority. Focus attribution and priority extend that record without duplicating geography.
- Awareness reveals identity only. Player evaluation uses OrganizationKnowledge; hidden PlayerTruth is never used to filter search or calculate Focus fit.
- Current/potential level targets use `getOrganizationRatingEvaluation`. UNKNOWN results remain UNKNOWN and lower displayed confidence.
- Deeper requests reuse canonical Quick Look, Full Report, Skill and Potential missions.
- No shortlist authority was found in the audit. Remove from consideration is a Focus-local disposition; no second shortlist was introduced.
- AI scouting continues to use its bounded territory planner. Migrating AI planning onto Focus entities is deferred rather than introducing a parallel AI implementation.
- Short and Medium duration are 14 and 42 simulation days; Ongoing has no expiry. Completion/cancellation ends linked future territory work and preserves discoveries/reports.

## Verification

- Focused tests: Focus lifecycle/operations, territory operations, persistence, Scouting Workspace and desktop time controls pass. The calendar regression covers advancing a full day with an active Focus; the Workspace test covers the visible confirmation after a report request.
- TypeScript project build passed.
- Vite production build passed.
- `git diff --check` passed.
- BS14H now uses a local `node_modules` install from its lockfile; it no longer depends on the incomplete `C:\BDM-BS14B` junction. Workspace DOM tests run successfully with that isolated install.
- The user has manually validated the core loop listed above. The full BS14H A–E checklist and BS14I A–G certification scenarios are not claimed as tested here.

## Known remaining scope

Resume/pause controls, completed-Focus immutability rules, automatic Quick Look triage, and AI Focus convergence remain for follow-up/certification. Active Focus criteria can be edited for name, positions, age and knowledge-aware current/potential thresholds; territory and assigned Scout changes use a new Focus. Candidate evaluation supports canonical aggregate dimensions, not a new role/archetype catalogue. Scout options show role suitability, evaluation/analysis quality band and before/after workload for the selected territory; territory familiarity is not surfaced as a canonical staff-knowledge measure. Responsibility delegation/advisory behavior for Focus creation is not yet unified with existing Player request responsibilities. The Centre links actual reports and surfaced matches, but there is no persisted recommendation authority to summarize.
