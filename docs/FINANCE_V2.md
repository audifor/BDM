# Club Finance & Economy V2

This document records CF1–CF11 implementation history. The final CF12 architecture and current legacy status are at the end; earlier readiness and deferred lists describe their respective milestones, not the final state.

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

## CF6 Budget & Forecasting

CF6 adds Organization-owned planning facts without making planning an accounting or cash authority:

```text
Ledger facts -> Recognition actuals
Contract/other authorities -> Commitments
Organization + Governance/Ownership approval -> Budget -> Budget lines/allocations
Actuals + known commitments + explicit assumptions -> Forecast
Treasury cash + due receivables/payables + explicit cash assumptions -> Liquidity forecast
```

`FinancialBudget` has an explicit season, fiscal-year, or arbitrary date-range period, currency, lifecycle, provenance, and optional Governance/Ownership approval metadata. `BudgetLine` and `BudgetAllocation` preserve Organization, Team, Section, category, currency, and analytical dimensions. Approved budgets are immutable; a revision creates a new approved budget with lineage, while the prior version remains in history and is reported as `SUPERSEDED` by the derived lifecycle query. Finance records approval provenance but does not decide who has authority or whether a board approved it.

Budget headroom is not cash and is not Salary Cap space. Budget comparisons read actuals from CF3 Recognition, commitments from CF3 and the CF5 contract schedule, and cash only from CF2 Treasury. Control queries report variance, commitment headroom, projected over-budget, unused/unbudgeted amounts, and insufficient budget; they never block Contracts, Treasury, Governance, or Salary Cap operations.

`FinancialForecast` is a derived current expectation, separate from Recognition. It combines actual recognized amounts, known future commitments, and only explicitly persisted assumptions. `ForecastAssumption` is not a financial fact and never creates Recognition, Commitment, Receivable, Payable, Ledger, or Cash. Scenarios (`BASELINE`, `UPSIDE`, `DOWNSIDE`, `CUSTOM`) are labels; there are no implicit percentages or invented ticket, sponsor, media, merchandising, prize, or other future revenue. Cash forecasting is a separate Treasury projection and never infers liquidity from a budget amount. Currencies remain separate with no FX.

Budget, revision, allocation, and assumption facts are additive optional Save V4 collections. Derived totals, variances, headroom, and baseline forecasts are not persisted. Old V4 and V1–V3 saves load with empty CF6 collections. `TeamFinances`, `world/finances.ts`, existing finance UI, Organization, OrganizationOwnership, Governance, Contract, Salary Cap, and Competition rules remain legacy/derived or their own authorities; none is replaced by CF6.

CF6 is conceptually aligned with BDM-DB's separate `budget`, `financial_account`, `financial_transaction`, `financial_posting`, `revenue_stream`, and `expense_commitment` vocabulary. Runtime game planning facts remain in GameWorld/Save and are not written back to BDM-DB.

## CF7 Revenue Engine

CF7 adds the first canonical revenue producer while preserving the accounting and treasury boundaries:

```text
RevenueSource (Organization-owned contract/fact)
  -> derived deterministic RevenueSchedule
  -> AuthorizedEconomicEvent (CF4)
  -> RevenueRecognition (CF3)
  -> Receivable
  -> Settlement
  -> Ledger / Cash (CF2)
```

`RevenueSource` is persisted; its schedule, contracted totals, future totals, recognized totals, collected totals, YTD and variances are derived. `RevenueSource`, Forecast, Recognition, Receivable and Cash are separate concepts. A source does not create money merely by existing, and a forecast assumption never creates recognition or cash.

The taxonomy covers ticketing, season tickets, hospitality, sponsorship, media, merchandising, licensing, competition, transfer buyout, facility, academy, grants, donations and other operating revenue. The current producers are deliberately narrow: contractual sponsorship/commercial sources and explicitly supplied facts. Competition revenue consumes an already-authorized Competition entitlement through CF4; it does not calculate eligibility, prize rules or distributions. Ticketing and media expose validated input/source seams but do not invent revenue when canonical attendance, capacity/pricing or rights facts are absent. Tax and revenue sharing are not assumed.

