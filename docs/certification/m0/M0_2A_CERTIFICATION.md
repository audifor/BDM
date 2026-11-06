# M0.2a certification — scripted decisions and timing

Certification/test status: **PASS**. Gameplay-capability scope: exactly the three
registered canonical resolvers, plus explicit safe stopping for everything else.
This is **M0.2a**, not full M0.2, full-season certification or M0.2b implementation.

## Verified source and delivery

- Repository: `https://github.com/audifor/BDM.git`.
- Worktree: `C:/BDM-worktrees/m0-season-headless-certification`.
- Existing branch: `test/m0-season-headless-certification`.
- Verified pre-edit HEAD/M0.1 SHA:
  `16512bafd624c904ec1ca95c008733671b6938e2`, clean working tree.
- The branch tracked `origin/test/m0-season-headless-certification` and
  `git ls-remote --heads origin test/m0-season-headless-certification` returned
  that identical SHA. No branch recreation, reset, rebase, merge or cherry-pick.
- The exact M0.2a certification commit SHA is the introducing commit of this
  report: `git log -1 --format=%H -- docs/certification/m0/M0_2A_CERTIFICATION.md`.
  This avoids an impossible self-referential commit hash inside its own contents.
  The delivery response records the full pushed SHA; verify it against
  `git ls-remote --heads origin test/m0-season-headless-certification`.
- The user explicitly authorized committing and pushing **only this branch**,
  superseding the repository's general no-push default. Other worktrees remain
  untouched. No production code, dependency or Vitest configuration changed.

Before editing, the unchanged M0.1 suite ran with
`npm run test:m0 -- --reporter=verbose --disableConsoleIntercept`:
**1 file, 2 tests passed**, exit 0, duration 27.14s. Its initial/final hashes and
four scores matched the original report exactly.

## Minimal infrastructure and mutation guard

`ScriptedResolutionSession.step` receives a canonical GameWorld, validates it and
reads the complete ordered production evaluator list. It classifies known versus
open-extension reasons, preflights **every** mandatory candidate for registered
resolver/source kind/ownership/target/canonical pending record, and applies only
the first mandatory candidate when all preconditions permit progress. Unsupported
BLOCKING or lower-ranked ACTION_REQUIRED candidates stop before any action.

The typed registry contains only `userGame`, `mediaOpportunity`, `coachJobOffer`.
There is no general gameplay framework, automatic acknowledgement, allowed-reason
list, date advancement, or collection write. The return includes before/after
candidate lists, operation/outcome, canonical hashes, generated obligations,
structured blockers and `mayAdvance`. The latter can be true only with no
remaining mandatory candidate and no failed action. A READY result retains
IMPORTANT/INFO observations without declaring them resolved.

After a real operation, the runner validates the returned world, reevaluates
breakpoints, checks the specific canonical terminal state and requires the
original mandatory identity to disappear. A changed object or hash alone does
not count as success. Failed validation/action or no progress returns BLOCKED.
The default limits are **16 attempted actions per game date**, **2 attempts per
date/reason/source-kind/source-ID identity**, and **64 overall attempts**. Limits
are configurable positive integers; failed attempts consume their budgets.
No-progress stops on its first occurrence; an explicit caller retry still cannot
exceed the identity cap. `run` stops immediately at READY or BLOCKED.

Blockers contain level, reason, source kind/ID, current date, original diagnostic,
exact cause, known/extension classification, full-world hash, user coach/team and
available source entity evidence. The canonical world itself is returned intact
when no action runs; there is no unknown-decision fallback.

**Executable setup/resolution separation:** production operations return immutable
new GameWorld values. Tests recursively deep-freeze the incoming world's canonical
objects/collections before each of the three resolvers, and before every step of
both combined runs. A direct attempted status assignment throws TypeError. The
original input hash remains unchanged after the real call. Setup helpers are in
`ResolutionScenarios.ts`; only they create/attach scenario entities through
canonical factories/services. Resolution imports/calls the three legitimate
operations and never calls a setup helper or writes canonical collections.

Fault tests replace only the certification registry callback with a no-op or
throwing callback; they do not mock or imitate any canonical service's effects.
The three capability tests and combined replay use the actual services/engine.

## Root seed and exact scenario setup

Root seed: **20261106**. `M0Support.ts` shares the existing M0.1 bootstrap,
canonical serialization/hash and match-seed derivation without changing their
default behavior. Match seed remains FNV-1a via existing `hashStringToSeed`:
`m0-match-v1:20261106:<seasonId>:<competitionId>:<gameId>:<gameDate>`.
The opening user game uses seed **2565148243**. No crypto/global randomness patch.

