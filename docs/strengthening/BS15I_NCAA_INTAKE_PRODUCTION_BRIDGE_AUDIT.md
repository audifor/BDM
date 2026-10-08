# BS15I NCAA intake production bridge

**Status: PASS — bounded production bridge and focused source routes.** The normal NCAA pool now consumes existing canonical Players. In the same seed-15015 two-cycle audit, 20 arrivals came from TalentCohort materializations and none came from the legacy synthetic generator. Both arrival checkpoints retained NCAA viability and passed Save V4 reload and deep integrity checks.

## Production pool and provenance

- At cycle opening, NCAA candidate demand is derived from program count and position vacancies, then capped by that cycle's configured `poolSize`. Only the shortfall is materialized from latent cohorts.
- A cohort candidate is materialized once into the canonical Player/Person model; recruiting then adds a RecruitProfile. Candidate key, PlayerId, and PersonId stay linked through signing, enrollment, roster arrival, and Save V4.
- Automatic monthly discovery of one extra candidate was removed. User-requested discovery remains bounded to one candidate and uses the same profile and recruiting gateways.
- The canonical pathway history distinguishes `US_HIGH_SCHOOL`, `JUCO`, `INTERNATIONAL_CLUB`, `ACADEMY_YOUTH`, and `OTHER_PRECOLLEGE`. Talent cohorts may declare an explicit pathway source. The yearly simulated supply uses `OTHER_PRECOLLEGE`; no route is inferred from age, nationality, or `RecruitProfile.origin`.
- Academy intake uses the existing youth pathway; its materialization records an `ACADEMY_YOUTH` event, while `PlayerRegistration` remains the team movement record. JUCO remains a provenance event and does not claim a separate league simulation.
- Save V4 persists pathway histories as an additive collection, leaving the older strict Player payload readable. Legacy synthetic pool construction remains available only through the explicit `generateLegacyFixtureRecruitingPool` fixture path; `generateRecruitingPool` does not fall back to it.
- AI prospects enter the same profile ranking, board, contact, offer, commitment, signing, enrollment, and eligibility operations. Ranking continues to use public position and organization knowledge; it does not inspect hidden PlayerTruth.

## NCAA intake reality after bridge

| Route | Production provenance | Recruitable | Signed in focused route | Arrived | Save/reload |
| --- | --- | --- | --- | --- | --- |
| HS | Explicit `US_HIGH_SCHOOL` Player pathway event | Yes | Yes | Yes | Pass |
| JUCO | Explicit `JUCO` Player pathway event | Yes | Yes | Yes | Pass |
| International | Explicit `INTERNATIONAL_CLUB` cohort/Player provenance | Yes | Yes | Yes | Pass |
| Academy/Youth | `ACADEMY_YOUTH` pathway event; existing registration authority retained | Yes | Yes | Yes | Pass |
| TalentCohort/Newgen | `OTHER_PRECOLLEGE` materialization from annual latent cohorts | Yes | 25 signed; 20 arrived across the audit | Yes | Pass |
| Portal | Existing BS15F authorized transfer entry | Yes, through Portal flow | Existing Portal gateway | Not observed in this audit | Existing Save V4 coverage |
| Legacy synthetic | Explicit fixture helper only; 0 generated in production NCAA pool | No production availability | 0 | 0 | Legacy compatibility only |

The four provenance routes were exercised together through the normal NCAA profile, board, contact, offer, commitment, signing, arrival, enrollment, and eligibility gateways. Save V4 reload retained each source record, PlayerId, PersonId, RecruitProfile, signing, enrollment, roster membership, and eligibility result. The separate production audit observed only `OTHER_PRECOLLEGE` arrivals; it does not claim that each specific source emerged in those two seasons.

## Same two-cycle source mix

| Checkpoint window | Teams | Arrivals | Men / women | HS | JUCO | International | Academy/Youth | TalentCohort other | Portal | Legacy synthetic | Unknown | Teams below 5 eligible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2033-12-31 | 24 | 8 | 8 / 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 / 24 |
| 2034-12-31 (new in window) | 24 | 12 | 8 / 4 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 / 24 |
| **Cumulative through 2034-12-31** | **24** | **20** | **16 / 4** | **0** | **0** | **0** | **0** | **20** | **0** | **0** | **0** | **0 / 24** |

The accepted baseline had 8 arrivals at the first checkpoint and 16 in the second window, all legacy synthetic. The bridge run had 8 and 12, all TalentCohort-backed. Across the full window, production legacy creation fell from 144 Players to 0. The lower second-window arrival count is observed behavior; no source percentages or quotas were tuned.

## Supply, positions, and performance

| Checkpoint | Player count | Materialized Talent Players (period / total) | Latent capacity | Save bytes | Eligible roster min / median / max |
| --- | ---: | ---: | ---: | ---: | --- |
| 2033-12-31 | 556 | 100 / 100 | 3,200 | 70,160,949 | 7 / 7 / 9 |
| 2034-12-31 | 660 | 104 / 204 | 4,800 | 127,123,070 | 7 / 8 / 10 |

Only 204 of 4,800 latent candidates were materialized by the second checkpoint (4.25%). Player counts were 117 lower at the first checkpoint and 165 lower at the second than the accepted baseline. The Save V4 size was 70.2 MB and 127.1 MB versus 71.1 MB and 129.1 MB in the baseline. Two-cycle runtime was **1,245.8 sec (20 min 45.8 sec)** versus **1,240.1 sec (20 min 40.1 sec)**, a 5.7-second increase (0.46%).

| Arrival window | PG | SG | SF | PF | C | Academic eligibility |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2033 | 0 | 1 | 2 | 5 | 0 | 8 / 8 eligible |
| 2034 new arrivals | 0 | 3 | 6 | 3 | 0 | 12 / 12 eligible |

Candidate generation and the normal recruiting pool covered all five canonical positions in the focused production-pool test. PG and C arrivals were still zero in this two-window sample; no position quotas were added. Source-country attribution was not inferred from nationality. Both genders remained viable at both checkpoints.

## Validation

- Focused suites: 90 tests passed across Talent bridge, recruiting engine/advisory/lifecycle/RPG, youth pathway, career cohort continuity, college eligibility, Portal turnover, recruiting UI, staff recommendations, and recruiting capacity; the four-route gateway certification passed.
- Two-cycle certification: passed, seed `15015`, `2032-10-01` to `2034-12-31`; 24 teams (12 men, 12 women); Save V4 and deep-integrity checks passed at both checkpoints.
- Hidden PlayerTruth firewall: recruiting advisory mutation tests passed; ranking uses public position and `OrganizationKnowledge` valuation.
- `npm run typecheck`, `npm run build`, and `git diff --check`: passed. Vite reported its existing large-chunk advisory.
- Five-year and ten-year certification remain stopped. No commit was created.

Detailed checkpoint data: [BS15I_NCAA_INTAKE_PRODUCTION_BRIDGE_AUDIT.json](BS15I_NCAA_INTAKE_PRODUCTION_BRIDGE_AUDIT.json). Accepted pre-bridge baseline remains available in [BS15I_NCAA_INTAKE_SOURCE_MIX_AUDIT.md](BS15I_NCAA_INTAKE_SOURCE_MIX_AUDIT.md).
