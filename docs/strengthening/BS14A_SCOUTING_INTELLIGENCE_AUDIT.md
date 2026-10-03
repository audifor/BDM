# BS14A — Scouting Intelligence Audit

**Milestone:** audit only. No production behavior changed.

**Source branch:** `bdm-stage2-bs12c-medical-recovery-rtp`

**Source SHA:** `c52a21717a5973ee33d99a0df3000d405bcb9847`

**Audit branch:** `bdm-stage2-bs14a-scouting-intelligence-audit`

**Worktree:** `C:\BDM-BS14`

**Starting status:** clean; new branch at source SHA.
**History caveat:** this checkout contains no BS13 branch or commit. Findings below describe the code at the stated source SHA; the BS13 premises supplied in the brief could not be independently tied to a repository commit.

## Executive answer

**BS14B lineage cross-check:** BS14A was audited at the stated BS12C SHA because that checkout lacked BS13 history. BS14B was re-anchored on committed BS13E `8bb698b8c4b1f766d38ca9edb4da6ca5e0607f84` and reviewed the relevant scouting, knowledge, save, Staff responsibility/workload, and acquisition paths. The BS13 delta adds Staff execution-quality and responsibility integration but does not alter the audit's finding that OrganizationKnowledge is the current report/acquisition input and PlayerKnowledge is legacy compatibility. See [BS14B convergence](BS14B_SCOUTING_KNOWLEDGE_AUTHORITY.md) for the authority migration.

BDM has a functioning, persistent Player Scouting pipeline: requests create dated assignments; daily calendar progression starts and completes them subject to per-scout workload; completion creates evidence, evaluator reports, and organization-specific knowledge. Reports are deterministic estimates with bounded error, confidence, coverage, and freshness. Staff attributes, assignment role, delegated role proficiency, and workload affect parts of the pipeline. Draft, recruiting, and free-agent AI rankings consume organization knowledge through a shared valuation function.

The pipeline is not the sole presentation authority. `PlayerKnowledgeRecord` (legacy, keyed by observer team) and `OrganizationKnowledge` (current, keyed by organization) coexist; WorldDB/generated starts have no populated canonical scouting knowledge; and the Player profile reads true Player ratings directly for headline ratings, category aggregates, and development detail. The Scouting workspace can request a QUICK_LOOK and display assignments/reports, but it does not offer mission selection, cancellation, scout selection, or priority editing. Many displayed panels are explicit empty projections.

The report engine currently evaluates seven aggregate basketball dimensions and eight potential domains, not the 80 individual ratings. It reads true player truth internally to make deterministic estimates, with no truth field copied into report/evidence/knowledge DTOs. Knowledge quality and displayed certainty lazily worsen with time, but stored findings are not rewritten or deleted. Geography does not constrain or improve scouting; `prioritizeRegions` actually prioritizes nationality clusters in the next opponent's roster.

## Scope and evidence standard

Inspected Domain, Engine, Application/store, UI, save, world-generation, market, draft, recruiting, opposition tactics, and focused test sources for scouting, knowledge, Staff, responsibilities, visibility, workload, and persistence. Design documents are treated as proposals/context; executable producers and consumers are the evidence for current behavior.

Relevant implementation: `src/domain/scouting/Scouting.ts`, `src/engine/scouting/ScoutingEngine.ts`, `DelegatedScouting.ts`, `AdvisoryScoutingReports.ts`, `src/domain/knowledge/*`, `src/domain/intelligence/OrganizationPlayerEvaluation.ts`, `src/domain/world/GameWorld.ts`, `src/engine/calendar/CalendarEngine.ts`, `src/save/GameWorldSaveV2.ts` through V4, `src/engine/tactics/OppositionScoutingReportEngine.ts`, `src/ui-ng/applications/scouting/*`, player and roster builders, and acquisition consumers. Focused tests inspected include `ScoutingEngine.test.ts`, `StaffQualityUncertainty.test.ts`, `DelegatedScouting.test.ts`, `AdvisoryScoutingReports.test.ts`, `OrganizationPlayerEvaluation.test.ts`, `rosterScoutAwareRatings.test.tsx`, `buildPlayerOverviewModel.test.ts`, `buildPlayerScoutingModel.test.ts`, opposition-report tests, and save V2/V3 tests. No tests were run: source inspection resolves the audited behavior and this milestone requests documentation only.