### userGame

- SETUP: unchanged eight-team male `generateWorld` configuration starting
  `2032-10-01`, real 56-game/14-round schedule attached through `updateGameWorld`.
  Valid user/Staff/team/season relationships; all matches initially scheduled.
- Expected before: ACTION_REQUIRED / USER_GAME /
  `schedule-generated-season-0001-game-0001`, owned by user coach/team,
  target `{ gameId }`. Diagnostic: `User game schedule-generated-season-0001-game-0001 is scheduled for today and needs an explicit match action.`
- RESOLUTION: `app/game/matchResolution.instantResult` with the deterministic seed.
  Real Match Next FAST preparation, simulation and result/stat completion.
- After: original obligation absent; completed score **99–89** and FAST stat log
  persisted. Frozen source still scheduled. Canonical validation **PASS**.
  Standalone capability **PASS**.

### mediaOpportunity

- SETUP: original bootstrap; recreate the existing scheduled user Game with
  `createGame({ ...game, stakes: 'important' })`, attach through `updateGameWorld`,
  then call `createPreMatchMediaOpportunity`. This is valid scenario configuration,
  not a production rule change or a pending-state mutation during resolution.
- Expected before: ACTION_REQUIRED / MEDIA_OPPORTUNITY /
  `media:pre:schedule-generated-season-0001-game-0001:pressure`, owned by the user
  coach, target `{ opportunityId }`. Diagnostic: `Media opportunity media:pre:schedule-generated-season-0001-game-0001:pressure is still pending and must be answered or skipped.`
- RESOLUTION: `engine/media/MediaEngine.skipMediaOpportunity`.
- After: the same record remains with status **skipped**, media reservedCount
  rises to **1**, and its candidate disappears. The still-pending user game remains
  visible and `mayAdvance` stays false. Validation/frozen-input capability **PASS**.

### coachJobOffer

- SETUP: the same supported generator with `starterVacancyTeamIndexes: [1]`.
  The user remains employed by team 0001; team 0002 has a legitimate vacancy.
  `createCoachJobOpeningForTeam` creates the opening; `applyUserCoachForJob`
  executes identify -> scheduled/completed interview -> offer via the existing
  canonical career flow. World validation passes before any resolution.
- Expected before: ACTION_REQUIRED / COACH_JOB_OFFER /
  `coach-offer:coach-job:generated-team-0002:2032-10-01:1:generated-coach-0001:1`,
  owned by the user coach, target `{ offerId }`. Diagnostic: `Coach job offer coach-offer:coach-job:generated-team-0002:2032-10-01:1:generated-coach-0001:1 is awaiting the user's response.`
- RESOLUTION: `app/coachCareer/CoachCareerService.declineCoachJobOffer`.
- After: offer **declined**, associated candidacy **rejected**, candidate absent.
  Opening/interview, employment, career history, team assignment and head-coach
  Staff assignments remain unchanged. Validation/frozen-input capability **PASS**.

## Multiple obligations and independent replay

Two independently constructed combined scenarios add the important-game/media
setup to the real pending-offer fixture. Initial canonical states compare equal.
Each resolution step executes exactly one operation in the production ordering:

1. Before: offer, pre-match media, user game. Decline offer. After: media, game.
2. Skip pre-match media. After: user game.
3. Instant-result user game. After: **new post-match media obligation**,
   `media:post:schedule-generated-season-0001-game-0001:performance`.
4. Skip that real newly generated media record. After: no mandatory candidate.
5. Read-only READY step, `mayAdvance=true`; no extra scripted action.

The generated post-match candidate has level ACTION_REQUIRED, source kind
MEDIA_OPPORTUNITY, user-coach ownership and an opportunity-ID target. Its diagnostic
is `Media opportunity media:post:schedule-generated-season-0001-game-0001:performance is still pending and must be answered or skipped.`
It is recorded under `generatedMandatory`, then resolved canonically, not deleted.

Full before/after candidate records, operation/outcome and canonical hashes are
emitted as `M0.2a evidence`. Both runs' complete final worlds **and complete step
records** compare equal. Observed SHA-256 chain:

