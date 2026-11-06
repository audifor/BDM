# M0.1 — Deterministic headless bootstrap and first match

Certification: **PASS**. Scope: the eight-team prototype's first round and one
application day, replayed from two independently initialized worlds. This does
**not** certify a full season, every universe, save/load replay, or another runtime.

## Repository and isolation

- Repository: `https://github.com/audifor/BDM.git` (`origin` and `github`).
- Date: 2026-11-06.
- Source baseline, verified after `git fetch origin`:
  `12d926241fda7f2ba3f198083cd61fd480c2fec8` (`origin/main`). It matches the supplied reference.
- Original checkout: `C:/BDM`, branch `playable/f4`, HEAD
  `c1905549d87ca1a11797ae5cadc348e2ccf557c9`, with unrelated tracked changes and
  untracked files. It was not edited or reset.
- Isolated checkout: `C:/BDM-worktrees/m0-season-headless-certification`, branch
  `test/m0-season-headless-certification`, created from the verified baseline;
  clean before milestone edits. No changes to `main`, no merge, no push.
- The certification commit is the commit introducing this report; obtain its exact
  SHA with `git log -1 --format=%H -- docs/certification/m0/M0_BASELINE.md`.
- Existing installed dependencies were reused through an ignored `node_modules`
  junction to `C:/BDM/node_modules`; no installation or lockfile change. Executed
  versions: Node `v24.12.0`, npm `11.6.2`, Vitest `4.1.10`, Vite `7.3.6`.

## Fixture and actions

The smallest supported existing fixture is `generateWorld` in
`src/engine/world/WorldGenerator.ts`, with
`{ seed: 20261106, gender: 'male', startDate: createGameDate(2032, 10, 1) }`.
Optional NBA-like/NCAA-like leagues and vacancies are omitted (existing defaults).
The existing `generateRoundRobinSchedule({ world, seasonId: world.currentSeasonId })`
creates 56 scheduled games over 14 rounds at the default four-day interval.
`updateGameWorld` installs that schedule through the canonical validated service,
following the existing Calendar/ScheduleGenerator test-fixture pattern. No new
entity model or replacement simulation is introduced.

The fixture contains eight teams, 96 players (12 per roster), one FIBA-like
competition (`generated-competition-0001`), one active season
(`generated-season-0001`), and user coach `generated-coach-0001` controlling
`generated-team-0001`. Canonical factories provide Person/Staff/assignment roots.
The larger current `createNewGame` fixture includes multiple ecosystems and both
genders, so it is not the smallest available supported bootstrap.
`docs/strengthening/BDM_CURRENT_GAME_LOOP.md` is absent at this baseline; the
capability registry is historical context, while current production code controls.

Identical scripted actions in each independent run:

1. Generate the world, attach the real schedule, validate the canonical world.
2. Evaluate the entire breakpoint candidate list. The first scheduled user game
   is already on the initial date, so zero calendar advances are needed to reach it.
3. Resolve that game with canonical `instantResult(world, undefined, matchSeed)`.
   Validate the resulting world and confirm the `userGame` candidate disappears.
4. Evaluate all candidates again. Resolve the three remaining games and advance
   one day through `advanceGameDayWithResult(world, seedFactory, [])`. The empty
   allowed-reasons list grants no mandatory-breakpoint bypass.
5. Reevaluate every candidate, validate the world on `2032-10-02`, and compare
   completed IDs, scores, persisted stat logs, and the entire canonical world.

No React rendering, UI store, browser DOM, Tauri runtime, Electron, external API,
or Python backend is used by the Node certification. The test asserts that
`document` is absent. World construction and gameplay use real services, not mocks.

## Seed authority and production engine

Root seed: **20261106**. World generation uses the existing `SeededRandomSource`
(Mulberry32) and deterministic sequence/entity IDs.

Each match seed is the existing `hashStringToSeed` (32-bit FNV-1a) of this exact string:

```text
m0-match-v1:20261106:<seasonId>:<competitionId>:<gameId>:<gameDate>
```

