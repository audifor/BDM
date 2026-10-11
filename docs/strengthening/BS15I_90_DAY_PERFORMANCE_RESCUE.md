# BS15I: 90-day performance rescue

## Scope and gate

Every measured run starts from the same full `createNewGame({ seed: 15015 })` fixture, uses an unemployed user coach and the same deterministic match seed stream, and advances exactly three consecutive 30-day windows: 2032-10-01 through 2032-12-30. All initially scheduled games and competitions remain present. No run in this investigation advances beyond 90 days. No five-, ten-, or thirty-year certification has started.

**90-day profile complete; absolute long-horizon cost gate remains closed.** The matched before/after totals are 288.83 s and 73.47 s, a 74.6% reduction. The final windows are approximately stable at the whole-driver level, with legitimate fixture/planning/monthly differences. Individual history-sensitive costs are reduced substantially but are not proven constant over years. A thirty-year straight-line extrapolation is still about 2.48 hours for one path; continuous plus repeated reload paths would take roughly twice that before annual lifecycle/save/checkpoint costs. This is not yet a practical full-certification budget or a verified scaling estimate.

## Matched 90-day wall time

| Window | Before wall (s) | After wall (s) | After process CPU (s) | Games resolved, both | Training executions, both | New planned sessions, both |
|---|---:|---:|---:|---:|---:|---:|
| 1 (1-30) | 47.44 | 23.25 | 24.62 | 66 | 529 | 553 |
| 2 (31-60) | 108.53 | 27.92 | 28.73 | 70 | 617 | 721 |
| 3 (61-90) | 132.86 | 22.30 | 22.47 | 24 | 728 | 692 |

CPU is the process-wide user plus system time, including worker threads; it can exceed wall time. All samples were collected on the same desktop, sequentially. RSS below is an endpoint sample, not peak memory. Sampling overhead is included in both wall-time measurements.

## Per-window subsystem calls and cost

Each cell is **seconds / calls / mean milliseconds per call**. Match calls count the calendar match-day phase, not individual games. Training calls count daily execution phases; planning calls count weekly checkpoints. Portal is nested within Recruiting, so its time must not be added to Recruiting again. Zero calls are reported explicitly where that path did not run.

| Subsystem | Before days 1-30 | After days 1-30 | Before days 31-60 | After days 31-60 | Before days 61-90 | After days 61-90 |
|---|---:|---:|---:|---:|---:|---:|
| MATCH_RESOLUTION | 20.981 / 15 / 1398.73 | 16.556 / 15 / 1103.73 | 29.025 / 18 / 1612.52 | 16.644 / 18 / 924.68 | 11.015 / 12 / 917.89 | 6.527 / 12 / 543.92 |
| TRAINING | 10.067 / 30 / 335.56 | 0.558 / 30 / 18.60 | 33.999 / 30 / 1133.30 | 1.013 / 30 / 33.77 | 57.974 / 30 / 1932.48 | 1.607 / 30 / 53.56 |
| AI_TRAINING_PLANNING | 6.196 / 4 / 1549.09 | 0.456 / 4 / 114.07 | 20.939 / 5 / 4187.71 | 1.096 / 5 / 219.11 | 30.840 / 4 / 7710.01 | 2.586 / 4 / 646.60 |
| SCOUTING_INTAKE | 6.314 / 30 / 210.47 | 1.815 / 30 / 60.50 | 12.911 / 30 / 430.37 | 1.623 / 30 / 54.09 | 15.571 / 30 / 519.03 | 1.691 / 30 / 56.37 |
| RECRUITING | 0.001 / 30 / 0.02 | 0.001 / 30 / 0.03 | 0.001 / 30 / 0.02 | 0.000 / 30 / 0.02 | 2.964 / 30 / 98.80 | 1.518 / 30 / 50.59 |
| DRAFT | 0.000 / 30 / 0.00 | 0.000 / 30 / 0.00 | 0.001 / 30 / 0.03 | 0.001 / 30 / 0.03 | 0.000 / 30 / 0.01 | 0.000 / 30 / 0.02 |
| Portal | 0.000000 / 0 / n/a | 0.000000 / 0 / n/a | 0.000000 / 0 / n/a | 0.000000 / 0 / n/a | 0.000514 / 1 / 0.514 | 0.000652 / 1 / 0.652 |

## Collection and memory endpoints