Revenue schedules are deterministic, effective-dated and currency-separated. Recognition requires an explicit due-date policy, uses CF4 idempotency, and materialization is atomic. Receivable settlement later increases cash without duplicating revenue. Queries support Organization, category, Team, Section, Competition, counterparty, source/provenance, currency, as-of and range dimensions. Known contractual revenue is consumed by CF6 budgets and forecasts as committed/known revenue, while assumptions remain hypothetical.

GameWorld and Save V4 persist only `RevenueSource` records. Old V4 and V1–V3 saves default the optional collection to empty. `TeamFinances` remains legacy/derived, `src/domain/world/finances.ts` remains a derived projection, and existing finance UI remains presentation/legacy surface; none is a competing revenue authority. Organization, OrganizationOwnership, Governance, Contract, Salary Cap and Competition rules remain authorities for their own concerns.

CF7 remains conceptually aligned with BDM-DB's canonical `financial_account`, `financial_transaction`, `financial_posting` and `revenue_stream` vocabulary. Runtime revenue sources and game recognitions are additive runtime/save state; `C:\BDM_DB` remains read-only and no second incompatible database semantic is introduced.

## CF8 Operating Cost Engine

CF8 adds the canonical non-contractual operating-cost producer while keeping every accounting and authority boundary explicit:

```text
OperatingCostSource / AuthorizedOperatingCostFact
  -> AuthorizedEconomicEvent (CF4)
  -> ExpenseRecognition (CF3)
  -> Payable
  -> Settlement
  -> FinancialTransaction / Ledger / Cash
```

An `OperatingCostSource` is an Organization-owned, persisted source for explicit OPEX policy and deterministic schedules. An `AuthorizedOperatingCostFact` is an already-authorized amount for a concrete event such as travel, medical treatment, scouting, academy, facility or competition operations. Source, commitment, expense recognition, payable, cash, budget and forecast remain different concepts. CF8 never creates an expense from activity alone: facility, Competition, travel, medical, scouting and academy producers require an explicit amount from their owning authority. Payroll remains CF5-owned and is rejected from CF8; CAPEX is classified separately and is not materialized as OPEX.

Schedules are derived and deterministic (`ONE_OFF`, `ANNUAL`, `SEASONAL`, or `EXPLICIT_SCHEDULE`). `materializeOperatingCostsForDate` is an explicit, atomic, idempotent hook; it does not become a broad daily loop. Recognition does not move cash, and settlement does not duplicate expense. Queries remain Organization-scoped, currency-separated and as-of/range compatible, with category, Team, Section, Competition, Facility, Match, source/provenance, paid/unpaid, trial-balance and future-commitment dimensions. CF6 consumes future OPEX commitments in budgets and forecasts; assumptions never create OPEX facts.

GameWorld and Save V4 persist only sources and authorized facts, with additive optional collections. Schedules, totals, variances and other derived values are reconstructed. V1-V3 and older V4 saves load with empty CF8 collections. `TeamFinances`, `src/domain/world/finances.ts` and existing finance UI remain legacy/derived or presentation surfaces; Organization, OrganizationOwnership, Governance, Contract, Salary Cap, Competition and Facilities remain authorities for their own facts. CF8 does not copy those models or make them financial authorities.

CF8 is conceptually aligned with BDM-DB's `financial_account`, `financial_transaction`, `financial_posting` and `expense_commitment` vocabulary. BDM-DB remains read-only for this milestone: runtime OPEX source/fact ownership and persistence belong to the game save, while BDM remains responsible for runtime/database integration.

## Deferred by CF1/CF2/CF3/CF4/CF5/CF6/CF7/CF8

Attendance-based ticket sales, full media-rights adapters, prize calculation, dynamic travel/medical/scouting/academy fact producers, taxation, FFP, luxury tax, salary-cap enforcement, valuation, inflation, FX simulation, owner/budget AI, financial UI, bankruptcy, administration, insolvency, debt collection AI, depreciation/asset accounting and automatic treasury policy remain future work.

## CF9 Debt, Capital & Competition Economy

