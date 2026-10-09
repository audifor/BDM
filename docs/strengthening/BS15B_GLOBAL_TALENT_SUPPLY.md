# BS15B · Global Talent Supply and Materialization

**Status:** implemented on `bdm-stage2-bs15b-global-talent-supply` from BS15A commit `eeae03d336066b064957671b6ad5445e82d8ea2b`.

**Scope:** bounded place-based supply, latent cohorts, deterministic materialization into the canonical `Person`/`Player`, rare-tail initial Player Truth policy, and additive Save V4 persistence. BS15B does not create academies, NCAA recruiting routes, Portal/NIL changes, youth UI, Draft integration, retirement, or automatic team placement.

## Authority and state

`src/domain/talent/TalentCohort.ts` defines `TalentCohort`, its versioned named supply inputs, a deterministic capacity, and a hard maximum of 100,000 candidates. Capacity is:

```text
min(100,000,
    floor(ageCohortPopulation
      × basketballParticipationPerThousand / 1,000
      × accessOpportunityBasisPoints / 10,000))
```

`ageCohortPopulation`, `basketballParticipationPerThousand`, and `accessOpportunityBasisPoints` are supply-only inputs. `gender`, birth year, generation year, seed, place and `inputVersion` are explicit cohort facts. A zero-capacity cohort is valid but cannot yield a candidate. Values in `TALENT_SUPPLY_TEST_FIXTURES` are synthetic engine fixtures, not population claims or production country data.

`GameWorld.talentCohortsById` is the canonical cohort collection. `GameWorld.talentMaterializationsByCandidateKey` stores only candidates that actually acquired identity. The candidate key is `<cohortId>:candidate:<six-digit index>`; the index must be between 1 and the cohort's finite capacity. No record or Player is allocated for other latent candidates.

## Materialization contract

`materializeTalentCandidate(world, cohortId, candidateIndex, cause)` resolves or creates one canonical Player. `materializeTalentCandidates(world, requests)` supports consumers with a batch and validates the resulting world once. Supported causes in this slice are `SCOUTING_DISCOVERY` and `RECRUITING_POOL`.

The stable Player ID derives from the cohort ID and candidate index. Cohort seed, candidate key and generator version seed position, name, biography, canonical Player Truth and development profile. An existing mapping always returns the same Player and retains its original provenance/cause. A conflicting Player ID, missing cohort, invalid index, future birth cohort or exhausted supply fails explicitly.

Materialization uses the existing `createPlayer`, `createPerson`, `generatePlayerBio`, canonical 80-rating generator, and development-profile generator. Player DOB uses the cohort birth year. The Person root receives the same name, gender, DOB and origin-country nationality as the Player; GameWorld validation enforces those generated compatibility facts. Origin country resolves through the existing Place parent hierarchy. The persisted provenance records cohort, candidate index/key, Place, generation year, generator version, first materialization cause and game date.

Materialization never edits Team rosters, Draft prospects, recruiting boards, OrganizationKnowledge or OrganizationPlayerAwareness. It creates a world-level canonical identity, not a universal public directory entry. Organization addressability and knowledge continue to follow BS14's existing membership, territory and knowledge boundaries. An unrostered materialized Player is not automatically visible in a team's Scouting territory.

## Supply, quality and development stay separate

- **Supply:** the formula above determines how many latent candidates a cohort can yield. Place input changes candidate count only.
- **Initial quality:** `generateCanonicalRatings(..., 'globalTalentRareTailV1')` reuses canonical Player Truth keys and samples a bell-shaped center using a 12-uniform Irwin–Hall approximation around 51 (standard deviation approximately 11), then adds bounded position bias and per-rating variation. Place and supply inputs are not rating multipliers. The default prototype-uniform policy remains available for the existing synthetic WorldGenerator/recruiting/Draft fixtures.
- **Development:** each new Player receives the existing age-aware canonical development profile and joins the existing annual development, Training, Medical, Staff and Facilities seams without a youth-specific truth model.

