# BS14F — AI Scouting Intelligence and Acquisition Integration

## Scope and authority

BS14F gives coached AI teams an autonomous Scouting department. `progressAiScoutingOperations` is the sole strategic planner. The canonical calendar calls it during `SCOUTING_INTAKE`; existing delegated/advisory/opposition flows keep their own authorities. Territory commands and discovery remain in `ScoutingTerritoryOperations`, while player reports continue through `requestScouting` and `progressScoutingAssignments`.

The control boundary follows the existing game convention: a team is user-controlled when `team.coachId === world.userCoachId`. Such teams are excluded from autonomous planning. Explicit human delegation continues through the existing delegated engine. AI teams with a defined non-user coach are planned together by `organizationId`, so knowledge and limits follow the existing organization scope. AI planning does not edit responsibility settings.

## Cadence and operations

Strategic planning runs on calendar days 1, 8, 15, 22, and 29. Report assignments and active territory discovery continue through the existing daily phases. No new clock or persisted cooldown is needed; old saves derive the next plan from the current date and existing world state. Planning is deterministic for identical state.

At bootstrap, an eligible Scout first gets the team's own current Competition. A regional or head Scout may cover its Team country when suitable; international, college, and pro Scouts may cover matching foreign or acquisition ecosystems. Role suitability is queried from the BS14E authority. Membership uses current Team country, Competition participants, and roster membership, never Player nationality. Existing coverage reduces the score, while own Competition, relevant ecosystems, and territory pool size raise it. Active operations are kept in place while valid to avoid churn.

An organization may have at most three active territory operations, further capped by its employed eligible Scout slots. Each Scout can hold at most one territory assignment in this planner, and an assignment is created only when canonical workload/capacity leaves room. No Scout is synthesized. Organizations without suitable employed Scouting staff have no autonomous territory capacity. Active human-team operations in a shared organization are left alone; invalidation applies only to AI-team operations.

## Player targets and report funnel

The bounded candidate pool draws from position-need free agents, the organization's public market knowledge, existing organization knowledge, the next draft pool, recruiting boards, next opponents, and territory awareness. The pool is capped at 120 candidates per organization; at most two new reports are requested per planning cycle. Position, age/context carried by public systems, eligibility, market state, roster need, existing knowledge, and the shared OrganizationKnowledge valuation projection drive priority. No hidden Player ratings or potential are inspected to pick a target.

Unknown targets start with Quick Look. A high-priority player with broad-only knowledge, or relevant knowledge whose freshness is at or below 0.65, may escalate to Full Report. Recent complete rating coverage is not immediately repeated. Existing nonterminal assignments, same-day reports, workload capacity, and stable evaluator ranking prevent duplicate work. Evaluators are chosen by role proficiency, evaluation/analysis attributes, and current workload. Skill Evaluation and Potential Evaluation are not automatically selected in this milestone; Tactical Opposition reports remain a separate artifact.

Urgent market, draft, recruiting, and roster decisions are not blocked. If a report cannot finish before a deadline, existing consumers continue with current OrganizationKnowledge or their UNKNOWN prior. This milestone does not change negotiation, trade, draft, or recruiting algorithms.

## Acquisition integration and fairness

Free-agent, market/trade, draft, and recruiting ranking continue to use existing OrganizationKnowledge-aware valuation. BS14F adds possible report requests before those decisions and lets completed reports alter the real valuation inputs; it adds no formula or privileged AI signal. Tactical opposition preparation remains independent, though known player information can be an input where existing code already permits it.

Human and AI acquisition intelligence share the invariant: current player evaluation comes from the consuming organization's `organizationKnowledge`; absent knowledge stays UNKNOWN. Territory awareness identifies a Player but grants no rating knowledge. Reports write through the established evidence → EvaluatorReport → OrganizationKnowledge path. Generated and WorldDB worlds are not seeded with universal reports; knowledge accumulates only as operations and requested reports progress. Knowledge and awareness are existing save state, so season changes do not wipe either. Current territory membership naturally follows current Team/Competition state.

## Bounds and cost

Strategic work runs five times per 30-day month, not every day. Candidate collection is limited to 120 distinct targets per organization, report creation to two per cycle, and territory work to three operations/eligible Scout slots. Free agents are grouped once per planning call. Territory scoring considers eligible Competition/country pools for each eligible Scout and reuses the BS14E membership/coverage projections. There is no all-player × all-rating strategic scan.

## Validation record

The 30-day generated-world subsystem smoke produced 1 territory operation (1 still active), 40 awareness records, 5 completed reports from 5 assignments, and 3 OrganizationKnowledge records for the selected AI organization. It remained within the 3-territory cap and well short of universal player knowledge. The focused suite covers AI territory bootstrap/determinism, human exclusion, off-cycle no-op, this 30-day smoke, real report-to-valuation feedback, territory operations, Scouting report generation, acquisition valuation, and save persistence.

Validation commands: `npx vitest run src/engine/scouting/AiScoutingOperations.test.ts src/engine/scouting/ScoutingTerritoryOperations.test.ts src/engine/scouting/ScoutingEngine.test.ts src/domain/intelligence/OrganizationPlayerEvaluation.test.ts src/save/ScoutingTerritoryPersistence.test.ts src/save/GameWorldSaveV2.test.ts`; `npm run typecheck`; `npm run build`; `git diff --check`. The final focused suite passed all 62 tests across six files, including the real report-to-valuation assertion. Typecheck passed. Production build passed with the repository's existing large-chunk advisory.

BS14G still owns the final Scouting workspace: contradictory Strengths/Weaknesses, premature Player Archetype, Actions buttons, mission selection, and territory management UI. Travel, Scouting budget, tendencies, personality intelligence, and broader acquisition-system redesign remain deferred. Status applies to AI Scouting behavior only and does not certify all Scouting complete.