`MatchSeedFactory = () => number` is sufficient. For day advancement, its draws
are bound to the games returned by `getScheduledGamesToday` in the same order
consumed by production `prepareDayGames`. That query sorts Game IDs explicitly;
the test rejects extra draws and verifies the exact draw count. Match identity,
not a mutable seed counter, determines entropy. The user action takes its seed
directly. The test verifies the actual production setup seeds and IDs against
both runs' recorded inputs.

Inspected seams: `createMatchSeed`, `MatchSeedFactory`, `advanceGameDay`,
`advanceGameDayWithResult`, `simulateRemainingGamesToday`, `prepareDayGames`,
`prepareMatchOptions`, and `instantResult`. No seed seam or other production
change was needed. Default production entropy remains unchanged. The conditional
production-seam backward-compatibility test is **NOT_RUN / not applicable**.

Actual user-match path:

```text
app/game/matchResolution.instantResult
  -> MatchNextEnginePort.prepare -> prepareMatchSetup -> prepareMatchOptions
  -> MatchNextEnginePort.simulate(setup, 'FAST')
  -> MatchNextLiveController.skipToEnd -> real match-next ticks -> gameEnd
  -> MatchNextEnginePort.complete -> completeMatchNext -> completeResolvedMatch
  -> applyCompletedMatchChain
```

Other opening-round matches use `advanceGameDayWithResult -> prepareDayGames ->
simulateDayOutcomesInline -> MatchNextEnginePort.simulate('FAST') -> applyDayOutcomes`
and the same completion chain. That chain applies the real score, stat log,
dynamic/development consequences, eligibility, season processing and injuries.
Neither the legacy engine nor the BACKGROUND tier supplies these results.

A pass-through spy observes eight actual `simulate` executions (four per world).
Every returned result is `engine: 'match-next'`, has `finalState.isComplete`, a
terminal `gameEnd`, the injected seed, and the score persisted in GameWorld.
No score is fabricated and no game is manually marked completed.

## Results and invariants

Per run: **1 day advanced, 4 games completed, 4 persisted MatchStatLogs**.
All IDs below share prefix `schedule-generated-season-0001-game-`:

- `0001`: seed `2565148243`, score **99–89** (user-controlled opening game).
- `0002`: seed `997934640`, score **104–76**.
- `0003`: seed `2779472725`, score **114–91**.
- `0004`: seed `2618951586`, score **84–73**.

Bootstrap and post-match canonical validation: **PASS**, using
`validateGameWorld`. Coach/team, competition/season, schedule and roster assertions:
**PASS**. All four matches were scheduled initially, finished with non-tied
scores, and persisted FAST stat logs. Each log contains at least ten player
lines; player/team roster references and summed team points agree with the final
result. Input immutability is also asserted.

Initial-world reproducibility: **PASS**. Final-world reproducibility: **PASS**.
Completed IDs, final scores and all persisted statistics: **PASS**.
SHA-256 over recursively key-sorted canonical JSON in both independent runs:

```text
initial 589479f65d671ed687cef1cb5bbd42b4f177452aba471d2c6bf531c137a86874
final   cda37fa9453a39fc8f417924fbd2b0f50d4b308485672c0b5d682e5ac07feb67
```

All enumerable canonical gameplay state is compared. Arrays retain their order;
no gameplay fields, IDs, decisions, injuries or timestamps are filtered. Direct
deep equality also compares both GameWorld objects. Only transient day-result
instrumentation (phase elapsed timings, outside GameWorld) is outside the world
comparison. Non-enumerable factory-derived values are not persisted canonical
JSON; no workaround rewrites gameplay differences.

## Breakpoints

The entire candidate list is inspected before each action and after the day.
Only this actual candidate occurred, identically in each run:

- Current date: `2032-10-01`.
- Level: `ACTION_REQUIRED`.
- Reason: `userGame`.
- Source kind: `USER_GAME`.
- Source ID: `schedule-generated-season-0001-game-0001`.
- Diagnostic: `User game schedule-generated-season-0001-game-0001 is scheduled for today and needs an explicit match action.`
- Attempted resolution: explicit `instantResult` with the derived match seed.
- Resulting status: **RESOLVED**; game completed and the candidate disappeared.

