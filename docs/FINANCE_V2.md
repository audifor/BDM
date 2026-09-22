# Club Finance & Economy V2 — CF1

CF1 establishes the runtime financial foundation. It does not simulate revenue, payroll, debt, tax, valuation, cash flow, or financial UI.

## Authority map

- `Organization` is the economic root. A `Team` is only an analytical dimension/cost or revenue center; it is not automatically a financial owner.
- `OrganizationOwnership`, `OrganizationControl`, ownership transactions, investment interests, and capital raises remain the authority for ownership and control.
- Player and staff contract domains remain the authority for contractual obligations. Finance may later post their economic consequences, but does not create a financial contract copy.
- Competition rules and salary systems remain the authority for salary-cap and sporting regulation. Finance will later record monetary consequences only.
- Governance decides whether an operation is authorized. Finance records its consequences and provenance.
- `GameWorld.currentDate` is the only gameplay clock. Finance has no clock or `Date`-based progression.

## Runtime model

The canonical runtime ledger is composed of:

- `FinancialAccount`: an Organization-owned account with a validated currency and optional open/close dates.
- `FinancialTransaction`: an immutable effective-dated fact with Organization, amount, provenance, optional analytical dimensions, and one or more postings.
- `FinancialPosting`: debit or credit against an account. CF1 uses double-entry and requires equal debit and credit totals in the transaction currency.
- `FiscalPeriod`: an Organization-owned dated reporting boundary.
- `OrganizationFinancialProfile`: non-derived configuration only (base currency and fiscal-year start month). Balances are never stored here.

Money is represented as JSON-safe integer `minorUnits` plus a three-letter uppercase currency code. Floating point, `NaN`, `Infinity`, negative posting amounts, and invalid currencies are rejected. A transaction is valid only when its postings match its amount, currency, Organization, and account life dates. Historical objects are frozen and there is no in-place ledger mutation API.

Queries derive account balances, trial balances, date ranges, Organization/account/source filters, and Team/Section/Competition/Contract dimension filters directly from transactions. A balance is debit minus credit; the signed result is intentionally not persisted.

## BDM-DB → BDM runtime boundary

`C:\BDM_DB` was available and inspected read-only. DDL-11/DDL-12 and the canonical table registry identify `financial_account`, `financial_transaction`, and `financial_posting` as canonical `SHARED_FINANCE` infrastructure. The adjacent canonical tables are `budget`, `revenue_stream`, and `expense_commitment`; `investment_asset`/`investment_position` are also present for later waves. The supplied SQLite world files contain these tables but no finance rows.

BDM-DB remains the definition of the initial world, real/canonical facts, structures, and importable rules. The BDM runtime and Save are the evolving economic state of an individual game. CF1 creates no write path to BDM-DB, so a game can diverge financially without changing the source dataset.

The runtime vocabulary intentionally follows the DB account/transaction/posting boundary. Runtime adds JSON-safe minor-unit money, explicit Organization ownership, provenance, and analytical dimensions needed by the TypeScript domain; future import adapters should map DB rows into these factories rather than introduce a competing model.

## Legacy findings and integrations

- `TeamFinances` is `LEGACY/DERIVED`: it supplies player/staff salary budgets used by existing salary and payroll projections. It remains untouched and is not converted into cash or ledger authority.
- `src/domain/world/finances.ts` is `DERIVED`: payroll snapshots are reconstructed from player/staff contracts and legacy budget pools. CF1 does not persist or replace those projections.
- Existing Organization, ownership, investment, Governance, contract, competition, and salary-cap surfaces are `CANONICAL` for their own concerns and are referenced by finance only.
- Existing finance UI and coach-finance profiles are `UI/CAREER-ONLY` projections and are not connected to the Organization ledger in CF1.

`GameWorld` now preserves optional financial accounts, transactions, fiscal periods, and Organization financial profiles. Save V4 writes them and reads older V4/V1–V3 saves with empty finance collections. No save version increment was necessary because V4 already owns optional additive runtime projections and its migration boundary remains intact.

## CF2 readiness

Treasury & Cash Flow can begin from the stable CF1 seam: Organization-owned accounts, integer money, effective dates, immutable balanced transactions, provenance, fiscal periods, and deterministic as-of queries. CF2 should define cash-account semantics and cash-flow projections on top of this ledger, then add explicit approved inputs for owner funding, capital injections, distributions, and future bank/debt instruments. It should not move ownership, contract, Governance, or salary-cap authority into Finance.

## Deferred by CF1

Ticket sales, sponsorships, merchandising, media rights, payroll progression, debt/loans/amortization, taxation, FFP, luxury tax, salary-cap enforcement, valuation, inflation, FX simulation, owner/budget AI, financial UI, bankruptcy, administration, and insolvency remain future work.
