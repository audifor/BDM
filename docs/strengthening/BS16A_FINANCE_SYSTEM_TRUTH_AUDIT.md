# BS16A — Finance System Truth Audit

**Milestone:** audit only. No production behavior changed. No shared/exclusion-zone file touched.
**Canonical repo:** `C:\BDM` (untouched, clean at audit start; `main` == `origin/main` == `a6826469c78f8f948d73fd663e4996a99d30c678`).
**Audit branch:** `bdm-stage2-bs16-finance-strengthening`
**Worktree:** `C:\BDM-BS16-FINANCE` (created from `main` at the SHA above; no BS15 work consumed).
**Date:** 2026-10-07.
**Evidence base:** executable producers/consumers read at the stated SHA. `docs/FINANCE_V2.md`, `docs/ARCHITECTURE.md` and `docs/autopilot/PRODUCT_GUARDRAILS.md` were treated as design context; where design intent and executable behavior differ this is stated explicitly.

> **Reading note (reconciled 2026-10-09).** The audit findings in this document describe the state at `a682646` and are preserved as history. Where they say canonical Finance is dormant, that `CalendarEngine` always skips the `CLUB_FINANCE_V2` phase, or that the phase has no processor, that is the audit-time state, **not** the current state. The implemented lineage (BS16A–BS16I) and the approved continuation (BS16J–BS16N) are recorded in **§16** below, which is the single authoritative BS16 Finance roadmap.

---

## Executive answer

Finance V2 (CF1–CF12) is a **coherent, validated, persisted, deterministic double-entry backend** — and it is **almost entirely dormant in gameplay**.

- The ledger, Treasury, recognition, contract schedule, revenue, operating cost, debt, competition economy, regulation, health, valuation and advice layers all exist as pure, tested domain code (`src/domain/finance/*`, 21 production files, ~3,285 lines; 12 test files, ~1,000 lines) with strict world validation and append-only enforcement in `src/domain/world/GameWorld.ts`.
- **No production code provisions Finance V2 state**: no `FinancialAccount`, no `OrganizationFinancialProfile`, no `FiscalPeriod` is created by new-game generation, world generation, calendar progression or any application service. `git grep` finds `createFinancialAccount(` / `createOrganizationFinancialProfile(` only in `src/domain/finance/FinancialLedger.ts` (definition), `src/domain/world/GameWorld.ts` (validation), `src/save/GameWorldSaveV4.ts` (load) and tests/test fixtures.
- **No lifecycle wiring exists**: `CalendarEngine` registers the `CLUB_FINANCE_V2` phase but always skips it (`src/engine/calendar/CalendarEngine.ts:190`, asserted by `CalendarEngine.test.ts:57`). No non-test code outside `src/domain/finance` calls `materializeRevenueForDate`, `materializeContractFinanceForDate`, `materializeOperatingCostsForDate`, `materializeDebtFinanceForDate`, `materializeCompetitionEconomyForDate`, `settleReceivable`, `settlePayable`, `process*EconomicEvent`, `recommendFinanceActions`, `assessFinancialRegulation`, `applyEconomicObservation` or `applyExchangeRate` (verified by exhaustive grep; only tests and the save persistence tests call them).
- The only production producers of canonical Finance facts are the **CFI7 facilities orchestration** (`src/integration/facilitiesFinance/FacilityFinanceOrchestration.ts`, wired for funded project start through `src/app/facilities/FacilityProjectCommands.ts:129`) and **two direct commitment writes for agent fees** (`src/app/marketIntelligence/FreeAgentSigningService.ts:87-94`, `src/app/contractRetention/RetentionSigningService.ts:139-146`).
- **Every affordability decision in the market/AI/user flows still uses the legacy `TeamFinances` budget pools** (`playerSalaryBudget` / `staffSalaryBudget`, `src/domain/world/finances.ts`), not canonical cash, commitments, budgets or health. Canonical finance is read for advice only (`src/engine/clubStrategy/ClubStrategyEngine.ts:81`).
- The **CF12 UI** (`src/ui-ng/applications/finances/*`) and the home dashboard / PCB surfaces read canonical queries correctly; because nothing is provisioned they render "no financial facts" in a real career.

System-truth score: **Finance V2 backend ≈ 8/10; Finance as a live, authoritative, connected gameplay system ≈ 3/10** → see the final score section.

---

## 0. BS15 safety / parallel work