CF9 adds Organization financing and authorized Competition-economy consumption without changing sporting or ownership authority:

```text
DebtInstrument / authorized capital action
  -> explicit deterministic materialization
  -> Ledger / ExpenseRecognition / Payable where applicable
  -> Treasury settlement / Cash

Competition economic fact
  -> CF4 Competition adapter -> CF3 entitlement/recognition -> Treasury
```

`DebtInstrument` is the only persisted Organization debt authority. It records lender, debt type, currency, original principal, dates, explicit interest terms, explicit repayment terms, status, provenance, and optional Governance/Ownership authorization reference. Drawdown and principal repayment are financing postings; interest is recognized through the CF4 `DEBT_ENGINE` event boundary as `INTEREST_EXPENSE`, with an optional payable. Outstanding principal, schedules, debt service, maturity, interest paid/unpaid and financing totals are derived from the immutable ledger and the instrument terms. There is no amortization inference, FX conversion, automatic daily loop or mutable cash field.

Owner loans are `DebtInstrument` records of type `OWNER_LOAN`. Capital contributions use the existing authorized `OWNER_FUNDING` path and equity accounts; owner distributions require an explicit authorized action and debit equity/credit cash. `OrganizationOwnership`, `OrganizationCapitalRaise`, Governance decisions and ownership/control transactions remain authorities for authorization, ownership and control. Finance records only the authorized monetary consequence and never creates owners or converts investment intent into cash by inference.

`CompetitionDistributionFact` is the persisted, authorized Competition-economy fact. It carries Competition, Season, recipient Organization/Team, integer Money, category (`PRIZE`, participation distribution, media distribution, solidarity, revenue share, league/development/other distribution or participation fee), effective/due dates, source rule, provenance and optional payer Organization. Finance never calculates awards from standings. Distributions consume the existing CF4 Competition adapter and CF3 entitlement/recognition path. Participation fees are translated into the existing CF8 `AuthorizedOperatingCostFact` path and are not given a second fee engine. Linked inter-Organization transfers use two Organization-scoped linked postings with one source fact: payer cash decreases once and recipient cash increases once.

Competition remains the sporting and entitlement authority; contracts, salary-cap rules, Governance, ownership and Organization remain authorities for their own domains. `TeamFinances`, `src/domain/world/finances.ts`, coach finance and existing finance UI remain legacy, derived, personal or presentation surfaces. None is a competing Organization-finance authority. Save V4 persists only DebtInstrument and CompetitionDistributionFact collections; schedules, outstanding balances, forecasts and totals are reconstructed. Older V4 and V1-V3 saves default the additive collections to empty.

CF9 is conceptually aligned with BDM-DB's canonical `financial_account`, `financial_transaction` and `financial_posting` boundary, and with its adjacent `expense_commitment` and competition award/reward vocabulary. Runtime CF9 facts are game-save state; `C:\BDM_DB` remains read-only and no second incompatible database semantic is introduced.

## CF10 readiness

CF10 may add explicit tax/FFP or valuation policy only after those authorities and their source rules are approved. It should consume CF9 debt service and Competition facts, preserve the ledger/treasury distinction, and avoid deriving economic awards or financing from sporting outcomes without an authoritative rule.

## CF10 Financial Regulation and Economy Simulation

Financial facts, regulation assessments, and economic assumptions are separate. A `FinancialRegulationRule` is supplied by a Competition or governing authority with jurisdiction, applicable Organizations, effective dates, version, metric, threshold, measurement window, consequence type, and provenance. Finance does not generate regulatory thresholds. `assessFinancialRegulation` reads existing Organization facts and returns an immutable assessment with the rule version and supporting fact IDs; `recordFinancialAssessment` preserves history in GameWorld. An assessment never posts to the ledger. The implemented metrics are minimum unrestricted cash, operating loss, overdue payables, recognized payroll to recognized revenue in basis points, and outstanding debt principal. A zero revenue denominator produces `INSUFFICIENT_DATA`. Unsupported financial sustainability metrics remain pending until their source facts and semantics are adequate.