```text
initial       367c9cd8e4662f0e0f7df3e845423c0ddefb14b532e593dfdc28dd73f9d484c9
offer decline b9616dc1a9850fe082de48db56fbb592b90b9c767b577f949d40fa190bbd08fa
pre skip      6b2c943d7bcff1799ab73ea179dd7c2a944daf2d45ec38431a19c64d298090d7
match         36ddaaad0c369a8f6c8d500e3a44430235528d8354828974b894783d23e7ce80
post skip     ac44ce0b09fe17bfaa57d67ff6b63b015b8b355df55c3053470c61da3c243854
```

No canonical fields are excluded to accommodate instrumentation.

## Inventory, unsupported capabilities and guard evidence

`M0_BREAKPOINT_INVENTORY.md` records all **18 actual built-in reasons**, levels,
sources, ownership, triggering state, targets, existing operations, stop policy,
user-resolvability and reason-specific M0 coverage. A source-AST regression checks
conditional reason expressions and every document entry; `additionalCandidates`
is separately classified as an open extension boundary.

- Registered resolution coverage: userGame, mediaOpportunity, coachJobOffer:
  **PASS**, real operations, valid frozen worlds and terminal-state evidence.
- Known-unregistered mandatory coverage: a factory-produced due RTP injury
  yields both userGame and returnToPlayReview. Preflight notices the lower-ranked
  RTP obligation and returns KNOWN_REASON/MISSING_RESOLVER before playing the
  game, with injury record/world hash. Guard test **PASS**; RTP gameplay capability
  remains **BLOCKED**.
- Unknown ACTION_REQUIRED and BLOCKING diagnostics: UNKNOWN_EXTENSION /
  MISSING_RESOLVER, original source/date/diagnostic retained, no action or world
  change. Both guard tests **PASS**; capability **BLOCKED**.
- IMPORTANT/INFO extension diagnostics remain ordered observations; a valid
  generated world before schedule attachment is READY without resolving them.
  This tests classification, not all eight built-in observation workflows.
- Source/ownership/action-target mismatch: fail preflight, no dispatch.
- Ineffective/no-op resolver: NO_PROGRESS_OR_UNRESOLVED_OBLIGATION and no loop;
  a third explicit unchanged-identity attempt hits BREAKPOINT_ATTEMPT_LIMIT.
- Throwing callback: CANONICAL_ACTION_FAILED with exact error text; original
  obligation remains. Configured daily/overall limits stop before the next action.

Seven mandatory gameplay paths remain unregistered/BLOCKED in M0.2a:
`returnToPlayReview`, `minimumRoster`, `draftPick`, `tradeNegotiationResponse`,
`seasonComplete`, `unsupportedCompetitionLifecycle`, `scheduledGameInPast`.
Only RTP has a new executable unresolved canonical scenario here; the other six
are inventoried/recognized with reason-specific scenarios **NOT_RUN**. Passing
guard tests are not capability certifications. The six IMPORTANT and two INFO
reasons remain observations; they are not falsely reported as resolved blockers.

## Timing and limitations

The appended performance section of `M0_BASELINE.md` specifies exact measurement
boundaries and raw stdout. Dedicated-run observations, milliseconds:

- Run 1: bootstrap **60.917**, user match **4739.691**, day advance **10584.464**,
  completed matches **4**, scenario total **15400.209**.
- Run 2: bootstrap **19.543**, user match **2866.949**, day advance **9006.527**,
  completed matches **4**, scenario total **11902.848**.
- Component-wise medians: **40.230**, **3803.320**, **9795.495**, **4**,
  **13651.528**, respectively.

The day interval includes the remaining three matches; the user match is counted
once. Timings are outside canonical state. Individual timings for those three
matches are **NOT_RUN**, not estimated. Warm-up, host load, two samples and one
day prevent reliable season-throughput claims. M0.1 canonical hashes and assertions
remain intact. Cross-runtime, worker, save/load and season behavior are not certified.

## Validation and exact files

Final dedicated run (exit 0):

