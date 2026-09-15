# MATCH & BASKETBALL SIMULATION V3 — MG2A · Match Construction & Lineup Authority

Branch: `match-gameplay-v3-mg2a-lineup-authority`
Base: `8b02606972b5ff85ddeca045a71637e4a3eb1951` (MG1-certified `match-gameplay-v3-mg1-canonical-match-audit`)
Scope: fix BUG-1 only. No Rotation Engine V2, no live substitutions/tactics, no Coach AI V2, no Training/Officials integration, no balance changes.

---

## Root cause

`src/app/game/playUserGame.ts` constructed every match's starting five by calling `selectStartingFive(world, teamId, date, squad)` (`src/engine/team/TeamEvaluation.ts:9`) unconditionally, for both the user's team and the AI opponent. `selectStartingFive` is a pure algorithmic ranking: per position, it picks the available player with the highest `calculatePlayerImpact` score. It has no awareness of `world.lineupsByTeamId` (the persisted `TeamLineup` the Tactics board writes to via `setLineupSlot`/`LineupEngine.ts`). The two never connected — `getTeamLineup()` was exported and used elsewhere (roster/tactics UI, `RotationEngine.activeLineupPlayerIds`) but never called anywhere under `src/app/game/` or `src/engine/match/`.

---

## Old flow

```
TeamLineup (world.lineupsByTeamId)     ← written by Tactics board, never read here
                                            ✗ (no connection)
playUserGame.ts: selectStartingFive(world, teamId, date, squad)
        → ranks available roster players by calculatePlayerImpact per position
        → ignores any user configuration entirely
        ↓
MatchEngine starting five = algorithmic pick, always
```

## New flow

```
TeamLineup (world.lineupsByTeamId)
        ↓ getTeamLineup(world, teamId)                      [src/domain/world/queries.ts:139]
        ↓ getLineupAssignments(lineup)                       [src/domain/tactics/TeamLineup.ts:78]
        ↓ filter to BASKETBALL_POSITIONS slots (PG/SG/SF/PF/C)
        ↓
playUserGame.ts: resolveStartingFive(world, teamId, date, availableSquad)   [new, playUserGame.ts:36]
        ├─ exactly 5 distinct starters, all present in this game's available squad?
        │     YES → use the configured starters, unchanged
        │     NO  → selectStartingFive(world, teamId, date, availableSquad)  [unchanged fallback]
        ↓
MatchEngine starting five = configured starters when valid, algorithmic pick otherwise
```

