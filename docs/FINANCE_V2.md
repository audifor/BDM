# Club Finance & Economy V2 — CF1

CF1 establishes the runtime financial foundation. It does not simulate revenue, payroll, debt, tax, valuation, cash flow, or financial UI.

## Authority map

- `Organization` is the economic root. A `Team` is only an analytical dimension/cost or revenue center; it is not automatically a financial owner.
- `OrganizationOwnership`, `OrganizationControl`, ownership transactions, investment interests, and capital raises remain the authority for ownership and control.
- Player and staff contract domains remain the authority for contractual obligations. Finance may later post their economic consequences, but does not create a financial contract copy.
- Competition rules and salary systems remain the authority for salary-cap and sporting regulation. Finance will later record monetary consequences only.
- Governance decides whether an operation is authorized. Finance records its consequences and provenance.
- Competition remains the authority for sporting eligibility and economic entitlements; Contracts remain the authority for contractual obligations. Finance records authorized economic consequences without copying either domain.
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

## CF2 Treasury & Cash Flow Authority

CF2 adds the canonical treasury layer without adding a mutable cash field to `Organization` or `GameWorld`.

- Cash accounts are existing `FinancialAccount` records whose `accountType` is one of `CASH`, `CASH_OPERATING_BANK`, `CASH_SECONDARY_BANK`, `CASH_PETTY`, `CASH_RESTRICTED`, or `CASH_ESCROW`. Restricted and unrestricted balances remain separate. Multiple currencies are never converted or summed together.
- `Receivable` and `Payable` are Organization-owned recognized rights and obligations. Their remaining amount and status are derived from immutable treasury applications; a receivable is not cash and a payable is not a cash outflow until settlement.
- `TreasurySettlement` records are persisted as `treasuryApplications` and point to the FinancialTransaction that records the settlement. They are append-only and cannot over-collect, over-pay, cross Organizations, cross currencies, or settle cancelled obligations.
- Cash balances, inflows, outflows, opening/closing cash, due items, committed projection, liquidity and drill-downs are queries over ledger postings and treasury facts. No parallel cash-movement history or persisted cash projection exists.

The semantic distinctions are intentional:

`recognized revenue/expense != cash movement`

`receivable != cash`

`payable != cash outflow`

`budget != cash`

`salary cap != cash`

Known cash flow is projected only from current cash plus open receivables and payables due inside the requested horizon. CF2 does not invent ticket sales, sponsors, attendance, future salaries, budgets, FX conversion, debt or forecasting assumptions.

Treasury settlement flows are:

```text
External entitlement
  -> receivable
  -> authorized collection settlement
  -> FinancialTransaction / FinancialPosting
  -> cash account balance

External obligation
  -> payable
  -> payment settlement
  -> FinancialTransaction / FinancialPosting
  -> cash account balance
```

Owner funding and competition distributions are accepted only as externally authorized provenance and produce ledger cash receipts; Treasury does not create owners, decide ownership, calculate competition awards, or approve Governance operations. Contracts and Competition remain authorities for obligations and entitlements. `GameWorld.currentDate` remains the only clock; CF2 exposes due queries and explicit settlement APIs but does not auto-pay items on their due date.

CF2 persists receivables, payables and settlement references in Save V4. Older V4 and V1–V3 saves default these collections to empty. BDM-DB remains read-only and continues to provide the canonical `financial_account`, `financial_transaction`, `financial_posting`, `revenue_stream` and `expense_commitment` vocabulary; runtime treasury facts belong to the individual game save and are not written back to BDM-DB.

## CF3 Revenue & Expense Recognition / Financial Commitments

CF3 records why an economic amount exists while keeping profitability and liquidity separate.

- `RevenueRecognition` is an immutable Organization-owned accrual fact with amount, currency, recognition date, category, provenance, optional counterparty, analytical dimensions, optional entitlement link, and optional receivable/ledger links.
- `ExpenseRecognition` is the equivalent accrual fact for player contracts, staff, operations, competition, facilities, fees, bonuses, travel, and future cost-engine categories. CF3 receives the amount from the owning authority; it does not calculate payroll or operating costs.
- `FinancialCommitment` represents a known future obligation. Its amount remains outstanding until linked expense recognitions reduce it; signing a multi-year commitment does not recognize the full amount on the signing date.
- `FinancialEntitlement` represents a known economic right supplied by Competition or another authorized source. Its amount remains outstanding until linked revenue recognitions reduce it.

The canonical chain is:

```text
Economic Authority
  -> Entitlement / Commitment
  -> Recognition
  -> Receivable / Payable
  -> Settlement
  -> Ledger Posting
  -> Cash
```

Recognition postings are non-cash double-entry facts: revenue debits an asset/receivable and credits revenue; expense debits expense and credits a liability/payable. Treasury settlement later changes receivable/payable and cash, without recognizing revenue or expense again. Owner funding remains an equity/financing movement and is never revenue.

CF3 queries derive recognized revenue, recognized expense, net operating result, category/source/team/section breakdowns, outstanding commitments and entitlements, and recognized-but-uncollected/unpaid amounts. All queries are Organization-scoped, currency-separated, and as-of-date compatible; no FX or aggregate is persisted.

Save V4 persists recognition, commitment, and entitlement facts as additive optional collections. CF1/CF2 and older saves default them to empty. BDM-DB `revenue_stream` and `expense_commitment` remain canonical source vocabulary for streams and commitments; the runtime records game-specific recognition and entitlement facts without modifying BDM-DB or inventing a competing database authority.

