# BS10E-B · Trade Execution Foundation

Status: **foundation complete; no negotiation or ordinary trade execution flow is available.**

## Execution semantics

A completed player trade changes team affiliation while preserving the existing active `PlayerContract`, its `ContractId`, term, guarantees, salary schedule, and other economic terms. The same operation moves roster ownership. The receiving club owes the ordinary active contract compensation from that point because payroll reads active contracts by `teamId`. Dead money stays with its existing team and season.

For retained salary, the full player contract still moves. A separate `RetainedSalaryObligation` stays on the retaining team's books, is scoped to the relevant season and receiving team, and points to the completed `TradeRecord`. It is included separately in team cap payroll; no duplicate contract is created. A `TradeRecord` remains one package-level history row. Each traded player also receives a `PlayerTransaction` with `kind: 'traded'`, the source and destination teams, and the unchanged contract ID.

`executeTrade` validates before constructing changes. A rejected package returns the unchanged input world. A successful package constructs all currently modeled effects in one GameWorld update: rosters, active contract affiliation, pick and rights ownership, salary exceptions, retained obligations, lineup cleanup, TradeRecord, and per-player transactions. GameWorld validates trade transaction team/contract references and season-scoped trade windows; it does not impose a false global roster/contract one-to-one invariant. Roster/contract repair remains evidence-driven.

**Cash limitation:** cash consideration has no team financial-ledger settlement, so validation now rejects cash movements with `CASH_SETTLEMENT_UNAVAILABLE` and execution returns the input world unchanged. Future binding execution must implement ledger settlement in the same atomic operation before enabling cash consideration.

## Timing, rules, and ecosystems

`TradeRules.tradeWindow` is optional. Missing means **NOT_CONFIGURED**, which blocks validation; it never means open. An explicit empty object means open for the full season. Optional `opensOn` and `closesOn` values define inclusive boundaries and must lie within that season. Current date outside the season is closed. No NBA deadline was inferred because no authoritative date was found in BDM's data/calendar structures.

At season transition, equivalent rules are materialized for the successor only when competition and ecosystem are unchanged. Season IDs are rewritten. A season-wide explicit window is carried forward. Dated bounds shift by the year difference between starts; an invalid or out-of-season shifted window is omitted, leaving the successor blocked as not configured. Rules are not invented where the source season has none. FIBA/NCAA generated seasons remain unsupported without configured trade rules.

## Operational and institutional authority

The responsibility registry now distinguishes `tradeRecommendation`, `negotiatePlayerTrade`, and `executePlayerTrade`. Negotiation and execution support `userControlled` and `delegated` modes; execution may be assigned to basketball leadership or a cap/contracts specialist. There is no automatic delegation. The controlled team's user can act through a future explicit application action without a fake staff holder, but still needs the institutional commitment process.

The new `PLAYER_TRADE_COMMITMENT` Governance decision is separate from `PLAYER_CONTRACT_SIGNING` and requires an effect. A generic exact-package reference can identify the package. This milestone does not resolve any club's actual approval graph or bind approvals from both participating institutions to execution. Package intelligence reports each side's operational mode independently and Governance as unknown. Team A's authority cannot stand in for Team B's.

## Product behavior and package intelligence

Trade Center now says **Assess package** and presents read-only validation feedback. TradesWorkspace also only assesses. Neither calls `executeTrade`. Advisory acceptance returns the surfaced `negotiationRequired` state and leaves the world unchanged; the staff recommendation UI explains that no trade was executed. The store exposes no direct trade execution action.

`TradePackageIntelligence` now reports resolved same-contract-ID transfer semantics, contract validation reasons, `OPEN` / `CLOSED` / `NOT_CONFIGURED` window state, negotiation/execution authority by club, and unknown Governance authority. Packages remain derived views, blocked when the window is not open, and nonbinding. Economic status remains `UNKNOWN`.

The only remaining `executeTrade` definition is the low-level engine function. Its only callers are focused engine tests; no production caller remains.

## BS10E-C handoff

BS10E-C must add a durable negotiation lifecycle and define package identity across revisions; counterparty-specific negotiation and acceptance; actor authorization for each club; exact-package Governance decisions and effect evidence for each institution; a binding commit command that revalidates dates, ownership, contracts, salary/retention/exceptions and atomically applies all assets; and financial settlement or explicit rejection of cash consideration. It must preserve independent team authority and player/package histories. It must not infer fairness or acceptance probability without separately approved product rules. Until those pieces exist, no two-club negotiation or ordinary binding trade is safe.

## Findings

- **P0 resolved:** Trade Center, TradesWorkspace, and Advisory acceptance no longer bypass negotiation and Governance by calling the engine. The low-level engine remains testable.
- **P1 resolved as foundation:** contract identity/affiliation, retained salary attribution, player-level trade history, fail-closed window status, and separate negotiation/execution responsibilities now have explicit semantics and focused coverage.
- **P1 open for BS10E-C:** no negotiation or two-sided commitment lifecycle; actual Governance rights remain unknown; cash-ledger settlement is missing from the low-level engine; generated NBA-like seasons with no configured trade window are intentionally blocked.