```text
npm run test:m0 -- --reporter=verbose --disableConsoleIntercept
 ✓ src/certification/m0/FirstMatch.test.ts > M0.1 deterministic headless first production match > bootstraps two canonical worlds and persists identical real Match Next results without bypassing decisions 27493ms
 ✓ src/certification/m0/FirstMatch.test.ts > M0.1 deterministic headless first production match > detects every mandatory candidate, including one below the user-game priority 23ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > resolves userGame with the production Match Next action and preserves a frozen input 4862ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > skips the real pending media opportunity without deleting its record 70ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > declines a real offer and rejects its candidacy while preserving the existing club assignment 78ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > fails closed for an unknown ACTION_REQUIRED candidate before executing any known action 50ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > fails closed for an unknown BLOCKING candidate before executing any known action 38ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > recognizes a real unregistered mandatory RTP obligation and retains its canonical evidence 32ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > retains IMPORTANT and INFO observations without resolving or blocking them 20ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > processes all three obligations one at a time in production order, records generated obligations, and replays identically 7521ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > stops immediately on an ineffective action and caps repeated attempts at two 121ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > records a thrown action failure without discarding the unresolved obligation 50ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > enforces configured action bounds {"maxActionsPerDay":1} 78ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > enforces configured action bounds {"maxActions":1} 74ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > rejects mismatched ownership evidence before dispatch 27ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > rejects mismatched source evidence before dispatch 26ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > rejects mismatched target evidence before dispatch 26ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > makes accidental direct canonical mutation throw at the frozen resolution boundary 20ms
 ✓ src/certification/m0/ScriptedResolution.test.ts > M0.2a scripted canonical resolution > keeps the complete reason inventory aligned with the actual evaluator, including conditional reason names 34ms
 Test Files  2 passed (2)
      Tests  19 passed (19)
   Start at  22:54:33
   Duration  52.01s (transform 7.28s, setup 0ms, import 10.85s, tests 40.65s, environment 0ms)
```

This is **17 M0.2a tests plus the two preserved M0.1 tests**, all passing. No
service effects were mocked, coverage deleted or assertions weakened.

Focused production regressions (exit 0):

```text
npm test -- src/engine/media/MediaEngine.test.ts src/app/coachCareer/CoachCareerService.test.ts src/app/game/SimulationBreakpoints.test.ts
Test Files  3 passed (3)
     Tests  24 passed (24)
Start at  22:53:01
Duration  45.61s (transform 18.35s, setup 0ms, import 24.94s, tests 46.55s, environment 0ms)
```

TypeScript validation (exit 0, no diagnostics):

```text
npm run typecheck
> bdm@0.1.0 typecheck
> tsc -b --pretty false
```

Isolation checks (exit 0):

```text
node node_modules/vitest/vitest.mjs list --filesOnly --json
node node_modules/vitest/vitest.mjs list --config vitest.m0.config.ts --filesOnly --json
Default suite files: 840; M0 files: 0
M0 suite files: 2
C:/BDM-worktrees/m0-season-headless-certification/src/certification/m0/FirstMatch.test.ts
C:/BDM-worktrees/m0-season-headless-certification/src/certification/m0/ScriptedResolution.test.ts
```

The PowerShell checks parse JSON and assert the projected file-list counts.
Normal suite exclusion and dedicated inclusion remain unchanged in configuration.
`git diff --check` passes. Source scans find zero `Math.random(` calls and zero
React/Zustand/Tauri imports in Domain/Engine. Build, Rust and full repository
suite: **NOT_RUN for M0.2a**, which changes only certification source/docs and
uses the requested focused validation scope. No new dependency/network install.

M0.1 regression: **PASS**, identical initial/final canonical hashes and all prior
assertions. M0.2a: **PASS** for its stated acceptance criteria; the seven listed
unregistered gameplay capabilities remain **BLOCKED**. Delivery is one atomic
commit on the existing branch, followed by the explicitly authorized push and
verification of its remote SHA and clean isolated working tree.

Changed files (certification-only):

- `src/certification/m0/FirstMatch.test.ts`: additive independent timing and shared
  helper imports; original assertions retained.
- `src/certification/m0/M0Support.ts`: unchanged-default bootstrap, canonical hash
  and existing match-seed policy shared by the two certification files.
- `src/certification/m0/ResolutionScenarios.ts`: explicit valid SETUP helpers and
  recursive mutation guard.
- `src/certification/m0/ScriptedResolution.ts`: three-action registry, strict
  resolution steps/records and bounded run.
- `src/certification/m0/ScriptedResolution.test.ts`: real resolution, replay,
  fail-closed guards, limits, mutation and evaluator-inventory coverage.
- `docs/certification/m0/M0_BREAKPOINT_INVENTORY.md`: complete current inventory.
- `docs/certification/m0/M0_BASELINE.md`: appended performance evidence only.
- `docs/certification/m0/M0_2A_CERTIFICATION.md`: this report.

Recommended M0.2b scope: approve deterministic policies and legal scenario tests
for the remaining user-action paths (starting with RTP and then draft/trade/roster
and supported season checkpoints). Preserve safe stopping for unsupported
competition lifecycles and schedule-integrity defects unless separate product/
production repair work is explicitly authorized. Do not assume every BLOCKING
condition can be solved by scripted acknowledgement.