Assessment breaches are evidence for Governance, Competition, and licensing. Existing `RegulatoryOrder`, `RegulatoryRemediationPlan`, and `OrganizationLicense` own their lifecycles; CF10 creates none automatically. A fine requires a distinct, externally authorized sanction fact and uses the CF4 expense event path: expense recognition, payable, non-cash ledger posting, then optional Treasury settlement. Salary Cap, including its luxury tax rule, stays in the Salary engine. Finance consumes an externally authorized tax liability only when one is supplied; it never calculates cap legality or tax tiers.

`EconomicObservation` holds dated region/currency index factors and `ExchangeRate` holds dated currency pairs. Factors are positive integer rationals. Monetary conversion uses BigInt intermediate arithmetic with half-up rounding to minor units and checks the safe-integer result. Reporting conversion has an explicit missing-rate result and never changes original amounts or currencies. Consolidated cash, debt, recognized revenue and expense, and forecast reporting totals are derived queries. Missing rates produce a partial result with named missing currencies. No accounting FX revaluation or gains/losses are posted.

Only future RevenueSource and OperatingCostSource amounts explicitly marked `INDEXED` use a named observation in a forecast. `FIXED`, `EXTERNALLY_SUPPLIED`, and unmarked sources retain their supplied amounts. Scenario observations and rates can be passed explicitly to forecast/reporting queries without entering GameWorld or creating Recognition. Existing recognitions, settlements, contract amounts, debt principal, and approved budgets are not changed. Debt fixed interest terms remain fixed; CF10 does not infer a floating benchmark. Daily progression has no automatic macro simulation or random inflation. Economic facts enter through explicit `applyEconomicObservation` and `applyExchangeRate` APIs; assessments enter through explicit assess/record calls.

### Audit and authority classification

- **CANONICAL:** Organization finance ledger, Treasury, Recognition, payroll schedule, budget, revenue/cost sources, debt instruments, Competition economic facts, Governance decisions, structural regulatory orders, remediation plans and licenses, SalaryRules and NCAA enforcement sanctions in their respective domains.
- **DERIVED:** cash/liquidity, overdue balances, operating loss, payroll/revenue ratio, outstanding principal, financial assessments before history is recorded, forecasts, converted reporting totals and current breach views.
- **LEGACY:** `TeamFinances` budget pools and older payroll projections; they are not Organization cash or regulation authority.
- **DORMANT:** Competition `LICENSE` entry selection is parsed but does not itself define financial licensing thresholds. Salary luxury tax tiers exist but no authorized tax-liability producer crosses into Finance.
- **UI_ONLY:** existing finances screens and Salary UI; CF10 adds no Finance UI.
- **MISSING_AUTHORITY:** concrete financial sustainability thresholds, NCAA financial restrictions, European/FIBA financial licensing formulas, indexation clauses for existing contracts, floating debt benchmarks, accounting FX revaluation policy and sanction-to-Governance routing rules. CF10 supplies no defaults for them.

`C:\BDM_DB` was inspected read-only. DDL-12 has canonical `financial_account`, `financial_transaction`, `financial_posting`, `budget`, `revenue_stream`, and `expense_commitment` tables with currency columns. It also has generic `sanction`, `sanction_effect`, `sanction_scope`, and `sanction_type` tables. The inspected canonical schema has no dedicated financial-regulation threshold/version table, FX-rate series, or macroeconomic indicator series; generic sanction records do not define a finance assessment formula. Runtime observations, rates, and assessment history belong to individual saves, not the source database. No BDM-DB file was modified.

Save V4 adds optional assessment, observation, and exchange-rate collections. Older V4 and V1–V3 saves load with empty collections. Explicit source indexation policies round-trip; old sources remain unmarked. Derived totals, dashboards, and conversion results are never persisted.

## CF11 Valuation, Financial Health and Finance AI

