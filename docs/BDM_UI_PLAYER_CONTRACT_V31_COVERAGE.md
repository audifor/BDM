# PLAYER / CONTRACT V3.1 · Contract evidence and gameplay boundary

## Verified source paths (2026-10-11)

- `src/ui-ng/applications/player/data/buildPlayerContractModel.ts` obtains agreements from `getCurrentPlayerContract(world, playerId)` or scheduled records returned by `getPlayerContracts(world, playerId)`. Without those records, it correctly leaves amounts and dates absent.
- `src/domain/world/contracts.ts` reads only `world.contractsById`; it does not retrieve contracts from a separate database.
- `src/app/game/WorldDbGameBootstrap.ts` creates the World DB game with players and roster assignments, but **does not pass player contracts** to `createGameWorld`. The selected `WorldDbGameBootstrapSliceV1` in `src/domain/worldDb/GameBootstrap.ts` does not contain player contracts.
- `src/app/game/WorldDbSpainGame.ts` uses the World DB bootstrap path. This explains why initial Spanish World DB rosters can be populated while PLAYER / CONTRACT has no current agreement.
- By contrast, `src/app/game/createAcbTestGame.ts` generates `PlayerContract` records and adds them to `createGameWorld`.

## UI V3.1 implemented

- OWN: a compact, action-led evidence state when no active or scheduled `PlayerContract` exists. It differentiates **roster membership** from **employment terms** and does not invent salaries, lengths or contractual violations. The registration already available remains visible; optional gaps remain discoverable.
- RIVAL: market knowledge can only come from the viewer club's authorized `marketKnowledge` and signals. Four selectable RPG **previews** are prominent; their outcomes are descriptive only, without world mutation. No unverified private contract, salary, agent or club relationship is revealed.
- Scouting, Contracts / Planning and eligible Free Agent Market navigation retain the existing canonical routes.
- The redundant contract side inspector remains removed; actual financial schedule season selections show their details inline.

## Upstream product/data repair (separate from cosmetic V3.1)

1. Determine if the source World DB actually contains sufficiently reliable, source-backed player contract terms and provenance. The current bootstrap slice does **not** expose any.
2. If present, extend the World DB selection slice, validator, repository extraction, and world bootstrap to import canonical `PlayerContract` records; validate IDs, term dates, money semantics, contract/roster compatibility and Save reload.
3. If source contracts do not exist, establish an explicit, approved non-real-world synthetic contract generation policy in the **world/bootstrap system**, not in PLAYER UI. Do not silently invent contract terms for actual professionals.
4. Add systematic coverage: all rostered players, validity on game start, finance linkage, own/rival FOW, season transitions, and persistence. No "PASS contracts integrated" claim until those checks pass.

## State

UI / gameplay routes: code implemented, automated and Tauri visual certification tracked separately.

World DB contract source and importer: **confirmed structural coverage gap**, not resolved by this UI change.
