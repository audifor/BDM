# Player Model + Intelligence Migration Plan

**Estado:** plan técnico; no implementación.  
**Entrada:** `PCB_RECOVERY_AUDIT.md`, `PLAYER_MODEL_RECOVERY.md`, `PLAYER_INTELLIGENCE_1A_DESIGN.md`, arquitectura BDM y código actual.  
**Regla:** una migración estructural versionada, una sola PlayerTruth, adaptadores temporales de lectura y cero dual truth.

## 1. Executive Summary

BDM debe sustituir de una vez los siete ratings bootstrap y su `PlayerPotential.ceiling` por el Player Model canónico, e introducir OrganizationKnowledge sparse sobre ese modelo. No conviene migrar primero a 35 ratings y más tarde volver a alterar Player para Knowledge: ambos contratos se incorporan a un único `GameWorldSaveV2`, aunque los consumidores de UI y engine se activen por olas.

La secuencia segura es: contratos de dominio → migrador determinista de save → adaptador de Match → training/development/generators → Knowledge/reportes → AI gate → consumidores UI → retirar adaptadores. MatchEngine conserva inicialmente sus señales actuales mediante un adapter desde los 35 ratings; no se reescribe en la migración. La IA de management deja de leer Truth para evaluar, mientras las validaciones objetivas y MatchEngine siguen leyéndola.

## 2. Current Architecture

`Player` contiene identidad, bio (`dateOfBirth`, `heightCm`, `weightKg`), `primaryPosition`, siete ratings enteros 0–100 y `potential.ceiling`. Personality vive en `personalitiesByPersonId`; morale, career fatigue, injury y training stimulus también viven en mapas independientes de `GameWorld`. `GameWorldSaveV1` tiene parser estricto y serializa players, knowledge, stimuli y mapas separados.

Knowledge actual contiene un `PlayerKnowledgeRecord` por `observerTeamId`/jugador con siete `estimate + uncertainty`. `ensurePlayerKnowledge` precarga al usuario todos los jugadores del mismo ecosistema. Market consume ese rango, mientras Draft AI y AI roster maintenance usan Truth directamente. Team es la entidad organizativa existente; no hay `OrganizationId`.

## 3. Target Architecture

```
PlayerTruth ───────► Match adapter / Development / rule validation
PlayerState ───────► Health, morale, contracts, roles
Personality ───────► morale, memory, narrative
Evidence ─► EvaluatorReport ─► OrganizationKnowledge ─► observer evaluation ─► view model
```

PlayerTruth: identity, measurements, 35 ratings, 21 tendencies, traits, position and development truth. State, Personality, Health, Relationships and Contract stay separate. OrganizationKnowledge, reports and assignments are separate persisted records. Overall/value/fit/archetype are derived and observer-specific where applicable.

## 4. Dependency Graph

```
PlayerRatings(7) ─┬─ PlayerPotential ── Development / Draft / Recruiting / Team evaluation
                  ├─ DevelopmentStimulus ── Training ── Offseason development
                  ├─ PlayerKnowledge ── Market UI
                  ├─ WorldGenerator / DraftGenerator / RecruitingGenerator / fixtures
                  ├─ MatchPlayerProfile ── MatchEngine ── MatchViewer/stats
                  └─ UI labels, Squad/Roster, Draft, Training, save parser/tests

PlayerTruth(35) ──► CanonicalMatchProfileAdapter ──► existing MatchEngine signals (Phase A)
                  ├─ canonical development/stimulus groups
                  ├─ OrganizationKnowledge / reports / view models
                  └─ future detailed MatchEngine and tactics (Phase B/C)
```

Upstream blockers are Player contract, save read/write, generator and fixture helpers. Downstream consumers are broad but isolated by adapter. The only dangerous cycle is UI or AI treating derived knowledge as truth; prevent it through directional imports and explicit evaluator interfaces.

## 5. Bootstrap Rating Consumer Audit

