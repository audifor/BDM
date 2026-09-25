# PRE-MG8 Match Pace Audit and Certification Performance

## Pace audit

The reported symptom was a completed 17–28 match. A deterministic five-seed audit used the configured first scheduled game and its resolved competition rules: four 10-minute periods (40 regulation minutes). No score target was used.

Before the timing correction, seeds 17, 42, 12345, 90001, and 98765 produced 64–69 possession-ending outcomes per game (67.4 average), 41–54 FGA (47.2 average), and 10–24 FGM (16.2 average). The corrected count includes shooting fouls (derived from two FTs per foul) and four period ends; with the configured 2,400 seconds, mean possession time was 34.8–37.5 seconds (35.6 average). Turnovers averaged 17.0 and FTA averaged 16.4. Field-goal conversion averaged 33.4%; three samples were below 30%.

The session clock was charged a full pace-adjusted 12–24 second interval on each time-advancing MatchSession action. A possession that continued through a pass, screen, or other action therefore paid multiple full possession intervals before ending. The existing playcall selection setup step was time-neutral, as MG7J intended. The audit did not find a playcall setup step consuming clock. Time-consuming eventless steps include spatial movement and action approach; no-event alone is not evidence of a defect. Time-neutral steps were primarily playcall selection.

The structural correction charges one full pace-adjusted interval to the current attacking possession. Further action steps in that possession still advance movement, clock, and fatigue, but use a short interval (`ceil(interval / 6)`, 1–5 seconds). The interval allowance resets when possession changes, on an offensive rebound, and at period transitions. The tracking field is transient `MatchSessionState`; saves and `MatchResult` are unchanged. The action outcomes and RNG draw count per step remain unchanged.

After the correction, the same five seeds produced:

| Measure | Range | Average |
| --- | ---: | ---: |
| Possession-ending outcomes | 101–108 | 104.8 |
| FGA, both teams | 69–82 | 73.6 |
| FGM, both teams | 20–31 | 26.0 |
| 3PA, both teams | 40–53 | 45.6 |
| 3PM, both teams | 9–17 | 14.4 |
| Turnovers, both teams | 21–31 | 25.8 |
| FTA, both teams | 20–30 | 24.4 |
| Average possession duration | 22.2–23.8 sec | 22.9 sec |
| Median possession duration | 21–23 sec | 21.6 sec |
| Longest possession | 51–61 sec | — |
| Ended by made FG / turnover / defensive rebound / shooting foul / period end | 20–31 / 21–31 / 34–42 / 10–15 / 4 | 26.0 / 25.8 / 36.8 / 12.2 / 4 |
| Time-consuming steps without MatchEvents | 52–57 | 55.2 |
| Clock in those eventless steps | 916–1,031 sec | 947.8 sec |
| Time-neutral playcall selections | 43–56 | 49.0 |
| Inferred action clears/resets | 35–47 | 42.2 |

Possession endings are counted from made shots, turnovers, defensive rebounds, shooting fouls, and period ends. Long possessions include offensive-rebound continuations. `Inferred action clears/resets` counts an existing offensive action being cleared while the same team retains the ball; it does not claim every such clear is a literal `RESET` continuation. The eventless step count includes real spatial movement and is not classified as non-basketball time. The session audit logs final score, home/away FGA, FGM, 3PA, 3PM, turnovers, FTA, and action kinds per seed.

The primary diagnosis is **MIXED**: excessive repeated possession intervals were a structural pace bug, and the sample also contains low conversion (post-fix FG% 29.0–41.9%, 35.2% average). The structural timing defect is fixed. Shooting and score calibration remains deferred to MG9/MG14; no shooting, contest, or score target constants changed here. MG8 defensive development did not start.

## Certification performance

The previous global worker restriction was in `package.json`: `test` ran `vitest run --passWithNoTests --maxWorkers=1`. `Invoke-MGCertification.ps1` invoked `npm test`; it did not add the restriction. MG7J's serial full suite completed 437 files (1 skipped), 3,427 tests passed (1 skipped), in 2,306.08 seconds (38m26s).

The package test script now uses Vitest's parallel defaults. Certification keeps focused MatchEngine steps serial and accepts `-Serial` for a serial full-suite fallback. An initial default run spawned 12 workers on a 6-core/12-thread i5-12400F and had 18 test timeouts across 9 files. Slow-file probes then passed 82/82 tests at four workers; the same probe had 1 timeout at six workers. This showed CPU contention against existing test timeouts, so the certification runner defaults to `-MaxWorkers 4`, which can be overridden with `-MaxWorkers <n>`; `-Serial` forces one worker.

The representative MatchEngine plus Live/UI integration probe passed 23 files and 198 tests both serially (29.10 seconds) and with Vitest defaults (9.43 seconds). The four-worker probe of the previously failing files passed 9 files and 82 tests in 85.92 seconds.

The definitive four-worker full-suite run used `npm test -- --maxWorkers=4` and completed successfully in 747.27 seconds (12m27.27s): 437 files passed, 1 skipped (438 total), and 3,428 tests passed, 1 skipped (3,429 total), with no failures. The prior presentation-test assumption was corrected to advance to a step with actual spatial movement; this definitive run covers that correction. Compared with MG7J's 2,306.08-second serial full-suite runtime (38m26.08s), this run saved 1,558.81 seconds (25m58.81s), a 67.6% reduction.