The three CF11 surfaces are separate pure queries over the existing authorities. `FinancialHealthSnapshot` reads Organization scoped ledger cash, Treasury obligations, Recognition, contract and operating commitments, CF9 debt, owner funding transactions, and CF10 regulation assessments. It reports one row per original currency, with an explicit observation window and 30 day due horizon by default. A shortfall, overdue amount, unfunded maturity or operating loss is evidence, not an insolvency procedure. `FinancialHealthPolicy` is an explicit versioned input for ratio thresholds; none is installed globally. Unknown contract currency prevents a future payroll projection rather than inventing a currency.

`OrganizationValuation` is a reproducible indication from recognized revenue or positive operating result and an explicit rational multiple. It reports operating metric, enterprise value and net debt components in their original currencies, along with CF10 reporting conversions. Missing FX makes the consolidated estimate incomplete. Net debt is subtracted from enterprise value to obtain indicative equity value; a historical capital contribution is neither revenue nor current equity value. No facility value is added because runtime Facilities does not provide an authorized market value. There is no DCF or default multiple. No current valuation, health total or forecast is persisted.

`FinanceDecisionProposal` is typed advice. An explicit versioned `FinanceAiPolicy` controls whether liquidity shortfalls yield financing, capital or spending recommendations and whether projected budget variance yields a revision recommendation. Advice never creates a `DebtInstrument`, capital contribution, revised budget, acquisition price, ownership change or financial transaction. A recorded proposal is a gameplay history item in GameWorld and optional Save V4 state. Approval for a Governance owned action requires a matching approved Governance decision; Ownership actions remain with Ownership and cannot be approved by Finance. Finance provides no execution API for these actions. Old saves receive an empty proposal collection.

The audit classified the ledger, Treasury, Recognition, CF5 contracts, CF6 budgets, CF7 revenue, CF8 costs, CF9 debt, CF10 regulation and FX, Governance and Ownership as **CANONICAL** in their respective boundaries. Cash, health, forecasts and valuation are **DERIVED**. `TeamFinances` and old club finance panels remain **LEGACY/UI_ONLY**. Investor interest and acquisition workflows remain **CANONICAL** for bidding and transaction price; their finance data feeds are currently **DORMANT**. Facility market value, universal valuation multiples, health thresholds and automatic capital approval are **MISSING_AUTHORITY**. Reputation has no approved CF11 valuation weight.

`C:\BDM_DB` was inspected read only. DDL 11/12 contain facility, facility ownership, investment asset/position, Organization investor interest/ownership and the shared finance ledger vocabulary. The inspected schema does not establish a current Organization enterprise value, facility market value, valuation multiple or health threshold for this runtime. CF11 adds no write path to BDM DB.

Boundaries: Financial Fact != Financial Health Assessment; Financial Health != Valuation; Valuation != Transaction Price; Valuation != Accounting Balance; AI Recommendation != Governance Approval; Forecast != Valuation Fact; Capital Contribution != Revenue; Cash != Club Value.

## CF12 Finance UI and final architecture

CF12 closes the Finance V2 sequence with a read-only Organization finance workspace. The UI presenter in `src/ui-ng/applications/finances/financeWorkspaceModel.ts` derives one selected section from canonical GameWorld queries. The React workspace memoizes that section, renders currency-labeled facts with provenance and source references, and holds only navigation, reporting-currency, scenario, and valuation-input state. No displayed total is written to GameWorld. The Club PCB Finance tab now opens this canonical workspace when a world is available; its former fixture-backed Finance panel is no longer mounted. The Salary Cap section remains explicitly separate and uses the existing Salary engine.

### Authority map

