# CF12 — Finance V2 final certification

CF12 completes the UI and integration layer for CF1–CF11. The Organization Finance workspace reads canonical finance queries and presents Overview, Cash Flow, Budget, Revenue, Operating Costs, Financial Payroll, Debt & Capital, Competition Economy, Financial Regulation, Forecast, Financial Health, Indicative Valuation and Finance AI. Salary Cap remains a separate Competition/Salaries view. The Club PCB Finance tab now mounts the canonical workspace with its GameWorld. No Finance UI state is persisted as a financial fact.

## Scope and authority audit

- Organization is the financial root; Team and Section remain analytical dimensions.
- CF1 Ledger, CF2 Treasury, CF3 Recognition, CF4 authorized-event adapters, CF5 Contract payroll, CF6 Budget/Forecast, CF7 Revenue, CF8 Operating Costs, CF9 Debt/Capital/Competition, CF10 Regulation/FX and CF11 Health/Valuation/AI remain the financial sources consumed by CF12.
- Contract, Competition, Governance, Ownership and Salary Cap stay in their own authority boundaries. The UI does not create an economic rule, authorization, sanction, funding action or transaction.
- The old Club PCB `ClubFinances` fixture view is no longer mounted. The Club dashboard shows canonical cash by currency and does not assign an invented health classification. The home Finance tile reads Organization finance facts and labels Salary Cap separately. `TeamFinances` remains legacy/derived for older market and coach-opportunity flows and is not used by these Organization Finance views. Coach personal finance remains separate.
- Money is shown with its currency. The presenter keeps original currencies apart; CF10 reporting conversion is explicit and reports missing FX. Missing producer data is labeled unavailable. Cash, recognition, commitments, budget, forecast, cap charge and indicative value retain distinct labels.
- Provenance and canonical IDs are exposed through row-level trace details. A recommendation remains advice; Governance/Ownership approval and execution are outside this UI.

## Certified flows

1. Authorized source or event → entitlement/commitment → recognition → receivable/payable → settlement → ledger posting → cash query → UI.
2. Contract term → CF5 financial schedule → recognized payroll/payable → settlement, without turning Salary Cap charge into cash salary.
3. Competition-authorized amount → CF9 distribution/fee → CF4/CF3 → treasury and ledger. Finance does not determine the award.
4. Approved budget and explicit forecast assumptions → CF6 comparisons and projected liquidity. Assumptions do not become actuals.
5. Governing regulation rule and observed financial facts → CF10 assessment → Health evidence. Assessment does not create a sanction.
6. Original-currency financial facts and explicit multiple → CF11 indicative value, with CF10 FX completeness; recorded AI proposals remain non-executing advice.

## Save and structural checks

Save V4 stores optional source collections and recorded proposal/assessment history. Older save migrations default absent collections to empty. Derived balances, schedules, forecasts, health ratios and value are reconstructed. BDM-DB remains read-only source data; runtime financial facts belong to the career save. No `Math.random()` call or React/Zustand/Tauri import enters Domain/Engine.

## Test certification

The global repository inventory is 413 source test files (`381 .test.ts`, `32 .test.tsx`). Vitest discovery now includes both patterns throughout `src/`. Four deterministic Vitest shards, `1/4` through `4/4`, each run once with one worker. Final result counts and inventory reconciliation are recorded below after the run.

| Shard | Files | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1/4 | 104 | 777 | 776 | 0 | 1 |
| 2/4 | 103 | 696 | 696 | 0 | 0 |
| 3/4 | 103 | 806 | 806 | 0 | 0 |
| 4/4 | 103 | 704 | 704 | 0 | 0 |
| **Total** | **413** | **2,983** | **2,982** | **0** | **1** |

The 413 reported file paths match the `rg --files src -g '*.test.ts' -g '*.test.tsx'` inventory exactly: **0 omitted, 0 duplicated**. The one skipped case is `src/app/game/WorldDbProductionSmoke.test.ts`'s production Spain ACB smoke, explicitly skipped by that test. The first broad-discovery run exposed three stale `EntityActionComposer` assertions: server rendering observed Zustand's initial snapshot, and the quick labels are lower-case. The test was repaired to use client DOM rendering while preserving its action-board assertions. The final four-shard run above is clean.

Final gates on the CF12 branch: focused Finance/Club/Home UI tests **PASS**; CF1–CF11 Finance, GameWorld, Save, Contracts, Competition, Organization, Governance, Ownership, Salary Cap and Facilities/Match tests are included in the global run; `npm run typecheck` **PASS**; `npm run build` **PASS**; `cargo fmt --manifest-path src-tauri/Cargo.toml --check` **PASS**; `cargo check --manifest-path src-tauri/Cargo.toml` **PASS**; `git diff --check` **PASS**. Search of `src/` found zero `Math.random()` calls and zero React/Zustand/Tauri/store imports in Domain or Engine.

## Deferred after CF12

Advanced attendance and ticket pricing, commercial negotiation, media-rights bidding, merchandising demand, dynamic travel costs, advanced medical economics, full asset accounting/depreciation, bankruptcy/administration, advanced macro simulation, tax, M&A execution, external valuation data and advanced financial markets remain outside Finance V2. The next macro waves are economy activation, financial distress and institutional lifecycle, and economic AI/market dynamics V2. No later wave was implemented in CF12.