Other ACTION_REQUIRED/BLOCKING candidates: **none**. IMPORTANT/INFO observations:
**none**. No pending decisions are deleted, edited, or allowed through by policy.

Guard coverage first calls `assertSimulationMayAdvance(world, [])` and
`advanceGameDayWithResult(world, throwingSeedFactory, [])` on the unresolved user
game. They respectively throw `SimulationAdvanceBlockedError` and return
`BREAKPOINT_PREVENTED`, preserving world identity/state and executing no match
or entropy draw. A second focused test supplies diagnostic candidates through
the existing evaluator context: one BLOCKING and one ACTION_REQUIRED below the
user-game priority. The same candidate-filtering policy detects both. These are
guard inputs, not added canonical decisions and not encountered gameplay blockers.
Any unexpected mandatory non-user-game candidate terminates certification as
BLOCKED with its full diagnostic inventory; no general scripted-user policy exists.

## Nondeterminism inspection

Inspection covered world generation/initialization, schedule/query ordering,
application day processing, match preparation, real resolution, consequences,
and canonical ID factories. No uncontrolled nondeterminism affected the exercised
canonical state. Relevant findings and boundaries:

- `src/app/game/playUserGame.ts`, `createMatchSeed`: `crypto.getRandomValues`
  influences canonical outcomes by choosing a match seed. Existing explicit-seed
  and MatchSeedFactory seams control every match in certification. No global
  randomness is patched. Future replay should retain explicit seeds; no fix is
  required for M0.1.
- `src/domain/ids/EntityIds.ts`, `generateId` and exported `create*Id`/
  `createEntityId`: `crypto.randomUUID` would affect canonical identity if used
  to mint gameplay entities. No injected entropy seam exists there. The exercised
  factories and lifecycle use supplied deterministic IDs; no production call sites
  of those ID generators were found in App/Engine/Domain outside their definitions
  and exports. Future gameplay callers needing replay should accept deterministic
  ID creation; changing that authority is outside M0.1.
- `src/engine/world/WorldGenerator.ts`, `generateWorld` /
  `generateWorldFromRandom`: world RNG is supplied by configuration seed; IDs
  are sequence strings. Player truth/bio/staff generation use existing stable
  identifiers/seeded infrastructure. Canonical state is controlled; both initial
  worlds compare equal before any simulation.
- `src/engine/injury/PostMatchInjuries.ts`, `generatePostMatchInjuries`, and
  `InjuryCreation.ts`: occurrence, severity, duration and injury IDs derive from
  stable game/player/source IDs through existing seeded streams. These canonical
  consequences remain in the full comparison; no correction needed.
- `src/domain/date/GameDate.ts`, `addDays` / `isoWeekNumber`: `new Date(0)` or
  explicit `Date.UTC` inputs with UTC operations; no host current date/timezone
  enters canonical GameDate. No correction needed.
- `src/app/game/advanceGameDay.ts` (publication, validation, repair, match,
  schedule-integrity, media and breakpoint phase timing) and
  `src/engine/calendar/CalendarEngine.ts`, `advanceDayWithTrace` phase runner:
  `performance.now` produces transient `elapsedMs` only. It is noncanonical and
  does not feed gameplay. No correction needed.
- `src/app/game/WorldDbCertificationDiagnostics.ts`, diagnostic output-directory
  creation, and `src/presentation/match-next/audit/bt7/integration.ts`, audit
  duration measurements: `Date.now` is tooling/instrumentation, outside this
  executed path and canonical state. No correction needed for gameplay.
- Ordering: `CalendarQueries.getGamesOnDate` explicitly sorts Game IDs;
  ScheduleGenerator and the synchronous day path preserve this order. Match
  application is ordered; no worker/concurrency-dependent result ordering is used.
  `advanceGameDay` and `MatchNextLiveController.prepareRestartInbound` also use
  `localeCompare` for ID tie-breaks. Fixture IDs are ASCII with fixed-width
  sequences. No discrepancy occurred, but cross-locale/runtime certification is
  **NOT_RUN**; arbitrary future Unicode identifiers may warrant explicit ordering.
