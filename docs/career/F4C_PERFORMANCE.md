# F4C performance

## Measurements observed

- The final focused WorldDB/NCAA/New Game/F4C run completed 65 tests with 9 skipped across 12 files in 279.83 seconds. The slowest cases are full NCAA daily lifecycle tests, not UI rendering.
- An earlier combined regression selection completed 66 tests with 15 skipped in 301.42 seconds; it is retained as a baseline for the broader pre-existing selection.
- `NcaaD1Real2027DailyNewGame.test.ts` reported `NCAA2027_FULL_WORLD_DAILY_PERF` at 185,828.48 ms for all phases. The slow phases were college eligibility exits, NCAA postseason and AI training planning.
- The new unified NCAA-only composition plus Save V4 test completed in 14-17 seconds for a 728-team world.

These values are measurements of the existing WorldDB/NCAA implementations and the F4C composition seam; they are not extrapolated claims for 7, 30 or 100 days.

## Interpretation

The integration does not add a frontend-wide recalculation loop. World assembly happens once before the shared clock begins. The existing detailed/reduced WorldDB setting remains the authority for selected PBM competitions.

The full 1/7/30/100-day mixed WorldDB+NCAA benchmark was not completed because the inherited NCAA daily phase exceeds the practical test budget. This is recorded as a performance limitation, not hidden by replacing the high-cost tests.
