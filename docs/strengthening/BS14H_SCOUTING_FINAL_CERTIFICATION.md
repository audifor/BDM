# BS14H Scouting Final Certification — PASS

**Final closure update:** the previously pending visual smoke was manually confirmed OK by the product owner on 2026-10-05. The technical certification below already passed; BS14H is therefore closed as PASS and the subsequent recruitment-focus implementation is included in the integrated BS14 lineage.

## Lineage and verdict

- Branch at stop: `bdm-stage2-bs14h-recruitment-focuses`
- Starting SHA: `592cb7a4a8c1c820e0777fbf43f2fb387ee268c1` (BS14G)
- BS14G: PASS; user-confirmed manual visual validation before BS14H.
- BS14H: **PASS — code, focused tests, typecheck, build and final manual visual smoke confirmed.**
- No merge, push or commit was performed.

## Stopped scope (superseded)

BS14H is final lifecycle and integration certification, not a feature expansion. It verifies human and AI scouting, territory discovery, canonical knowledge and awareness boundaries, Staff causality, persistence/reload, duplicate suppression, acquisition feedback, legacy compatibility and season rollover. Deferred areas remain tendencies, personality/medical scouting, travel, per-assignment financial cost, richer evidence ingestion and authored scouting narratives.

## Authority map

- `GameWorld.organizationKnowledge` is the only current mutable Player Scouting evaluation authority.
- `organizationPlayerAwarenessById` grants identity/addressability only; it cannot reveal ratings or potential.
- `evidenceById` and `evaluatorReportsById` are historical observations.
- `scoutingAssignmentsById` and `scoutingTerritoryAssignmentsById` own their respective work lifecycles.
- `derivePlayerKnowledgeAccess` is the shared profile permission projection: controlled-roster exact ratings remain valid; external players receive only known OrganizationKnowledge evaluations.
- Acquisition reads `getOrganizationRatingEvaluation` / `deriveOrganizationPlayerValuation`; unknown information uses deterministic priors and does not fall back to PlayerTruth.
- Staff employment, team role, professional attributes and workload govern mission eligibility, quality, selection and capacity. Advance Scouts can perform broad opposition Full Reports and contextual Fit/Live Game missions.

See the reconciled [authority map](BS14_SCOUTING_AUTHORITY_MAP.md), [capability matrix](BS14_SCOUTING_CAPABILITY_MATRIX.md), [decision register](BS14_SCOUTING_DECISION_REGISTER.md) and [integration map](BS14_SCOUTING_INTEGRATION_MAP.md).

## Certified lifecycles

Human requests, delegated/advisory requests and autonomous AI work use the canonical assignment service and shared evidence/report/knowledge completion pipeline. AI planning is bounded and excludes user-controlled teams. Territory discovery resolves current COUNTRY/COMPETITION membership, creates awareness without ability knowledge, and stops after an operation ends. Assignment completion and same-date replay are idempotent; cancellation is terminal and preserves history.

The calendar runs Scouting intake before assignment progression, so newly created work can enter the ordinary progression phase. Staff attribution is stored on assignments/reports and later Staff changes do not rewrite history. Full Report writes 80 rating findings; Skill Evaluation is family-scoped; Potential Evaluation stores estimates rather than true ceilings; Live Game requires and records the actual scheduled game.

## Save/load and season matrix

| Scenario | Result |
|---|---|
| V2/V3/V4 territory and awareness persistence, including legacy V2 empty defaults | PASS (targeted regression) |
| V2/V3/V4 sparse rating-knowledge/Scouting runtime round-trip | PASS (targeted regression) |
| Active Full Report save/reload, completion and replay | PASS (`ScoutingFinalCertification`) |
| Active territory save/reload, continued discovery, end and post-end stop | PASS (`ScoutingFinalCertification`) |
| Cancelled assignment save/reload remains terminal and creates no report/evidence | PASS (`ScoutingFinalCertification`) |
| Season rollover retains OrganizationKnowledge, reports, evidence, assignments, awareness and territory operations | PASS (new targeted rollover test) |
| V1 legacy knowledge compatibility | Existing conversion path retained; V2 sparse-knowledge legacy regression passed. |
| Competition territory derives current participants and rosters | PASS (domain membership test). |