- Repository-wide production-source scan also found wall-clock calls in UI save
  timestamps (`CareerSaveControls`, `ui/App`), action-usage preferences, desktop
  clocks, roster/grid view IDs, and PCB tactics authoring metadata/path IDs.
  Those flows are not invoked by this headless scenario. Save-envelope/UI metadata
  is not this scenario's canonical gameplay state; any later certification that
  exercises authoring/save timestamps should define its canonical boundaries
  explicitly rather than normalize unexplained differences.
- `Math.random(` in all `src/`: **zero**. Forbidden React/Zustand/Tauri imports
  in Domain/Engine: **zero** in the checked import scan.

No unrelated nondeterminism was repaired. Known M0.1 blockers: **none**.
Long-horizon decisions, other worlds, save/load and worker/cross-runtime behavior
remain outside this first-match certification.

## Commands, discovery and exact test output

Normal command: `npm test`. Dedicated command: `npm run test:m0`.
The normal configuration retains Vitest's default exclusions and additionally
excludes `src/certification/m0/**`. The dedicated configuration inherits aliases
and Node environment, replaces inclusion/exclusion explicitly, and includes only
`src/certification/m0/**/*.test.ts`. It serializes files and sets test/hook timeouts
to 21,600,000 ms (six hours), configurable with positive integer
`M0_TEST_TIMEOUT_MS`. Example in PowerShell:
`$env:M0_TEST_TIMEOUT_MS = '600000'; npm run test:m0`.
The dedicated config is included in TypeScript's Node configuration checks.

Executed:

```text
npm run test:m0
Test Files  1 passed (1)
     Tests  2 passed (2)
Duration  27.11s (transform 5.08s, setup 0ms, import 6.31s, tests 20.43s, environment 0ms)

npm run test:m0 -- --reporter=verbose --disableConsoleIntercept
✓ src/certification/m0/FirstMatch.test.ts > M0.1 deterministic headless first production match > bootstraps two canonical worlds and persists identical real Match Next results without bypassing decisions 18860ms
✓ src/certification/m0/FirstMatch.test.ts > M0.1 deterministic headless first production match > detects every mandatory candidate, including one below the user-game priority 21ms
Test Files  1 passed (1)
     Tests  2 passed (2)
Duration  25.44s (transform 5.11s, setup 0ms, import 6.35s, tests 18.88s, environment 0ms)

Final run after adding exact production setup seed/ID verification:
npm run test:m0 -- --reporter=verbose --disableConsoleIntercept
✓ src/certification/m0/FirstMatch.test.ts > M0.1 deterministic headless first production match > bootstraps two canonical worlds and persists identical real Match Next results without bypassing decisions 23275ms
✓ src/certification/m0/FirstMatch.test.ts > M0.1 deterministic headless first production match > detects every mandatory candidate, including one below the user-game priority 17ms
Test Files  1 passed (1)
     Tests  2 passed (2)
Duration  30.80s (transform 5.89s, setup 0ms, import 7.27s, tests 23.29s, environment 0ms)

npm run typecheck
> bdm@0.1.0 typecheck
> tsc -b --pretty false
(no diagnostics; exit 0)
```

Every verbose run also printed `M0.1 evidence` with the exact hashes, seeds,
scores, breakpoint record, four stat logs and eight production executions recorded
above. All three certification invocations exited 0. Counts refer to two test
cases, not eight distinct tests; eight is the real engine execution count per run.

Exact final evidence output (one stdout line):

