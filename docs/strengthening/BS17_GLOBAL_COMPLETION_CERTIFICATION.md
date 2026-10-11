# BS17 GLOBAL COMPLETION — Certification

> **Erratum (BS ALL FINAL INTEGRATION, see `BS_ALL_FINAL_INTEGRATION_CERTIFICATION.md`).** Known limitation 1 below is mis-attributed.
> The "second 1 July" failure is not a defect of the base Calendar: the multi-season harness advanced the raw daily Calendar, which never
> performs the canonical competition rollover that simulate-until and the next-season action perform. Without a rollover the world keeps
> its first season, and the second annual development would rewrite that season's immutable rating history. Through the canonical path
> the rollover happens and the second and third 1 July checkpoints are crossed (certified in the integration document).

Worktree `C:\BDM-BS17-FINAL` · branch `bdm-stage2-bs17-global-completion` · base `fdeaf817f207a5fd23a2fedc45566f7334515484`.
No merge, no push, source branches and `main` untouched.

## Verdict

**PASS for the BS17 scope, with one external limitation on the multi-season horizon.**

Facilities, Economy, Governance and AI work end to end from a **new production game** (`createConfiguredGame`), through the same
commands the UI invokes. The focal 3-season horizon was reached for **637 simulated days (about 2 full seasons, one season close at
2033-07-01)**. The Calendar of the base commit cannot cross the *second* annual player-development checkpoint (1 July of year 2)
in any shipped universe, with or without BS17 (see *Known limitations*, item 1).

## What was delivered (commits on top of the base)

| Checkpoint | Commit | Content |
|---|---|---|
| BS17E-A FINAL | `3e36c485` | `BDM_GAME_BALANCE_V1` preset and bootstrap; playable authorized maintenance and repair from a new game; physical occupancy |
| BS17E-B CAPEX | `99f9ae07` | Renovation, replacement, expansion as `FacilityDevelopmentProject`s; Governance `CAPITAL_EXPENDITURE`; one Finance reservation and one recognition per milestone |
| BS17E-C services | `342c5ed7` | Recurring conservation contract (`SERVICE_OFFER`), Calendar-driven periods billed exactly once, notice-based termination |
| BS17F AI | `66a25da7` | AI clubs plan one deterministic proposal per month through the simulated manager and the Board approves |
| Fixes from the long run | `e72824df` | Three defects found by the multi-season run (below) |

### GAME BALANCE V1 (authorized preset)
Simulated, versioned (`bdm-game-balance-v1`) and labeled as a video-game simulation: markets by ecosystem (FIBA-like EUR, NBA-like USD,
NCAA-like EUR) × scale bands (SMALL/MEDIUM/LARGE by contracted payroll); opening treasury through Finance's own authority
`GAME_BALANCE_PRESET` (World DB first, canonical Finance sources next, preset only when absent; no automatic debt, no credit line, no
overwrite of known facts); generic simulated facilities and components, three synthetic providers, cost catalog, offers valid 14 days,
payment due 30 days, minimal Governance (institution, bodies, appointments, grants), `FACILITY` and `FACILITY_DEVELOPMENT` budget
lines. The preset is opt-in for every low-level creator; only `createConfiguredGame*` (the production entry point) applies it.

### Production gameplay (user)
Need or limitation → offers (three providers) → proposal → Board decision (next day) → Finance reservation and authorization → contract
→ works (component occupied, unavailable to Training and Medical through the C1 physical authority) → acceptance → economic
recognition (milestone) → payable → Treasury settlement → Save. Proven by `ProductionGameplay`, `ProductionInvestment`,
`ProductionService` and three production UI tests that drive the real buttons.

### AI gameplay
`processAiFacilityManagement` runs inside the single Calendar phase `FACILITY_MANAGEMENT` (before `CLUB_FINANCE_V2`). The simulated
general manager (an EXTERNAL appointee of the club operator body) uses the same commands, rights and Finance gates as the user.
One deterministic planning day per club per month, at most one new proposal per club per month, priority by severity then service then
justified investment, only the cheapest affordable offer the Board would accept, idempotent stage-gated progress, no RNG.
47 AI clubs produced 153 operations in 100 days and 286 over 540 days, all through approved decisions.

## Evidence

### Focal tests (all passing)
`src/app/facilityMaintenance` (12 files, 81 tests), `src/ui-ng/applications/facilities` (18 tests), `src/domain/facilityEconomy`,
`GameWorldSaveV4.FacilityOperations`, `ShippedUniverseFacilities`. New in this program: `ProductionGameplay`, `ProductionInvestment`,
`ProductionService`, `FacilityInvestmentCausal` (15), `FacilityServiceCausal` (2), `FacilityAiManagement` (4: AI-only, once per club per
month, authorized spending, severity priority, determinism and Save/reload equality), `FacilityMaintenanceOccupancy`, three UI production
tests.