| Consumer | Bootstrap field(s) | Replacement | Complexity | Migration risk |
|---|---|---|---|---|
| `Player.ts` validation/type | all 7 | 35-key rating record | M | canonical contract |
| Potential/proxy | all 7 | domain evaluation + potential profile | M | preserve upside |
| MatchPlayerProfile | all 7 | CanonicalMatchProfileAdapter | M | behaviour drift |
| Shot/turnover/rebound resolution | shooting/playmaking/defense/rebound/athletic | existing match signals initially | S | adapter fidelity |
| Training focus/stimulus | all 7 | rating-group distribution | M | save stimulus |
| Offseason development | all 7/potential | canonical keys/domain ceilings | L | career progression |
| World/Draft/Recruit generation | all 7 | truth+tendencies+development generator | L | determinism/diversity |
| Draft AI | proxy + ceiling | OrganizationKnowledge evaluation | M | current omniscience |
| Recruiting generation/AI | all 7 + ceiling | truth + prospect knowledge | M | separate observer knowledge |
| Market UI | all 7 knowledge | `KnowledgeSummary` | M | screen contract |
| AI roster maintenance | proxy | organization evaluation | M | non-omniscience |
| Market salary terms | proxy | objective market formula / public eval | M | distinguish price from preference |
| Team evaluation | all 7 | derived canonical evaluation | M | formula calibration |
| Roster/Squad/Draft/Training UI | all 7 | view models/labels | M | no Truth leak |
| Save V1 parser | all 7 knowledge/stimulus | Save V2 reader | L | compatibility |
| Tests/fixtures | all 7 | canonical fixture builder | L | broad mechanical impact |

All seven occur in domain, engine, generator, save, UI and test code. There is no safe UI-first route.

## 6. Canonical Player Model Contract

`Player` becomes truth with four measurement fields (`heightCm`, `weightKg`, `wingspanCm`, `standingReachCm`), identity `dominantHand?`, primary/optional secondary positions, 35 unique 1–100 ratings, 21 1–100 tendencies, sparse trait ids and `developmentProfileId`/value. Rating truth may be decimal internally but all public validators enforce finite values in 1–100; UI rounds by default.

No personality, health, morale, contract, relationships, overall or market value is embedded in Player. Ratings are the exact approved list; extended rating keys stay outside v1.

## 7. Potential Contract

Replace scalar `potential.ceiling` as authority with `PlayerDevelopmentProfile`: `developmentStage`, `growthRate`, `declineSensitivity`, and internal ceilings for `shooting`, `finishing`, `creation`, `passing`, `defense`, `rebounding`, `physical`, `mental`. `overallPotential` derives from profile + current ability and is never canonical. The eight ceiling domains must be constrained to 1–100 and no lower than a coherent current-domain evaluation unless an explicit decline rule permits it.

## 8. Tendency Contract

Persist exactly the 21 approved 1–100 tendencies as PlayerTruth. `Rating` governs action success; `Tendency` influences action selection with tactics/role. Training UI uses groups, not 21 buttons. No tendency becomes a proxy for a missing rating.

## 9. Personality Boundary

Keep `personalitiesByPersonId`; extend its canonical dimensions from six to eight (`adaptability`, `competitiveness`) in the same V2 migration. Do not embed personality in Player, derive work ethic from professionalism and preserve existing morale/memory consumers. This is a separate record migration within the same save version, not a second Player migration.

## 10. Health Boundary

Career fatigue, live match fatigue, InjuryRecord and future medical profile remain external. `stamina` is PlayerTruth performance capacity; recovery rate/injury resistance are not ratings in v1 and do not enter Player. Health knowledge is permissioned and does not copy exact state to OrganizationKnowledge.

## 11. Knowledge Contract

V1 replaces `PlayerKnowledgeRecord` with sparse organization entries containing `organizationId`, `subjectPlayerId`, dimension summaries, optional detailed estimates, `coverage`, `confidence`, `assessedAt`, provenance and source facts. Rating details use `{ estimate, uncertainty }`; range/min/max/effectiveCoverage/descriptors are derived. Existing seven estimates migrate as a single legacy-source entry for their corresponding canonical domains, not into 35 invented detailed estimates.

## 12. Observer/Organization Contract

Introduce an opaque `OrganizationId` type now, with a transition resolver `organizationIdForTeam(teamId)` whose v1 implementation is one-to-one `TeamId`. Team APIs accept `OrganizationId` at Knowledge boundaries; game rules continue accepting TeamId. This prevents permanent TeamId leakage while avoiding a new organization entity/mapping table before clubs can own multiple teams.

## 13. Compatibility Strategy

Use only read adapters:

- `LegacyRatingAdapter`: converts a fully canonical PlayerTruth to the seven legacy signals for code not yet migrated.
- `CanonicalMatchProfileAdapter`: produces existing MatchPlayerProfile signals from canonical truth.
- `LegacyKnowledgeAdapter`: renders migrated V1 knowledge through the present estimated-range surface until Market is moved.

Each adapter is owned by its boundary, documented `TEMPORARY`, and removed when all listed consumers have migrated. No adapter writes legacy ratings or persists a duplicate seven-rating record.

## 14. Legacy Rating Migration

Map each old rating to a domain anchor and derive subratings deterministically. Formula pattern:

`new = clamp(oldAnchor + positionBias + measurementBias + profileVariation(playerId, key) + crossDomainCorrection)`.

Variation is seeded with `hashStringToSeed('player-model-v2:' + playerId + ':' + key)`, bounded (normally ±6), mean-centred per domain, and corrected so the domain aggregate remains near the old anchor. Position/height adjust plausibility but never overwhelm ability. This gives two old `shooting=80` players distinct mid/three/free-throw profiles while preserving comparable aggregate ability. Persist the new keys only.

Anchor mapping: shooting→midRange/threePoint/freeThrow; finishing→rim/contact/dunk/floater/post; playmaking→ballHandling/ballSecurity/firstStep/changeDirection/passing/vision; perimeterDefense→perimeter/screen/steal/shotContest/awareness; interiorDefense→interior/rimProtection/awareness/discipline; rebounding→offensive/defensive/boxOut; athleticism→acceleration/speed/lateral/changeDirection/strength/vertical/stamina. Mental ratings are deterministic blends of relevant anchors plus bounded profile variation.

## 15. Tendency Generation

Generate all 21 with independent deterministic streams keyed by player id+tendency. Inputs: position, canonical ratings, measurements, age and derived archetype. Clamp 1–100. Examples: high three point + SG/SF biases `threePointAttempt`; high rim/contact/first step biases `drive`; high passing biases P&R ball handler; big size/rebound biases crash and roll; defense/discipline influence help/gamble/foul. Preserve team tactic independence: player tendency is baseline, tactic can constrain it.

## 16. Measurement Migration

Existing saves have height/weight only. Generated players receive wingspan and standing reach via isolated deterministic streams based on playerId, height, position and gender; they are marked generated provenance internally if provenance arrives. Existing real-world imported players must **not** fabricate sourced facts: use `undefined`/known-missing permitted fields or deterministic generated values explicitly marked `generated`, never labeled sourced. Current codebase has no dataset/importer provenance model nor wingspan/standing reach/dominant hand fields; that is an implementation scope addition, not a hidden assumption.

## 17. Potential Migration

Map legacy ceiling to eight domain ceilings using canonical current domain ability, age, position and deterministic profile variation. Preserve approximate global upside by mean-correcting domain headroom to legacy ceiling minus current aggregate ability. For each domain, ceiling must remain valid and plausible; no `all eight = legacy ceiling`. Generate stage/growth/decline from age plus independent id stream. Old ceiling is discarded after migration; derived overall projection is validated against legacy band approximately.

## 18. Development Stimulus Migration

Migrate accumulated bootstrap stimulus rather than reset it: distribute each old value across the canonical keys in its anchor domain using fixed weights, with deterministic profile weighting only where it preserves total stimulus. Sum must be conserved within floating tolerance. New training plans store domain/group focus and map through a centralized canonical distribution. This avoids 35 UI controls and preserves ongoing save progress.

## 19. Knowledge Migration

For each legacy observer TeamId, resolve OrganizationId and migrate each record to **one sparse OrganizationKnowledge entry** with `source=LEGACY_BASELINE`, original `assessedAt`, and seven domain findings. `finishing` maps to FINISHING etc.; `athleticism` to PHYSICAL. Do not populate subrating estimates, potential, personality, health, reports or artificial assignments. Legacy `uncertainty` maps directly; coverage/confidence are deterministic defaults based on own-vs-external and uncertainty. If a record is absent, persist nothing; public facts derive directly.

## 20. Save Versioning