| Area | Authority | Finance V2 role |
| --- | --- | --- |
| Economic owner | Organization, OrganizationOwnership and control | Organization is the finance root; Team and Section are analytical dimensions. |
| Contracts and payroll terms | Player and staff Contract domains | CF5 derives dated financial obligations; Finance does not rewrite contract terms. |
| Competition economics | Competition and supplied authorized distribution facts | CF9 records monetary consequences through CF4; no award is inferred from standings. |
| Governance and capital authorization | Governance, Ownership and investment workflows | Finance consumes approved events and records their ledger consequences. |
| Ledger and cash | CF1 FinancialAccount/Transaction/Posting and CF2 Treasury | Immutable double-entry facts, receivables, payables, settlements and derived cash balances. |
| Operating performance | CF3 Recognition, CF7 RevenueSource, CF8 OperatingCostSource | Recognition and source schedules remain distinct from cash and forecast. |
| Planning | CF6 Budget and Forecast | Approved budgets and explicit assumptions; variance and forecast are derived. |
| Financing | CF9 DebtInstrument and authorized owner capital | Debt service and principal are derived; capital is not revenue. |
| Regulation and economy | Governing rule authority and CF10 observations/FX | Versioned assessments and reporting conversion; no implicit sanctions or revaluation. |
| Health, value and advice | CF11 policies and queries | Evidence, indicative valuation and recommendations, never a new transaction authority. |
| Salary Cap | Salary rules and engine | Competition roster charge, separate from financial payroll and cash. |

The data path is `authority -> authorized CF4 event or source fact -> commitment/entitlement -> recognition -> receivable/payable -> settlement -> ledger/cash -> health/forecast/valuation -> UI`. Some facts start directly at the ledger (authorized capital and debt movements). Each step preserves provenance and effective dates. The UI offers traceable IDs where a query exposes them; it does not synthesize transactions from screen state.

### Persistence and boundaries

GameWorld and Save V4 persist optional source facts: accounts, transactions, obligations, settlements, recognitions, commitments, entitlements, budgets, approved assumptions, revenue/cost sources, debt, competition facts, regulation observations and assessments, and recorded Finance AI proposals. Queries reconstruct balances, schedules, comparisons, projections, ratios and valuation. Earlier saves default absent optional Finance collections to empty. BDM-DB remains a read-only source of initial canonical world facts and schema vocabulary; per-career runtime facts are saved in BDM, with no Finance V2 write-back to BDM-DB.

Money remains integer minor units with its original currency. Overview and Health group by currency. Reporting views require a selected or configured currency and explicit CF10 FX; incomplete conversion keeps original components visible and names missing rates. A missing source, contract currency, rule or valuation assumption is displayed as unavailable. Zero is displayed only for a quantity derived from an existing fact or explicit query context. Financial regulation rules belong to governing authorities, and an assessment alone does not create a sanction. Finance AI advice cannot approve Governance or Ownership actions. Salary Cap is never treated as Organization cash, financial payroll or an Organization budget.

### Legacy status and limitations

`TeamFinances` remains a legacy budget pool for older market and coach-opportunity projections; it is not the authority for the new Organization Finance workspace or the home dashboard's Finance tile. The old `ClubFinances.jsx` component remains in the tree for historical reference but is no longer rendered by the Club PCB Finance tab. The Club PCB dashboard shows currency-separated canonical cash and leaves health unclassified without policy. Coach personal finances are a separate career feature. Older market affordability projections still consume legacy TeamFinances and must be migrated with their owning product flows before they can represent Organization cash. CF12 does not convert them into Finance V2 facts.

The runtime still lacks some dynamic fact producers. No attendance-based ticket pricing, commercial negotiation, media-rights bidding, merchandising demand, dynamic travel-cost generation, advanced medical economics, full asset accounting/depreciation, bankruptcy/administration lifecycle, advanced macro simulation, tax engine, M&A execution, external valuation data or advanced financial markets were added. Empty screens remain honest until an authorized producer supplies facts. No global health policy, financial sustainability thresholds, universal valuation multiple or facility market value is assumed.

### Roadmap after Finance V2

1. **Economy activation:** connect authoritative attendance, ticketing, sponsorship, media, merchandising, facilities, travel, medical, scouting and competition-economic producers to the existing event seams.
2. **Financial distress and institutional lifecycle:** define approved rules for insolvency, administration, restructuring, defaults, rescue financing, forced sales and capital rescue before implementing consequences.
3. **Economic AI and market dynamics V2:** extend interactions among clubs, owners, boards, lenders, sponsors, competitions and markets after the required authorities and market facts exist.

Final test inventory, shards, pass counts and gate evidence are recorded in `docs/autopilot/CF12_FINANCE_V2_FINAL_CERTIFICATION.md`.
