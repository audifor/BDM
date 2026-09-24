# MG4C Team Lineup Authority

Before MG4C, match preparation ignored the persisted `TeamLineup` and always used `selectStartingFive()`.

`resolveStartingFive()` now uses the canonical lineup when its five position slots contain distinct roster players who are available for that match. It preserves PG-to-C slot order. Missing, incomplete, duplicated, stale, or unavailable starters fall back to deterministic `selectStartingFive()`; that fallback and its MG4B `PlayerTruthRatings` evaluation were not changed.

Team strength is calculated from that same resolved five, keeping its existing impact formula while removing a second automatic starter selection.

Both `prepareMatch()` (used by instant preparation) and `createLiveUserMatch()` call the same resolver. Match session creation initializes `initialLineups` and `activeLineups` from the resolved starters, so the initial active five matches the prepared lineup. No live coaching or rotation behavior was changed.

Files changed:

- `src/engine/team/TeamEvaluation.ts` and `src/engine/team/index.ts`: shared lineup resolution.
- `src/app/game/playUserGame.ts`: live and instant preparation use the resolver.
- `src/engine/team/TeamEvaluation.test.ts`: explicit-wins and incomplete-lineup fallback tests.
- `src/app/game/LiveMatchController.test.ts`: live/instant parity test.

Validation: the two affected test files passed (17 tests) using the existing MG4B dependency cache and a temporary MG4C Vitest config, which was removed afterward. The initial direct runner attempt could not resolve packages because MG4C has no `node_modules`; no dependencies were installed. Typecheck and build were skipped; no bundling behavior changed, and the available test runner transpiled both changed TypeScript areas.

Result: MG4C team lineup authority passes. Live and instant match bootstrap share the same explicit-lineup rule.
