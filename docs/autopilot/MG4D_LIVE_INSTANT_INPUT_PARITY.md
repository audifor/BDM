# MG4D Live / Instant Input Parity

Before MG4D, `createLiveUserMatch()` assembled its own match options. It omitted the persisted per-game tactical and matchup overrides and always constructed default rotation plans, while instant preparation used the game plan's matchups and rotation override.

`prepareMatchOptions()` is now the shared pre-match builder. `prepareMatch()` uses it before running the full simulation; `createLiveUserMatch()` passes its result to `LiveMatchController`. Both receive the same world and game context, available squads, profiles, MG4C-resolved lineups, strengths, tactical plans, matchup overrides, rotation plans, and deterministic RNG streams. Match rules continue to resolve from the same Game/Competition context when the session is created.

The remaining difference is execution: instant runs the session to completion and applies the result; live creates a controller for incremental playback. In-match coaching remains disabled and out of scope.

Validation: `LiveMatchController.test.ts` passed (7 tests), including persisted tactic/matchup input and initial-session parity. `GameApplication.test.ts` was attempted but could not load because the reused dependency cache lacks `@tauri-apps/api/core`; no tests in that file ran. The full suite, typecheck, and build were skipped per milestone policy. MG4B PlayerTruth and MG4C lineup resolution were not changed.

Result: live and instant execution share the same pre-match input builder.
