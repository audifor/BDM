# BS14 Scouting Decision Register

Snapshot: audit facts at `c52a21717a5973ee33d99a0df3000d405bcb9847`. “Decision” means a confirmed repository fact or a deferred product/architecture decision; no gameplay rule is approved here.

## Confirmed findings

| ID | Finding | Severity | Evidence / disposition |
|---|---|---|---|
| D-01 | Player profile has an exact PlayerTruth bypass for ratings | P0 | `buildPlayerOverviewModel` enumerates `PLAYER_TRUTH_RATING_KEYS`; development detail reads truth. Preserve as audit finding; BS14C must decide access policy before changing it. |
| D-02 | OrganizationKnowledge is the sole current mutable Player scouting knowledge authority | CLOSED for BS14B | Runtime `playerKnowledgeById` and its writers/readers were removed; V1 records remain migration input and map through `Team.organizationId`. |
| D-03 | Current scouting dimensions do not represent 80 individual ratings | P1 | `ScoutingEngine.domains` maps seven aggregates; PlayerTruth catalog has 80 rating keys. BS14D must select the report dimension contract. |
| D-04 | Generated and WorldDB starts have empty current knowledge; ACB test-game seeds a special baseline | CONFIRMED | Normal creation has no legacy authority. ACB baseline is now seeded directly as `legacyBaseline` OrganizationKnowledge. Initial knowledge policy remains future work. |
| D-05 | Player assignment addressing is not discovery | P1 | Assignment requires PlayerId; current human board has own roster and already-known subjects; automation uses bounded known domain sources. |
| D-06 | Staff causal signals are multiple and intentionally distinct | P2 | Professional attrs, evaluator experience, role proficiency, quality score, confidence, and coverage each have separate formulas. No universal overall. |
| D-07 | Region prioritization has no geographic authority | P2 | It ranks nationality clusters in next opponent pool. Decide whether to rename/narrow or add actual geography model in BS14E. |
| D-08 | AI does not default to delegated scouting | P2 | Responsibility enrichment sets default mode userControlled; AI valuation consumers use knowledge/UNKNOWN priors. Decide AI assignment cadence in BS14F. |
| D-09 | Knowledge decays only when projected | P2 | Lazy freshness increases uncertainty; no expiry/rewrite/refresh lifecycle. Decide whether persisted history should be immutable evidence with derived current certainty. |
| D-10 | Player scouting and tactical opposition scouting are separate report systems | P2 | EvaluatorReport vs OppositionScoutingReport, distinct producer/quality/output/save; only shared generic responsibility/OrganizationKnowledge surfaces. |
| D-11 | Human Scouting UI exposes one request variant | P2 | QUICK_LOOK only; fixed regional scout/normal priority; no cancellation or other mission controls. |
| D-12 | Real geographic scope and travel/budget are absent | P2 | No coverage or Region state, cost producer, or travel calculation. |
| D-13 | Some evidence-source enum options lack producer integrations | P3 | Automatic completion produces source from mission type; source list includes many external inputs without ingestion in this path. |

## Product/architecture questions intentionally left open

1. What should cross-team knowledge access be when multiple teams share one organization? BS14B uses the existing `Team.organizationId` ownership rule for current evaluation.
2. Which of the 80 rating keys and 40 tendency keys are scouted, reported, or made public through independent facts?
3. Which fields are inherently public (identity, age, position, injury, contract, value) and which require evidence/permission?
4. Should own-roster ability be exact, estimated, or mixed with staff observation? Current UI/legacy ownership differs by route.
5. What does “region” mean in the basketball universe: country, league, competition, geography, or a configured scout territory?
6. How should AI acquire initial player knowledge and how much operational work should AI clubs perform?
7. Should stale evidence remain in an immutable archive while current estimates recalculate, or should findings expire/refresh?
8. Is tactical Opposition Scouting a separate domain permanently, with only shared source knowledge, or should specific common report/evidence contracts be reused?

## Proposed follow-on sequence

BS14B authority/legacy migration → BS14C knowledge permissions and profile masking → BS14D 80-rating report/quality model → BS14E assignment operations and real geography → BS14F market/recruiting/draft and AI integration → BS14G user-facing actions/report content → BS14H save, daily lifecycle, and integration certification. This order avoids designing UI around unresolved truth/knowledge ownership. The sequence remains a recommendation only.

## BS14B delta disposition