**Recommend `GameWorldSaveV2`.** `GameWorldSaveV1` has a strict envelope (`schemaVersion: 1`) and strict parsers that require all seven ratings and old knowledge/stimulus shapes. Overloading V1 would hide incompatible data and weaken validation. Add a dispatcher that reads V1, runs pure `migrateV1ToV2`, validates V2, then serializes V2 only. V1 remains read-compatible; V2 never serializes legacy ratings.

## 21. Match Adapter Strategy

Phase A uses `CanonicalMatchProfileAdapter` to create the existing `MatchPlayerProfile` signals. It aggregates canonical subratings to legacy-equivalent signals: shooting blends three/mid/free as appropriate to current action, creation blends handling/security/passing/vision, defense blends perimeter/interior/awareness/rim protection, rebound blends offensive/defensive/box out, athletic blends acceleration/speed/lateral/strength/vertical/stamina. It must be pure, deterministic and separately tested against migrated legacy profiles.

## 22. MatchEngine Evolution

Phase A: 35 ratings → adapter → unchanged MatchEngine signals.  
Phase B: Shot/turnover/rebound resolutions consume relevant canonical inputs (three vs mid vs rim, handling/security, passing, defensive domains).  
Phase C: tendencies participate in action selection, constrained by tactical plan and roles.  
Do not combine Phase B/C with save migration; adapter behavior protects match regression.

## 23. Training Migration

Replace seven focus keys with user-friendly groups: Shooting, Finishing, Creation, Passing, Defense, Rebounding, Physical, Mental, Balanced. A central distribution maps each group to canonical rating keys. Fatigue stays in CareerFatigue. Training session migration maps old focus to its group and old stimulus with section 18 rules.

## 24. Development Migration

Offseason development reads canonical development profile, current domain ability and canonical stimuli. Growth acts per rating but domain ceilings and profile control aggregate outcomes. Keep deterministic streams per player/rating/season. Development must not read Knowledge; scout uncertainty never affects actual growth.

## 25. Draft Migration

Generate complete canonical PlayerTruth, tendencies, development profile and measurements for prospects. Do not create all organizations’ scouting records during generation. Draft AI requests/uses its organization Knowledge; if it has no evidence, it receives deterministic public baseline/evaluation policy, not prospect Truth. Existing `chooseAiDraftProspect` is a direct Truth violation and must be replaced in the AI-gate wave.

## 26. Recruiting Migration

Recruiting prospect generation follows Draft generation. Recruiting actions and visits create evidence/assignments and organization-specific Knowledge; ratings never live in `RecruitProfile` as a duplicate. Current recruiting generation directly creates seven-rating PlayerTruth and public score from it; it must move to canonical generator plus observer evaluation.

## 27. Market Migration

Market is the first UI consumer of `KnowledgeSummary`. Replace seven cell queries with requested domain/rating views and potential summary. Contract asks remain an objective Market/Contract calculation; UI may show public ask but not derive private ability from price. Existing Market reads Knowledge for rows but shows exact `getPlayerPotentialBand(player.potential)`: that is a current Truth leak and must move to potential knowledge display.

## 28. Trade Migration

Trade validation continues using Truth/rules: roster, salary matching, rights and legality. Team valuation uses the acquiring organization’s KnowledgeSummary plus its needs. The audit located no full AI trade valuation engine equivalent to Draft/roster maintenance, but all future trade evaluators must accept organization/knowledge, not Player objects as valuation authority.

## 29. Free Agency Migration

Eligibility and affordability remain Truth/rules. Player asking terms are Market truth/policy. Human and AI preference/valuation are knowledge-based. `AiRosterMaintenance` currently sorts free agents with direct bootstrap ability proxy and must call an organization evaluator; it is an explicit migration target.

## 30. AI Knowledge Gate

Create a bounded `OrganizationPlayerEvaluator` API with no PlayerTruth surface in decision inputs: `evaluate(world, organizationId, playerId, context) → OrganizationEvaluation`. It internally queries knowledge/public facts and returns score/risk/confidence. Draft AI and AI roster maintenance migrate first. Add tests/lint-level module boundaries where feasible: management modules may import evaluator, not `calculate...AbilityProxy` or direct `world.players[id].basketball.ratings`. Match and objective rule validators remain exempt.

## 31. Roster Contract

Future roster receives compact `RosterPlayerIntelligenceRow` per observer, requested columns only, no reports/history and no whole Player DTO. Own rosters get high-current-knowledge views; potential remains estimated. Pagination/virtualization/selectors remain mandatory per PCB recovery audit.

