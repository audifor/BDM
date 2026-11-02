# F6 Final Report

## Verdict

**PARTIAL.** One focused production gameplay behavior was deepened and verified. F6's full playable certification requirements were not met. The current worktree is the F6 branch based on F5 `4366b19d`.

## Functional change

Professional player response now compares total salary guarantees across term length, considers an actual competing OPEN/ACCEPTED negotiation, varies counter terms with representation/agent traits, and evaluates due offers in strongest-package order. The shared transfer response receives the buyer organization. Details and limits are in `F6_GAMEPLAY_CHANGES.md`.

## Verification performed

- Focused Vitest runs: 4 files, 55 tests passed (`MarketEngine` 20/20; `FreeAgentContactService`, `FreeAgentSigningService`, and `TransferPolicy` 35/35). Causal comparisons use seeded market expectations and seeded agent attributes.
- `npm run typecheck -- --pretty false`: passed.
- `npm run build`: passed (Vite emitted existing chunk-size and mixed static/dynamic-import warnings).
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed. Scans found no `Math.random(` in `src/` and no React/Zustand/Tauri imports in Domain or Engine.
- Full `npm test -- --run` did not complete cleanly. It reported timeouts in `GameApplication.test.ts` and `StaffScreen.test.tsx` under heavy parallel load. Running the GameApplication file on the untouched F5 base reproduced the same four 5-second timeout failures, confirming those failures predate F6. The full run was stopped before a complete suite summary; no global green result is claimed.

## Gameplay status

- Existing match engine, scouting/knowledge, training, recruitment, season and career authorities remain in place; presence of an engine is not treated as full playable depth.
- Rival trade negotiation is BLOCKED at the autonomous response boundary.
- Role/playing-time valuation, broad club autonomy, facilities gameplay connection, full team finance loop, staff performance effects, and multi-ecosystem long-horizon lifecycle remain partial or unverified.
- No complete European, NBA, NCAA or unified-world user-through-GUI scenario was executed. The native window was launched on 2026-11-02, but no full route was manually certified.
- No three-season interactive run, ten-season simulation, or Windows GUI acceptance was executed.

## Performance / regressions

F6 long-horizon timings, memory, save size and UI response times are NOT TESTED. No performance improvement is claimed. Regression status is limited to the tests and builds reported in this document; do not interpret that as a whole-product certification.

## Files and traceability

- `F6_GAMEPLAY_AUDIT.md`: route classifications and evidence.
- `F6_GAMEPLAY_CHANGES.md`: production behavior and constraints.
- `F6_PLAYABLE_ACCEPTANCE.md`: scenario acceptance status.
- `F6_LONG_HORIZON_PERFORMANCE.md`: explicit untested matrix.

## Consolidation update (2026-11-02)

- F6 code commit `7365013c` and the isolated owner-requested publication policy commit `83c04b0f` are published on `feature/bdm-f6-final-gameplay`; the remote SHA was verified as `83c04b0fd4b094c7b8e64f61c6dc9ece18f44f41`.
- The native Tauri app launched from `C:\BDM-worktrees\bdm-f6-final-gameplay` and displayed the Basketball Dynasty Manager window. This records startup only, not visual acceptance of gameplay flows.
- Integration candidate `integration/bdm-unified-20261102` adds the read-only DB-04 catalog adapter. Its focused test passed 3/3; other candidate validations and the remaining PR review are recorded in `docs/integration/BDM_CONSOLIDATION_REPORT.md`.
- F6 remains **PARTIAL**. No three-season or ten-season run, full New Game path, market signing UI route, or global regression suite has been certified.

F6 source worktree: `C:\BDM-worktrees\bdm-f6-final-gameplay`. The separate integration candidate is not `main`; no merge to `main` has occurred.