The selected BS13E lineage adds Staff responsibilities, workload, evaluator-quality inputs, and related save/runtime integration relative to BS14A's BS12C audit source. It does not change OrganizationKnowledge shape or authority, PlayerKnowledge compatibility shape, V1 migration, report completion authority, or acquisition valuation inputs. BS14A's authority findings remain valid; BS14B closes D-02 and updates the ACB exception under D-04.

## BS14C decision: Player-profile visibility

The information boundary is the user's controlled roster, not mere organization membership. `Team.organizationId` owns shared knowledge; controlled-roster membership alone authorizes exact current PlayerTruth ratings. External current ability and potential are projected from current OrganizationKnowledge at the world date. Unknown stays unknown, and seven aggregate dimensions are never expanded into individual ratings. Public identity/context and separately owned contract/medical information retain their existing rules. True external development history is withheld pending BS14D rating-level intelligence. Navigation into a profile reuses this policy.

## BS14D decisions

- Current basketball rating findings use `rating:<CANONICAL_KEY>`; `PlayerTruthCatalog.ts` owns the single 80-key skill-family map. Tendencies remain deferred.
- Quick Look stays aggregate; Full Report covers all 80 current ratings; Skill Evaluation covers the selected family (and supports legacy aggregate target IDs); potential stays separate; Tactical Fit stays contextual; Live Game retains broad observations pending a defensible per-rating observation map.
- Rating-derived aggregate projections take precedence when canonical-member coverage is at least 0.60. The estimate is an equal-weight known-member mean; uncertainty includes a missing-coverage penalty. Below threshold, the stored aggregate finding remains the compatibility fallback.
- Rating findings consolidate in OrganizationKnowledge under the same per-dimension rules, age through lazy freshness, and do not synchronize with later PlayerTruth development.
- V2/V3/V4 already preserve generic dimensions; no save schema migration is required. Aggregate-only legacy findings remain intact and do not create fake individual ratings.
- External profile rows use only exact `rating:<KEY>` organization findings; own-roster exact ratings and external development masking continue under BS14C.

See [BS14D Rating-Level Scouting](BS14D_RATING_LEVEL_SCOUTING.md). Status: **TECH READY / AWAITING VALIDATION**; this does not certify all Scouting complete.

## BS14E decisions

- Territory is `COUNTRY` or `COMPETITION`, based on current Team/Competition membership. Nationality remains biography.
- Identity awareness is organization-scoped and distinct from OrganizationKnowledge. Territory discovery does not create rating or potential knowledge.
- Each active territory assignment costs two existing Scouting workload units. Daily discovery is deterministic, quality-sensitive, workload-limited, and capped at three Players.
- Publicly addressable roster, opponent, active draft, recruiting, market-knowledge, and free-agent Players remain candidates without gaining evaluation knowledge.
- The `prioritizeRegions` ID is preserved; its current delegated decision records the scheduled game's Competition territory. Broad AI operation cadence is deferred to BS14F.
- Territory and awareness fields are optional additive V2 scouting-runtime values, defaulting empty for older saves and preserved by V2/V3/V4.

See [BS14E Scouting Operations and Coverage](BS14E_SCOUTING_OPERATIONS_AND_COVERAGE.md).

## BS14F decisions

- AI means a coached team whose coach differs from `world.userCoachId`; no responsibility values are altered. Human delegation stays on the existing delegated path.
- Strategic AI Scouting planning runs on days 1, 8, 15, 22, and 29. Daily assignment execution and territory discovery continue in their established calendar phases; no new cooldown save field is required.
- Territory count is capped at three per organization and by employed eligible Scouting Staff. Own Competition leads, with relevant role-suitable domestic/foreign/acquisition ecosystems next; canonical BS14E coverage penalizes saturated areas. Valid operations persist to prevent churn.
- AI targets at most 120 bounded public/contextual candidates and requests at most two reports per organization per cycle. Unknown starts at Quick Look; broad-only or sufficiently stale high-priority knowledge may escalate to Full Report. Skill and potential missions are not selected automatically.
- Active/equivalent assignments, same-day reports, shared workload, and deterministic evaluator ranking guard duplicate and overload work. No hidden ratings influence target selection.
- Existing acquisition valuation remains the authority for free agency, market/trades, draft, and recruiting. Urgent decisions proceed with available knowledge or UNKNOWN priors rather than waiting for a report.
- OrganizationKnowledge remains the only current evaluation authority for both human and AI consumers; awareness confers identity only. Existing saves carry awareness, reports, and knowledge across reload and season transition.

See [BS14F AI Scouting and Acquisition](BS14F_AI_SCOUTING_AND_ACQUISITION.md). Status: **TECH READY after focused validation**; final human Scouting UX remains BS14G.
