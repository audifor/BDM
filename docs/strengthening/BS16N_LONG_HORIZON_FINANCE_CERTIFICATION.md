# BS16N — Long-Horizon Finance Certification

**Status: PARTIAL.** Every longitudinal Finance semantic the shipped product actually implements is certified
green over a ten-year horizon. The milestone is PARTIAL for one registered product-policy reason: the product
has **no producer that materializes a second fiscal period or renews an authorization**, so multi-year gameplay
spending cannot be legitimately authorized after the first fiscal year. Nothing was patched with invented money
to make that look green.

**Run identification**

| Field | Value |
|---|---|
| Worktree | `C:\BDM-BS16-CANONICAL` |
| Branch | `bdm-stage2-bs16-finance-canonical` |
| Baseline SHA (BS16M-B2 closed) | `970d254` |
| Production change in BS16N | **none** — this milestone adds certification coverage and documentation only |
| Certification artifact | `src/engine/finance/FinanceLongHorizonCertification.test.ts` (9 cases) |
| Certification result | **9/9 PASS** (full-file run: 303.40 s) |
| Regression closure | 13 files / 130 tests PASS (779.69 s) |
| Final gates | `npm run typecheck` clean, `npm run build` ✓ 11.97 s, `git diff --check` clean |
| Pushed | no; local commits only |

---

## 1. What is being certified

Continuity, not features. The shipped Finance lifecycle already certifies *semantics* per milestone
(BS16B–BS16M). BS16N certifies that those semantics **survive time**: thousands of processed days, a fiscal
rollover, a season rollover, save/load round trips, compounding payroll and one long-lived debt, without
duplication, invention, drift or terminal-state reopening.

The subject is a compact deterministic world whose entire economic life is declared explicitly:

| Fixture element | Declared value |
|---|---|
| Organizations | 2 (`team-home`, `team-away`), competition `competition-a`, currency `EUR` |
| Horizon | 2032-10-01 → 2042-09-30 = **3,651 processed days** |
| Fiscal year start | month 10 (so the only materialized period is 2032-10-01 → 2033-09-30) |
| Contracts | `contract:home-multi-year` (120,000 major/year, 2032-10-01 + 10 years), `contract:home-expiring` (90,000 major/year, 2032-10-01 + 2 years) |
| Seasons | `season-a/b/c` (2032-33, 2033-34, 2034-35) |
| Home games | 6 (2032-10-15, 2032-11-05, 2032-12-10, 2033-01-20, 2033-11-08, 2034-11-20) + the fixture's own 2032-10-01 game |
| Competition revenue policy | `COMPETITION_PARTICIPATION_DISTRIBUTION`, 12 × 200,000 major installments (one declared fiscal year) |
| Competition cost policy | `MATCH_OPERATIONS`, 25,000 major per home game |
| Injected money | exactly one capital contribution (500,000,000 minor) and exactly one financing drawdown (1,000,000,000 minor) |
| Authorization | the first fiscal period only (as shipped) |

Driven by the canonical loop `updateGameWorld(world, { currentDate: next })` → `advanceClubFinanceForDate(...)`,
i.e. the real `CLUB_FINANCE_V2` daily order, not a shortcut.

## 2. Checkpoint evidence

Captured from the instrumented run of the certification fixture (`Y1/Y2/Y3/Y5/Y10` checkpoints, all values in
minor units, currency `EUR`). Checkpoint counts are world-wide; cash, debt and equity are the home Organization.

| Checkpoint | Date | Profiles | Periods | Transactions | Revenue recog. | Expense recog. | Receivables | Payables | Commitments | Open reservations | Cash (minor) | Debt liability | Equity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Y1 | 2033-09-30 | 2 | 1 | 66 | 24 | 8 | 24 | 8 | 8 | 0 | 1,706,500,000 | −1,000,000,000 | −500,000,000 |
| Y2 | 2034-09-30 | 2 | 1 | 72 | 24 | 11 | 24 | 11 | 11 | 0 | 1,685,500,000 | −1,000,000,000 | −500,000,000 |
| Y3 | 2035-09-30 | 2 | 1 | 76 | 24 | 13 | 24 | 13 | 13 | 0 | 1,673,500,000 | −1,000,000,000 | −500,000,000 |
| Y5 | 2037-09-30 | 2 | 1 | 84 | 24 | 17 | 24 | 17 | 17 | 0 | 1,649,500,000 | −1,000,000,000 | −500,000,000 |
| Y10 | 2042-09-30 | 2 | 1 | 105 | 24 | 27 | 24 | 27 | 27 | 0 | 589,500,000 | 0 | −500,000,000 |