### Multi-season continuity (`BS17MultiSeasonContinuity.test.ts`, opt-in `BDM_BS17_MULTISEASON=1`)
New production game from 2032-10-01; the user's club runs a renovation (accepted 2032-11-20) and a conservation service
(signed 2032-10-03) while 47 AI clubs act. World saved and reloaded at every checkpoint, invariants asserted after each one: lifecycle
derivable for all operations; at most one proposal, approval request, contract and completion per operation; unique service periods;
service cost facts equal processed periods; facilities and components never lost; no organization with negative cash; operation events
identical after reload.

| Day | Date | Operations | Service facts | Orgs with negative cash | Lowest cash (minor units) | Save size |
|---|---|---|---|---|---|---|
| 180 | 2033-03-30 | 240 | 256 | 0 | 238,696,000 | 69.8 MB |
| 360 | 2033-09-26 (after season close) | 241 | 544 | 0 | 198,068,800 | 146.2 MB |
| 540 | 2034-03-25 | 286 | 809 | 0 | 183,744,000 | 224.3 MB |
| 637 | 2034-06-30 | 286 | 954 | 0 | 183,081,600 | 264.1 MB |

Facilities contribute about 5.9 MB of the 224 MB Save at day 540 (economy records 3.3 MB, condition records 1.3 MB, bindings 0.7 MB);
the bulk is pre-existing training-session history (160 MB).
Runtime: about 1.9 s per simulated day early on; 1,574 s for the first 360 days and 4,384 s for 540 days (the Calendar slows as the
pre-existing training history grows).

### Defects found and fixed by the long run (regression tests added)
1. Accepting a **replacement** wrote a second condition record for the new component, which stalled the Calendar on the day (the
   Calendar reports `TECHNICAL_FAILURE` and does not advance). Fixed; covered by a new test.
2. A **replacement could be opened while a renovation of the same component was in progress.** Capital eligibility now treats any
   renovation or replacement of a component as the same occupied target.
3. Project and operation ids of a retired component's successor could collide (`renovation:strength:1`). Attempt numbering now
   takes the first unused id.

### Regression against the base `fdeaf817`
Integrated run (facilities, governance, board UI, integration, finance, Save V4, convergence, shipped universes, calendar, `src/app/game`,
training, medical, staff contracts): 1,611 tests, 1,555 passed, 51 failed. The same 21 files, run on the base worktree, give
253 tests with 51 failures. Every failure in the integrated run also fails on the base (MX0.7 / PlayerContractSigning / Board fixtures hit
`INSUFFICIENT_AUTHORIZED_HEADROOM`; `SimulationBreakpoints` contract-review validation error; GameApplication and simulateUntilDate
timeouts; `BS15IFinalY5SaveAudit`, `MatchEquivalence` and others), plus load-dependent timeouts that pass alone
(`GameWorldSaveV4.Facilities`, `FacilityProjectCommands` determinism, `SportingFacilityContext`, `LiveMatchController`).
**Regressions attributable to BS17: none found.**

### Static checks
`tsc -b` clean; `npm run build` OK; `git diff --check` clean; no conflict markers; no new `Math.random`/`Date.now`/`new Date()` in
non-test sources; no new `app`/`ui`/`engine` imports in Domain; no UI imports in Engine; base is an ancestor of HEAD; working tree clean.

## Known limitations

1. **Second annual player-development checkpoint (pre-existing, outside BS17).** On the base commit, advancing any shipped universe
   past 1 July of year 2 fails in `ANNUAL_PLAYER_DEVELOPMENT` with *"Player rating history for … is immutable"*: prototype on
   2034-06-30 (day 638), NCAA on 2034-06-30 (day 548), ACB on 2028-06-30 (day 651). Therefore the multi-season run stops after about 2 seasons.
   Not reopened here (player development is not part of BS17).
2. No revenue sources exist: the opening simulated treasury is the only liquidity; the Board's liquidity buffer and Finance's
   affordability gate protect it (lowest AI treasury never fell below 183 million minor units). Treasury settles a due batch all or nothing.
3. Calendar cost is higher (about +73 % per day measured earlier) because 47 AI clubs plan and progress operations.
4. Mixed OPEX/CAPEX offers are not supported (no source of cost breakdown). Services restore the most worn component by whole points
   (1 to 4 per month); renewal after the term is a new, separately approved contract (the AI renews; the user must re-propose).
5. The legacy manual capital-commitment path in the Projects tab still exists beside the new investment panel.
6. ACB and World DB universes receive the preset but are exercised lightly (one prototype universe fully); World DB 2029 was not reopened.
7. Pre-existing base failures listed above remain.

## Safe to freeze
Yes, for the BS17 Facilities / Economy / Governance / AI scope. Do not freeze claims about a third simulated season until limitation 1 is fixed.