```text
M0.1 evidence {"status":"PASS","configuration":{"seed":20261106,"gender":"male","startDate":"2032-10-01"},"initialHash":"589479f65d671ed687cef1cb5bbd42b4f177452aba471d2c6bf531c137a86874","finalHash":"cda37fa9453a39fc8f417924fbd2b0f50d4b308485672c0b5d682e5ac07feb67","daysAdvanced":1,"seeds":[{"gameId":"schedule-generated-season-0001-game-0001","seed":2565148243},{"gameId":"schedule-generated-season-0001-game-0002","seed":997934640},{"gameId":"schedule-generated-season-0001-game-0003","seed":2779472725},{"gameId":"schedule-generated-season-0001-game-0004","seed":2618951586}],"completed":[{"id":"schedule-generated-season-0001-game-0001","result":{"homeScore":99,"awayScore":89}},{"id":"schedule-generated-season-0001-game-0002","result":{"homeScore":104,"awayScore":76}},{"id":"schedule-generated-season-0001-game-0003","result":{"homeScore":114,"awayScore":91}},{"id":"schedule-generated-season-0001-game-0004","result":{"homeScore":84,"awayScore":73}}],"statLogs":4,"breakpoints":[{"date":"2032-10-01","level":"ACTION_REQUIRED","reason":"userGame","sourceKind":"USER_GAME","sourceId":"schedule-generated-season-0001-game-0001","diagnostic":"User game schedule-generated-season-0001-game-0001 is scheduled for today and needs an explicit match action.","attemptedResolution":"instantResult with explicit seed","resultingStatus":"RESOLVED"}],"productionExecutions":8}
```

Discovery commands (no test execution):

```text
node node_modules/vitest/vitest.mjs list --filesOnly --json
node node_modules/vitest/vitest.mjs list --config vitest.m0.config.ts --filesOnly --json
```

The PowerShell verification parses each command's JSON, rejects nonzero exits,
checks no default entry matches `certification[/\\]m0`, and checks exactly one
certification entry matches `FirstMatch.test.ts`. Observed output, exit 0:

```text
Default suite files: 840; M0 files: 0
M0 suite files: 1
C:/BDM-worktrees/m0-season-headless-certification/src/certification/m0/FirstMatch.test.ts
```

Test isolation: **PASS**. Normal full-suite execution: **NOT_RUN**, as explicitly
requested by M0.1. Additional regression tests: **NOT_RUN**, since no production
seed seam changed.

Additional repository checks:

- `npm run build`: **PASS**, exit 0, 1,445 modules transformed, built in 13.94s.
  Vite reported circular-chunk reexports involving `updateGameWorld` and the
  unchanged `WorldDbV2Universe.ts` / `WorldDbV2Game.ts`, plus chunk-size warnings.
  No build settings or application code were changed to suppress them.
- `cargo fmt --check` from repository root initially exited 1 because the Cargo
  manifest is in `src-tauri`, not the repository root. Corrected invocation
  `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: **PASS**, exit 0,
  no output.
- `$env:CARGO_TARGET_DIR = 'C:/BDM/src-tauri/target'; cargo check --offline --manifest-path src-tauri/Cargo.toml`:
  **PASS**, exit 0. Exact output:
  `Compiling bdm v0.1.0 (C:\BDM-worktrees\m0-season-headless-certification\src-tauri)`;
  `Finished dev profile [unoptimized + debuginfo] target(s) in 24.83s`
  (Cargo renders backticks around `dev`). Existing cached artifacts were reused;
  offline execution prevents dependency fetching.
- `rg -n 'Math\.random\(' src`: no matches, **PASS**.
- `rg -n 'from [\x27\x22](react|zustand|@tauri-apps)' src/domain src/engine`:
  no matches, **PASS**.
- `git diff --check`: **PASS**. Final diff reviewed against M0.1: test/config/docs
  only; no production code, domain contract, save schema, UI, ratings or rule change.

## Files modified and next scope

- `package.json`: dedicated `test:m0` command.
- `vitest.config.ts`: explicit M0 exclusion with default exclusions preserved.
- `vitest.m0.config.ts`: isolated configurable long-running Node certification.
- `tsconfig.node.json`: typecheck the dedicated Vitest config.
- `src/certification/m0/FirstMatch.test.ts`: bootstrap, strict breakpoint guards,
  production-match execution, persistence/invariants and independent replay.
- `docs/certification/m0/M0_BASELINE.md`: this evidence report.

Recommended next task: M0.2, extending the same isolated suite to the next approved
multi-day/season scope with an explicit mandatory-decision policy and breakpoint
inventory. M0.2–M0.6 are **NOT_RUN** and are not implemented by this milestone.