## 1. Canonical domains and truth

| Concern | Actual authority | Behavior |
|---|---|---|
| Player truth | `Player.basketball.ratings`, `Player.development.ceilings` | Canonical 80 rating truth and potential ceilings. Player profile builders can read it directly. |
| Staff truth | `StaffPerson.professional.attributes` | Canonical 13 Staff professional attributes. Team role is separately canonical in `TeamStaffAssignment.role`. |
| Active Player scouting work | `GameWorld.scoutingAssignmentsById` | Canonical assignments, keyed by assignment ID. |
| Raw scouting evidence | `GameWorld.evidenceById` | Dated source, quality, dimensions, context/game reference; no observation payload values. |
| Evaluator report | `GameWorld.evaluatorReportsById` | Immutable-per-ID estimate findings, uncertainty/confidence/coverage, staff and evidence references. |
| Current organization knowledge | `GameWorld.organizationKnowledge` | Sparse per-organization/per-player/per-dimension findings and report/evidence provenance. This is what current consumers query. |
| Legacy knowledge | `GameWorld.playerKnowledgeById` | Team-observer record with seven old aggregate rating keys, estimate/range uncertainty and assessment date. Compatibility/save-V1 surface; not updated by the current report completion path. |
| Organization evaluation policy | `GameWorld.organizationEvaluationPoliciesById` | Deterministic policy projection keyed by organization, stored/reconstructed with world state. It is not an evaluator or report. |
| Opposition report | `GameWorld.oppositionScoutingReportsById` | Separate team/game tactical-preparation artifact. It is not a Player evaluator report. |

There is no single “per team knows this player” type: current knowledge is organization scoped; legacy knowledge is observer-team scoped. The evaluator report is scout-attributed, while consolidated knowledge belongs to the organization. Individual scout familiarity is not a separate persistent player-knowledge authority.

## 2. Assignment lifecycle, time, and workload

`requestScouting` accepts a player and mission and creates a `QUEUED` assignment. Duplicate nonterminal work for the same organization/player/evaluator/mission is a no-op. The store exposes one human action, `requestScoutingAssignment(playerId)`, which always requests `QUICK_LOOK` from the user's `regionalScout` at normal priority. A club without that role cannot request through that action.

Daily `CalendarEngine.advanceDay` runs `SCOUTING_INTAKE` (delegated scouting, advisory requests, tactical opposition reports) before `SCOUTING_ASSIGNMENTS`. Thus newly created Player assignments may start that same day. Missions have base units/days: QUICK_LOOK 1/1, FULL_REPORT 4/5, SKILL_EVALUATION 2/3, POTENTIAL_EVALUATION 2/3, TACTICAL_FIT 2/3, LIVE_GAME 2/1. Per evaluator, active capacity is 6 units for a QUICK_LOOK start and 4 units for other queued assignment admission (the test/source exposes the existing mission admission rule); active work is ordered by URGENT, HIGH, NORMAL, LOW, then ID. Insufficient capacity leaves work queued. Completion date adds one day for relevant ability below 50, one for evaluator experience below 30, and one when current active workload is at least four. LIVE_GAME waits for its game date and then completes immediately.

The engine's `activeWorkload` counts mission units of active Player assignments. Delegated candidate selection also reads canonical `calculateStaffWorkload` overload plus active scouting units. Generic role/responsibility capacity affects who can hold/do delegated duties; Scouting adds a separate mission-unit workload. Two versus fifty assignments therefore differ materially: work queues and more requests wait. No travel, scouting budget, or financial cost is attached.

There is no public UI cancellation transition in the audited Scouting workspace. The domain status permits `CANCELLED`, but no production cancellation consumer/command was found in the focused paths.

## 3. Report generation, quality, and knowledge change

At completion, the engine creates one evidence record and one evaluator report, then consolidates findings into `OrganizationKnowledge`. QUICK_LOOK evaluates shooting and physical; SKILL_EVALUATION evaluates one selected dimension (default shooting); POTENTIAL_EVALUATION evaluates eight potential domains; TACTICAL_FIT evaluates `tacticalFit`; FULL_REPORT and the fallback missions evaluate seven grouped dimensions: finishing, shooting, creation, perimeter defense, interior defense, rebounding, physical. Group mappings currently aggregate only a subset of the Player rating catalogue.

