# World Generator P3 import

Draft consumer integration, coordinated with audifor/BDM-DB PR #140 and its P3 follow-up. Refs audifor/BDM-DB#132, audifor/BDM-DB#137, audifor/BDM-DB#139. This does not certify full gameplay.

Start screen → **Importar universo WorldDB** → SQLite path → read competitions → competition/club → independent game. The runtime bundle is the sibling `competition-runtime-bundle.json`. The existing Tauri repository and `WorldDbSession` remain the only import path.

The July 1 world start is distinct from competition start. PLAYER80/40, PERSON50, physical values and position familiarity survive save V4. Development stage uses the world reference date. The complete imported STAFF80 vector is retained in `worldDbUniverseSource`; BDM's existing staff runtime uses its 13 semantic attributes. Exact imported compensation terms feed the canonical financial schedule directly in minor units; the legacy whole-major-unit boundary remains unchanged for legacy games.

PASS: real generated ACB/LF Endesa/Primera FEB imports, 257 ACB players, exact source compensation obligations, opening cash, fixture calendars with multiple dates per round/byes, facilities projection, one day through the existing daily application boundary, independent worlds, disk save/reopen. No MatchEngine modification.

FAIL: complete active professional/relationship import (delegate, psychologist, directors, agents, officials, media); complete operational projection of budgets, non-base clauses and facility capabilities/rights/costs; complete cross-rule NBA/NCAA gameplay. These are exposed through `availableNotConsumed` and the coordinated P3 report. A PARTIAL format is never relabelled COMPLETE to pass an execution gate. Opening a file/import compatibility does not establish full season playability.

Real-data test setup:

1. Set `BDM_P3_WORLD_DB`, a fresh `BDM_P3_EXPORT_DIR`, and `BDM_P3_EDITIONS` (comma-separated selected edition IDs). Run `cargo test --locked probe_universe_bootstrap -- --nocapture` in `src-tauri`.
2. Set `BDM_UNIVERSE_EXPORT_DIR` to that directory and `BDM_UNIVERSE_BUNDLE` to the generated runtime bundle. Run `npx vitest run src/app/game/WorldDbUniverseGame.test.ts`. Optional `BDM_UNIVERSE_GAME_EXPORT` must name a new file; the test never overwrites an existing save.

Local coordinated evidence: `C:\BDM_DB\PGM30_CERT_RESULTS\worldgen_p3\codex-continuation`. The generator repo contains `docs/WORLDGEN_P3_2026-10-22.md`, the family PASS/WARN/FAIL CSV, hashes, manifests and comparison results. Long simulation benchmarks retain their original tests; the functional regression command explicitly excludes the inherited long runs and does not claim they passed.
