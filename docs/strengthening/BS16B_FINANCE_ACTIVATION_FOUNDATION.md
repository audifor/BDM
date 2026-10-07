# BS16B — Finance Activation Foundation

**Branch:** `bdm-stage2-bs16-finance-strengthening`
**Worktree:** `C:\BDM-BS16-FINANCE`
**Baseline:** `main` lineage `a682646` (BS16A audit: `docs/strengthening/BS16A_FINANCE_SYSTEM_TRUTH_AUDIT.md`)
**Scope:** audit-only findings established by BS16A are accepted; this milestone activates only the canonical foundation — **no money, no producers, no lifecycle**.

## What BS16B adds

BS16A proved every shipped world starts with an empty Finance V2 state (no accounts, no profile, no fiscal period), so almost all canonical Finance functionality is dormant. BS16B makes canonical Finance *capable of existing*:

```text
Organization -> deterministic finance configuration -> canonical account catalog
-> financial profile -> opening fiscal period -> valid Finance V2 world state
-> deterministic provisioning -> validation -> save/load
```

Implementation: `src/domain/finance/FinanceFoundation.ts` (exported from `src/domain/finance/index.ts`).

## 1. Canonical account catalog

Derived strictly from the account-type checks the existing Finance V2 engines apply — no accounting categories were invented.

| Role | `accountType` | Required by |
| --- | --- | --- |
| `CASH_OPERATING` | `CASH_OPERATING_BANK` | CF2 settlements (`Treasury.validateCashAndOffsetAccounts`), CF4 owner funding / competition receipts, CF9 debt drawdown/repayment (`DebtEngine.createDebtTransaction`) |
| `RECEIVABLE_CONTROL` | `RECEIVABLE` | CF3/CF4 revenue recognition offset (`createRevenueRecognitionLedgerTransaction`), CF2 receivable collection offset |
| `PAYABLE_CONTROL` | `PAYABLE` | CF3/CF4 expense recognition offset (`createExpenseRecognitionLedgerTransaction`), CF2 payable settlement offset, CF9 interest payable |
| `EQUITY_CONTROL` | `EQUITY` | CF4 owner funding offset, CF9 capital contribution / owner distribution |
| `REVENUE_OPERATING` | `REVENUE` | CF7 revenue recognition result, competition distribution receipt offset |
| `EXPENSE_OPERATING` | `EXPENSE` | CF5/CF8 expense recognition result, CF9 interest expense, CFI7 facility expenditure (`LedgerAccountMapping`) |
| `DEBT_LIABILITY` | `LIABILITY` | CF9 debt drawdown/repayment (`DebtEngine.createDebtTransaction`) |

Ids are deterministic and stable: `finance:account:<organizationId>:<currency>:<role-slug>`. The Organization segment may contain `:` (a Team-derived Organization id equals its Team id); parsing resolves from the id suffix, and `assertOrganizationFinanceAccountShape` verifies that any account claiming a canonical id matches the role's account type, Organization, and currency.

## 2. Account mapping authority

`getOrganizationFinanceAccounts` is the single semantic mapping authority; all producers resolve ledger accounts through it (never label matching). Typed resolvers mirror the existing engine seams:

| Resolver | Existing seam |
| --- | --- |
| `resolveCashAccountId` / `resolveCashAccount` | `financialAccountIdFromString` call sites, `SettlementRequest.cashAccountId` |
| `resolveRevenueRecognitionAccounts` | `EconomicEventAdapterOptions['ledger']` for CF4/CF7 revenue |
| `resolveExpenseRecognitionAccounts` | `EconomicEventAdapterOptions['ledger']` for CF4/CF5/CF8 expense; same `{ offsetAccountId, resultAccountId }` shape as CFI7 `LedgerAccountMapping` |
| `resolveOwnerFundingAccounts` | `createOwnerFundingTransaction` / `processOwnerFundingEconomicEvent` |
| `resolveCompetitionDistributionReceiptAccounts` | `createCompetitionDistributionTransaction` (`COMPETITION_DISTRIBUTION_RECEIPT`) |
| `resolveTreasurySettlementAccounts` | `SettlementRequest` cash/offset pair for `RECEIVABLE`/`PAYABLE` |
| `resolveDebtLedgerMapping` | `DebtLedgerMapping` (cash, debt liability, interest payable, interest expense) |