The report estimate is the relevant true dimension plus deterministic hash-derived error and bias, rounded and clamped to 1–100. The noise half-width is `max(2, 18 - talentOrPotentialAbility/10 - experience/25 - applicablePerkReduction)`; biases add fixed +1 to +3 in matching categories. Report uncertainty is `max(3, round(17 - ability/9 - experience/18 - perkReduction + (1-evidence.quality)*5 + staffQualityAdjustment))`; delegated/advisory `staffQualityAdjustment = round(((50-qualityScore)/50)*4)`. Confidence is `clamp(round(100 - uncertainty*4 + evidence.quality*12), 1, 95)`. Evidence quality is mission units/4. This is reproducible uncertainty, not a fresh randomized draw. Staff can systematically err through biases; the bounded deterministic error permits over- and under-estimation.

`evaluatorProfile` uses a stored evaluator profile when present, otherwise derives experience as `round((talentEvaluation + analysis)/3)`, `EYE_FOR_SHOOTERS` at talent evaluation ≥80, and production bias below 45. Potential missions use `potentialEvaluation`; tactical-fit uses mean tactical knowledge and analysis; other findings use talent evaluation. The profile/perks/biases are stored in the world. Repeated reports merge estimates/confidence/uncertainty by confidence×coverage weights, increase coverage (first finding by evidence coverage; later distinct reports by 0.45× coverage), reduce duplicate-evidence contribution, and record unique evidence/report IDs. This can change an estimate and coverage; it is not a staged state machine and does not necessarily narrow uncertainty (disagreement can add uncertainty).

Stored evidence/report/knowledge are not aged or rewritten by a daily decay engine. `getOrganizationRatingEvaluation` computes freshness on read: `max(0, 1 - days/365)`, increases uncertainty by `round((1-freshness)*5)` capped at 20, then returns EXACT/RANGE/DESCRIPTOR/MIXED/UNKNOWN. Non-potential knowledge is EXACT only if uncertainty ≤1, freshness ≥0.8, and provenance is not inferred. Potential is explicitly never EXACT. The knowledge summary also calculates freshness lazily. Thus stale knowledge remains persisted and available but its projection becomes less precise.

## 4. Staff and Scout authority

The current role IDs are `headScout`, `regionalScout`, `advanceScout`, `collegeScout`, `internationalScout`, and `proScout`; legacy `scout` maps to `regionalScout`. The registry has role-weighted proficiency and default capacity costs: headScout (director, 2), regionalScout (standard, 2), advanceScout (standard, 2), collegeScout (standard, 1), internationalScout (standard, 1), proScout (standard, 1). The registry weights:

| Role | Attribute weights used for role proficiency |
|---|---|
| headScout | talent .26, potential .24, analysis .16, leadership .14, communication .10, adaptability .10 |
| regionalScout | talent .25, potential .25, analysis .15, adaptability .10, communication .10, tactical .05, player development .05, leadership .05 |
| advanceScout | tactical .30, analysis .28, talent .16, communication .14, adaptability .12 |
| collegeScout | talent .28, potential .28, analysis .16, adaptability .14, communication .14 |
| internationalScout | talent .26, potential .26, adaptability .20, analysis .14, communication .14 |
| proScout | talent .30, analysis .24, potential .18, adaptability .14, communication .14 |

Weights participate in role proficiency and responsibility/scouting-department ranking; the assignment's `evaluatorStaffId` and team assignment role determine actual person/eligibility. A manually created assignment can specify an evaluator without validating that their assignment role is scouting; the default chooser only considers assigned `regionalScout`s. Delegated candidate selection permits any role in the scouting department and ranks by role proficiency less workload penalty.