| Checkpoint | Trial balance debit = credit | Explained cash = cash balance | Save V4 payload | Save/reload equal |
|---|---|---|---|---|
| Y1 | 2,551,000,000 | 1,706,500,000 = 1,706,500,000 | 291,814 bytes | yes |
| Y2 | 2,617,000,000 | 1,685,500,000 = 1,685,500,000 | 307,856 bytes | yes |
| Y3 | 2,665,000,000 | 1,673,500,000 = 1,673,500,000 | 318,604 bytes | yes |
| Y5 | 2,761,000,000 | 1,649,500,000 = 1,649,500,000 | 340,100 bytes | yes |
| Y10 | 4,001,000,000 | 589,500,000 = 589,500,000 | 394,794 bytes | yes |

Facts worth reading directly from the table:

- **Growth is event-driven, not day-driven.** 3,651 days produce 66 → 105 transactions: history grows with the
  economic events the world declared, never with the calendar.
- **The ledger always balances** and **cash is always fully explained** by the audited cash-source catalogue.
- **Cash never goes negative**; the global minimum across the horizon is 589,500,000 minor units (Y10, the lowest
  point, reached after full debt repayment).
- **Capital never recurs** (one contribution, constant equity control) and **debt terminates exactly once**
  (liability 1,000,000,000 → 0 with no duplicated service fact).
- **No reservation is ever left `OPEN`**, at any checkpoint and after replay.

### 2.1 Cash provenance is closed *and* complete

The certified audited catalogue of transaction types that may touch an Organization cash account is exactly:

`DEBT_DRAWDOWN`, `DEBT_PRINCIPAL_REPAYMENT`, `OWNER_FUNDING_RECEIPT`, `PAYABLE_SETTLEMENT`, `RECEIVABLE_COLLECTION`.

| Checkpoint | Observed cash sources |
|---|---|
| Y1 | `DEBT_DRAWDOWN`, `OWNER_FUNDING_RECEIPT`, `PAYABLE_SETTLEMENT`, `RECEIVABLE_COLLECTION` |
| Y2 | same four |
| Y3 | same four |
| Y5 | same four |
| Y10 | all five (the debt principal repayment occurred between Y5 and Y10) |

The assertion is two-sided: **closed** (no unknown cash source ever appeared) and **complete** (the horizon
exercised every audited source, so no catalogue entry is dead). A future cash movement that is not one of these
five fails certification instead of balancing silently — which is the executable form of "if Finance cannot
explain where money came from, it must not create it".

## 3. Certified longitudinal semantics

**Case 1 — trial balance, cash identity and save/reload at every checkpoint.**
Debits equal credits at all five checkpoints; every cash posting is an audited source and the postings sum
exactly to the balance; cash ≥ 0 at every checkpoint and on every intermediate day; the Save V4 round trip
preserves transaction, payable, receivable and profile counts and the exact cash balance at each checkpoint.

**Case 2 — revenue and operating cost exactness.**
Both participating Organizations recognize exactly the 12 declared installments (24 world-wide) on exactly the
declared dates (2032-10-01 … 2033-09-01, 200,000 major each). Competition operating cost produces exactly one
`MATCH_OPERATIONS` occurrence per home game the materialized fiscal period reaches, and explicitly **none** for
the games it does not (the fixture asserts that games after the period exist, so the negative case is real and
not vacuous).