Identity, execution, and collection counts matched between the before and after runs for every field captured in the original baseline. Scouting detail was added later without changing the simulation fixture. Active Player means no `careerEnd`; historical Player means a retained career-ended Player. The initial fixture had 456 active Players, zero historical Players, zero training history, zero scouting assignments/reports/awareness, and 48 team training plans.

| End of window | Players / active / historical | Scouting assignments / evaluator reports / territories | Awareness / opposition reports / focus records | Team / individual training plans | Scheduled history / completed history / stimulus events | Before RSS / heap used (MiB) | After RSS / heap used (MiB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 456 / 456 / 0 | 0 / 0 / 20 | 888 / 0 / 0 | 48 / 0 | 553 / 529 / 4657 | 332.6 / 105.1 | 314.7 / 132.3 |
| 2 | 456 / 456 / 0 | 0 / 0 / 20 | 1392 / 0 / 0 | 48 / 0 | 1274 / 1146 / 9754 | 379.4 / 135.3 | 314.3 / 89.7 |
| 3 | 528 / 528 / 0 | 0 / 0 / 20 | 1392 / 0 / 0 | 48 / 0 | 1966 / 1874 / 14625 | 359.8 / 143.0 | 347.9 / 165.1 |

The 72 additional Players in the third window come from the real recruiting-pool lifecycle. No Player was removed or fabricated for this benchmark. Retirement and July annual supply are not exercised by this quarter. Evaluator/opposition report production was zero in this fixture; this profile does not establish their busy-season scaling. Portal ran once; Draft ran its daily phase but had no resolved Draft in this window.

## Why the runtime grew

The central defect was repeated work on historical immutable evidence inside the common world-update boundary. It inflated Training, weekly planning, Scouting, monthly autonomy, and match-result application together. The first-to-second window gained 61.10 s wall time; measured world-update time gained 55.86 s (about 91% of that increase). Update calls grew 46%, while their mean cost grew from 12.37 to 26.82 ms. The third-window mean was 40.45 ms. This was not explained by legitimate operation count alone: Players stayed at 456 through day 60, games grew only from 66 to 70 per window, and training execution count grew from 529 to 617.

Training session history grew 0 -> 553 -> 1,274 -> 1,966; immutable stimulus evidence grew 0 -> 4,657 -> 9,754 -> 14,625. Append checks serialized unchanged completed sessions and existing evidence repeatedly. Existing stimulus evidence was also rebuilt through the rating-key constructor on every append. Whole-world validation repeatedly revisited the same links. CPU sampling measured approximately 83.2 s in `validateWorld`, 40.5 s in scheduled-session append checks, 25.4 s in immutable-collection checks, and 11.9 s in stimulus evidence construction in the baseline. These are sampled self-times, not exact timers for independent phases.

## Changes, applied and measured in order

1. **Shared growth defect first:** retain canonical immutable stimulus objects; compare changed objects rather than serializing identical references; reuse one append index; revalidate historical links when their dependencies change. Initial creation and Save reload still perform complete validation. Changed/new evidence, duplicate IDs, removal, changed injuries, removed Players/Staff/territories, and schedule collisions remain checked.
2. **Canonical Match:** world AI games still use `simulateAndApplyGame -> prepareMatchOptions -> simulateMatchWithRotations -> stepMatchSession`, followed by the ordinary result/stat/season application. `simulateMatch`, detailed simulation, and instant result all use this possession engine; no distinct approved fast background mode was found. No UI viewer is involved. Player lineup qualities are computed once per selection rather than for every positional permutation; the scoring formula, permutation order, and tie rule remain unchanged. Eight complete plans matched the previous implementation.
3. **Daily Training:** execute sessions in the same order and retain each append guard, then validate the complete world once at the daily phase boundary. Collect new immutable stimulus evidence and append it once per day, rather than rebuilding all history for every session. If unauthorized-transfer enforcement must commit a consequence, pending evidence is flushed before that canonical authority runs. The complete result matched sequential execution for a multi-team, multi-session fixture.
4. **Weekly AI Training planning:** preserve the weekly cadence, existing week plans, current roster/context, candidate dates, participation, Staff assignment, fatigue decisions, and ordinary scheduling checks. Validate the complete ordered planning result once. Skip constructing context when an existing AI horizon is preserved. Complete world plus decisions matched sequential planning, including a repeated already-planned call.
5. **Scouting intake:** territory discovery still visits only current territory rosters, caps daily discoveries at three, deduplicates against awareness/knowledge/own roster, and respects `lastProcessedAt`. AI candidate construction is bounded by per-source limits and a per-organization cap; it groups free agents once on planning days, not every organization every day. No global latent-candidate scan exists in these paths. Intake no longer submits an unchanged awareness collection when discovery is empty. Ordered territory updates receive one final world validation. Complete discovery state and same-day idempotency matched sequential intake.

Training execution reads current team rosters, not all historical Players. Weekly planning still scans game/session history to derive relevant fixtures and pending load; due-session selection still scans the retained scheduled-session collection. Immutable Staff/Facilities are not being silently skipped when their relevant references change. These remaining scans are real scaling risks to inspect before assuming thirty-year performance.

## Requested comparison with the earlier 60-day profile

The original timing figures below are retained as historical measurements. They are not the matched instrumented 90-day baseline above. After costs for these subsystem rows use only the first 60 days of the final run.

| Metric | Earlier measurement | Final measurement |
|---|---:|---:|
| Days 1-30 | ~40 s | 23.25 s |
| Days 31-60 | ~81 s | 27.92 s |
| Days 61-90 | n/a | 22.30 s |
| MATCH_RESOLUTION | 41.4 s / 60 d | 33.20 s / 60 d |
| TRAINING | 33.5 s / 60 d | 1.57 s / 60 d |
| AI_TRAINING_PLANNING | 20.6 s / 60 d | 1.55 s / 60 d |
| SCOUTING_INTAKE | 14.3 s / 60 d | 3.44 s / 60 d |
| Projected 30-year single-path cost | >6 h warning; matched 90-day baseline 9.77 h | 2.48 h straight-line estimate |

**Game-count correction:** the earlier reported 56 games was computed as initial scheduled count minus final scheduled count. That undercounts when canonical season coordination generates additional fixtures. The corrected metric uses completed-game count deltas: 66, 70, and 24 games in the three windows (160 total; 136 in the first 60 days). The former per-game cost derived from 56 is therefore invalid. This does not invalidate the recorded wall/phase timers.

## Validation and reproducibility

- Each before/after profile completed through exactly 2032-12-30 with canonical arrivals and progress records.
- Full-world comparisons against saved sequential implementations passed for daily Training, weekly planning (including no replan), and territory intake (including same-date idempotency). Temporary reference modules were moved out of the source tree to `C:/Temp/BS15I-equivalence-evidence` after comparison.
- New permanent regression checks protect stimulus immutability/removal/new-record validation, collisions against completed history, awareness territory dependency invalidation, and final batch validation before return.
- Final focused regressions: **78 tests PASS**. Production build (TypeScript + Vite): **PASS**. Whitespace check: **PASS**. Details are also recorded in the main BS15I ledger.
- One existing rotation test fails because its fatigue calculation starts from a different lineup than the match event stream. It also failed with the unchanged HEAD coaching engine substituted; the failure was reproduced before attributing it to this optimization. The previously noted StaffCulture calendar test also remains baseline debt.

Run only the bounded profile:

```powershell
$env:BS15I_PROFILE_90='1'
$env:BS15I_PROFILE_LABEL='after'
npx vitest run src/app/game/testSupport/BS15IProfile.test.ts
```

There is no configurable year/day horizon in this profile: three 30-day windows are hard-coded. Default execution without the environment switch does not launch the profile. Raw before/after window results are stored alongside this report in `BS15I_90_DAY_PROFILE_BEFORE.json` and `BS15I_90_DAY_PROFILE_AFTER.json`. CPU samples and the actual transformed validator source are in `C:/Temp/BS15I-before.cpuprofile`, `C:/Temp/BS15I-after.cpuprofile`, and `C:/Temp/BS15I-after-world-source.js`. These measurements do not certify five, ten, or thirty years, annual supply/development/retirement, or repeated V4 continuation. No commit, merge, reset, clean, branch recreation, or push was performed.

## Rescue 2: match and weekly planning follow-up

The same seed, full `createNewGame` world, 30-day windows, match-seed stream, games and training cadence were rerun after the measured Match and planning changes. All 160 games resolved and all 1,874 training executions remained present.

| Metric | Rescue 1 | Rescue 2 |
|---|---:|---:|
| Days 1-30 | 23.25 s | 12.27 s |
| Days 31-60 | 27.92 s | 19.69 s |
| Days 61-90 | 22.30 s | 16.93 s |
| Match resolution / first 60d | 33.20 s | 15.54 s |
| Training / first 60d | 1.57 s | 1.52 s |
| AI planning / first 60d | 1.55 s | 1.20 s |
| Scouting / first 60d | 3.44 s | 3.26 s |
| 30-year straight-line single-path estimate | 2.48 h | 99.1 min |

The Rescue 2 estimate uses the measured 48.89 seconds for 90 days, multiplied by 10,950 simulated days. It is a straight-line estimate before additional annual/checkpoint costs and future collection growth. This is about a 33% reduction from Rescue 1, but it remains above the 90-minute limit for starting a 30-year run. Do not launch 30 years.

### Match micro-profile

The canonical route remains `simulateAndApplyGame -> prepareMatchOptions -> simulateMatchWithRotations -> stepMatchSession -> completeMatch`, with the ordinary completed-game, MatchStatLog, season/standings and post-game consequence authorities. The first 60 days spent 15.54 seconds in the match-day phase for 136 completed games, or **114 ms/game**. Across all 90 days, the match-day phase was 18.78 seconds for 160 games, or **117 ms/game**.

The Node CPU sample was isolated to `simulateAndApplyGame` descendants and normalized to sampled Match time (18.67 seconds). Self-sample costs identify the remaining work:

| Match work | Sampled time | Share of sampled Match time |
|---|---:|---:|
| Lineup permutation traversal (`visit`) | 4.54 s | 24.3% |
| Permutation score calculation (`scoreLineup`) | 1.26 s | 6.7% |
| Complete-world validation during canonical result/stat/season application | 4.22 s | 22.6% |
| `stepMatchSession` self time | 0.35 s | 1.9% |
| Match-stat aggregation self time | 0.02 s | 0.1% |
| Post-game player consequences self time | 0.28 s | 1.5% |

Availability and option construction, session creation, rotation dispatch, and season standings do not stand out as independent sampled costs at this resolution; their elapsed time remains included in the measured 114-117 ms/game. The top actionable inner cost is the exhaustive five-position lineup permutation search. The change precomputes player-only lineup qualities once, removes per-permutation candidate/selection arrays and sorting, and preserves role-fit summation order, candidate traversal order, score penalties, and lexicographic tie-breaking. Three representative AI match snapshots captured before the change match exactly after it: final result, lineup, substitutions, complete player stat log/minutes, fatigue, injuries, season state, and completed fixtures. The Match engine, possession decisions, events, and presentation output are unchanged.

### Weekly training history scans

Weekly AI planning now builds temporary `team -> games` and `team -> scheduled sessions` projections once for the planning pass. The projections are derived from canonical GameWorld collections and updated when the planner adds a canonically scheduled session; they are discarded after the pass. Per-team context uses its game/session subset, and scheduled load is accumulated once over that team's upcoming sessions instead of rescanning all retained sessions separately for every date in the horizon. AI cadence, candidate dates, load formula, decisions, and canonical records are unchanged. Focused planning equivalence and scheduling tests passed.

Due-session execution still performs a retained-session scan each simulated day to select scheduled sessions due on that date. The final 90-day profile reached 1,966 retained sessions; the remaining per-day scan is a long-horizon risk and is not indexed yet. No history was removed or truncated. Training CPU samples attributed 0.59 seconds over the 90 days to session execution and 1.05 seconds to session scheduling; these are self-sample costs, not whole-phase timers.

### Five-year gate result

The stable 30-day windows, exact three-game match snapshots, retained canonical workload, and 33% lower projection opened the five-year step. The continuous/reloaded run completed its Year 1 Save V4 reload and deep integrity checkpoint, then stopped during Year 2 at a canonical lifecycle invariant: **“The active contract has no matching canonical signing transaction to prove roster restoration.”** It ran for 269.8 seconds and produced no Year 2 checkpoint. Do not continue to 10 years until this invariant is resolved and the five-year continuation completes.

Year 1 reached 2033-10-01: 600 active Players, 182 completed games, four supply cohorts, 1,600 latent capacity, zero materialized supply Players, a 56.52 MB Save V4 payload, 0.46 s save, 1.21 s load, and 678 MB RSS. Match resolution was 18.27 s; Training 33.52 s; AI training planning 31.14 s; Scouting 17.18 s; Recruiting 16.21 s; Draft 2.13 s. Annual supply took 16.85 ms, annual Player development 171.67 ms, and career end 0.32 ms. Year 1 took 212.84 s wall time versus 198.33 s projected from 90 days (+7.3%); annualized from Year 1, that is about 106.4 minutes for 30 years before later growth. The full certification remains incomplete because the run stopped before Year 2's checkpoint.