Professional attribute causality: `talentEvaluation`, `potentialEvaluation`, `analysis`, and `tacticalKnowledge` directly affect evaluator experience, mission duration, evaluator ranking, estimate noise/uncertainty, or tactical evaluation as described above. Role-weighted proficiency indirectly uses the role table's `communication`, `adaptability`, leadership, and relevant technical attributes in delegated selection/quality. `communication` and `adaptability` are not independent direct report-accuracy terms. Scouting `DecisionQualityFn` uses canonical role proficiency, professionalism/resilience personality adjustment (±3 combined around 50), seeded jitter (±5), and generic overload penalty. Its score selects a bounded target/evaluator band for delegated work and adjusts delegated/advisory report uncertainty. Manual HEAD_COACH requests have no `staffQualityScore`, so skip that quality adjustment.

No universal Staff overall exists in this path. `EvaluatorProfile.experience`, registry role proficiency, scouting decision quality, and report confidence are distinct values with different producers/consumers; the first three overlap conceptually as quality signals but are not duplicate numeric fields with one shared authority.

## 5. Roles, responsibilities, geography, and delegation

Scouting registry responsibilities: `assignScouts` and `prioritizeRegions` are eligible to headScout/regionalScout and support the generic modes (default userControlled); `oppositionReport` is eligible to advanceScout/regionalScout/proScout and supports userControlled/advisory/organizational; `prospectReport` is eligible to regionalScout/collegeScout/internationalScout/proScout and supports userControlled/advisory/organizational. Responsibilities are stored per team. A delegated holder is resolved against a Staff assignment and registry eligibility.

`assignScouts` has a real consumer: delegated progression chooses a bounded target from the next scheduled opponent's unknown roster and a bounded evaluator pool, then creates a QUICK_LOOK assignment and records an applied delegation outcome. `prioritizeRegions` has a real but mislabeled/limited consumer: it reorders that same pool by nationality cluster size, with role-quality-bounded selection; it creates no Region entity. `oppositionReport` creates an advisory FULL_REPORT request against one unknown next-opponent player; `prospectReport` requests a FULL_REPORT for an unknown player on the team's recruiting board. Advisory outcomes are recorded unapplied; assignment/report progression remains the single execution pipeline. Draft on-clock advisories use `prospectReport` for knowledge-only recommendation, separate from the scouting assignment creation.

No scouting Region model or region/country/league/competition/club coverage assignment exists. Geography does not gate discovery, report speed, quality, volume, travel, or costs. Countries and player nationality exist as general world/player data; nationality is only a cluster key for `prioritizeRegions`. No competition familiarity or distance input appears in Player report formulas.

## 6. Player discovery, visibility, and 80-rating compatibility

There is no discovery/visibility status machine in the current Player scouting assignment domain. Assignments require an already-addressed Player ID. `deriveScoutingNeeds` is a bounded helper and only selects supplied candidate IDs; delegated selection limits candidates to the next opponent roster. No `unknown → discovered → watched` record is created.

The new `OrganizationKnowledge` has sparse keys for seven aggregate dimensions and potential dimensions. Reports do not model 80 individual ratings, personality, hidden traits, injury, contract, value, role fit, tactical fit (except one coarse mission number), or development projection as general per-player facts. Potential estimates are the one eight-domain extension. Current `Player` truth has 80 canonical ratings and 40 tendency values. Consequently the report data model is structurally behind the Player rating model; Scouting compresses some 80-rating truth into seven older aggregate dimensions, while detailed 80-rating report findings do not exist. The seven-dimension legacy knowledge model is an additional stale compatibility shape.

Roster rating columns and some market/recruiting/draft projections consult organization evaluations. The Player profile does not consistently apply that mask: `buildPlayerOverviewModel` enumerates all `PLAYER_TRUTH_RATING_KEYS`, derives exact top-rating chips and exact aggregate descriptors from `player.basketball.ratings`; `buildPlayerDevelopmentModel` derives current 80-rating detail/trend from true ratings/history. An unscouted external Player can therefore reveal exact rating values through profile overview/development even though roster scouting-aware columns show `?` or knowledge-derived estimates.

Profile potential display is different: scouting/development overview potential panels call `getOrganizationRatingEvaluation` on the user's organization knowledge and say “Not scouted” when empty; the evaluator itself never returns potential EXACT. Hidden `Player.development.ceilings` are read by report production, but no direct profile read of those ceilings was found in the current NG profile. Personality/character and hidden-trait panels return unknown; the domain model does not have general player personality or hidden-trait scouting findings. Contract and injury surfaces read their own actual domains and are not masked by Player Scouting. The profile contains exact public/player identity and context data as well.