**Case 3 — payroll exactness per contract year.**
`contract:home-multi-year` produces exactly one guaranteed occurrence per contract year on
2032-10-01 … 2041-10-01 (ten), `contract:home-expiring` on 2032-10-01 and 2033-10-01 (two); no occurrence falls
on or after a contract's `expiresOn`; every occurrence id is unique (no duplicated longitudinal fact); zero open
reservations remain.

**Case 4 — debt, capital and terminal states.**
Exactly one capital contribution and one drawdown (1,000,000,000 minor); every debt transaction id is unique;
every declared installment becomes exactly one collected receivable (`RECEIVABLE` treasury application), one per
installment, no duplicates.

**Case 5 — renewal semantics are reported, never leaked or faked.**
At Y10 the world still has exactly **one** fiscal period, authorization state is `NOT_PROVISIONED` and the
gameplay decision reason is `BUDGET_AUTHORIZATION_NOT_MODELLED` (never the legacy `FINANCE_PROFILE_UNAVAILABLE`
fallback); the activation report status is `RENEWAL_NOT_MODELLED`. Across both Organizations, every existing
period id is unique and no two periods overlap.

**Case 6 — growth without duplication.**
Transaction counts are monotone non-decreasing; both Organizations keep exactly one profile; no transaction id
is ever duplicated; receivables equal `12 × 2` (no receivable minted or lost over ten years); payables equal
expense recognitions exactly; and revenue recognitions at Y10 equal revenue recognitions at Y1 — the honest
shape of the shipped product, where revenue is frozen after the single materialized period while payroll keeps
compounding.

**Case 7 — ordinary-day performance.** See §5.

**Case 8 — replay and terminal-state integrity.**
Reading a save re-runs the deterministic Staff-contract repair (`ensureStaffContractStructure`); the repair is
idempotent (a second round trip adds nothing at all), the first Finance pass after it records exactly **one**
payroll occurrence dated on the current date and never a backdated fact, and replaying the *same* processed date
from then on is a strict no-op — including world identity (`again === settled`). No reservation is left `OPEN`
and reserved capacity is 0 after replay.

**Case 9 — shipped ACB rollover proof.** See §4.

## 4. Rollovers

**Fiscal rollover (certification fixture).** The world crosses 2033-10-01 (the end of its only materialized
period) inside the horizon. Observed: authorization goes `ACTIVE` → `NOT_PROVISIONED` with
`BUDGET_AUTHORIZATION_NOT_MODELLED`; no period is invented; no legacy pool is consulted; payroll and debt
service continue (they are contract- and agreement-driven); competition revenue and competition operating cost
stop (they are period-driven and the product can materialize exactly one period).

**Season rollover.** The fixture crosses two season boundaries (2033-05-31, 2034-05-31). Season rollover does not
touch Finance: `startNextSeason` has no Finance producer, which is precisely the registered gap in §6.

**Shipped ACB rollover (case 9).** On the real shipped ACB test world, driven 300+ days to 2027-10-15:

- authorization at 2027-08-31 = `ACTIVE`; at 2027-09-02 = `NOT_PROVISIONED` with
  `BUDGET_AUTHORIZATION_NOT_MODELLED`, activation report `RENEWAL_NOT_MODELLED`;
- the rollover neither leaked the previous authorization nor fell back to legacy pools — `teamFinancesByTeamId`
  is byte-identical before and after;
- exactly one fiscal period exists;
- economic life continues for everything contract-driven: >1,000 transactions and payroll occurrences after
  2027-09-01;
- everything period-driven stops: **zero** revenue recognitions and **zero** `MATCH_OPERATIONS` occurrences on or
  after 2027-09-01;
- currency never drifts (`EUR` before and after).

## 5. Performance and growth

| Measurement | Value |
|---|---|
| Processed days (compact fixture) | 3,651 |
| Median ordinary-day Finance cost, whole horizon | 1.29 ms |
| Median ordinary-day cost, first 200 days | 0.88 ms |
| Median ordinary-day cost, last 200 days | 1.49 ms |
| Growth factor over ten years of history | ≈ 1.7× |
| Certified bound (case 7) | last-200 median < max(25 × first-200 median, 50 ms) |
| Checkpoint segment wall time (incl. a full Save V4 round trip of the grown world) | 0.46 s → 3.01 s |
| Full certification file runtime | 303.40 s (9/9 PASS) |
| ACB shipped rollover case share of that runtime | ≈ 297 s for 300+ days (≈ 0.8–1.0 s per ACB day) |

