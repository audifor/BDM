# Known Technical Debt

These items are known and are NOT blockers for milestones 016B.1 through 019 unless a new change directly exposes a defect in them.

## TeamEvaluation edge-case coverage

Some explicit controlled fixtures remain missing for:
- PlayerId tie-break behavior in Starting Five
- fallback when one or two positions are missing
- roster with fewer than five players
- bench player improvement that does not displace a starter
- bench player improvement that does displace a starter
- explicit TeamStrength 0 and 100 team fixtures
- full schedule-to-MatchSimulation determinism integration

Existing functionality is green and the core behavior has partial coverage. Do not spend an autonomous milestone expanding this debt unless a current milestone depends on a broken edge case.

## Manual Tauri inspection

Several prior milestones could not perform interactive visual inspection in the agent environment. Build/typecheck/tests are authoritative for automation. UI milestones should still make a best-effort manual run when the environment allows it.