## 7. Reports and presentation

| Field | Stored report/evidence/knowledge | UI projection |
|---|---|---|
| Producer / target / requesting club | evaluator report stores evaluator, organization, subject, assignment, mission, date; evidence stores organization/subject | Scouting workspace resolves names and club context |
| Scout | `evaluatorStaffId`; evidence does not attribute a scout | report and assignment boards show evaluator name |
| Observations | Evidence records source/date/quality/dimensions/context/game ID; no narrative observation text | Scout notes and observed-game notes are explicitly reported as unavailable |
| Estimates/potential | `EvaluatorFinding` values, uncertainty, confidence, coverage; consolidated in OrganizationKnowledge | seven aggregate rating readings; eight potential readings through profile view |
| Strengths/weaknesses | not persisted; only finding dimensions | profile derives top/bottom aggregate dimensions from estimates when known (some labels); overview “top ratings” instead leaks Player truth |
| Recommendation/confidence | evaluator report has optional tacticalFit only; per-finding confidence. No general sign/decline recommendation | report UI mostly reprojects current consolidated knowledge; strength cards, confidence labels and potential bands are derived |
| Freshness | report date and finding assessedAt; no expiry field | freshness/uncertainty recalculated on read |
| Role fit/comparison/acquisition | no evaluator report fields | profile role-fit/team-fit/comparison placeholders; acquisition recommendation belongs to other intelligence services |

Opposition report is a separate shape: team, opponent, game, author, generated date, quality score, optional defensive emphasis/pace adjustment, flagged players. It has no Player evaluator findings, evidence references, potential or report freshness/confidence. Recommendation formulas consume organization knowledge plus existing evaluator-report familiarity only. Reports are generated once per team/game when responsibility is advisory with a valid holder; they can be accepted into existing `TeamGamePlan` tactical override fields through `acceptOppositionScoutingReport`. This is distinct from Player assignment/report infrastructure despite sharing organization knowledge and staff responsibility primitives.

The Scouting workspace shows Knowledge, Assignments, Reports, Opposition tabs. It requests QUICK_LOOK and projects persisted state. Player Scouting Report view, player development-scouter panel, roster ratings, and market/recruiting valuation labels are read projections. No report free-text, cancellation/edit workflow, travel operations, competition coverage map, or acquisition “sign” recommendation is persisted.

## 8. Acquisition and AI clubs

`deriveOrganizationPlayerValuation` reads `OrganizationKnowledge`; it does not read hidden true ratings for its seven dimensions. Unknown values use deterministic ID-derived neutral prior estimates, mode UNKNOWN, confidence zero; it is not a projection from the hidden Player values. Current consumers include AI draft choice and draft prospect advice, AI recruiting target ranking, AI minimum-roster free-agent ranking, and market candidate/trade intelligence surfaces. This means those ranking functions use organization knowledge/unknown priors rather than true 80-rating data, with other public/market facts (for example position, salary, roster need) used separately. Human market, roster, draft, and recruiting UI projection code also reads OrganizationKnowledge on the investigated paths.

AI clubs do employ scouting Staff where the generated staff structure supplies them (including the generated regionalScout role outside NCAA teams). Their responsibilities are initialized to `userControlled` by `ensureResponsibilityStructure`; delegated/advisory scouting only runs when configured with an eligible holder and mode. No generated AI loop sets all AI teams to delegated Scouting. As a result, AI teams generally create no Player scouting assignments/reports by default and rank candidates on unknown organization priors plus contextual inputs. This is not a true-data omniscience cheat in the inspected acquisition ranking consumers, although other non-scouting AI systems can inspect Player truth for their own simulation/roster work. Existing organization knowledge, if supplied, is organization-specific and consumed consistently.

Human Player loop: open Scouting Knowledge board → request QUICK_LOOK for a listed/known subject → daily progress queues/starts/completes it as capacity allows → inspect assignment/report and the changed organization estimate → use that knowledge in knowledge-aware roster/market/draft/recruiting projections. Limits: target list is own roster plus already-known subjects, so the UI is not a player-discovery/search system; a requested player's profile overview itself exposes exact ratings; no mission/staff/priority/cancel controls exist.