Interpretation, stated honestly:

- On the compact fixture, ten years of accumulated Finance history do **not** make an ordinary day an order of
  magnitude slower; the certified bound (25×) has ≈ 15× of headroom.
- On the **shipped ACB** world the same measurement is much worse, and the cause is not Finance: every world
  mutation re-validates the entire world (`updateGameWorld`), so the per-day cost grows with total fact history
  (≈ 0.15 s of validation per mutation at ~1,400 finance facts). Extrapolating the ACB per-day cost to a full
  ten-year career is not feasible in a test, which is exactly why the long-horizon certification runs on a
  purpose-built compact world and the ACB world gets the rollover proof instead. This cost profile is registered
  in §6 as an engineering gap, not a Finance-correctness defect.

## 6. Registered gaps (why this milestone is PARTIAL)

| # | Gap | Evidence | What it needs |
|---|---|---|---|
| 1 | **No fiscal-period or authorization renewal producer.** Nothing in production materializes a second `FiscalPeriod` or renews an authorization; `allowNewPeriodMaterialization` has no production caller, `startNextSeason` ignores Finance, the activation report returns `RENEWAL_NOT_MODELLED`, and a gameplay decision after the first fiscal year answers `BUDGET_AUTHORIZATION_NOT_MODELLED` (correctly unblocked by liquidity, never by a legacy pool). | certification case 5; ACB rollover proof (case 9) | one approved product policy for annual budget renewal (who sets the next period's authorization, from what source). **This is the BS16N blocker.** |
| 2 | **Economic policies declare a single fiscal year.** `createCompetitionRevenuePolicy` requires installments to sum exactly to `annualAmount`, so a revenue policy covers one fiscal period; revenue and event OPEX therefore stop at the period boundary even when the world continues for a decade. | certification case 2; case 9 (zero revenue after rollover) | either an approved multi-year policy shape or the period renewal from gap 1. |
| 3 | **No shipped-world economic provisioning.** `provisionEconomicSources` is called only by the ACB test boundary (`createAcbTestGame`); no shipped career world provisions an economic policy. | acceptance audit recorded in the BS16A document (§16.4) | an approved provisioning point for shipped worlds. |
| 4 | **Staff-contract lifecycle repair runs only at load.** `ensureStaffContractStructure` repairs a lapsed staff contract when a save is read; the calendar itself has no producer that keeps staff contracts alive. The repair is deterministic and idempotent (certified in case 8), but a long-running session that never saves/reloads does not receive it. | certification case 8 | a canonical calendar-time staff-contract lifecycle producer. |
| 5 | **Per-day cost grows with total fact history** because every mutation validates the whole world. Not a Finance defect; a scaling characteristic of the world-update seam. | §5 | incremental/bounded world validation (outside Finance). |

Not renegotiated, not silently changed: `BS16H` stays PARTIAL (no legitimate opening economic source), the
legacy `TeamFinances` pools stay NON-AUTHORITATIVE (zero allow/block authority), and no product rule was altered
to make a long horizon look healthier.

## 7. Known failures (baseline, not greened)

Reproduced in a clean worktree at the BS16M-B2 baseline and left alone (class C — pre-existing and unrelated to
BS16N, which changes no production code):

| Suite | Failures | Note |
|---|---|---|
| `src/domain/finance/EconomicEventAdapters.test.ts` | 5 | baseline-red before BS16M-B2 |
| `src/domain/finance/CanonicalFinanceStack.integration.test.ts` | 1 | baseline-red |
| `GameWorldSaveV3` hiring path / `createAcbTestGame` hiring | 1 (shared) | baseline-red; reason string reclassified at BS16M-B2 (`FINANCE_PROFILE_UNAVAILABLE` → `INSUFFICIENT_LIQUIDITY`) |
| `GameApplication` timeouts | 5 | identical at baseline (environment-bound) |

No test was deleted, skipped or weakened to reach any result in this document.

## 8. Regression closure

One representative certified surface per canonical BS16 authority, run once (13 files / 130 tests PASS,
779.69 s):

| File | Authority |
|---|---|
| `src/domain/finance/FinancialAuthority.test.ts` | BS16C/D authorization + affordability |
| `src/domain/finance/FinanceFiscalPeriodAuthority.test.ts` | BS16G fiscal-period truth |
| `src/domain/finance/ContractFinancialSchedule.test.ts` | BS16I player/staff longitudinal schedule |
| `src/engine/finance/ClubFinanceLifecycle.test.ts` | BS16I daily Finance lifecycle |
| `src/engine/finance/ClubTreasuryLifecycle.test.ts` | BS16J Treasury |
| `src/engine/finance/ClubEconomicSourceLifecycle.test.ts` | BS16K revenue / OPEX / collection |
| `src/engine/finance/ClubFinancingLifecycle.test.ts` | BS16L financing / capital |
| `src/domain/finance/GameplayFinancialDecision.test.ts` | BS16M canonical gameplay authority |
| `src/app/game/BindingCapacityReservation.test.ts` | BS16M-B1/B1C capacity handoff |
| `src/app/game/PrototypeFinancePolicy.test.ts` | BS16M-B2 prototype currency policy |
| `src/app/game/WorldDbSpainFinance.test.ts` | shipped Spain boundary |
| `src/save/FinancePersistence.test.ts` | Finance Save V4 persistence |
| `src/save/FinanceReservationPersistence.test.ts` | reservation terminal-state persistence (added because `FinancePersistence` covers the Save V4 shape, not the terminal reservation state) |

Deliberately **not** re-run: `FinanceLongHorizonCertification.test.ts` (frozen at 9/9 — no production Finance
code changed afterwards), `SystemsActivation`, broad `GameWorldSave*`, Foundation + OpeningState,
`EconomicEventAdapters`, `CanonicalFinanceStack.integration`, Facilities, Talent, season lifecycle,
`AnnualDevelopmentExactlyOnce`, and ACB-wide long simulations.

## 9. Static guards

| Guard | Result |
|---|---|
| `Math.random(` in `src/` | 0 |
| React / Zustand / Tauri imports in `src/domain` or `src/engine` | 0 |
| `PrototypeFinancePolicy` / `BDM_PROTOTYPE_FINANCE_POLICY` referenced from `src/domain` or `src/engine` | 0 (prototype `EUR` policy cannot leak into domain or engine) |
| Legacy `TeamFinances` allow/block authority in production | 0 callers; `canTeamAffordAdditionalSalary` / `canTeamAffordAdditionalStaffSalary` exist only as definitions/re-exports in `src/domain/world/finances.ts` + `index.ts` and as test assertions |
| Automatic financing | none — a drawdown is only ever an explicit `FinancingDrawdown` order |
| Unexplained money creation | none — cash provenance is a closed, complete five-entry catalogue (§2.1) |
| Working tree | clean; nothing pushed |

## 10. Verdict

**BS16N: PARTIAL.**

- Certified PASS: trial balance, cash identity and cash provenance closure, revenue and operating-cost
  exactness, contract-year payroll exactness, debt/capital/terminal states, renewal-semantics honesty (no leak,
  no legacy fallback), growth without duplication, replay and load-repair idempotence, save/load fidelity at
  every checkpoint, ordinary-day performance on the compact fixture, and the shipped ACB rollover behaviour.
- PARTIAL because of gap 1: legitimate multi-year gameplay operation needs an annual fiscal-period/authorization
  renewal authority that the product does not yet define. Gap 2 follows from it, and gaps 3–5 are registered
  engineering boundaries.
- No production defect was demonstrated, so BS16N contains **no repair commit**. Manufacturing one would have
  meant inventing a renewal policy, which is a product decision, not an engineering one.

`BS16N` is the last defined BS16 Finance milestone. Nothing in this document promotes `BS16E` or `BS16H` to
PASS, and nothing turns a PROPOSAL into DECIDED.