## 32. Player Profile Contract

Profile loads observer-specific `PlayerIntelligenceProfile`: overview, selected rating domain, tendencies, development projection, authorized health summary and paginated reports. Truth is not passed into React; Player Profile application service authorizes and derives display modes.

## 33. Performance Model

No full GameWorld subscription in rows, no giant DTOs, no organization×player×rating matrix, no eager reports, no daily knowledge scan, no duplicate public facts, no derived persistence and no report history in roster rows. Update/decay is targeted and lazy. Indices by organization/player and player/report are required once storage is introduced.

## 34. Storage Estimate

Dense: 50 orgs × 5,000 players × 35 ratings = **8.75 million estimate records** before metadata. At even 24–64 bytes/value that is roughly **210–560 MB**, excluding object/JSON overhead; in JSON/TS objects it would be far worse.

Sparse illustrative world: 15 own roster + 80 active targets + 200 competition familiarity summaries + 100 archived detailed reports = ~395 player entries per organization; 50 orgs ≈ 19,750 entries. If only 20% carry 8 detailed ratings and the rest hold dimension summaries, this is orders of magnitude below dense storage and grows with observed play, not world size. Exact representation must be measured after implementation.

## 35. Persistence

V2 persists PlayerTruth, development profiles, personality profiles, health/state separately, sparse OrganizationKnowledge, assignments and reports. Public facts and all derived values are reconstructed. Every record is JSON-safe and validated. Source provenance supports `public`, `legacyBaseline`, `ownObservation`, `scoutReport`, etc.

## 36. Domain Events

Implement later: PlayerModelMigrated (migration audit only), PlayerObserved, ScoutingAssignmentCreated/Completed, ScoutingReportCompleted, OrganizationKnowledgeUpdated, KnowledgeDecayed, ScoutJoined/LeftOrganization, PublicPlayerDataImported. Events carry ids/dates/provenance, never embedded PlayerTruth snapshots.

## 37. Compatibility Layers

| Layer | Owner | Removal condition |
|---|---|---|
| LegacyRatingAdapter | player/match boundaries | all non-match consumers use canonical evaluation |
| CanonicalMatchProfileAdapter | match boundary | Phase B MatchEngine consumes canonical inputs |
| LegacyKnowledgeAdapter | market/profile boundary | V2 KnowledgeSummary powers all screens |
| V1 save reader/migrator | save boundary | retained indefinitely for backwards loading, isolated from runtime |

## 38. Migration Phases

1. **Contracts + tests:** canonical keys/types, development profile, measurement optionality, OrganizationId resolver, no runtime switch.
2. **Pure migration + Save V2:** V1 reader, deterministic player/personality/stimulus/knowledge migration, validation and round-trip tests.
3. **Truth generators + adapters:** new game/draft/recruit generator and canonical match adapter; existing MatchEngine unchanged.
4. **Canonical development/training:** groups, stimulus migration and offseason development.
5. **Knowledge core:** sparse entries, public facts, summaries, freshness/uncertainty/coverage/confidence.
6. **Reports + assignments:** six v1 missions, staff capability mapping and targeted updates.
7. **AI gate:** Draft and free-agent roster maintenance via OrganizationPlayerEvaluator; market valuation separation.
8. **Consumer migration:** Market first, then Roster/Profile/Draft/Recruiting/Trade contracts; remove legacy runtime adapters.
9. **Certification:** tests, typecheck, build, save compatibility corpus, determinism/property tests and adapter removal review.

## 39. Test Strategy

Player migration: deterministic mapping, 1–100 validation, aggregate preservation, diversity among same legacy ratings, measurement fallback and idempotency. Save: V1→V2 and V2 round-trip, invalid record rejection and fixtures. Development: stimulus conservation and profile ceilings. Knowledge: sparse creation, ranges, coverage/confidence/freshness, exact/public display, provenance and decay. AI: no direct Truth evaluation, different org views, same seed reproducibility. Match: adapter keeps expected signal/result tolerance. Draft/recruit: complete truth generation without eager knowledge.

## 40. Acceptance Scenarios

