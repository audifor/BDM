# MG7J Offensive Engine Final Certification

## Scope and lineage

MG7J certifies the offensive decision systems delivered by MG7A through MG7I. The certification branch started from MG7I commit `b8522b52ee4cc463c32ec582fff20645cb13db04` and retains the complete MG7A-I ancestry.

MG7J found one integration defect during certification: selecting a half-court playcall spent a full possession interval before that selected action could execute. A setup step now stores the selected canonical action without advancing the game clock, movement, or sporting events. The next normal MatchSession step executes that action. The period-end guard still resolves clocks too short for the minimum pace-adjusted possession before selecting an action.

Live presentation segments now carry their actual start and end period-clock values from MatchSession. This preserves elapsed-time visualization for time-consuming steps that emit no MatchEvent, such as transition settling. MatchEvent remains the canonical sporting event stream.

## Certified architecture

- **Macro playcalling:** `OffensivePlaycalling.selectNextOffensiveAction` chooses among viable primary actions using player tendencies and the current tactical plan.
- **Primary action authority:** `MatchSessionState.offensiveAction` holds one canonical primary action at a time. MatchEngine dispatches it through the matching action-specific decision logic.
- **P&R:** `PickAndRollOffense` evaluates screen use, roll or pop, and handler continuations.
- **Isolation and drive:** `IsolationOffense` selects a viable drive, shot, pass, or reset; `DribbleDrives` owns `DriveIntent` geometry and advancement.
- **Post-up:** `PostUpOffense` resolves post continuations while `PostUpMovement` validates context and supplies movement targets.
- **Handoff:** `HandoffOffense` validates participants, approaches, transfer readiness, and continuation choices.
- **Spot-up and catch:** `SpotUpOffense` validates canonical owner/catch context and chooses shot, drive, pass, or reset.
- **Cuts:** `OffBallMovement` produces secondary cut intents; cuts support the primary action and do not replace its authority.
- **Transition:** `TransitionOffense` reads transition opportunities and chooses a continuation; MG6 spatial movement advances the resulting transition intent.
- **Shared DriveIntent:** drive decisions pass a validated `DriveIntent` to MatchEngine and MG6 movement execution.
- **Pass and shot resolution:** the existing `PassingResolution` and `ShotResolution` remain the canonical outcome resolvers.
- **MG6 movement authority:** `SpatialState`, base-spacing, screen, and transition movement own court positions and movement updates. MG7 supplies sporting decisions and intents.
- **Ball ownership and lineup:** ownership is represented by `SpatialState.ball`; MatchSession owns active lineups and changes them through substitutions.
- **Player truth, tendencies, and tactics:** match profiles provide ratings and tendencies. Tactical plans alter viable action usage through tactical effects. Gameplay does not resolve from Overall.
- **GameWorld boundary:** GameWorld is read to prepare the match and its competition rules, and to apply the completed result. MatchSession stepping uses its captured profiles, lineups, plans, and spatial state; it does not query GameWorld or application stores during play.
- **Events, stats, and visuals:** sporting outcomes append canonical MatchEvents. Result/stat application consumes the completed simulation. The viewer consumes event deltas and read-only spatial snapshots; it has no gameplay authority.
- **Live/Instant:** both entry paths create and execute the same MatchEngine session with injected RNG streams.

## Determinism and runtime audits

- No `Math.random()` calls were found under `src/`.
- No wall-clock or platform random source is used by production `src/engine/match` runtime code.
- The match engine uses injected seeded RNG streams for gameplay and decision selection.
- Domain and Engine source has no React, Zustand, or Tauri imports.
- Session resume and wrapper-versus-step parity are covered by MatchSession tests; explicit seeded startup and Live/Instant setup parity are covered by `matchSeedLifecycle` tests.

## Certification results

| Check | Result |
|---|---|
| MG7 focused certification | PASS — 9 files, 122 tests |
| MatchEngine regression suite | PASS — 19 files, 176 tests, 0 skipped |
| Full repository suite | PASS — 437 files passed, 1 skipped; 3,427 tests passed, 1 skipped |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; Vite reports the existing large-chunk advisory |
| `git diff --check` | PASS |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS |
| Determinism and seeded RNG audit | PASS |
| Live/Instant authority and seed parity | PASS |

The full suite printed JSDOM `HTMLCanvasElement.getContext()` warnings from UI tests. Vitest completed successfully with the totals above.

Focused certification command:

```powershell
.\node_modules\.bin\vitest.cmd run --maxWorkers=1 src/engine/match/MatchSession.test.ts src/engine/match/PlayerDrivenOffense.test.ts src/engine/match/MatchEngine.test.ts src/engine/match/DetailedMatchSimulation.test.ts src/engine/match/PlayerTruthAuthority.test.ts src/app/game/LiveMatchController.test.ts src/app/game/matchSeedLifecycle.test.ts src/ui/match/MatchPresentationSegment.test.ts src/ui/match/SpatialVisualBridge.test.ts
```

MatchEngine regression command:

```powershell
.\node_modules\.bin\vitest.cmd run --maxWorkers=1 src/engine/match
```

Full suite command:

```powershell
npm test
```

## Final architecture statement

MG7 OFFENSIVE ENGINE = canonical primary action authority + action-specific offensive intelligence + secondary off-ball behavior + transition offense + catch continuations + half-court playcalling + MG6 spatial execution + existing canonical resolution.

## Known limitations

- The full suite has one skipped test; Vitest did not print a skip reason in its summary.
- Vite emits its existing advisory that some production chunks exceed 500 kB.
- UI tests may print JSDOM canvas `getContext()` warnings; these did not fail the suite.
