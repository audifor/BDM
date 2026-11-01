# CAREER-F3.1 - Global failure recovery

## Historical evidence

The global F3 run did not leave a log, JSON report or process snapshot in the repository. The only durable evidence was the prior report: the command was interrupted after emitting failures and before a Vitest summary. Therefore those historical `x` markers are classified **UNKNOWN**, not as Career regressions and not as PASS.

No stale Vitest process from that run was found. The Node processes present during inspection belonged to Computer Use/PixelLab infrastructure or an older worktree, not to the F3 global test command.

## Controlled reproduction

Command used for the Career-related isolation:

```text
npx vitest run --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --reporter=dot <Career/HRPG/Staff/Home/Save/Match files>
```

Result: **19 files, 201 tests PASS**, 674.54 seconds. This included HRPG, staff reactions, recommendations, CoachCareer, CoachLife, Home, Save V4, MatchEngine port, CareerLoop and F1 arrival.

The four long playable regressions were then run separately and completed:

| Scope | Result | Duration |
|---|---:|---:|
| `PlayableF3HumanCareer.test.ts` | 3/3 | 360.39 s |
| `PlayableF0B.test.ts` | 4/4 | 393.75 s |
| `CareerF1Arrival.test.ts` + `PlayableF1.test.ts` | 20/20 | 179.89 s |
| `PlayableF2Mechanisms/Attribution/F2.test.ts` | 24/24 | 1214.91 s |

## Remaining global observation

Controlled global command:

```text
npx vitest run --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --bail=1 --reporter=dot
```

It did not reach a final summary before the operational window. It did, however, report:

```text
src/app/game/WorldDbGameBootstrap.test.ts > ... measures advanceGameDay performance over 100 consecutive days
advanceGameDay x100: 292338.6ms (2923.39ms/day)
```

Classification: **PERFORMANCE**, not `CAREER_REGRESSION`. This is a WorldDB bootstrap performance fixture and no Career failure was observed in the controlled output. The process was interrupted; the run is **INCONCLUSIVE**.

## Other environment observation

Computer Use failed before app enumeration with:

```text
Computer Use native pipe is unavailable: failed to connect native pipe: El sistema no puede encontrar el archivo especificado. (os error 2)
```

Classification: **ENVIRONMENT**. It prevented native Windows inspection; it did not alter the application or test result.

## Conclusion

There is no reproduced Career regression to correct in F3.1. The unknown historical failures remain unclassified because their logs were not preserved. The demonstrated global cost is documented separately from functional Career evidence.
