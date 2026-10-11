# BS15 / BS16 final / BS17D convergence V3.1 certification

**PASS · BS15/BS16/BS17 CONVERGENCE V3.1 FINAL CLOSURE** (the earlier Save V4 timeout caveat is closed, see Final timeout closure).

## Authority and reproducibility

The isolated branch is `integration/bs15-bs16-bs17-final-v3-1` in `C:\BDM-INTEGRATION-BS15-BS16-BS17-V3-1`.
The user explicitly approved STAFF-CONTRACT V4-01 in the V3.1 mandate on 2026-10-10.
Source branches and worktrees are read-only. No main merge, push, fetch, pull, dependency installation, BS17E/F work or new product decision was performed.

- BS15 original: `94c077092224a9f75c861a853d9d52fceae526fe`.
- BS15/V2 frozen integration: `fbe788ce01f1dd34fc40b360b4661ebaad63457c`.
- BS16 final: `680d7aa25534a03f1ed10a6041be9543cb5470a8`.
- BS17D final and starting point: `8be14ef133dcddccf30d961bec0964a8dca69236`.
- Common Finance base: `97c58b98b9192a569f30bdfd8b63565f0b02a744`.
- First unverified integration merge: `cf43aaee4ed079dd6e0238bfdda3b21f99ad392f` (parents BS17D and BS16 final).
- Intermediate candidates: `db16c7972f6dd0fd011cf483c20f8f3849be9a13` (production-identical to the next), `d47591a7baffabb3c4866e4ef5cd2d92adfc6e30` (test-only fixture delta, production tree identical to `db16c79`).
- Closure fixes (test-only): `fee3d75dd030ef048c0aa8b11f2893f1ff199c8b`.

BS15/V2 `fbe788ce`, BS16 final `680d7aa` and BS17D `8be14ef` were verified with `git merge-base --is-ancestor` against `d47591a`. The certification commit adds only this report. Its SHA is `git log -1 --format=%H -- docs/strengthening/BS15_BS16_BS17_CONVERGENCE_V3_1_CERTIFICATION.md`.

## STAFF-CONTRACT V4-01 and the original failure

**STAFF-CONTRACT V4-01 · NO SYNTHETIC RENEWAL ON CURRENT V4 LOAD**:
current valid V4 loading preserves contractual terms, identity, history and existing economic obligations.
It cannot hire Staff, create an absent salary contract, replace an expired contract, extend its term or change its salary.
Staff/Contracts authors contractual sources; Finance recognizes those sources; Calendar supplies the processing date.

The original BS16 ninth longitudinal case serialized an employed Staff person without a current salary contract.
Its reload expected one newly recognized payroll expense. The red reproduction retained the original expectation and failed with expected expense count 1, received 0.
`deserializeGameWorldV3` historically calls `ensureStaffContractStructure`: for employed Staff without an active or future contract, that helper creates a role-band salary contract with a two-year term. If the historical employment start would make that term expired, the helper starts the new contract on the current date. In a current V4 load this is a synthetic hiring/renewal, not reconstruction of a persisted obligation.

BS15 authority commit `a20ea256216d1256b707591103f7beceed27ea57` explicitly made V4 call V3 structural parsing with `backfillStaffContracts: false` while retaining historical migration enrichment.
The integrated V4 loader keeps that boundary. `deserializeGameWorldSaveV4` dispatches schema 4 directly to it. The application `loadSavedGame` adds Board and canonical Finance foundation checks, with no Staff contract authoring. Current V4 reference validation remains strict.

The reconciled ninth case retains the complete ten-year fixture, its other eight cases, replay identity and terminal reservation checks. It separately proves that current V4 loading and double loading do not invent contracts or expenses, then supplies an explicit legitimate EUR 65,000 Staff contract before the economic event. Finance must recognize exactly one EUR 6,500,000-minor-unit expense, one payable, contract provenance and balanced current-date postings; reprocessing is an identity no-op. The original Finance test blob is `6221998ac67461644156ab466c049a4eed909dc5`; the reconciled blob is `faeb5828017d511cf35f6305554495f573a202bc`.

`StaffContractV4Policy.test.ts` independently covers:

- A: real contract preserved on load; Calendar recognizes the exact due payroll once, with commitment, payable and balanced ledger.
- B: expired terms and previously recognized obligations survive; loading and processing cannot fabricate replacement payroll.
- C: legitimate employment without a salary contract survives; neither loading nor the next Calendar day creates salary facts.
- D: the existing salary-bearing Staff reassignment command authors a deterministic replacement and terminates the prior contract before Finance recognizes the new EUR 70,000 source. A dedicated standalone renewal command remains a domain limitation.
- E: supported historical V3 migration retains its version-authorized backfill; repeated current V4 loading does not repeat it, including after expiry.
- F: valid, expired and missing-contract worlds keep exact contractual/economic/person/history facts through two loads.
- Invalid Staff references are rejected rather than relaxed to make the policy pass.