## CF4 Economic Event Adapters

CF4 adds one explicit integration boundary for externally authorized economic facts:

```text
External Authority
  -> AuthorizedEconomicEvent
  -> Finance Adapter
  -> Commitment / Entitlement
  -> Recognition
  -> Receivable / Payable
  -> Settlement
  -> Ledger / Cash
```

`AuthorizedEconomicEvent` is immutable and carries a stable event id, source authority and entity, Organization, effective/due dates, integer Money, provenance, analytical dimensions, counterparty, and an external idempotency key. Valid source authorities are explicit (`CONTRACT`, `COMPETITION`, `GOVERNANCE`, `OWNERSHIP`, `ORGANIZATION`, future revenue/cost engines, and controlled manual system actions). Finance validates the boundary and records consequences; it does not decide contractual terms, competition awards, or Governance/Ownership authorization.

Contract, Competition, and Governance/Ownership adapters are explicit entry points. Contract events require an already-authorized due date and preserve Contract/Team/Organization ownership; they do not invent payroll schedules. Competition events require a supplied entitlement amount, Competition identity, due date, and participating Team; the adapter does not calculate prize or distribution amounts. Owner funding is recorded as an equity/financing receipt and never as revenue.

Idempotency is derived from the stable tuple `sourceAuthority + sourceEntityId + idempotencyKey` and the provenance of the resulting commitment, entitlement, recognition, subledger item, and ledger transaction. Reprocessing returns the existing consequence without adding money. A conflicting replay with changed Organization, currency, amount, or category is rejected. No processed-event cache is persisted.

Processing validates references and account mappings, constructs all immutable consequences, and applies one `GameWorld` update. If validation or construction fails, the original world is returned unchanged. Recognition is the accounting fact; Receivable/Payable is its operational subledger and settlement only moves cash against the asset/liability. The reconciliation checks reject orphan recognition-linked subledger items, while existing Treasury and Ledger validation covers settlement bounds, balanced postings, Organization isolation, and duplicate materialization.

CF4 deliberately does not connect all contracts to daily progression: the current contract model does not expose enough payment-schedule facts to generate correct events. Callers may submit explicit authorized events now; specialized revenue/cost engines can connect later without moving authority into Finance. Save V4 needs no new event collection because idempotency is derivable from persisted financial facts; CF1-CF3 and legacy save defaults remain unchanged.

## CF5 Contract Financial Scheduling & Payroll Obligations

CF5 derives the first automatic financial producer from the existing Contract authorities:

```text
Contract terms
  -> ContractFinancialSchedule
  -> AuthorizedEconomicEvent
  -> ExpenseRecognition
  -> Payable
  -> Settlement
  -> Ledger / Cash
```

The schedule is a deterministic view, not a second contract system and not persisted. Player contracts contribute `cashSalary` and `guaranteedAmount` from their canonical annual/year compensation; staff contracts contribute their canonical `annualSalary`. The financial schedule never uses `capHit` as expense and never writes salary or contract value back into Finance. Team, Organization Section, beneficiary, Contract provenance, period, season association, and currency are derived at read time.

The current contract models contain no payment dates, bonus definitions, options, buyouts, release clauses, or trigger records. They also contain no currency field. CF5 therefore uses an explicit annual contract-year recognition policy, requires a currency policy or Organization financial profile, and does not assume twelve monthly payments. Schedule entries expose `dueOn: null`; materialization requires the explicit `ON_RECOGNITION` simulation policy for the payable date. This is a deliberate boundary between economic recognition and an absent contractual payment schedule.

If expiry or termination cuts an annual contract period short, CF5 omits that partial period because Contracts has no authoritative proration rule. A future Contract-owned proration or termination-payment term can add a separate explicit event without rewriting existing finance facts.

Guaranteed and conditional portions are separate derived entries. Only guaranteed entries can be materialized automatically. Conditional exposure remains queryable and cannot become an ExpenseRecognition or Payable until an authorized trigger exists. No bonus engine, payroll negotiation, proration rule, or termination payment is invented.

`materializeContractFinanceForDate` receives a `GameWorld`, explicit date, Contract/Team/Organization scope, currency policy, ledger mapping, and due-date policy. It emits CF4 `AuthorizedEconomicEvent` values and calls the Contract adapter; it never bypasses CF4 or calls Treasury directly. The operation is idempotent through the schedule entry id and applies all entries atomically for the requested date. The current daily loop is not connected automatically because it does not yet provide a safe payment schedule; this function is the controlled hook for a future producer integration.

Contract termination changes only future derived entries. Existing Recognition, Commitment, Payable, Settlement, and Ledger facts remain append-only and are not deleted. Salary Cap continues to calculate `capHit` and regulatory effects independently from financial payroll. Multiple currencies remain separate and no FX conversion is performed.

CF5 payroll queries derive committed, player, staff, current-season, next-season, future-by-contract/person/season, guaranteed, conditional, recognized-YTD, paid, unpaid, Team, Section, and currency-separated views. These queries feed later forecasting work without creating a Budget or persisting a schedule cache.

## Deferred by CF1/CF2/CF3/CF4/CF5

Ticket sales, sponsorships, merchandising, media rights, annual budgets, forecasting assumptions, payroll progression, debt/loans/amortization, taxation, FFP, luxury tax, salary-cap enforcement, valuation, inflation, FX simulation, owner/budget AI, financial UI, bankruptcy, administration, insolvency, debt collection AI and automatic treasury policy remain future work.