The adjacent `creates a deterministic new season without replacing canonical history` test has an unrelated `advanceGameDay` failure: `Rehabilitation dates cannot precede injury`. The same test and error reproduce at the BS14G base SHA with no BS14H changes. This medical/calendar defect is outside Scouting and was not modified.

## PlayerTruth leak audit

Inspected the Scouting workspace, Player profile Overview, Attributes, Development and comparison projections, report detail boundaries, market/free-agent, trade, draft and recruiting valuation paths, autonomous AI target selection and AI acquisition valuation. External profile builders pass through `derivePlayerKnowledgeAccess`; exact rating rows are included only for the user's controlled roster, while external unknowns remain unscouted. The scouting workspace serialization regression rejects raw Player ratings. AI and acquisition valuation take organization knowledge and public/context inputs rather than hidden PlayerTruth. Internal PlayerTruth reads used to create uncertain observation findings remain the authorized simulation boundary.

## Tests and validation

Commands were invoked through installed package entry points because the shared `node_modules/.bin` shims are absent; behavior is equivalent to the package scripts.

| Command / scope | Result |
|---|---|
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 src/engine/scouting/ScoutingFinalCertification.test.ts src/engine/scouting/ScoutingEngine.test.ts src/engine/scouting/ScoutingTerritoryOperations.test.ts src/engine/scouting/AiScoutingOperations.test.ts src/engine/scouting/DelegatedScouting.test.ts src/engine/scouting/AdvisoryScoutingReports.test.ts` | PASS, 6 files / 55 tests |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 src/domain/world/scoutingTerritories.test.ts src/engine/scouting/StaffQualityUncertainty.test.ts` | PASS, 2 files / 6 tests |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 src/domain/intelligence/OrganizationPlayerEvaluation.test.ts src/ui-ng/applications/player/data/buildPlayerScoutingModel.test.ts src/ui-ng/applications/scouting/ScoutingWorkspace.test.tsx src/ui-ng/applications/scouting/buildScoutingWorkspaceModel.test.ts` | PASS, 4 files / 23 tests |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 src/ui-ng/applications/player/data/buildPlayerOverviewModel.test.ts src/ui-ng/applications/player/data/buildPlayerDevelopmentModel.test.ts src/ui-ng/applications/player/data/buildPlayerComparisonSnapshot.test.ts src/ui-ng/applications/player/data/buildPlayerWorkspaceModel.test.ts` | PASS, 4 files / 46 tests |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 src/engine/draft/DraftProspectAdvisory.test.ts src/engine/recruiting/RecruitingAdvisory.test.ts` | PASS, 2 files / 24 tests |
| Targeted V2/V3/V4 and territory persistence tests (`-t` matching Scouting round-trip cases) | PASS, 4 files / 10 tests; 72 unrelated cases skipped |
| Targeted Scouting season rollover test | PASS, 1 test |
| `node node_modules/typescript/bin/tsc -b --pretty false` | PASS |
| `node node_modules/vite/bin/vite.js build` | PASS; Vite reports the existing large-chunk advisory |
| `git diff --check` | PASS |

An initial combined broad persistence invocation was stopped after prolonged machine contention; it is not counted as a passing run. The targeted persistence cases listed above completed successfully.

## Visual smoke and final status

BS14H Tauri dev build was launched and the final manual visual smoke was subsequently confirmed OK by the product owner on 2026-10-05, covering the previously pending quick regression checklist: (1) external unknown Player, (2) discovered but unscouted Player, (3) Quick Look and detailed Full Report, (4) active and completed assignment, (5) active territory, and (6) a reloaded save with Scouting state.

Remaining Scouting P0/P1 issues found: none. The final overall status is **PASS**. The known base-reproduced rehabilitation invariant failure is outside BS14 and remains documented above.

## BS14 closure answers

| Question | Answer |
|---|---|
| Sole current Player Scouting knowledge authority? | `GameWorld.organizationKnowledge`. |
| Sole identity/discovery authority? | `organizationPlayerAwarenessById`. |
| Can awareness expose ratings? | No. |
| Can external Player UI read exact PlayerTruth? | No; external profiles receive only known organization evaluations. |
| Can AI acquisition read hidden PlayerTruth without knowledge? | No; unknown dimensions use deterministic priors. |
| Does Full Report produce rating-level knowledge? | Yes, all 80 canonical rating dimensions. |
| Does Skill Evaluation remain family-scoped? | Yes. |
| Does Potential Evaluation avoid real ceilings? | Yes; it writes uncertain estimates. |
| Does Live Game preserve real-game provenance? | Yes; request validation requires a scheduled involving game and evidence/report retains the game reference. |
| Can assignments be cancelled without deleting history? | Yes; cancelled is terminal and records remain. |
| Can territory end without deleting awareness? | Yes; ended operations stop discovery and awareness remains. |
| Does save/load preserve unfinished work? | Yes across the tested V2/V3/V4 runtime routes. |
| Can unfinished work complete twice after reload? | No; terminal filtering/stable IDs and replay regression prevent duplicate outputs. |
| Does knowledge survive season transition? | Yes; targeted rollover regression passes. |
| Does competition territory use current membership? | Yes; membership derives from current competition participants/rosters, not nationality. |
| Do historical reports remain historical after Staff changes? | Yes; report/evidence attribution is stored at observation time. |
| Do human and AI consumers share the knowledge authority? | Yes; both converge on OrganizationKnowledge and shared evaluation helpers. |
| Are acquisition consumers knowledge-aware? | Yes; valuation tests confirm findings change value while hidden truth mutations do not. |
| Are all BS14-critical technical audit gaps closed? | The inspected technical boundaries and focused tests pass; final visual confirmation is still open. |
| What remains deferred? | Tendencies, personality/medical scouting, travel, scouting budgets/cost, richer evidence ingestion and authored report narratives. |

## Final response metadata

1. Branch: `bdm-stage2-bs14h-scouting-final-certification`.
2. Starting SHA: `592cb7a4a8c1c820e0777fbf43f2fb387ee268c1`.
3. Final SHA: unchanged at `592cb7a4a8c1c820e0777fbf43f2fb387ee268c1`; no certification commit because status is PARTIAL.
4. Commit: none.
5. Initial status: clean.
6. Scope: final integration, lifecycle, persistence and certification only.
7-8. State map and PlayerTruth audit: see this report's Authority map and leak audit sections.
9-29. Mission, lifecycle, Staff, knowledge, delegated/AI, fairness and acquisition answers: see Certified lifecycles, Save/load matrix and BS14 closure answers.
30-41. Save, reload, exactly-once, legacy, calendar, season, movement, duplicate-work and UI reload results: see Save/load and season matrix, Tests and validation, and the listed regression tests. Player movement membership is covered by the domain scouting-territory tests.
42-44. Capability matrix, decision register and deferred items: see linked reconciled documents and the matrix above.
45. Files changed: the five BS14 docs listed below plus three Scouting test/engine files and the new certification test; no production files outside Scouting were changed.
46-48. Focused test files, exact commands and outcomes: see Tests and validation.
49. Typecheck: PASS.
50. Build: PASS; large chunk advisory only.
51. `git diff --check`: PASS.
52. Visual smoke: BDM Tauri window launched; checklist remains unconfirmed due unavailable app/browser observation surface.
53. Working tree: intentionally contains the uncommitted BS14H certification changes; branch is isolated and unmerged.
54. Remaining P0 Scouting issues: none found.
55. Remaining P1 Scouting issues: none found; visual smoke is a closure gate, not a discovered code defect.
56. Closure answers: see the table above. The one adjacent medical-date failure is reproduced on the base SHA and is outside Scouting.
57. Final status: **PASS**.