- `C:\BDM` was inspected only (`git status` clean, `main == origin/main`); nothing was reset, cleaned, merged or pushed.
- No BS15 worktree or branch exists in this repository view (`git worktree list`, `git branch -a` inspected); BS15 is not consumed or referenced.
- The audit worktree is `C:\BDM-BS16-FINANCE` on a new branch from `main`. Only this audit document (+ this worktree's validation runs) was produced. No commit was made (per milestone instruction).
- No file in the BS16A hard exclusion zone was modified: `GameWorld.ts`, Save V4/migrations, `createNewGame`, `advanceGameDay`, `CalendarEngine`/shared world lifecycle, Player/Person identity, TalentCohort, Recruiting, NCAA, Portal, Draft, Contracts shared lifecycle, `AiRosterMaintenance`, Scouting, Training, Medical, shared world validation were read-only.

---

## 1. Canonical Finance Map

Legend — status: **CANONICAL** (authoritative for its concern), **DERIVED** (reconstructed), **LEGACY** (older authority still used), **UI_ONLY**, **DORMANT** (implemented, never invoked in production), **MISSING_AUTHORITY**.

| # | Area | Canonical file(s) | Authority | Producer (production) | Consumer | Persistence | AI usage | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|
| A | Money/account/transaction models | `src/domain/finance/FinancialLedger.ts` | Immutable double-entry facts, integer minor units + ISO currency | `createFinancialTransaction` callers only (tests, facilities, save load) | Queries, world validation | Save V4 optional collections | none | `FinancialLedger.test.ts` | CANONICAL |
| A | Fiscal period / org profile | `FinancialLedger.ts` (`createFiscalPeriod`, `createOrganizationFinancialProfile`) | Reporting boundary + currency config | **none in production** | UI/reporting queries | Save V4 optional | none | `FinancePersistence.test.ts` | DORMANT |
| B | Cash balance authority | `src/domain/finance/FinancialQueries.ts`, `CashFlowQueries.ts` | Derived from ledger postings; no mutable cash field | — (derived) | UI, health, reporting, club strategy | not persisted (derived) | `ClubStrategyEngine.ts:81` (health) | `Treasury.test.ts` (cash balances) | CANONICAL |
| C | Ledger/transactions | `FinancialLedger.ts` + `FinancialQueries.ts` | Append-only, validated postings | same as A | all queries | Save V4 | none | `FinancialLedger.test.ts` | CANONICAL |
| D | Revenue | `src/domain/finance/RevenueEngine.ts` (`REVENUE_CATEGORIES:8`, sources `:90`, schedule `:138`, `materializeRevenueForDate:167`) | RevenueSource + recognition chain | **none** (sources only creatable via API/tests) | CF6 forecast, CF7 queries, UI `financeWorkspaceModel` | Save V4 (`revenueSources`) | none | `RevenueEngine.test.ts`, `RevenueEnginePersistence.test.ts` | DORMANT |
| E | Costs (non-contractual) | `src/domain/finance/OperatingCostEngine.ts` (`materializeOperatingCostsForDate:209`) | OperatingCostSource / AuthorizedOperatingCostFact | facilities orchestration (`FacilityFinanceOrchestration.ts:119`) | CF6 forecast, facility queries | Save V4 (`operatingCostSources`, `operatingCostFacts`) | none | `OperatingCostEngine.test.ts`, `OperatingCostEnginePersistence.test.ts` | PARTIAL (one producer) |
| E | Contract payroll cost | `src/domain/finance/ContractFinancialSchedule.ts` (`getContractFinancialSchedule:92`, `materializeContractFinanceForDate:104`) | Derived from Player/Staff contracts; cashSalary/guaranteed only | **none** (hook never invoked) | planning (`engine/clubNeeds/ContractRosterPlanning.ts:147`), contracts UI, health | not persisted (derived) | `clubNeeds` planning only | `ContractFinancialSchedule.test.ts` | DORMANT |
| F | Budgets | `src/domain/finance/BudgetForecasting.ts` (`createFinancialBudget:160`, `getActiveApprovedBudget`, `getBudgetComparison`) | Organization planning facts; not cash, not a control | **none** | UI finance workspace, health, AI advice | Save V4 optional | advice only | `BudgetForecasting.test.ts` | DORMANT |
| G | Forecasting | `BudgetForecasting.ts` (`createFinancialForecast`, `getProjectedLiquidity`), `CashFlowQueries.ts` (`getCashFlowProjection`) | Derived expectation from actuals + commitments + explicit assumptions | — (derived) | UI finance workspace, reporting | not persisted | advice only | `BudgetForecasting.test.ts`, `CF11.test.ts` | DORMANT |
| H | Obligations/commitments | `Recognition.ts` (commitment/entitlement), `RecognitionQueries.ts` (`getOutstandingCommitments:102`) | Known future obligations, distinct from paid cash | facilities, free-agent/retention agent fees | budget comparison, health, UI | Save V4 | none | `Recognition.test.ts` | PARTIAL |
| I | Contracts interaction | `ContractFinancialSchedule.ts`, `EconomicEventAdapters.ts` (`processContractEconomicEvent:169`) | Contracts own terms; finance derives dated obligations | **none** | planning/UI/health | derived | none | `ContractFinancialSchedule.test.ts`, `EconomicEventAdapters.test.ts` | DORMANT |
| J | Facilities interaction | `src/integration/facilitiesFinance/*` (`authorizeFacilityMaintenanceExpenditure:97`, `executeFundedFacilityProjectStart:306`, `executeFacilityProjectCapitalPayment:354`, `bindFacilityProjectDebtFinancing:426`), `FacilityFinanceQueries.ts` | Facilities own physical ops; finance records consequences + `FacilityFinancialBinding` | `src/app/facilities/FacilityProjectCommands.ts:129` (project start only) | `ClubFacilitiesReadModel.ts:41` | Save V4 binds are persisted | none | `FacilityFinanceIntegration.test.ts` (399 lines) | PARTIAL (only project start wired) |
| K | Staff interaction | `ContractFinancialSchedule.ts` (staff salaries); legacy `staffSalaryBudget` | Staff contracts own compensation; finance derives | **none** | health/budget/UI | derived | legacy budget checks (`StaffCareerService.ts:123,154`) | `ContractFinancialSchedule.test.ts` | DORMANT |
| L | Competition interaction | `CompetitionEconomy.ts` (`createCompetitionDistributionFact:16`, `materializeCompetitionEconomyForDate:27`), `EconomicEventAdapters.ts:189` | Competition owns entitlements; finance records monetary consequences | **none** | UI competition tab | Save V4 (`competitionDistributionFacts`) | none | `CompetitionEconomy.test.ts`, `FinanceCF9Persistence.test.ts` | DORMANT |
| M | Sponsorship/commercial | `RevenueEngine.ts` categories (`SPONSORSHIP`, `MEDIA`, `TICKETING`… `:8`) | RevenueSource authority (external supply) | **none** (no negotiation/producer flow) | UI | Save V4 | none | `RevenueEngine.test.ts` | MISSING_AUTHORITY (producer) |
| N | Debt/financing | `src/domain/finance/DebtEngine.ts` (`createDebtInstrument:54`, `materializeDebtFinanceForDate:96`) | DebtInstrument + authorized capital | **none** (facility binding only creates instruments via orchestration when called) | health, UI | Save V4 (`debtInstruments`) | none | `DebtEngine.test.ts` (24 lines) | DORMANT |
| O | Financial restrictions | `FinancialRegulation.ts` (`assessFinancialRegulation:68`, `recordAuthorizedFinancialFine:134`) | Rules supplied by an external authority; finance only assesses | **none** | UI regulation status; Governance evidence | Save V4 (`financialRegulationAssessments`) | none | `CF10.test.ts` | DORMANT |
| P | AI financial decisions | `src/domain/finance/FinanceAI.ts` (`recommendFinanceActions:40`, `recordFinanceProposal:61`, `resolveFinanceProposal:69`) | Deterministic advice; never executes | **none** | UI proposals tab | Save V4 (`financeDecisionProposals`) | advice only | `CF11.test.ts` | DORMANT |
| Q | Save/persistence | `src/save/GameWorldSaveV4.ts:162-186` (payload), `:263-272` (serialize), `:347-373` (optional defaults), `:403` (rehydration) | Save V4 optional additive collections | save service (`src/app/save/GameSaveService.ts:9`) | load | Save V4 | — | 8 finance persistence tests + `FinanceCF9/CF10Persistence` | CANONICAL |
| R | Calendar/lifecycle execution | `src/engine/calendar/CalendarEngine.ts` (`COACH_FINANCE:155`, `CLUB_FINANCE_V2:190`); `src/app/game/advanceGameDay.ts` | Club Finance V2 **has no processor** | none | none | — | — | `CalendarEngine.test.ts:57` asserts skip | MISSING (dormant by design) |
| S | UI read models | `src/ui-ng/applications/finances/*` (CF12), `ui-ng/applications/home/HomeDashboardSlot.tsx:313-346`, `ui/pcb-migrated/club/ClubPcbPage.tsx:34,44`; legacy: `ui/screens/SalaryScreen.tsx`, `ui/desktop/DesktopCanonicalSurfaceLayer.tsx:17`, `ui-ng/applications/market/MarketWorkspace.tsx:61` | Read-only projections | — | user | none | — | `FinancesWorkspace.test.tsx` | PARTIAL (canonical UI wired but empty in practice; legacy panels remain) |
| T | Tests | `src/domain/finance/*.test.ts` (12), `src/save/*Persistence.test.ts` (8), `FacilityFinanceIntegration.test.ts`, `FinancesWorkspace.test.tsx`, salary/coach suites | — | — | — | — | — | focused run: 34 files / 262 tests green | see §14 |

---

## 2. Authority audit

1. **Authoritative cash balance?** Only the CF1/CF2 ledger: cash accounts are `FinancialAccount` rows whose type is in `CASH_ACCOUNT_TYPES` (`Treasury.ts:22-29`); balances are derived from postings (`FinancialQueries.getAccountBalanceAsOfDate:53`, `CashFlowQueries.getCashBalancesByCurrency:86`). No `Organization.cash` or equivalent exists. In practice this authority is empty in gameplay because nothing is provisioned (§5, route 1).
2. **One ledger?** Yes — one `financialTransactionsById` per world, validated in `GameWorld.validateFinancialState:2656-2700` (organization, account, currency, opening/closing dates, dimensions, contract references). No second ledger exists.
3. **Balances reconstructible from transactions?** Yes, balances are never persisted (`FinancialLedger.ts` comment; `moneyFromBalance`), trial balance derives from postings (`getTrialBalanceAsOfDate:69`).
4. **Transactions immutable/history-based?** Yes: append-only checks reject removal or change of any existing transaction (`GameWorld.assertFinancialTransactionsAppendOnly:2851-2867`), mirrored for settlements, recognitions, commitments, entitlements, sources, facts, budgets and facility bindings (`assert*AppendOnly`, `assertImmutableCollection:2919-2931`).
5. **Can money move without a financial record?** Only via cash postings, which always require a `FinancialTransaction` with provenance, ≥2 balanced postings and same-currency accounts (`createFinancialTransaction:163-220`), or via a settlement that validates remaining obligation, id uniqueness and account mapping (`Treasury.validateSettlementRequest:254`). No mutable cash/budget field was found outside the ledger.
6. **Can a transaction be applied twice?** Not through canonical paths: settlement ids and settlement transactions are unique (`validateSettlementRequest` duplicate checks), adapter idempotency is the tuple `sourceAuthority + sourceEntityId + idempotencyKey` (`EconomicEventAdapters.eventKey:346`, `existingArtifacts:310`, replay compatibility `:329`), and `GameWorld` rejects duplicate recognition/commitment/entitlement provenance (`assertUniqueRecognitionSource:2843`). **Caveat:** `GameWorld` does not enforce global provenance uniqueness across `financialTransactionsById` — only the calling paths enforce it. A raw caller could post two different transactions citing the same provenance id.
7. **Event-driven or periodically synthesized?** Both models exist but only "explicit authorized event" is wired. Revenue/cost/debt/competition are schedule-derived and materialized only when an explicit caller supplies date + ledger mapping + due-date policy (all `materialize*ForDate` APIs); no periodic synthesis runs in production (CalendarEngine phase skipped, §R).
8. **Budgets constraints or informational?** Informational. `getBudgetComparison` reports variance/overrun but no code path blocks contracts, Treasury, salary cap or governance on budget state (as documented in `docs/FINANCE_V2.md` CF6 and confirmed in code — no consumer of `getBudgetComparison` exists outside UI/health).
9. **Commitments separated from paid cash?** Yes: `FinancialCommitment` → `ExpenseRecognition` → `Payable` → `TreasurySettlement` → ledger posting; `getOutstandingCommitments` vs cash balances (`RecognitionQueries.ts:102`, `CashFlowQueries.ts`).
10. **P&L vs cashflow distinction?** Yes: recognition queries (accrual) vs settlement/ledger cash movements (`getCashMovementsBetween`), plus derived liquidity projections (`getCashFlowProjection`, `getLiquiditySnapshot:191`).
11. **Financial period/season close?** **No.** `FiscalPeriod` has `OPEN|CLOSED` but nothing closes a period; there is no season-close finance step and no budget/forecast renewal (`startNextSeason.ts` only rolls salary/trade rules: `rollForwardSalaryRules:219-229`).
12. **Historical accounts preserved?** Yes — append-only + immutable facts; save round-trips them (`FinancePersistence.test.ts`).

**Duplicated / competing authorities identified**

| Concern | Canonical (Finance V2) | Competing legacy authority | Live usage |
|---|---|---|---|
| Cash | CF1/CF2 ledger cash accounts | none | canonical (empty) |
| Contract affordability (players) | none (CF6/CF11 exist but unused) | `TeamFinances.playerSalaryBudget` + `canTeamAffordAdditionalSalary` (`src/domain/world/finances.ts:9-10`) | legacy is the only live check: `MarketService`, `AiRosterMaintenance.ts:52`, `FreeAgentSigningService.ts:65`, `FormalOfferPreparation.ts:100`, `FreeAgentOfferIntelligence.ts:155`, `MarketCandidateFeasibility.ts:74`, `PlayerContractSigningGovernanceService.ts:343,392`, `NegotiationCounterResponseService.ts:104`, `AiRetentionEngine.ts:95,210`, `MarketWorkspace.tsx:61`, `DesktopCanonicalSurfaceLayer.tsx:17` |
| Staff affordability | none | `TeamFinances.staffSalaryBudget` + `canTeamAffordAdditionalStaffSalary` (`finances.ts:28-31`) | `StaffCareerService.ts:123,154` |
| Payroll projection | CF5 schedule (cash salary, no currency) | `world/finances.ts:8,18-26` (cap-hit based, unitless) | legacy used by advisory/services; CF5 used by planning/UI/health |
| Budget pools vs cash | CF6 budgets (unused) | `TeamFinances` pools | legacy |
| Coach personal economy | separate canonical domain (`coachFinancesByCoachId`, monthly processor `CalendarEngine.ts:155`) | — | GRAY (career feature, not club finance) |
| Salary cap | separate canonical engine (`src/engine/salary/*`, capHit units) | — | GRAY (not cash) |

---

## 3. Money creation / destruction audit

Every production route that can change club money, with its canonical accounting status:

| # | Route | Source → consequence | Ledger/record | Verdict |
|---|---|---|---|---|
| 1 | Facilities maintenance authorization | `authorizeFacilityMaintenanceExpenditure` → `AuthorizedOperatingCostFact` + optional `FinancialCommitment`/`ExpenseRecognition`/transaction | yes (factories + `FacilityFinancialBinding`) | **PASS** (canonical facts; called only from tests today) |
| 2 | Facilities funded project start / capital payment / debt binding | `FacilityFinanceOrchestration.ts:306,354,426` → commitments/recognitions/transactions/debt | yes | **PASS**; only route 2-start is wired (`FacilityProjectCommands.ts:129`) |
| 3 | Free-agent signing agent fee | `FreeAgentSigningService.ts:87-94` → `FinancialCommitment` | yes (direct factory, content-addressed id) | **PASS with note** (bypasses CF4 adapter; no recognition/settlement producer) |
| 4 | Retention signing agent fee | `RetentionSigningService.ts:139-146` → `FinancialCommitment` | yes | same as 3 |
| 5 | Player/staff salary signing (market, AI, trades, retention) | contract changes only; **no finance fact** | none | **FAIL** (salary obligations never reach canonical finance; affordability is a legacy budget-pool check) |
| 6 | Daily/season revenue, payroll materialization | `materialize*ForDate` hooks | would be canonical | **FAIL (dormant)**: no production caller; calendar phase skipped (`CalendarEngine.ts:190`) |
| 7 | Owner funding / capital / competition distributions | `processOwnerFundingEconomicEvent`, `CompetitionEconomy` materializers | canonical | **DORMANT**: no production caller |
| 8 | Debt interest / drawdown / repayment | `DebtEngine` | canonical | **DORMANT**: no production caller |
| 9 | Fines / regulation | `recordAuthorizedFinancialFine` / assessments | canonical | **DORMANT**: no production caller |
| 10 | Save/load | `GameWorldSaveV4` serialization → rehydration through `updateGameWorld` | preserves all facts; older saves default empty (`:347-373`) | **PASS** |
| 11 | Legacy `TeamFinances` pools | generator/enrichment (`engine/world/TeamFinancesGenerator.ts`, `TeamFinancesEnrichment.ts`), save V1/V3 migrations | not cash; only budgets | **PARTIAL** (documented legacy; still the live affordability authority) |

No path was found that mutates cash/budget **without** a canonical record; the failure mode is rather that the canonical record is never created for the dominant gameplay flows (salary, revenue, costs, competition money).

---

## 4. Revenue audit

| Revenue type | Implemented? | Amount authority | Frequency | Context | Transaction created? | Forecastable? | AI-visible? | Historical? | Tested? |
|---|---|---|---|---|---|---|---|---|---|
| Ticketing/attendance/matchday | Seam only: `RevenueSource` category `TICKETING` + `createTicketRevenueFact` (`RevenueEngine.ts`) | explicit supplied fact | policy `ONE_OFF/ANNUAL/SEASONAL/EXPLICIT_SCHEDULE` | team/competition dims | only when `materializeRevenueForDate` is called | yes (CF6/CF7 schedule) | no | yes if materialized | partially (`RevenueEngine.test.ts`) |
| Season tickets | Category `SEASON_TICKETS` (same seam) | explicit | policy-driven | team | as above | yes | no | yes | partial |
| Competition prize/distributions | Yes: `CompetitionEconomy.ts` (`PRIZE`, distributions), CF4 competition adapter | external entitlement amount required — **finance never computes awards** | explicit facts | competition/season/team | compatibility with CF4 → recognition → receivable | yes | no | yes | `CompetitionEconomy.test.ts`, `FinanceCF9Persistence.test.ts` (thin) |
| Broadcast/media | Category `MEDIA` + `RevenueSourceAuthority: 'MEDIA'` | explicit | policy-driven | org/competition | as above | yes | no | yes | partial |
| Sponsorship/commercial | Category `SPONSORSHIP`/`HOSPITALITY`/`LICENSING`; no negotiation or contract-creation flow | explicit | policy-driven | org/team | as above | yes | no | yes | partial |
| Merchandising | Category only | explicit | policy | org | as above | yes | no | yes | partial |
| Transfers/buyouts | Category `TRANSFER_BUYOUT` only; trade service explicitly blocks cash settlements (`TradeNegotiationService.ts:129` `CASH_SETTLEMENT_UNAVAILABLE`) | — | — | — | no | no | no | no | no |
| Ownership injections | `processOwnerFundingEconomicEvent` (OWNERSHIP/GOVERNANCE authority) → ledger receipt, equity, never revenue | external authorization | explicit | org | yes (when called) | n/a | no | yes | `EconomicEventAdapters.test.ts` |
| Grants/subsidies | Category `GRANT`/`DONATION` | explicit | policy | org | as above | yes | no | yes | partial |
| Facility income | Category `FACILITY` | explicit | policy | facility dims | as above | yes | no | yes | partial |

**Finding:** the revenue *taxonomy and accounting seams are complete*, but **no live producer exists** for any revenue type (no attendance/ticketing producer, no sponsorship generation, no media rights, no prize calculation). Per the milestone instruction, nothing was invented; these remain missing authorities.

## 5. Cost audit

| Cost | Implemented | Accrued (recognition) | Committed | Paid (settlement) | Forecast | Collapsed incorrectly? |
|---|---|---|---|---|---|---|
| Player salaries | CF5 schedule from contracts (`cashSalary`, guaranteed/conditional split) | via `materializeContractFinanceForDate` (dormant) | yes (commitments on materialization) | via Treasury settlement (dormant) | yes (CF6 `knownCommitments`, payroll queries) | No — distinct, but **no producer** and no currency in the source contract |
| Staff salaries | CF5 schedule (`STAFF_CONTRACT_EXPENSE_DUE`) | same | same | same | same | same |
| Bonuses/incentives | Only `CONTRACT_BONUS_DUE`/`CONTRACT_BUYOUT_DUE`/`CONTRACT_TERMINATION_PAYMENT` event types exist; contract domain has no bonus/buyout payment terms (retention proposals carry nonbinding incentives/options) | no | no | no | no | Deferred by design (documented) |
| Agent fees | yes — direct `FinancialCommitment` on free-agent/retention signing | no recognition | yes | no | yes (outstanding commitments) | no |
| Facility OPEX/CAPEX/maintenance | yes — CFI7 orchestration (`costNature` OPERATING/CAPITAL, category FACILITY…) | optional immediate recognition | yes | capital payments create transactions | yes | no |
| Travel/accommodation/medical/scouting/academy ops | CF8 categories + `AuthorizedOperatingCostFact` seam; **no producers** | only via explicit facts | via facts | via settlement | yes | no |
| Taxes/fees | Not modelled (fine via `AUTHORIZED_FINANCIAL_FINE` path only) | — | — | — | — | missing authority |
| Debt service | Yes — interest recognition via CF4 `DEBT_ENGINE`; principal repayment posts financing transactions (`DebtEngine.ts:140`) | yes | yes | yes (transaction) | yes (`getDebtServiceForecast`) | no |
| Other recurring costs | OPEX `ANNUAL/SEASONAL` schedules | as above | as above | as above | yes | no |

**Finding:** the accrued/committed/paid/forecast separation is modelled correctly and consistently; the gap is producer coverage and the missing contract-side payment terms (bonuses, proration, currency).

## 6. Budget / forecast audit

| Question | Can BDM answer today? | Evidence |
|---|---|---|
| How much cash do I have now? | Yes in code, but **empty in gameplay** (no accounts provisioned) | `getCashBalancesByCurrency:86`; UI `HomeDashboardSlot.tsx:317` |
| What am I already committed to pay? | Yes (commitments query) — only if commitments were produced (facilities/agent fees today) | `getOutstandingCommitments:102` |
| What income is expected? | Yes from contracted `RevenueSource`s (none exist in production) | `getRevenueSchedule:138` |
| What costs are expected? | Yes from OPEX sources/contracts schedule (none exist in production except facility facts) | CF5/CF8/CF9 forecasts |
| Season-end projection? | Yes derived (`createFinancialForecast`, `getProjectedLiquidity`) | UI forecast tab |
| Can I afford a proposed action? | **No canonical check exists**; all live checks use legacy pools | `canTeamAffordAdditionalSalary` callers (§2) |
| Does the AI know this? | Only strategic pressure (`ClubStrategyEngine.ts:81` health) and advisories; decisions use legacy pools | §2, §11 |
| Can two simultaneous decisions overspend the same budget? | **Yes** — no reservation/commitment gate on any decision path | no reservation code; budgets informational |
| Are budgets hard limits, soft policies or reporting? | Reporting only | no enforcement consumer |

**Missing mechanisms:** (a) provisioning of accounts/profiles/periods; (b) an affordability query layer over cash + commitments + budget; (c) reservation of headroom for pending negotiations/commitments; (d) budget renewal and period close at season boundaries; (e) contract-side currency policy.

## 7. Contract / market boundary (audit only; no shared-system change)

Finance receives:
- **Salary commitments:** CF5 derives them from contracts, but only when `materializeContractFinanceForDate` is invoked (dormant). Contract models carry `cashSalary`, `capHit`, `guaranteedAmount`, no currency, no payment dates (documented) — materialization requires an explicit currency policy and `ON_RECOGNITION` due-date policy.
- **Bonuses/incentives/guarantees/buyouts/releases/termination effects:** event types exist (`CONTRACT_BONUS_DUE`, `CONTRACT_BUYOUT_DUE`, `CONTRACT_TERMINATION_PAYMENT`), producers do not. Contract termination (release) only changes future derived schedule entries; existing facts are append-only (documented; `ContractReleaseService.ts:66` reads schedule for preview only).
- **Signing costs:** two flows record agent-fee commitments (free agency, retention). Nothing else posts salary obligations.

**Required shared-system changes (not performed) → `DEFERRED_INTEGRATION_AFTER_BS15`:**
- `DEFERRED_INTEGRATION_AFTER_BS15` — wire contract signing/release services (`src/app/market*`, `src/app/contractRetention`, `src/app/governance/PlayerContractSigningGovernanceService.ts`) to the canonical finance authority (cash/commitment/budget), replacing or subordinating `canTeamAffordAdditionalSalary`/`canTeamAffordAdditionalStaffSalary`.
- `DEFERRED_INTEGRATION_AFTER_BS15` — contract lifecycle events (salary due, termination payments, bonuses) as CF4 events; requires contract-domain payment terms and a contract currency (shared contract model change).
- `DEFERRED_INTEGRATION_AFTER_BS15` — any change to `GameWorld.ts`, Save V4 or `advanceGameDay`/`CalendarEngine` needed to run finance materialization automatically.

## 8. Facilities / governance boundary

**Facilities (CFI7)** — `src/integration/facilitiesFinance/*` is the only layer combining Facilities commands with Finance facts, atomically, with content-addressed ids (module header comment). Responsibility split:
- Facilities own: condition, maintenance needs/actions, development projects, physical outcomes.
- Finance owns: commitments, recognitions, ledger transactions, bindings, expenditure queries (`FacilityFinanceQueries.ts`: committed/recognized/paid/outstanding/funding/underfunded).
- Production wiring is partial: only `executeFundedFacilityProjectStart` is called from `src/app/facilities/FacilityProjectCommands.ts:129`; `authorizeFacilityMaintenanceExpenditure`/`executeFundedMaintenanceAction`/`executeFacilityProjectCapitalPayment`/`bindFacilityProjectDebtFinancing`/`completeFundedFacilityDevelopmentProject` have no production callers outside their module and tests.
- No CAPEX accounting/depreciation exists (documented; CAPEX classified, not depreciated) — missing authority (BS17 territory → GRAY for Finance).

**Governance** — Governance authorization is consumed as provenance/approval metadata only (`BudgetApproval`, `FinanceDecisionProposal.authorityRequired`, `resolveFinanceProposal` gating on a matching governance decision `FinanceAI.ts:69-77`). Finance creates no approvals and no owners. Conversely, `PlayerContractSigningGovernanceService` blocks signings on legacy payroll budget, not canonical budgets/cash (`:343,:392`).
- `DEFERRED_INTEGRATION_AFTER_BS15` — Governance approval of canonical budgets/capital actions and any automatic spending restriction (requires governance product decisions).

## 9. AI audit

| AI decision | Financial inputs (actual) | Affordability check | Classification |
|---|---|---|---|
| AI free-agent signings / roster maintenance (`AiRosterMaintenance.ts:52`) | legacy `playerSalaryBudget` | legacy check | (b) stale/duplicated authority |
| AI offer preparation / feasibility (`FormalOfferPreparation.ts:100`, `MarketCandidateFeasibility.ts:74`, `FreeAgentOfferIntelligence.ts:155`) | legacy budget | legacy | (b) |
| AI counter responses (`NegotiationCounterResponseService.ts:104`) | legacy budget | legacy | (b) |
| AI retention (`AiRetentionEngine.ts:95,210`) | legacy budget | legacy | (b) |
| AI trades | salary matching via cap rules; cash settlements blocked | n/a | (d) cannot spend cash |
| Staff career AI (`StaffCareerService.ts:123,154,379`) | legacy `staffSalaryBudget` | legacy | (b) |
| Club strategy (`ClubStrategyEngine.ts:81-84`) | canonical health snapshot (distress indicators) | advisory only | (a) canonical read |
| Basketball operations advisories (`BasketballOperationsAdvisory.ts:67,104`) | legacy snapshot | advisory | (b)/advisory |
| Finance AI (`FinanceAI.ts`) | canonical health + budget comparison | never executes | (d) advice only |

**Answers:** AI does **not** see canonical cash/budgets/forecasts/commitments for decisions; it sees legacy budget pools. AI can therefore "spend" (commit salary) with no canonical cash linkage; AI ignores future canonical commitments; AI and user share the same legacy authority (consistent, but the wrong one relative to Finance V2); no AI path bypasses canonical finance because none use it. AI advice exists (`recommendFinanceActions`, deterministic, policy-gated) but is never invoked in production.

## 10. Multi-season / long-horizon audit

Evidence from code and focused tests (no multi-year simulation started):
- **Balance resets:** none (no balance state); ledger append-only across seasons in principle.
- **Duplicated recurring transactions:** idempotency keys/ids prevent duplicates within a world; nothing repeats because nothing runs.
- **Missing rollover:** budgets, forecasts, fiscal periods, revenue/cost sources, debt and regulation assessments have **no season-close/renewal logic**; `startNextSeason.ts` rolls salary/trade rules only. Commitments/payables/receivables persist (good).
- **Unbounded histories:** all finance collections grow monotonically (append-only) with no archival/compaction; simple queries are O(n) scans. Acceptable in the short term; a long-career risk.
- **Stale forecasts:** forecasts are always recomputed from current world state (never cached) — correct.
- **Budgets not renewed:** confirmed (no producer for budgets at all; `getActiveApprovedBudget` will return nothing for new periods).
- **Sponsorship/revenue duplication:** impossible today (no producer), but there is no producer-side idempotency contract beyond content-addressed ids.
- **Obligations never expiring:** commitments have `cancelledOn` and due dates; nothing cancels expired obligations automatically (no lifecycle).

## 11. Financial invariants — enforcement and tests

| # | Invariant | Enforced? | Evidence | Test coverage |
|---|---|---|---|---|
| 1 | Transaction identity unique | PASS | `indexById` throws on duplicate ids (`GameWorld.ts:2434-2446`) | `FinancialLedger.test.ts` |
| 2 | Same event cannot be charged twice | PASS (canonical paths) | CF4 idempotency tuple + replay checks (`EconomicEventAdapters.ts:310-338`); settlement duplicate checks (`Treasury.ts:254-266`); unique recognition/commitment provenance (`GameWorld.ts:2843`); content-addressed ids in facilities/signing flows | `EconomicEventAdapters.test.ts`, `Treasury.test.ts`, `RevenueEngine.test.ts` (idempotent retry), `CF11.test.ts` |
| 3 | Cash cannot change without attributable canonical event | PASS (design) | no mutable cash field; postings require provenance; settlements require obligations | `FinancialLedger.test.ts`, `Treasury.test.ts` |
| 4 | Committed ≠ paid | PASS | commitment/entitlement vs settlement; remaining amounts derived | `Recognition.test.ts`, `Treasury.test.ts` |
| 5 | Historical transactions do not mutate | PASS | append-only + immutability checks (`GameWorld.ts:2851-2931`) | `FinancialLedger.test.ts` |
| 6 | Period totals reconcile | PARTIAL | recognition/query totals derive from facts; **no period close operation exists**, no reconciliation test | `CF10.test.ts` (assessment window only) |
| 7 | Save/reload does not alter financial meaning | PASS | optional collections + rehydration (`GameWorldSaveV4.ts:347-403`); round-trip tests; `persistentWorldTruth.ts` helper | 8 persistence tests |
| 8 | AI and user operate through the same financial authority | **FAIL** | both use legacy pools; canonical authority unused (§9) | none |
| 9 | Currency/unit coherence | PARTIAL | money = integer minor units + ISO code; multi-currency never summed without explicit FX (`EconomicEnvironment.ts:82`, `EconomicReporting.ts`); **contracts/salary cap are unitless integers with no currency field** (CF5 requires explicit policy) | `CF10.test.ts`, `RevenueEngine.test.ts` (per-currency) |
| 10 | Future obligations survive season boundaries | PASS (structural) / FAIL (renewal) | obligations persist by design; budgets/sources do not renew | none for renewal |
| 11 | Determinism | PASS | no `Math.random(` in `src/` (verified); finance is pure over world; deterministic sort orders | `CF11.test.ts` (identical advice) |
| 12 | Derived values are not persisted | PASS | balances/forecasts/variance/health/valuation never stored; Save V4 stores facts only | persistence tests |
| 13 | Every money movement is double-entry | PASS | `createFinancialTransaction` requires balanced ≥2 postings, distinct accounts | `FinancialLedger.test.ts` |
| 14 | Simultaneous decisions cannot overspend | **FAIL** | no reservation/commitment gate; budget checks are read-only | none |
| 15 | Replay across save/reload cannot double-charge | PARTIAL | idempotency derived from persisted facts (documented) but no test that replays an event after save/load | `CF11.test.ts` (proposal replay only) |

## 12. Test audit

Focused run (this milestone): **34 test files / 262 tests / all passing** (vitest, node env; UI workspace test included). Full-suite BDM was not run (per milestone).

| Subsystem | Coverage | Notes |
|---|---|---|
| CF1 ledger | FULLY | immutability, balance derivation, org isolation, append-only rejection (`FinancialLedger.test.ts`) |
| CF2 Treasury/cash | FULLY | settlement bounds, currency/org crossing, cancelled obligations, duplicate settlement (`Treasury.test.ts`) |
| CF3 recognition/commitments | FULLY | accrual vs settlement separation, links, entitlement caps (`Recognition.test.ts`) |
| CF4 adapters/idempotency | FULLY | replay, conflict rejection, atomicity, authority checks (`EconomicEventAdapters.test.ts`) |
| CF5 contract schedule | FULLY | schedule derivation, guaranteed/conditional, materialization idempotency (`ContractFinancialSchedule.test.ts`) |
| CF6 budgets/forecast | PARTIALLY | creation, comparison, variance; no season renewal, no enforcement-boundary tests (`BudgetForecasting.test.ts`) |
| CF7 revenue | PARTIALLY | schedule/idempotency/collection; no ticketing producer (`RevenueEngine.test.ts`) |
| CF8 operating costs | PARTIALLY | schedules, payroll rejection, idempotency (`OperatingCostEngine.test.ts`) |
| CF9 debt/competition | PARTIALLY / thin | debt tests 24 lines; competition 20 lines + 10-line persistence test |
| CF10 regulation/FX | PARTIALLY | metrics, assessments, conversion (`CF10.test.ts`) |
| CF11 health/valuation/AI | PARTIALLY | snapshot, valuation math, deterministic advice, governance gating (`CF11.test.ts`) |
| Persistence | FULLY per collection | 8 finance persistence tests + pre-CF1 defaults |
| Facilities integration | FULLY | 399-line integration test (atomicity, bindings, funded flows) + production command tests (`app/facilities/FacilityProjectCommands.test.ts`, `FacilityGameplayPersistence.test.ts`) |
| UI read model | PARTIAL | `FinancesWorkspace.test.tsx` renders sections from canonical queries |
| Multi-season lifecycle | UNTESTED | no season rollover/renewal tests |
| AI/user authority parity | UNTESTED | no test asserts canonical affordability |
| Reservation/concurrency | UNTESTED | mechanism absent |

No `.skip`/`.todo`/`.only` in finance suites (verified).

## 13. Product-truth view

| Capability | Rating | Why |
|---|---|---|
| Ledger & transaction truth | GREEN | immutable, validated, reconstructible, tested |
| Cash balance authority | GREEN | single derived authority, no competing field |
| Provisioning & activation (accounts, profiles, periods, opening balances) | RED | no production code creates any of them |
| Contract payroll → finance | YELLOW | strong derived model + hook; never invoked; no currency/payment terms |
| Revenue producers | RED | seams only; no ticketing/sponsorship/media/prize producer |
| Cost producers | YELLOW | facility path wired partially; other OPEX seams unused |
| Budgets as control | RED | informational only; no enforcement, reservation or renewal |
| Forecasting | YELLOW | derived and correct; no producer inputs, no season rebase |
| Debt/financing | YELLOW | model + materialization; no producer |
| Competition economy | YELLOW | fact/adapter model; no award authority or producer |
| Financial regulation/FFP | YELLOW | assessment mechanics; rules external (missing authority) |
| Health/valuation/advice | YELLOW | correct pure queries; AI advice never invoked |
| AI financial intelligence | RED | decisions use legacy budget pools; no canonical affordability |
| Persistence | GREEN | Save V4 optional collections, round-trip verified |
| Lifecycle/season close | RED | calendar phase skipped; no rollover for budgets/periods |
| UI read models | YELLOW | canonical CF12 workspace wired; legacy finance panels remain; empty data in practice |
| Facilities/gov boundary | YELLOW | clean separation; partial wiring; CAPEX/depreciation missing |
| Coach personal finances | GRAY | separate career domain (works, monthly processor) |
| Salary cap | GRAY | separate authority; capHit units, not cash |

**Finance V2 current system-truth score: 3 / 10** as a *connected gameplay finance system* (backend quality ≈ 8/10, integration/liveness ≈ 2/10).

## 14. Validation performed (audit-only)

| Check | Result |
|---|---|
| Focused finance tests (`npm test -- src/domain/finance src/domain/salary src/engine/salary src/engine/world src/engine/coachFinances src/integration/facilitiesFinance src/ui-ng/applications/finances src/save/TreasuryPersistence src/save/BudgetForecastingPersistence src/save/RevenueEnginePersistence src/save/OperatingCostEnginePersistence src/save/FinancePersistence src/save/FinanceCF9Persistence src/save/FinanceCF10Persistence`) | 34 files / 262 tests passed (23.5 s). The path filters also include a few non-finance `src/engine/world` generator suites; all were green. |
| `npm run typecheck` | passed (exit code 0, no output — `tsc -b --pretty false`) |
| `git diff --check` | clean (exit 0); the new untracked file was additionally scanned — 0 trailing-whitespace lines |
| `Math.random(` in `src/` | zero matches (`git grep`) |
| React/Zustand/Tauri imports in `src/domain` + `src/engine` | none (only a test asserting the rule) |
| `npm run build` | not run — audit changes are documentation only (milestone allows skipping) |
| Rust checks (`cargo fmt/check`) | not applicable (no Rust touched; milestone narrows validation to finance tests + typecheck + diff check) |

## 15. Output roadmap (BS16B onward)

> **SUPERSEDED / REFINED BY IMPLEMENTATION DISCOVERY — preserved as history.** This table was the legitimate, evidence-based plan at audit time. Deeper System Truth auditing exposed additional Finance layers that must exist before final certification — monetary-boundary correctness, shipped currency provisioning, an explicit opening economic state, the daily lifecycle processor, treasury settlement, real revenue/OPEX sources, financing/capital acquisition and consumer convergence — so the endpoint below ("BS16H — Finance Certification") is superseded by **BS16N — Long-Horizon Finance Certification**. The rows are kept verbatim. Audit-time findings elsewhere in this document (for example the "the `CLUB_FINANCE_V2` phase is always skipped" and dormant-lifecycle findings) describe the state at `a682646`; the current state and the canonical continuation are recorded in §16.

Evidence-driven; shared-file risk marked. All wiring into the BS16A exclusion zone is deferred.

| Block | Exact scope | Dependencies | Shared-file risk | Expected value | Acceptance gate |
|---|---|---|---|---|---|
| **BS16B — Finance Activation Foundation** (implementation) | Deterministic organization account catalog + ledger-mapping policy + currency policy from `OrganizationFinancialProfile`; pure provisioning helper that creates accounts/profiles/opening fiscal period for a world; unit + world-validation tests. No wiring into `createNewGame` yet. | none | LOW (new files in `src/domain/finance` + a new `src/integration` module) | Makes every later materialization possible (all materializers need account mappings) | New helper creates a valid, validated finance world; tests green; zero shared-file edits |
| **BS16C — Canonical Affordability Queries** (implementation) | Finance-owned affordability/headroom queries: cash available, commitments due, budget headroom, per-organization per-currency; deterministic; plus "cannot afford" decision contract. | BS16B (needs accounts to be meaningful, but queries are pure) | LOW | Gives AI/user a single authority to replace `canTeamAffordAdditionalSalary` checks | Query layer tested; no consumer switch yet |
| **BS16D — Lifecycle & Season Closure** (implementation + deferred wiring) | Pure orchestration for daily materialization (contract schedule, OPEX, revenue, debt service + settlement policy) and season close (fiscal period close, budget/forecast renewal, obligation review). Wiring into `CalendarEngine`/`advanceGameDay`/`createNewGame` marked `DEFERRED_INTEGRATION_AFTER_BS15`. | BS16B | MEDIUM→HIGH for wiring (exclusion zone), LOW for pure code | Removes the dormant-phase finding; gives multi-season continuity | Pure orchestration tests (multi-day, cross-season rollover); wiring explicitly deferred |
| **BS16E — Decision Safety (reservations)** | Commitments-as-reservations for pending negotiations/capital actions so two simultaneous decisions cannot overspend the same headroom; deterministic reservation lifecycle (open/consume/release). | BS16C | MEDIUM (touches market/negotiation flows that are shared) | Closes invariant #14; enables safe AI+user parallelism | Reservation tests + a documented decision path; market wiring deferred if shared |
| **BS16F — Producer Coverage** | Wire authoritative producers for the highest-value flows in non-excluded files: staff/player payroll postings at signing (via CF5/CF4), facility maintenance authorization from the facilities module, agent-fee recognition/settlement, owner funding/authorization surfaces. | BS16B, BS16D | MEDIUM (market/signing services may be shared) | Moves Finance from "backend" to "live system" | Producers create canonical facts in a scripted world; idempotency preserved |
| **BS16G — Revenue/Economy Authorities** (product decision gate) | Attendance/ticketing facts, sponsorship lifecycle, media rights, competition award rules, taxation — each requires an owning authority and approved rules; per audit none exist. Scope only after human approval of those product decisions. | product decisions | HIGH (Recruiting/NCAA/Draft/competition = exclusion zone) | Only path to real economic gameplay | Approved authority list + implementation per authority |
| **BS16H — Finance Certification** | Certification run: provisioning + lifecycle + affordability + reservations + producers, single-season and two-season checks, save/load, determinism. | all above | LOW | Formal closure of Finance System Truth | Certification doc + green gates |

Do **not** blindly continue CF-roadmap ordering: the evidence says the minimum path to Finance System Truth is provisioning (B) → affordability queries (C) → lifecycle/season close (D) → decision safety (E) → producers (F), with G gated on product decisions and H closing.

---

## 16. Canonical BS16 roadmap (reconciled 2026-10-09)

**This section is the single authoritative BS16 Finance roadmap.** It records the milestones actually implemented (evidence: commits and certification tests, never prose alone), the reframing of §15, and the approved continuation. §15 remains above as the historical plan of record.

### 16.1 Implemented lineage

| Milestone | Title | Status | Implementation evidence |
|---|---|---|---|
| BS16A | Finance System Truth Audit | **PASS** | `b100961` (audit-only); this document |
| BS16B | Finance Foundation | **PASS** | `445fb1d` (canonical provisioning: account catalog, ledger mapping, currency and fiscal period), `cedbb71` (certification) |
| BS16C | Financial Authority & Reservation Truth | **PASS** | `3628e17` |
| BS16D | Spending Authorization Truth | **PASS** | `0896a4a` |
| BS16E | Authorization Activation | **PARTIAL at the original milestone**; the activation blocker was reconciled by the BS16F tranche (`c9fbafb`) | `361b9b3` |
| BS16F | Canonical Currency & Shipped Finance Provisioning | **PASS** | `c9fbafb` (activation reconciliation), `755ee03` (canonical currency provisioning), `eb01799` (shipped activation certification), `1e9db17` (World DB Spain finance boundary) |
| BS16G | Monetary Boundary & Fiscal Period Truth | **PASS** | `88a010b` (every legacy money boundary crossed once), `ecfa182` (fiscal periods derived from the fiscal year, not the season) |
| BS16H | Opening Economic State Authority | **PARTIAL** | `8cdf963` (authority), `884b420` (certification) |
| BS16I | Contract Payroll & Daily Finance Lifecycle | **PASS** | `87a24a0`, `76a3dcf`; final closure `f176bc8` |

Status rules that must not be relaxed:

- **BS16H stays PARTIAL and is not retroactively promoted to PASS.** The authority exists and is certified, but no shipped world carries a legitimate opening economic source (`OPENING_ECONOMIC_STATE_UNAVAILABLE`), so truthful zero cash remains canonical. This is not a blocker for BS16J/BS16K, because zero cash is a valid and honest state.
- **BS16E stays PARTIAL for its original milestone.** Its authorization activation was reconciled with the canonical finance foundation in `c9fbafb`, which belongs to the BS16F tranche.
- **BS16I is PASS**, including the initial career date: `createNewGame` processes `processClubFinanceForDate(currentDate)` exactly once, and the first normal Advance Day processes the next GameDate.
- Every commit above is a **local** commit on `bdm-stage2-bs16-finance-canonical`; nothing is claimed as pushed or merged.

### 16.2 Approved continuation

#### BS16J — Treasury & Settlement Truth

Goal: turn canonical outstanding payables into real cash settlements when actual liquidity exists.

Scope: payable eligibility by due date; canonical treasury settlement authority; deterministic organization and currency isolation; no negative cash; no invented overdraft; idempotent and save-safe settlement; an explicit insufficient-liquidity state; no arbitrary creditor priority.

Approved default policy for automatic settlement — for each organization and date, the eligible due payables form **one canonical due batch**:

- if cash covers the **entire** eligible batch → settle all;
- if cash does **not** cover the entire eligible batch → settle **none** automatically.

Reason: BDM has no canonical creditor-priority policy, so BS16J must not invent payroll-first priority, oldest-first priority, proportional allocation, smallest-first allocation or a financing fallback.

No consumer migration in BS16J.

#### BS16K — Revenue & Operating Cost Source Authority

Goal: create legitimate shipped economic-source producers so canonical Finance has real recurring inflows and outflows beyond payroll.

Scope: audit existing shipped data; competition/media/commercial revenue authority; operating-cost authority; use only defensible source data and policy; feed the existing Revenue/OPEX engines; lifecycle, save and idempotency correctness; no reputation-based or random cash formulas.

Do not treat authorization as revenue.

#### BS16L — Financing & Capital

Goal: model the explicit acquisition of liquidity.

Must distinguish `FinancingAgreement` from `CapitalContribution`, and the funding actor must stay generic enough for an external financial institution, an owner, a person/coach or another organization.

Ownership boundaries: Finance owns economic facts, Governance owns approval and conflict authority, Human RPG owns personal wealth and roles. No bank-only architecture.

#### BS16M — Canonical Consumer Convergence & Financial AI

Goal: move gameplay affordability and financial decisions from legacy `TeamFinances` to canonical Finance only after the canonical lifecycle is economically trustworthy.

Scope includes the controlled migration of contracts, market, staff, relevant AI and other affordability consumers.

Requirements: explicit parity/divergence certification; no dual-write; retire legacy authority only when safe; AI understands liquidity, authorization, commitments and funding gaps.

#### BS16N — Long-Horizon Finance Certification

Goal: final System Truth certification for Finance, covering fiscal rollover, budget renewal authority, season close, long-horizon ledger integrity, save/load, revenue and cost continuity, debt/financing continuity, AI continuity, performance and growth, and multi-season economic plausibility.

This is the final BS16 Finance certification milestone. It supersedes the §15 definition "BS16H — Finance Certification", because implementation discovery revealed the required intermediate System Truth layers.

### 16.3 Scope uniqueness

**BS16J has exactly one canonical definition: §16.2 of this document.** Any other description of BS16J — including session notes or prompts — is not canonical. The remaining roadmap after BS16I is exactly BS16J → BS16K → BS16L → BS16M → BS16N, and no BS16 milestone beyond BS16N is defined.

### 16.4 Product principles

The invariants that govern every milestone above (AUTHORIZATION ≠ CASH, CASH ≠ REVENUE, REVENUE ≠ FINANCING, LOAN ≠ CAPITAL CONTRIBUTION, PAYABLE ≠ PAYMENT, BUDGET ≠ OPENING BALANCE, ZERO CASH MAY BE TRUE, and "if Finance cannot explain where money came from, it must not create it") are recorded canonically in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) under "Finance invariants and principles".

