# BS15I NCAA intake source mix: bounded two-cycle audit

**Status: PARTIAL — source provenance gap.** The canonical run completed both annual arrival boundaries and stayed playable, but the observed NCAA intake came entirely from the legacy synthetic recruiting pool. No HS, JUCO, international, academy/youth, or Portal arrival was verified in this two-cycle window. This is an audit result; no source-mix or percentage change was made.

## Scope and fixture

- Fresh canonical `createNewGame({ seed: 15015 })`; no direct-created recruits or modified source percentages.
- Initial date: `2032-10-01`. The run ended at `2034-12-31` after complete NCAA arrival boundaries on `2033-12-31` and `2034-12-31`.
- Fixture: 2 NCAA ecosystems and competitions, 12 men's teams and 12 women's teams (24 unique teams total).
- Actual target-season cycles closed by the two boundaries: 1 in the first window, then 2 in the second window (women's 2034 cycle and men's 2034 cycle).
- Total simulation runtime: **1,240,094 ms (20 min 40.1 sec)**. The first checkpoint was at 366,862 ms (6 min 6.9 sec).

## NCAA intake observed

| Arrival boundary | Cycles closed in window | Arrivals | Men | Women | Verified primary source | Signed | Teams below 5 eligible |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 2033-12-31 | 1 | 8 | 8 | 0 | Legacy synthetic: 8 (100%) | 13 | 0 / 24 |
| 2034-12-31 | 2 | 16 | 11 | 5 | Legacy synthetic: 16 (100%) | 16 | 0 / 24 |

The source-by-gender counts are also in the JSON artifact. The complete per-team rows are included there, including opening roster, departures, signed recruits, effective arrivals, ending roster, eligibility count, and unmet need. At the checkpoints, eligible roster counts ranged from 7–9 (median 7) in the first period and 7–10 (median 8) in the second. All 24 teams were above the five-player minimum at both boundaries.

## Supply paths and provenance

- **Legacy synthetic pool:** 72 generated recruit profiles in the first target cycle; 13 were signed and 8 arrived. Across the two target windows there were 144 profiles; 16 were signed and all 16 arrived. Legacy attribution requires the paired profile/player ID pattern emitted by `RecruitingEngine.generateRecruitingPool`.
- **TalentCohort:** canonical cohort capacity was 1,600 at the first checkpoint and 3,200 across the cohort records at the second checkpoint. These are model capacities, not actionable NCAA prospects or per-cycle openings. Materialization records created during the measured windows: 1, then 8. By the second checkpoint, 4 materialized candidates had recruiting profiles; 0 arrived in an NCAA roster. The event-level records retain candidate keys, materialization cause, PlayerId, PersonId, and the available Place-country link.
- **Portal:** 0 entries, commitments, or completed moves in either measured window.
- **HS, JUCO, international, academy/youth:** 0 verified arrivals in the window. This means no route met the audit's evidence rules; it does not claim that nationality, age, or `RecruitProfile.origin` proves a route.
- **Unknown provenance:** 0 arrivals. All observed recruits matched the legacy synthetic ID signature. No source percentage was inferred or adjusted.

JUCO is a material provenance gap in the current schema: college enrollment plus a high-school graduation year cannot distinguish a two-year JUCO path from a four-year transfer. The audit therefore leaves that route unverified rather than guessing.

## Quality, eligibility, and identity

- Arrival quality (mean of the canonical basketball rating fields; descriptive telemetry): p10 / median / p90 were **42.69 / 48.84 / 79.28** in the first period and **46.89 / 65.25 / 77.38** in the second.
- Arrival age p10 / median / p90: **18 / 19 / 21** then **18 / 19 / 20**.
- Positions: first period SG 3, SF 3, PF 2; second period SG 5, SF 5, PF 6. No PG or C arrivals were observed in these samples.
- Academic eligibility at arrival: 8/8 and 16/16 eligible; no academic rejection reasons among these arrivals.
- Place-country coverage: 0/8 and 0/16 arrivals had a Place-country link in the captured provenance; geography is therefore unclassified. Nationality was not used as a source or route proxy.
- Both checkpoints passed SaveV4 serialize/reload and deep-integrity checks. All 24 arrival records retained the same PlayerId↔PersonId, roster membership, and enrollment identity after reload.

## Interpretation

The two completed windows support a bounded continuity result: all teams remained above the chosen playable minimum and the observed signing cohorts arrived without academic ineligibility. They do **not** certify a mixed HS/JUCO/international/academy intake. The current fixture's measured arriving source mix is 100% legacy synthetic, while TalentCohort produced some separately tracked materializations that did not arrive. Source diversity and JUCO provenance remain open questions; this report does not attempt to change them.

## Validation

- Focused canonical two-cycle audit: passed, `1 test`; runtime 1,245.51 sec (`C:\Temp\BS15I-ncaa-intake-source-mix-test.log`).
- Checkpoint JSON and combined source data were captured under `C:\Temp\BS15I-ncaa-intake-source-mix-*.json`; the saved audit data is [BS15I_NCAA_INTAKE_SOURCE_MIX_AUDIT.json](BS15I_NCAA_INTAKE_SOURCE_MIX_AUDIT.json).
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite emitted its existing large-chunk advisory.
- `git diff --check`: passed.