AI loop: candidate systems rank from the AI organization's existing knowledge/unknown prior → draft/recruit/free-agent behavior acts through its owning subsystem. There is no general AI scouting intake by default because responsibility mode remains userControlled. Where a responsibility is set to delegated/advisory, bounded assignments/reports run daily using the same assignment pipeline. Thus AI acquisition is knowledge-aware but AI report production is largely dormant absent delegation.

## 9. World creation and save/load

Generated `createNewGame` initializes empty `playerKnowledgeById` and `organizationKnowledge`; a separate `ensurePlayerKnowledge` compatibility helper can create deterministic estimates for same-ecosystem players and slightly narrower own-roster estimates, but production `createNewGame` does not invoke it. Focused test asserts the normal new game has no Player knowledge. The ACB test-game path invokes `ensurePlayerKnowledge`, producing a second, team-scoped legacy baseline shape. WorldDB bootstrap creates players/Staff/teams/games, no Player or organization knowledge, no assignments/reports, and does not invoke the legacy enrichment. Imported WorldDB Player true ratings remain available to direct Player profile code.

GameWorld stores both knowledge forms, evidence, evaluator profiles, assignments, evaluator reports, organization policies, responsibilities/outcomes, and opposition tactical reports. Save V1 is legacy and serializes Player legacy knowledge; Save V2 migrates V1 records into deliberately sparse `OrganizationKnowledge`, clears legacy `playerKnowledge`, and adds `scoutingRuntime` for evidence/profiles/assignments/reports/policies. Save V2 round-trip tests cover active/completed assignments, reports, knowledge and opposition artifacts through V3. Save V3/V4 preserve the V2 scouting payload and opposition report fields via world serialization. Assignments/reports/knowledge/evidence therefore persist; knowledge discoveries/estimates persist via OrganizationKnowledge; no region/coverage/discovery state exists to persist. Legacy PlayerKnowledge remaining in a live V2+ GameWorld can coexist with migrated OrganizationKnowledge, but current evaluator consumers read the latter.

Potential is removed from Player Save V2 payload as a compatibility projection; development profile ceilings remain canonical under Player development state and are persisted in the Player record. Save serialization is not itself a fog-of-war boundary.

## 10. Capability matrix summary

See [BS14_SCOUTING_CAPABILITY_MATRIX.md](BS14_SCOUTING_CAPABILITY_MATRIX.md). Main statuses: Player assignment/report/knowledge = REAL; report-backed freshness = PARTIAL (lazy view only); one-action Scouting UI = PARTIAL; 80-attribute evaluation = MISSING; player profile masking = DISCONNECTED; opposition tactical scouting = REAL, separate domain; geographic coverage = MISSING; old PlayerKnowledge = LEGACY/PARTIAL; broad discovery and report-text content = MISSING.

## 11. Disconnected systems and duplicate truth

| Severity | Finding |
|---|---|
| P0 | The NG Player profile overview/development reads exact canonical Player ratings directly, bypassing organization knowledge. This defeats the knowledge mask for any external player viewed there. |
| P1 | Two knowledge authorities coexist: legacy `playerKnowledgeById` (team-scoped seven rating keys) and current `organizationKnowledge` (organization-scoped sparse dimensions). The legacy helper is still reachable through the ACB test-game path; current scouting writes only organization knowledge. |
| P1 | Current scouting models seven aggregate dimensions, while Player truth is 80 ratings. Individual rating-level coverage/evidence is absent, and the old seven-signal structures remain. |
| P1 | New generated and WorldDB starts have no organization knowledge or reports; candidate evaluation operates on UNKNOWN priors and Scouting has no discovery search beyond supplied/bounded players. |
| P2 | Workspace actions request only QUICK_LOOK, normal priority, regional scout. Other mission types and their parameters exist in the engine but have no equivalent user controls here. Cancellation is represented in the domain but lacks a production UI/application transition in audited paths. |
| P2 | `prioritizeRegions` responsibility has a real consumer but ranks nationality clusters, not geography/regions; its label implies a dimension the world/scouting model does not represent. |
| P2 | `oppositionReport` / `prospectReport` (Player assignment) and `oppositionScouting` (tactical report) are distinct flows with overlapping labels and separate output/persistence. They share generic responsibilities and OrganizationKnowledge but not report infrastructure. |
| P2 | Findings carry date and lazy decay but never refresh/expire automatically; old knowledge persists indefinitely with certainty reduced only at read time. |
| P3 | UI “confidence”, “coverage”, evaluator experience, role proficiency, decision quality, and report finding confidence are related quality concepts but have different formulas/meaning. Avoid conflating them; no one universal quality field exists. |
| P3 | Evidence source catalogue includes public stats, combine, workout, own observation, staff prior knowledge, and evidence can be appended, but the current automatic assignment completion always manufactures a LIVE_SCOUTING / VIDEO_SCOUTING / OPPONENT_GAME evidence stub; no integration was found for most listed source types. |