---

## Final report

**BS16A: PASS (audit complete; no production change attempted; validation baseline green).**

| Area | Status | Main evidence | Gap |
|---|---|---|---|
| Ledger/accounting truth | GREEN | `FinancialLedger.ts`, `GameWorld.ts:2656-2927`, `FinancialLedger.test.ts` | none material |
| Cash authority | GREEN (but empty) | `CashFlowQueries.ts`, no mutable cash field | nothing provisions accounts |
| Revenue coverage | RED | taxonomy + seams only (`RevenueEngine.ts`) | no producers; no award/ticketing/media authorities |
| Cost coverage | YELLOW | CF5/CF8 + facilities path | no producers for payroll/OPEX at signing; no bonus/buyout terms |
| Budget/forecast truth | RED (as control) | `BudgetForecasting.ts` informational | no enforcement, reservation, renewal |
| AI financial intelligence | RED | legacy budgets everywhere (§9) | no canonical affordability; advice unused |
| Persistence/lifecycle | GREEN / RED | Save V4 tests; `CalendarEngine.ts:190` | no lifecycle processor; no season close |
| Cross-system boundaries | YELLOW | CFI7, CF4, governance provenance | partial wiring; legacy affordability crossing into governance |
| Invariants | 10 PASS / 3 PARTIAL / 2 FAIL | §11 | #8 authority parity, #14 reservations, #6 period close |
| Test coverage | Strong backend, weak integration | 262 focused tests green | lifecycle, parity, reservation, season-renewal untested |
| Long-horizon risks | MEDIUM-HIGH | §10 | unbounded histories, no budget renewal, no period close |

**FINANCE V2 CURRENT SYSTEM-TRUTH SCORE: 3 / 10** (connected system view; backend-only view: 8/10).

**RECOMMENDED BS16B:** `BS16B — Finance Activation Foundation` (deterministic organization account catalog + ledger/currency mapping policy + provisioning helper with world-validation tests; no shared-file wiring).

**FILES MODIFIED:** `docs/strengthening/BS16A_FINANCE_SYSTEM_TRUTH_AUDIT.md` (new; this file only).

**BS15 COLLISION RISK: NONE** — work happened only in `C:\BDM-BS16-FINANCE`; canonical tree untouched; no shared/excluded file modified; all required integrations into shared files are recorded as `DEFERRED_INTEGRATION_AFTER_BS15`.

**DEFERRED_INTEGRATION_AFTER_BS15 entries:** contract/market affordability convergence; contract lifecycle events (due/termination/bonus) + contract currency; `createNewGame` finance provisioning; `CalendarEngine`/`advanceGameDay` lifecycle wiring; `GameWorld.ts`/Save V4 changes if any; governance spending restrictions; `AiRosterMaintenance` affordability.