`resolveStartingFive` is called from all three match-construction entry points that used to call `selectStartingFive` directly for lineup purposes: `prepareMatch` (Instant Result / AI-vs-AI / `simulateAndApplyGame`) and `createLiveUserMatch` (live match). Both home and away sides go through the same resolver — there is no user/AI special-casing in the code, because AI-controlled teams simply never have a configured `TeamLineup` (their `lineupsByTeamId` entry stays at the default empty lineup created by `GameWorld`'s constructor), so they fall through to `selectStartingFive` exactly as before.

`calculateTeamStrength` (used for coach-XP fairness, not starting-five selection — see MG1 Section G, BUG-4) still calls `selectStartingFive` internally and is untouched; it was already fenced off from play-by-play resolution and is out of MG2A's scope.

---

## Fallback policy (explicit)

1. Read `getTeamLineup(world, teamId)`.
2. Extract the players assigned to the five starter slots (`PG`, `SG`, `SF`, `PF`, `C`) via `getLineupAssignments`.
3. The configured lineup is **valid and authoritative** only if:
   - exactly `PLAYERS_ON_COURT` (5) starter slots are filled, **and**
   - all 5 player ids are distinct, **and**
   - all 5 players are present in this specific game's available squad (`getAvailablePlayersForCompetition` — i.e. eligible *and* available on this date: not injured/suspended/otherwise unavailable).
4. If any condition fails — no lineup configured, fewer/more than 5 starters, or a configured starter unavailable for this specific game — fall back to the existing `selectStartingFive(world, teamId, date, availableSquad)` unchanged. No partial correction, no silent substitution of a single missing starter: the entire configured lineup is either used as-is or the whole algorithmic fallback runs.
5. This is a pure read-side resolution. It does not mutate `world.lineupsByTeamId`, does not validate/repair the stored lineup, and does not persist anything new. `GameWorld`'s own validation (`GameWorld.ts:716-723`) already guarantees any persisted `TeamLineup` only references real roster players with no duplicate slot/player — MG2A's validity check adds the game-specific availability/completeness check on top of that roster-level guarantee.

This policy is implemented as a single new function, `resolveStartingFive`, in `src/app/game/playUserGame.ts:36-44`. No new files were needed for the fix itself (a separate test file was added — see below).

---

## Files changed

| File | Change |
|---|---|
| `src/app/game/playUserGame.ts` | Added `resolveStartingFive()` (lineup-authority resolver + fallback policy). Replaced the two direct `selectStartingFive(...)` calls used for lineup construction (in `createLiveUserMatch` and `prepareMatch`) with `resolveStartingFive(...)`. `selectStartingFive` remains imported/used (inside the resolver, and via `calculateTeamStrength`). |
| `src/app/game/LineupAuthority.test.ts` | New. Six regression tests (A–E plus one live-path test) proving the policy end-to-end. |
| `docs/match/MATCH_GAMEPLAY_V3_MG1_AUDIT.md` | Added a one-line "RESOLVED in MG2A" note under BUG-1, pointing here. No other content changed. |
| `docs/match/MATCH_GAMEPLAY_V3_MG2A_REPORT.md` | New (this file). |

No UI files were touched. The pre-match Tactics/Plantilla UI (`src/ui/pcb-migrated/tactics`, `plantilla`) already wrote `TeamLineup` correctly (confirmed in MG1) — the break was entirely on the read side in `playUserGame.ts`, so no UI change was required to close BUG-1.

---

## End-to-end trace (post-fix)

```
1. UI write        src/ui/pcb-migrated/tactics/TacticsPcbPage.tsx / CanonicalRoster.tsx
                    → src/engine/tactics/LineupEngine.ts:11 setLineupSlot()
                    → world.lineupsByTeamId[teamId] (persisted TeamLineup)

2. Resolver         src/app/game/playUserGame.ts:36 resolveStartingFive(world, teamId, date, availableSquad)
                    → src/domain/world/queries.ts:139 getTeamLineup(world, teamId)
                    → src/domain/tactics/TeamLineup.ts:78 getLineupAssignments(lineup)
                    → validity check (5 distinct, all available) → configured starters OR
                    → src/engine/team/TeamEvaluation.ts:9 selectStartingFive() [fallback]

3. Match construction  playUserGame.ts:88 (createLiveUserMatch) / :95 (prepareMatch)
                    lineups.home / lineups.away = resolveStartingFive(...) for each side

4. Rotation seed    playUserGame.ts:90 / :107-108 createDefaultRotationPlan({ initialLineup: lineups.home, ... })
                    — now seeded from the resolved (authoritative-when-valid) starting five

5. Engine init      src/engine/match/MatchEngine.ts:270 createMatchSession(options)
                    session.state.initialLineups / activeLineups = lineups passed in step 3

6. First on-court five   MatchSession's initial activeLineups — provably equal to the user's
                    configured TeamLineup starters when Test A/B's conditions hold (see tests)
```

---

## Tests added

All in `src/app/game/LineupAuthority.test.ts`:

- **Test A** — user configures the 5 *lowest*-`calculatePlayerImpact` roster players as starters (deliberately the opposite of what `selectStartingFive` would choose); asserts the actual match starting five equals the configured five, not the algorithmic pick.
- **Test B** — configures one lineup, then a second lineup differing by one starter; asserts the real starting five changes between the two and matches each configuration exactly.
- **Test C** — the AI opponent (no configured `TeamLineup`) is asserted to produce exactly the same starters as calling `selectStartingFive` directly — proving the AI path is untouched.
- **Test D** — no lineup configured for the user's own team; asserts the match is still playable (non-zero final score) and the starting five equals the algorithmic fallback, deterministically.
- **Test E** — an incomplete configured lineup (4 of 5 starter slots filled) is asserted to fall back to the algorithmic pick deterministically, exactly like Test D.
- **Live-path test** — repeats Test A's assertion through `createLiveUserMatch` (the live-match controller path), not just `prepareUserMatch` (Instant Result), confirming both entry points share the fix.

All 6 tests pass. No existing test needed modification — `GameApplication.test.ts`'s `'prepares transient five-player lineups from each game roster'` test only ever asserted shape/validity (5 unique rostered players), which remains true regardless of which resolution path produced them, and every world built via `createNewGame()` in the existing suite starts with an empty (default) `TeamLineup`, so all pre-existing tests exercise the fallback path and observe byte-identical behavior to before the fix.

---

## Known remaining limitations (explicitly out of MG2A scope)

- **Rotation/bench slots are not yet authority-checked.** MG2A only makes the 5 starter slots (`PG`/`SG`/`SF`/`PF`/`C`) authoritative. Bench slot (`B1`-`B7`) configuration already flows correctly into `RotationPlan`/`RotationController` via `TeamGamePlan.rotationOverride` (per MG1), independent of this fix — this wave did not need to touch it.
- **`calculatePlayerImpact` hidden-overall usage is untouched** (MG1 BUG-4). It is still used inside the `selectStartingFive` fallback and by `RotationPlan.ts`'s bench-substitution ranking. Per the brief, resolving or excepting that usage is explicitly deferred to MG2C.
- **Live in-match tactics/substitutions remain disabled stubs** (MG1 BUG-2) — out of scope, untouched.
- **No new "conflicting slot / position mismatch" UI warning was added.** The fallback policy silently (from the user's perspective) reverts to the algorithmic five when the configured lineup is invalid for this specific game (e.g., a starter got injured after the lineup was set). MG2A does not add user-facing messaging for this case — it was explicitly out of scope ("No UI redesign"). A future wave may want to surface "your configured lineup was invalid for this game; using automatic selection" as a pre-match notice.
- **AI teams could theoretically be given a configured `TeamLineup`** in a future wave (e.g., scripted AI game-plans) and would automatically become authoritative under this same resolver — no code change would be needed for that case, since the resolver is team-agnostic. Not implemented or tested here since no AI-configured-lineup path exists yet.

---

## Validation

- `npm run typecheck`: **PASS**, zero errors.
- `npm run build`: **PASS**.
- Focused suite (match engine, tactics domain, match UI, ui-ng match app, app/game, pcb-migrated tactics/plantilla, engine/team, engine/tactics): **57 test files, 395 tests, all passed** (includes the new `LineupAuthority.test.ts`).
- Full repository suite (`npm test`): **320 test files, 2343 tests, all passed, exit code 0** (up from MG1's 319/2337 baseline by exactly one new file and its six tests — no regressions anywhere in the repo).
- Determinism boundary (`Math.random(` in `src/`): **zero matches** — clean.
- Domain/Engine dependency boundary (react/zustand/@tauri-apps import in `src/domain`, `src/engine`): **zero matches** — clean.
- Marker audit (`.only`, `.skip`, `debugger`, `console.log/debug`, `TODO`, `FIXME`) on changed files: **zero matches** — clean.
- `git diff --check`: clean (only a benign LF/CRLF normalization notice, no whitespace errors).
