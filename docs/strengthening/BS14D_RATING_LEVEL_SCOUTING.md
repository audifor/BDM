# BS14D · Rating-Level Scouting

- Status: **TECH READY / AWAITING VALIDATION**
- Branch: `bdm-stage2-bs14d-rating-level-scouting`
- Base: `81520bfae810866b444b66d5f618adede5fe4442` (BS14C)

## Authority and dimensions

`PlayerTruthCatalog.ts` owns the 80 canonical current rating keys and one family map covering each key exactly once. Current scouting findings use `rating:<CANONICAL_KEY>` (for example, `rating:THREE_POINT_STATIC`) in `GameWorld.organizationKnowledge`. Report history remains in `evaluatorReportsById`; it is evidence history, not a UI source of current values. No rating cache or parallel authority was added. The 40 tendencies are **DEFERRED**.

The eight skill families are `shooting`, `finishing`, `ballHandling`, `playmaking`, `offBall`, `defense`, `physical`, and `mental`. The pre-existing seven acquisition/summary dimensions remain `finishing`, `shooting`, `creation`, `perimeterDefense`, `interiorDefense`, `rebounding`, and `physical`. Both are mapped from the canonical rating catalogue in the Domain layer. Legacy 35-rating aliases are not emitted as scouting dimensions.

## Mission coverage

| Mission | Current rating output |
|---|---|
| `QUICK_LOOK` | Existing broad `shooting` and `physical` findings; no individual ratings. |
| `FULL_REPORT` | One finding for each of all 80 canonical ratings. |
| `SKILL_EVALUATION` | Findings for the selected one of eight families; the existing selected-dimension input also accepts one of the seven aggregate dimension IDs and expands to its canonical member ratings. Defaults to `shooting`. |
| `POTENTIAL_EVALUATION` | Existing eight separate `potential:*` estimates; never mixed with current ratings and never displayed exact. |
| `TACTICAL_FIT` | Existing tactical-fit report context; no current rating findings. |
| `LIVE_GAME` | Existing seven broad observations are preserved. There is no defensible per-rating event-observation map yet. |

The normal human Scouting workspace still requests Quick Look only. Full Reports can run through existing advisory/domain request paths; BS14D does not add mission-selection UI.

## Estimate quality and consolidation

The evaluator reads PlayerTruth internally and writes only a noisy estimate. Deterministic noise is bounded by `max(2, 18 - talentEvaluation/10 - experience/25 - specializationReduction)`, scaled by a stable hash into `[-1, 1]`, then existing family bias is applied and the value is clamped to 1–100. Finding uncertainty remains `max(3, round(17 - ability/9 - experience/18 - specialization + (1-evidenceQuality)*5 + staffQualityAdjustment))`; confidence and coverage use the existing formulas, with per-report coverage contribution capped at 0.85. `EYE_FOR_SHOOTERS`, `TAPE_GRINDER`, `LIVE_SCOUT`, and existing biases continue to affect relevant dimensions. Higher relevant ability/experience/specialization narrows expected error and uncertainty; it does not guarantee accuracy.

The seed combines assignment ID, evidence ID, and finding dimension. The assignment ID includes organization, Player, evaluator, mission, and request date. Identical execution is reproducible, and every rating gets a distinct error input. Repeated reports consolidate by the same rating dimension using the existing confidence/coverage weighted finding semantics; disagreement can widen uncertainty. Freshness is lazy and uses the normal organization evaluation projection. Player development never synchronizes into existing findings.

## Aggregate projections and compatibility

Aggregate reads first derive from rating findings when weighted coverage reaches **0.60** of the canonical aggregate's members. The estimate is the equal-weight mean of the known estimates; uncertainty is mean known uncertainty plus `(1 - coverage) × 20`, capped at 20. Partial coverage therefore widens the result. If the threshold is not met, a stored aggregate finding is used as the compatibility fallback. New Full Reports do not dual-write aggregate findings.

Old aggregate-only saves remain readable and do not manufacture `rating:*` findings. V2 stores `organizationKnowledge` generically; V3/V4 preserve it through their existing save layering, so no schema bump was needed. Historical aggregate EvaluatorReports remain as written.

Market, draft, recruiting, and valuation projections already call the shared organization evaluation/valuation helpers. Trade-package coverage was updated to call `getOrganizationRatingEvaluation`, so rating-derived aggregates and the legacy fallback follow the same freshness and organization boundary. These consumers do not read PlayerTruth.

## Player profile behavior

The profile still goes through `derivePlayerKnowledgeAccess`. External Players receive a row for every canonical rating, but a row is numeric/ranged/descriptive only when that exact `rating:<KEY>` exists in the viewer organization's knowledge; otherwise it is `Not scouted`. Aggregate findings do not synthesize individual rows. The projection does not copy unknown-prior estimates. A legitimately exact evaluation may display exact because it came from OrganizationKnowledge. Controlled-roster Players keep exact current ratings through the existing own-roster permission path, and do not receive scouting rows.

External development history stays unavailable. Current rating observations do not imply true past ratings, deltas, or development trajectory. Potential remains a separate knowledge-aware projection.

## Performance and manual path

Only completed scouting activity stores findings; a Full Report adds at most 80 sparse entries for one organization/Player. Rendering and daily progression do not scan all Players × ratings × organizations.

Manual validation through supported routes:

1. Request Quick Look for an external Player: confirm broad observations appear and rating rows remain `Not scouted`.
2. Request Full Report through an existing advisory/domain path: open the external Player's Attributes view and confirm estimates/ranges appear only for known rows. Confirm potential stays separate and Development history stays masked.
3. Repeat a report on a later date and inspect the same rating dimensions in OrganizationKnowledge for consolidation/freshness changes.

The human UI has no Full Report selector yet; mission selection belongs to BS14G. This implementation is **TECH READY / AWAITING VALIDATION**, not a declaration that Scouting is complete. BS14E remains responsible for later operational/geographic work.