## 3. Currency — exact gap reported

The BDM world model has **no canonical per-Organization currency**: `Organization`, `Team`, `Country`, `Ecosystem` and `Competition` carry no currency field; the only currency-bearing records are Finance V2 facts themselves (accounts, money, capital raises, support pledges) and user input (facilities workspace "ISO code, e.g. EUR"). BS16B therefore does **not** hardcode or infer a currency: `provisionOrganizationFinanceFoundation` requires an explicit `currencyCode` policy input. Once provisioned, `OrganizationFinancialProfile.baseCurrencyCode` becomes the Organization's canonical Finance V2 currency (already consumed by retention/free-agent commitment validation and the facilities read model). No exchange-rate logic was invented.

## 4. Opening fiscal period

One `FiscalPeriod` per (Organization, Season), anchored to the canonical season authority:

- id: `finance:fiscal-period:<organizationId>:<seasonId>`
- `startsOn`/`endsOn`: `Season.startDate`/`Season.endDate` (default season = `world.currentSeasonId`)
- `label`: `Season.label`
- `status`: `OPEN`

`fiscalYearStartMonth` is the calendar month of the season start date (the same anchor as the opening period) unless the caller supplies an explicit month. No period-close or rollover rule was introduced.

## 5. Eligibility (finance-bearing Organizations)

`Organization` has no kind/type field, so eligibility is derived from canonical world structure: an Organization is finance-bearing iff it **owns at least one Team** (`Team.organizationId`). Club organizations qualify (in shipped worlds Organizations are derived from their Teams); league/federation/competition bodies that own no Team do not. `listFinanceBearingOrganizationIds` is the canonical selection query; the provisioner rejects non-eligible Organizations instead of blindly provisioning them.

## 6. Provisioning helper

`provisionOrganizationFinanceFoundation(world, organizationId, { currencyCode, seasonId?, fiscalYearStartMonth? })`:

- provisions **only** missing foundation state (profile, catalog accounts, opening period);
- deterministic — no randomness, no wall clock, no UI, no legacy `TeamFinances` writes;
- idempotent — reprovisioning returns the identical world reference; after save/load the same ids/values are reused;
- never overwrites existing facts — a conflicting profile (currency or fiscal month), a canonical account with a different shape, or an opening period with different dates is rejected;
- creates **no money and no ledger transaction**; cash stays zero until a canonical posting establishes a balance.

## 7. World validation

Canonical `GameWorld` validation already owns account ownership, unique ids, profile/currency/period validity, and append-only finance collections. BS16B reuses it and adds exactly one invariant: canonical-pattern account ids must match their role shape (`assertOrganizationFinanceAccountShape`, called from `validateFinancialState`). No parallel validator was created; overlapping fiscal periods remain permitted because the current model does not prohibit them.

## 8. Existing engine compatibility (no new formulas)

`FinanceFoundation.test.ts` drives existing canonical operations exclusively through the mapping authority: CF7 revenue recognition + CF2 collection settlement, CF8 operating-cost recognition + payable, and CF9 debt drawdown — asserting account balances and that replay is idempotent. No live gameplay producer was activated.

## 9. Legacy boundary

Finance V2 foundation now exists, **but** live affordability authority remains legacy: `TeamFinances.playerSalaryBudget` / `staffSalaryBudget` and `canTeamAffordAdditionalSalary` / `canTeamAffordAdditionalStaffSalary` are untouched. No dual-write and no synchronization bridge. This avoids silently changing gameplay economics before reservation/enforcement exists (later BS16 work).

## 10. Deferred (not in BS16B)

- global activation (`createNewGame`, `CalendarEngine`, `advanceGameDay`) — shared/exclusion-zone files;
- producers (payroll posting, ticketing/media/sponsorship revenue, OPEX, debt service, competition awards);
- season close, budget renewal/forecast rebase, fiscal period close;
- affordability-authority convergence and budget reservations/enforcement;
- AI financial decisions;
- UI changes.