## Semantic merge and adversarial correction

Nine conflicts were resolved individually:

- `createNewGame.ts`: BS15 Talent, Recruiting, Portal and aid policies coexist with explicit final Finance currency and annual authorization policies.
- `AiRosterMaintenance.ts`: available-player counting, pending binding commitments and college intake coexist with canonical Finance decisions and structured blockers.
- `MarketService.ts`: shared deterministic market terms coexist with atomic final Finance capacity binding and ownership checks.
- `GameWorld.ts`: BS15 validation scope/transaction/index behavior coexists with financing agreements, drawdowns and capital contributions. Full and incremental updates reject invalid new references.
- `GameWorldSaveV4.ts`: all three source families persist together; current V4 disables Staff contract backfill.
- `FinanceActivationLoad.test.ts`, `FinanceFoundation.test.ts`, `FinanceOpeningState.test.ts`, `FinancePersistence.test.ts`: stronger identity/economic preservation checks remain; final Finance payroll and truthful missing-profile behavior are accepted, and pre-foundation fixtures remove all dependent canonical Finance fields consistently.

The final Finance gameplay seam also replaces inherited legacy affordability checks in Professional Pathways, including aggregate minimum-roster completion. It preserves market quotes, identity, Talent and Draft rules and uses the existing structured Finance decision.

The first wider focal run exposed a real initialization interaction: the completed-year NCAA sport budgets were created before current-period Finance activation. Finance correctly treated existing canonical budget history as authoritative and declined a legacy initial seed; those historical sport budgets lacked current Finance period linkage, so salary authorization and its rollover were absent for college organizations. The fix moves only historical sport-budget creation after initial Finance activation. It preserves both sources: 48 current-period salary authorizations and the independent completed-year college sport budgets, with no new cash or global renewal default. The shipped activation test verifies both sets explicitly, and all-organization rollover and salary conversion checks remain exact.

Positive signing/hiring fixtures were reconciled with final Finance by executing declared financing sources in the club's canonical currency and approving explicit test salary limits before commands. A settled opening state is not overwritten, and raising legacy pools is not an economic authority. Calendar, AI repair, Staff lifecycle and undrafted pathways keep their original contract/identity/rejection/exactly-once assertions. Negative financing and liquidity checks remain covered. Initial red results are preserved alongside the final runs.

No formula, RNG implementation, Finance policy or simulation lifecycle was copied into the UI. Facilities/Training/Medical/Calendar production source remains BS17D. The only production difference after the first candidate is the narrow prototype initialization ordering fix. The world retains all 264 BS16 and all 273 BS17D interface fields (276 in the union). Finance lifecycle production code remains the frozen final implementation; BS15 college compensation adapters and expense mapping remain intact.

## Closure gates and evidence (claude closure session, 2026-10-10)

Raw JSON/logs remain under `node_modules/.cache/convergence-v3-1` (not committed). Each gate lists the SHA it ran on. Production source is identical from `db16c79` to `fee3d75`; only the two test files named below changed after `d47591a`.

| Gate | Result | Ran on |
|---|---|---|
| Typecheck (`tsc -b`) | PASS (re-run after fixture edits: exit 0) | d47591a, then fee3d75 tree |
| Build (`tsc -b && vite build`) | PASS, 40.6 s | d47591a |
| STAFF-CONTRACT V4-01 (`StaffContractV4Policy.test.ts`) | 9/9 PASS inside the focal runs; cross-policy 18/18; original red 0/1 -> reconciled green | db16c79 / d47591a |
| Finance long-horizon | **9/9 PASS** (the former 8/9 case now keeps both causalities) | d47591a |
| Finance continuity (renewal, financing agreement, lifecycle) | 33/33 PASS | d47591a |
| Save V4 / persistence set (10 files) | 99/100 at default timeouts; the 1 failure was a 5000 ms timeout, closed below | d47591a |
| Legacy Save V1/V2/V3 migration paths (6 selected cases) | 6/6 PASS | d47591a |
| BS15 differential (`certify-convergence-v2.mjs`) | frozen 10/10, integrated 10/10, exit 0, 63 s | d47591a |
| Professional Pathways | 5/5 PASS after fixing a test bug (see below); had never been run before this session | fee3d75 |
| Cross-system `BS15BS16BS17Convergence.test.ts` | 5/5 PASS after fixture repair (see below); had been silently *skipped* in both previous focal runs | fee3d75 |
| Cross-system A-G (`BS15BS16BS17ConvergenceV3_1.test.ts`) | 9/9 PASS | db16c79 |
| Training/C1, Medical M1, Facilities, Calendar, Recruiting/Portal/Draft, Talent, Finance activation (remaining focal files) | PASS | db16c79 |
| Guards: Domain/Engine imports, RNG, conflict markers, `git diff --check` | PASS (`guards.json`; diff check clean; the single marker-like hit is `docs/autopilot/CFI7_FINANCE_INTEGRATION_CERTIFICATION.md`, byte-identical to the BS16 source) | d47591a / fee3d75 |