1. V1 save loads and writes valid V2.
2. Baseline player maps deterministically.
3. Same old shooting produces distinct valid shooting profiles by player id.
4. Tendencies are deterministic and not identical defaults.
5. Eight potential domains preserve approximate legacy upside.
6. Own-player baseline is compact/high-current but potential remains uncertain.
7. Unscouted opponent has public facts only.
8. Prospect begins unknown without all-org records.
9. QUICK_LOOK adds limited coverage.
10. FULL_REPORT reduces relevant uncertainty without exact guarantee.
11. POTENTIAL report changes projection confidence, not Truth.
12. Stale entry has reduced effective coverage but retains historical coverage.
13. Public measurement is exact with authorized provenance.
14. Rating displays derived range when uncertainty >1.
15. AI trade evaluator values a target from organization knowledge.
16. AI draft selection cannot access direct player ratings/potential.
17. Missing knowledge does not leak Truth through Market/Profile.
18. V2 save round-trips reports/assignments and sparse knowledge.
19. Match adapter remains compatible with existing match expectations.
20. 5,000-player world creates only on-demand knowledge entries and avoids daily global scans.

## 41. Failure / Rollback Strategy

Migration is pure and non-mutating until a V2 world validates. On bad V1 payload, missing rating, invalid knowledge, or incomplete fixture: fail with explicit migration/validation error identifying player/record/key; never silently invent a fallback unless the documented deterministic migration rule applies. Preserve original V1 file and write V2 atomically only after successful validation. Rollback means reopen original V1 with the old reader, not maintain dual runtime truth.

## 42. Risks

1. Broad type/test blast radius from replacing seven keys.
2. Match behaviour drift through adapter aggregation.
3. Save corruption if V1/V2 dispatch is incomplete.
4. AI Truth leakage through convenience imports.
5. Sparse design violated by eager bootstrap or UI selectors.
6. Imported data provenance absent in current BDM.
7. Existing dirty worktree can obscure implementation diff; implementation run must start clean or isolate scope.

## 43. Blockers

No technical blocker prevents planning. Implementation must obtain product approval for calibration constants: domain mapping weights/profile variation bounds, exact-vs-range permission policy, potential projection display and imported-data provenance schema. These are explicit configuration decisions, not grounds to delay contract work.

## 44. Recommended Implementation Waves

Use **three large implementation prompts plus one certification prompt**, rather than many micro-passes:

1. Player Truth + Save V2 + pure migration + adapters.
2. Development/Training/Generation + Knowledge core + reports/assignments.
3. AI gate + Market/Roster/Profile/Draft/Recruiting/Trade consumer contracts and adapter removals.
4. Certification only: compatibility corpus, deterministic tests, performance inspection, full required validation and documentation updates.

## 45. Definition of Done

- V1 saves load through a tested V1→V2 migration and V2 round-trip exactly.
- Runtime has only canonical PlayerTruth; compatibility adapters are read-only and scoped.
- 35 ratings, 21 tendencies, four measurements, eight personality dimensions and multidomain development validate 1–100.
- Knowledge is sparse, provenance/freshness/coverage/confidence aware and does not leak Truth.
- Management AI uses OrganizationKnowledge; MatchEngine still uses Truth.
- Match adapter passes compatibility tests before detailed engine evolution.
- No `Math.random()` in `src`; domain/engine remain UI/Tauri-free.
- Performance contract is tested/inspected; all checks in AGENTS.md pass.

## 46. Final Recommendation

Approve a single V2 migration with canonical truth plus sparse Intelligence schema, but stage consumer activation behind pure adapters. Begin implementation at contracts/save migration, not UI. This minimizes irreversible risk, protects long saves and delivers a natural seam for MatchEngine evolution without forcing detailed simulation and scouting UI in the same change.

## Documentation update plan after implementation

Update Architecture, project source of truth, Player Model, Knowledge/Scouting, Save format, Match Engine contracts and import/dataset provenance documentation. Do not update them in this planning pass.

## Evidence audited

`Player.ts`, `PlayerPotential.ts`, DevelopmentStimulus, Training/Development engines, MatchPlayerProfile/MatchEngine, World/Draft/Recruiting generators, `PlayerKnowledge.ts`, `PlayerKnowledgeEnrichment.ts`, `GameWorld.ts`, `GameWorldSaveV1.ts`, Market, AI roster maintenance, team evaluation, Staff and UI screens/tests.
