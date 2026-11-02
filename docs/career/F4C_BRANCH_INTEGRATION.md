# F4C branch integration

## Base

The branch starts at Career F4B commit `a399115c`, which is descended from the shared project base `12d92624`.

Integrated incrementally:

1. `feature/worlddb-global-playable-02` at `cdb6adeb` (148 commits ahead of `origin/main`). This supplied the global WorldDB catalog, NBA/G League format bindings, NCAA source projections, category guards and WorldDB runtime tests.
2. `origin/feature/newgame-two-step-league-selector-01` at `7fd7742a`. It already contains `origin/feature/worlddb-ncaa-daily-newgame-01` at `6feb163d` as an ancestor, so the NCAA daily line was not merged a second time.
3. F4C code then added the unified New Game composition seam and its Save V4/integration test.

The merge bases of the three lines are all `12d92624`. No rebase, reset, force update or change to an existing worktree was performed. The original WorldDB and Career branches remain untouched.

## Functional matrix

| Functionality | Source branch | Canonical authority | Dependency | Conflict | Resolution |
|---|---|---|---|---|---|
| WorldDB competition catalog | WorldDB global | `WorldDbV2Competitions` and global JSON | WorldDB source root | Existing catalog is PBM-shaped | Reused global catalog and provenance |
| League selection | New Game selector | `LeagueSelectionStep` and `WorldDbNewGameCatalog` | selected levels and source root | NCAA was a separate universe option | Added same-world NCAA toggle |
| World assembly | WorldDB global | `createWorldDbV2UniverseFromSnapshots` | shared seed/date/source | Supplemental NCAA world had no composition seam | Added `mergeGameWorlds` and unified entry point |
| NCAA men/women | NCAA daily/New Game | `createNcaaD1Real2026Universe` | deterministic seed and generated policy | Existing UI route was separate | Composed both categories into the selected WorldDB world |
| NBA/G League | WorldDB global | native format bindings and TradeEngine | selected WorldDB competition | No direct conflict | Preserved native format and trade authorities |
| Save V4 | Career + WorldDB | `GameWorldSaveV4` | JSON-safe GameWorld | Array ordering is not a product fact | Verified identity sets and persisted world counts |
| Coach mobility | Career | `CoachCareerService` | job openings and reputation | No new mobility engine needed | Reused existing employment/history authority; full cross-ecosystem pilot remains pending |

## Non-integrated references

The remote NCAA and New Game branches were inspected. No code was copied indiscriminately from them. `docs/playable/evidence/f3/ab-comparison.json` was not staged or modified.
