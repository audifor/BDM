# BS15I Population, Save & Long-Horizon Certification

> Historical attempts below are preserved. Final Y30 certification is PASS; see [final long-horizon closure](BS15I_LONG_HORIZON_CLOSURE.md) and `BS15I_LONG_HORIZON_RESULTS.json`.

**Status:** In progress; final pass gate remains open until the integrated and desktop runs complete. The five-year gate was reopened after the NCAA provenance-emergence PASS on 6 October 2026; no replacement run has started.\
**Base:** `8d0e128181b39d1d0354ca3067b55a51428db213`\
**Worktree:** `C:\BDM-BS15I` (`bdm-stage2-bs15i-population-save-long-horizon`)

## Certification approach

The integrated certification uses the full `createNewGame` world, deterministic seed `15015`, and checkpoints at Year 0, 1, 5, 10, 25 and 30. Scheduled games and competition participants are retained so canonical match results can complete seasons and drive pathways. At each checkpoint the reload branch is serialized with Save V4, loaded, checked against the uninterrupted branch by semantic identity/cohort/materialization/roster/enrollment/Draft/Portal/ruleset snapshots, then continued. World integrity checks cover unique Player and Person IDs, one Person per Player, valid Player references, and unambiguous active roster membership. Save size, serialize/load time, phase timings, active age bands, and latent/materialized supply are collected.

The long-horizon test driver is test support over `simulateUntilDate`, competition lifecycle, and Save V4. It advances in 30-day windows for progress and watchdog checks, keeps canonical match resolution enabled, and supports requested checkpoint, save/reload, and deep-integrity dates. Repository inspection found no approved fast/background match simulator: both instant-result and scheduled-world resolution use the possession-level MatchEngine. The driver does not fabricate results or bypass season authorities. A faster background match model remains an architecture decision because it would define a new result and player-stat simulation contract.

## Long-horizon performance rescue

**LONG-HORIZON ATTEMPT 1 — ABORTED FOR CERTIFICATION PERFORMANCE (not a product failure).** The original 30-year run was stopped after 2 h 35 m 51 s wall time, approximately 2 h 33 m CPU time, and about 743 MB working set. It emitted no externally visible checkpoint marker; the simulated year, player count, save size, and population metrics were therefore unavailable. No exception or assertion failure had been observed before termination.

A full-world profile used 456 Players, 178 initially scheduled games, and 8 seasons. One canonical match took 0.35–0.43 s in isolated smoke samples. A 60-day canonical run resolved 56 games and completed in 121.6 s (about 2.03 s per simulated day). Its two 30-day segments took 40 s and 81 s; process RSS was approximately 242 MB initially, 374 MB after the first segment, and 367 MB after the second, consistent with collection between samples rather than a demonstrated leak. Player count remained 456. No Save V4 checkpoint ran in this profile.

| Cost center | 60-day time | Invocations | Mean | Growth evidence |
|---|---:|---:|---:|---|
| Match/world resolution | 41.4 s | 33 match days; 56 games | 1.25 s per match day, 0.74 s per game | Game count and result/stat application increase with completed fixtures. |
| Scheduled training | 33.5 s | 60 daily phase calls | 0.56 s per day | Rose from 8.35 s in segment 1 to 25.20 s in segment 2 as training activity increased. |
| AI training planning | 20.6 s | 9 weekly calls | 2.29 s per call | Rose from 5.03 s across 4 calls to 15.57 s across 5 calls as planning activity increased. |
| Scouting intake (next) | 14.3 s | 60 daily calls | 0.24 s per day | Rose from 5.11 s to 9.20 s between segments. |

Season lifecycle coordination took 0.63 s across 63 calls. Talent cohort generation, materialization, annual development, retirement, save serialization, and checkpoint integrity were not exercised in this 60-day window. A linear projection from the observed 2.03 s/day is about 6.2 hours for 30 years, before allowing for growing game and historical-record collections; this is a lower-bound warning, not an SLA or a valid long-horizon estimate. The 5-, 10-, and 30-year gates remain unrun until these measured costs are reduced.

The validator’s historical scheduled-training collision check was also changed from a world-wide scan for every session to same-team/date and same-player/date candidate indexes. Its order and collision semantics are preserved. The 60-day measurement still shows scheduled training as a top cost, so that change alone does not resolve the certification runtime.

## Changes under certification

- Annual supply creates a deterministic, explicitly simulated cohort on 1 July for each represented country and gender. Cohort supply remains latent and does not materialize Players automatically.
- Career end is an idempotent shared lifecycle authority. It preserves Player and Person identity/history, removes active roster membership, closes active registrations/enrollments and contracts, and retires active Portal/recruiting state. A structural age safeguard applies after age 45; the limit is not a tuned demographic claim.
- Save V4 persists career-end markers additively and defaults the new collection for older V4 payloads.
- Future CollegeRulesets are derived per season with `SIMULATED_CARRY_FORWARD` provenance and a source ruleset ID. Retired Players are excluded from active eligibility, scouting, portal, draft, and free-agent projections.

## Checkpoint metrics

Populate this table from the completed integrated run. Player counts include retained historical Players; active means no career-end marker.

| Year | Persons | Players | Active | Retired/inactive | Latent capacity | Materialized | Youth | College | Pro | Portal active | Draft candidates | Active enrollments | Save bytes | Save ms | Load ms |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| 1 | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| 5 | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| 10 | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| 25 | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| 30 | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |

The integrated test also logs the age-band distribution, audit-only rating average, rostered transition counts, per-checkpoint mean simulation time for the two paths, a one-day advance sample, and annual supply duration. No absolute save-size or timing threshold is imposed; growth and scaling must be interpreted from observed metrics.

## Validation ledger

| Gate | Result | Evidence |
|---|---|---|
| Annual cohort cadence and bounded materialization | Pending | `AnnualTalentSupply` focused tests and integrated checkpoints |
| Retirement and preserved identity | Pending | `PlayerCareerLifecycle` focused tests; integrated checkpoints |
| Identity/reference integrity | Pending | integrated integrity scanner |
| Save V4 semantic round-trip and continuation | Pending | integrated checkpoint comparisons; focused V4 fixtures |
| Future CollegeRuleset carry-forward | Pending | future eligibility fixture and integrated checkpoint ruleset IDs |
| BS15B-H focused regression subset | Pending | selected Talent Supply, youth, eligibility, recruiting, Portal, draft, scouting/UI suites |
| Long-horizon profile | PASS | full-world 60-day profile; aggregate subsystem timings and progress markers captured |
| 5-year continuous/reloaded simulation | REOPENED; run pending | Prior attempt passed Year 1 and stopped in Year 2 on a canonical active-contract/signing-transaction invariant; no replacement run has started |
| 10-year continuous/reloaded simulation | Pending | deferred until the 5-year gate and scaling are acceptable |
| 30-year continuous/reloaded simulation | Pending | deferred until performance recovery; no raw 30-year rerun |
| Second deterministic seed | Pending | planned five-year run |
| Production build and typecheck | PASS | existing baseline validation before rescue changes; rerun after implementation |
| Diff whitespace check | PASS | `git diff --check` |
| Tauri desktop launch | PASS | `npm run tauri -- dev`; Vite ready, Rust dev profile finished, and `target\\debug\\bdm.exe` launched |

## Save V4 stall investigation

The prior broad test batch including `GameWorldSaveV4.test.ts` did not finish within several minutes. The V4 suite by itself also remained CPU-active past three minutes, so it was interrupted once rather than repeated. A representative CollegeRuleset V4 round-trip passed in 1.2 seconds, and the career-end V4 round-trip passed in the focused career lifecycle suite. Current evidence points to cumulative fixture cost/batch contention rather than an isolated serializer deadlock. This does not establish full-suite performance; exact targeted Save V4 coverage will be recorded in the final ledger.

## Known pre-existing baseline debt

The supplied BS15I brief identifies six historical `GameWorldSaveV1` failures and one `SeasonContentActivation` scheduled-game-in-the-past failure as reproduced on the clean base. They are not counted as BS15I regressions unless canonical Save V4 or the integrated long-horizon path reproduces them. Focused validation and the final result will record any observed overlap.


## Latest bounded performance gate (5 October 2026)

See [BS15I_90_DAY_PERFORMANCE_RESCUE.md](BS15I_90_DAY_PERFORMANCE_RESCUE.md) and the adjacent raw JSON records. The latest matched 90-day windows improved from 47.44 / 108.53 / 132.86 seconds to 23.25 / 27.92 / 22.30 seconds. Runtime fell by approximately 74.6%, while all 160 canonical games and 1,874 training executions remained. The dominant growth came from repeated historical evidence reconstruction, serialization, and world validation; ordered daily/weekly batches retain append guards and final canonical validation.

The earlier 56-game figure and its derived per-game mean are superseded: scheduled-count subtraction undercounted newly generated fixtures. Correct completed-game deltas are 136 over the first 60 days and 160 over 90 days.

The original Rescue 1 bounded profile was stable but had a 2.48-hour thirty-year estimate. Rescue 2 reduced matched 90-day runtime by about 33% and lowered the straight-line estimate to 99.1 minutes; the thirty-year run remains prohibited because this exceeds the 90-minute limit. Under the improved bounded gate, the prior five-year continuous/reloaded run started. Its Year 1 Save V4 and deep-integrity checkpoint passed; it stopped during Year 2 on a canonical active-contract/signing-transaction invariant. The five-year gate was reopened after the NCAA intake provenance-emergence gate passed on 6 October 2026; a replacement five-year run is pending. Ten-year and thirty-year runs have not started. Original BS15I PASS remains pending, and this is not a full certification claim.


### Final bounded-rescue validation

- 78 focused tests PASS across GameWorld, TrainingSchedule, scheduled Training execution/history, AI Training planning, Training modules, territory Scouting, and the one-day canonical driver with V4 reload/integrity.
- Production `npm run build` PASS, including TypeScript compilation and Vite output.
- `git diff --check` PASS.
- Eight full coaching plans matched the previous implementation. Full-world Training/planning/territory comparisons against sequential implementations passed before temporary reference modules were removed from the source tree.
- Rescue 2 match snapshot equivalence passed for three representative AI-vs-AI games, including results, complete player stat logs/minutes, substitutions, fatigue, injuries, season state and completed fixtures.
- Focused Match/Training tests passed (67 tests across six files, then 34 tests across four files including the one-day Save V4 certification); two other focused tests remain failing as documented in the Rescue 2 report.
- The Rescue 2 five-year run is incomplete: Year 1 checkpoint passed, then a canonical invariant stopped the run during Year 2. No ten-/thirty-year or second-seed PASS and no new Tauri launch are claimed. Existing uncommitted BS15I work and the current branch were preserved.