## 12. Ten critical findings ranked

1. **P0 — External player profile leaks true ratings.** Exact top-four rating chips, aggregates, and development details bypass scouting knowledge.
2. **P1 — Duplicate knowledge ownership.** Team-keyed legacy PlayerKnowledge and organization-keyed OrganizationKnowledge coexist; producers/consumers differ.
3. **P1 — 80-rating intelligence mismatch.** Reports and persisted knowledge cover seven summaries, not the canonical 80 ratings.
4. **P1 — Start state has no current scouting knowledge.** Generated and WorldDB worlds start without OrganizationKnowledge; old baseline enrichment is not in normal creation.
5. **P1 — No true discoverability model.** Scouting starts from a Player ID; the only automated targets are next-opponent rosters/recruiting-board entries.
6. **P2 — Human workflow is narrow.** Scouting UI supports a single QUICK_LOOK request with fixed evaluator/priority, not general mission/assignment management.
7. **P2 — Geography is nominal only.** Region responsibility operates on nationality clustering and does not assign regional coverage.
8. **P2 — AI scouting production is dormant by default.** Responsibilities start userControlled; AI acquisition consumes organization knowledge/unknown priors without a default report-generation loop.
9. **P2 — Knowledge decay is projection-only.** Stale persisted records are never refreshed, superseded, or expired by time.
10. **P2 — Similar opposition labels mask separate systems.** Tactical OppositionScoutingReport is a pre-match artifact; Player oppositionReport is a scouting assignment advisory. Their lifecycle/quality/consumer differ.

## 13. Recommended remaining BS14 milestones

This is a sequencing proposal, not product approval or implementation.

- **BS14B — Authority and compatibility convergence:** choose/preserve one canonical Player knowledge contract; document and reconcile team versus organization ownership and Save V1/V2 migration boundary.
- **BS14C — Player knowledge and profile visibility:** establish user/team/organization access policy and route Player profile, roster, market, draft, and recruiting display through an authorized projection. This addresses the confirmed P0 leak.
- **BS14D — Rating-level reports and evaluation quality:** align report finding dimensions to approved Player rating catalogue; preserve uncertainty/confidence semantics and Staff causal weights; decide potential and hidden information policy.
- **BS14E — Scouting operations, assignments, and geography:** clarify real Region/coverage requirements; converge responsibility semantics, target discovery, assignment lifecycle, mission/staff selection, workload, and any actual cost inputs.
- **BS14F — Market, recruiting, draft, and AI integration:** ensure candidates can be found without leaking truth, define AI report cadence/authority, and certify knowledge-only decisions across incoming routes.
- **BS14G — Gameplay manifestation and UI:** expose only supported report content and actionable assignment operations, clearly distinguishing Player reports from tactical Opposition reports.
- **BS14H — Save migration and integration certification:** test generation paths, Save V1–V4 round trips, daily progression, stale findings, profile masking, acquisition asymmetry, and focused UI consumers.

## Validation record

- Focused source/tests inspected: as listed in Scope and evidence standard.
- Runtime tests: not run; no uncertain code behavior required execution after source-path inspection.
- Production files modified: none.
- `git diff --check`: run after document creation; result recorded in final response.
- Full suite/typecheck/build: not run, as required by the audit scope.