### Focal accounting (29 files, no single 355/355 run exists)

- Initial run (c. `cf43aae`): 360 tests, 319 PASS / 36 FAIL (missing Finance liquidity/authorization in fixtures, plus the NCAA budget ordering defect).
- After production + fixture fixes (`db16c79`): 360 tests, 354 PASS / 1 FAIL / **5 SKIPPED**. The skipped five were `BS15BS16BS17Convergence.test.ts`, whose `beforeAll` threw, so they never executed. The earlier statement that all 355 cases were covered was therefore incomplete.
- `EcosystemTransitions.test.ts` failing case fixed at `d47591a`: file 7/7 PASS.
- This session repaired the five skipped tests (5/5) and the never-run Pathways file (5/5).
- Consolidated: 354 + 1 + 5 = 360 distinct focal cases passed across four runs, plus Pathways 5/5. No production code changed between the runs.

### Fixes made in this session (test-only, commit `fee3d75`)

1. `BS15BS16BS17Convergence.test.ts`: the BS17D fixture assumed a world without Finance and rewrote a contract whose first-year payroll Finance had already recognized (idempotency conflict, which is correct Finance behavior). It now funds through the canonical financing/authorization fixtures, signs a legitimate Player contract aligned to the checkpoint day, expects the 18 Treasury settlements that real liquidity produces (12 opening Player payrolls, 4 Staff backfill payables, the controlled operating cost and the new payroll) and asserts cash conservation (opening liquidity minus Treasury applications; the recognized revenue stays a receivable). Assertions on exactly-once Finance, identical financial collections for blocked/available, Talent identity and restoration retry are unchanged.
2. `AiProfessionalPathways.test.ts`: the legacy-budget invariance check used 100,000,000,000, above the validated 1,000,000,000 cap; it now uses the maximum valid value, so the invariance claim is still tested.

## Adversarial review (focal)

Checked and found no defect: renewal or hiring on V4 load (policy tests A-F), payroll without a contract, lost payroll for a legitimate contract, duplicated expense (exactly-once assertions), NCAA sport budget period and double activation (shipped activation test, 48 salary authorizations plus independent historical budgets), identity changes across Save, legacy migrations applied to V4, duplicate Calendar processing, lost BS16 collections (273/264 interface fields preserved), physical Training/Medical bypass, fixture-minted money, and unexpected production differences versus the frozen sources.

## Limits and freeze scope

- Save V4 annual-development-cycle test: the former default-timeout caveat is closed (see Final timeout closure). Its cost remains a performance observation, not an optimization.
- Fixture durations are not performance measurements. Prior V3 harness figures (ordinary day 88 ms, combined round trip 246 ms, blocked Training 11 ms) are bounded observations only.
- No full repository suite, no new World DB Y1-Y30 certification and no BS15 re-certification is claimed. World DB 2029 remains unresolved. Historical full V1/V3 baseline failure sets are not repaired; the supported migration paths are checked focally. BS17E/F are out of scope. Rust and cargo gates are outside the narrowed closure set.
- The dedicated standalone Staff renewal command remains a domain limitation (policy case D uses the existing reassignment command).
- Protected `main`, `origin/main`, `C:\BDM` (Courtside) and the source branches were not touched. No push was performed.

## Final timeout closure

Justification: the test builds two full worlds with `createNewGame()` plus two Save V4 round trips. It timed out at Vitest's default 5000 ms (no global `testTimeout` is configured) at 5298 ms in the Save gate and 5937-6329 ms in isolation, and also timed out at 5069 ms in the frozen BS16 archive on this machine. Behavior was never failing: it passed with an external 120 s timeout.

Change (commit following `7550503`): the test's own Vitest timeout argument was set to `15_000` (`}, 15_000)`), as other tests in the file already do. Only that closing line changed; no assertion, fixture, procedure, global timeout or other test was touched, and no production code changed (`git diff 7550503 --stat`: 1 file, 1 line).

| Check | Before | After |
|---|---|---|
| Timeout | 5000 ms default | 15000 ms local |
| Isolated test, default config | FAIL (timeout) | PASS x3: suite test time 6.01 s, 6.47 s, 6.37 s |
| `GameWorldSaveV4.test.ts` complete | 24/25 | **25/25 PASS**, 0 skipped, 0 pending (target test 6.41 s) |
| `tsc -b` | PASS | PASS |
| `git diff --check` | clean | clean |

The test still takes about 6 s; this is an observation of fixture cost, not an optimization. Reused gates (Finance long-horizon 9/9, Finance continuity, BS15 differential, focal Talent/Facilities/Training/Medical/Calendar, Pathways, Convergence, build) were run on trees whose production source is identical to this commit; the only delta is a timeout argument in a test file none of them import as a dependency, so they were not repeated.