The audit-only cohort indicator is the arithmetic mean of the 80 canonical Player Truth rating keys. It is a temporary distribution diagnostic, not a persisted Overall, player-ranking authority, or gameplay rating. Diagnostic bands are ordinary `<60`, useful `60–69`, strong `70–79`, elite `80–89`, and generational `>=90`; the names and cut points exist only to inspect distribution shape.

### Deterministic rarity audit

Fixture: 20,000 deterministic candidates, seed `17`, uniform five-position sampling. Result:

| Metric | Result |
|---|---:|
| P50 | 51.78 |
| P75 | 59.31 |
| P90 | 66.01 |
| P95 | 70.09 |
| P99 | 77.13 |
| P99.9 | 85.29 |
| Position mix | PG 4,000 · SG 4,032 · SF 3,917 · PF 4,036 · C 4,015 |
| Diagnostic quality bands | ordinary 15,381 (76.905%) · useful 3,603 (18.015%) · strong 929 (4.645%) · elite 82 (0.410%) · generational 5 (0.025%) |

This validates distribution shape and repeatability only. It is not calibration to any real country, league, or NBA outcome frequency.

## Persistence, bounds and measurements

Save V4 adds optional `talentCohorts` and `talentMaterializations` arrays. Existing Save V4 files without those keys deserialize as empty collections; no schema version bump or production database table was needed. Candidate-to-Player mapping, cohort inputs/seed/version, Player, Person and origin provenance round-trip together. Resolving a candidate after reload returns the persisted Player ID.

Focused benchmark run (in-memory test fixture; timing is indicative and machine/load dependent):

| Operation | Time |
|---|---:|
| Create cohort | 0.29–0.54 ms |
| Inspect supply metrics | 0.08–1.26 ms |
| Materialize one | 0.80–32.17 ms |
| Batch materialize 100 | 19.61–115.85 ms |
| Save/load then resolve existing candidate | 58.50–230.04 ms |
| Latent cohort Save V4 payload | 22,557 bytes |
| Same cohort with 100 materialized candidates | 464,536 bytes |

The long-run diagnostic creates many latent cohort descriptions and statistical Player Truth samples without making Players or a GameWorld. It reports supply/sample counts, percentiles, five-position counts, duplicate candidate keys, elapsed time and a deterministic checksum. It is a generation diagnostic, not a 30-year simulation certification.

## Tests and compatibility

Focused coverage verifies deterministic and place-varied bounded supply, capacity exhaustion, repeated consumer resolution, distinct IDs/Persons/biographies/truth/development, birth-year and Person/Player agreement, origin provenance, male/female use of the same API, no roster or knowledge grant, invariance of Scouting territory selection under a hidden Truth change, Save V4 round-trip and old-V4 empty defaults, five-position distribution, rarity percentiles and lower latent save cost. The selected PlayerBioGenerator and WorldGenerator regressions passed. In an additional existing Save V4 Scouting-persistence regression, the 5-second test timeout fired under host load; BS15B's own Save V4 identity/default tests passed, and the existing pre-91 V4 reader regression passed.

Existing WorldGenerator, Recruiting and Draft generated classes remain intact as compatible fixtures/fallbacks. No full test suite was run as part of this milestone.

## Known limits and BS15C handoff

- Supply inputs are explicit provisional fixture values. There is no world demographic dataset, country talent scalar, or real-world calibration claim.
- A latent candidate is addressed by its stable cohort/index key; no individual name, DOB, position, Player Truth or OrganizationKnowledge exists before materialization.
- Materialization is callable by Scouting/Recruiting causes but those systems are not yet wired to it. BS15E will replace synthetic recruiting entrants only after the route is designed.
- No Academy, registration history, current roster placement, retirement, pathway balancing or population sink is introduced here.
- BS15C owns the first club youth/academy intake and dated registration/promotion lifecycle. It should consume this generic materialization API, preserve the candidate's canonical PlayerId, and own the first actual team-membership event rather than changing this provenance record into a career ledger.
