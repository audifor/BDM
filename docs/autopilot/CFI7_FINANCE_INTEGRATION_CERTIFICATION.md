# CFI7 — Club Facilities & Infrastructure V2 — Finance Integration Certification

## 1. Branch

`club-facilities-infrastructure-v2-cfi7-finance-integration`

## 2. Facilities initial SHA

`6aa100430678e4c4c37c6d0c5c42fb88d8ff2ccb` — `docs(facilities): add CFI6a lifecycle restoration certification report`.
Contains CFI1, CFI2, CFI2S, CFI3, CFI4, CFI5, CFI6, CFI6a.

## 3. Finance integrated SHA

`706dced9b6c8fbd002347d5b9b67498c63ddf7a9` — `feat(finance): add debt capital and competition economy` (CF9).
Contains CF1 → CF9.

Note: the `C:\BDM-FINANCE` working copy was checked out on
`club-finance-economy-v2-cf10-financial-regulation-economy-simulation`, not the cf9 branch named in
the brief. Commit `706dced` is contained in *both* branches, and since both repositories share the
same `origin` (`github.com/audifor/BDM`), the commit was already reachable from `C:\BDM-FACILITIES`
with no fetch required. The certified cf9 SHA was merged; nothing from cf10 entered this branch.
`C:\BDM-FINANCE` also carried one untracked file (`src/domain/finance/EconomicEnvironment.ts`), which
is uncommitted and therefore also absent here.

## 4. Merge / convergence commit

`a8fd8f589807bae5043b68c6c06b82aab2005512` — a real, non-squash `git merge` of `706dced` into the CFI7
branch. Merge base: `1fff9a507f2d22ae527554ae894146d9e2788812` (`test(governance): certify final
integration`) — the common ancestor both CFI1 and CF1 branched from. No cherry-pick, no file copying,
no `--ours`/`--theirs`.

## 5. Final SHA

`d87a16acfef192e45834b28b5e850afc45971ab3`.

## 6. Feature commits

Merge convergence is deliberately distinguishable from CFI7 feature work:

| SHA | Kind | Subject |
| --- | --- | --- |
| `a8fd8f5` | MERGE CONVERGENCE | `Merge commit '706dced...' into club-facilities-infrastructure-v2-cfi7-finance-integration` |
| `9da1826` | CFI7 FEATURE | `feat(facilities): add CFI7 Facilities/Finance integration layer` |
| `d87a16a` | CFI7 FEATURE | `test(facilities): add CFI7 Facilities/Finance integration tests` |

## 7. Merge conflicts encountered

Exactly three files conflicted. `src/domain/world/GameWorld.ts` auto-merged cleanly despite both
branches adding collections to it.

| File | Hunks | Nature |
| --- | --- | --- |
| `src/domain/ids/EntityIds.ts` | 2 | Both branches appended id types + `*FromString` constructors at the same anchor |
| `src/domain/ids/index.ts` | 2 | Same, in the barrel re-export list |
| `src/save/GameWorldSaveV4.ts` | 5 | Imports, save interface fields, serialize body, deserialize parse body, deserialize update chain |

All were textual collisions from appending at a shared anchor, not semantic disagreements: no field
from either domain was dropped, renamed or reconciled away. Resolution was by union in declaration
order (Facilities first, then Finance).

## 8. Resolution of GameWorld

`GameWorld.ts` auto-merged: the Facilities collections (CFI1-CFI6a) and the Finance collections
(CF1-CF9) landed in separate regions of the interface, `CreateGameWorldInput`, `createGameWorld`,
`updateGameWorld` and the validation sequence. Both domains' `validate*` calls are present and run on
every `createGameWorld` and `updateGameWorld`. The auto-merge was verified by inspection (102 facility
references, 129 finance references) and by the passing world/facilities/finance suites, not assumed.

CFI7 then added exactly one collection, `facilityFinancialBindingsById`, with its indexer,
append-only guard (`assertFacilityFinancialBindingsAppendOnly`) and
`validateFacilityFinancialBindingCollection` call in both construction paths.

## 9. Resolution of Save

`GameWorldSaveV4.ts` carried the only substantive merge defect, and it was a silent one.

A naive union of the deserialize chain leaves the Facilities `return` statement *ahead* of the Finance
`updateGameWorld` call:

```ts
const withFacilityDevelopment = updateGameWorld(withFacilityOperations, { ... })
return Object.freeze({ ...attachWorldDbCompetitionRuntime(withFacilityDevelopment, runtime), ... })
const withFinance = updateGameWorld(withStructuralRegulation, { financialAccounts, ... }) // dead code
```

This makes the entire Finance branch unreachable and drops **every** Finance collection on load, while
typechecking cleanly. It was caught by 7 failing Finance persistence round-trips (FinancePersistence,
RecognitionPersistence, FinanceCF9Persistence, BudgetForecastingPersistence, TreasuryPersistence,
OperatingCostEnginePersistence, RevenueEnginePersistence). The fix chains Finance onto the Facilities
result rather than the pre-Facilities world:

```ts
const withFinance = updateGameWorld(withFacilityDevelopment, { financialAccounts, ... })
const withFacilityFinanceIntegration = updateGameWorld(withFinance, { facilityFinancialBindings })
return Object.freeze({ ...attachWorldDbCompetitionRuntime(withFacilityFinanceIntegration, runtime), ... })
```

Serialize needed only a union (both domains write their own keys). Facilities collections stay
required in `GameWorldSaveV4`; Finance collections stay optional (`?`), exactly as each branch defined
them, so both branches' backward-compatibility semantics are preserved unchanged.

## 10. Finance audit (CF1-CF9, read from source)

Read from `src/domain/finance/` before any adapter was designed. No type or field name in this
integration was taken from the brief on faith.

| Module | Lines | Primitives |
| --- | --- | --- |
| `FinancialLedger.ts` (CF1) | 260 | `FinancialAccount`, `FinancialTransaction`, postings, `Money`/`CurrencyCode`, `FinancialSource`, `FinancialDimensions` |
| `Treasury.ts` (CF2) | 317 | `Receivable`, `Payable`, `TreasurySettlement` (`obligationKind` RECEIVABLE/PAYABLE, `settledOn`), `TreasuryCounterparty` |
| `Recognition.ts` (CF3) | 333 | `RevenueRecognition`, `ExpenseRecognition`, `FinancialCommitment`, `FinancialEntitlement`, `createExpenseRecognitionFromCommitment`, `createExpenseRecognitionLedgerTransaction` |
| `EconomicEventAdapters.ts` (CF4) | 359 | authorized economic events / adapter results |
| `ContractFinancialSchedule.ts` (CF5) | 316 | contract-driven financial schedules |
| `BudgetForecasting.ts` (CF6) | 283 | `FinancialBudget`, `BudgetLine`, `BudgetRevision`, `BudgetAllocation`, `ForecastAssumption` |
| `RevenueEngine.ts` (CF7) | 219 | `RevenueSource` |
| `OperatingCostEngine.ts` (CF8) | 263 | `OperatingCostSource`, `AuthorizedOperatingCostFact`, `getOperatingExpenseByFacility` |
| `DebtEngine.ts` (CF9) | 149 | `DebtInstrument`, drawdown/repayment transactions, `getFinancingTransactions` |
| `CompetitionEconomy.ts` (CF9) | 43 | `CompetitionDistributionFact` |

Three findings drove the whole design:

1. **CF8 already has a Facilities seam.** Both `OperatingCostSource` and `AuthorizedOperatingCostFact`
   carry a `facilityId` field, `OPERATING_COST_CATEGORIES` already includes `'FACILITY'` and
   `'VENUE'`, and `OperatingCostSourceAuthority` already includes `'FACILITY'`. CF8's
   `getOperatingExpenseByFacility` already aggregates facility OPEX via
   `referenceMatches(world, item, 'FACILITY', facilityId)`. CFI7 therefore built **no** recurring-cost
   scheduler and **no** facility OPEX aggregator.
2. **`costNature: 'OPERATING' | 'CAPITAL'` already exists** on operating cost facts, so capital vs
   operating expenditure is already expressible. There is no type named `CAPEX`; the brief was right
   not to assume one.
3. **`FinancialCommitment.category` and `FinancialSource.kind` are free-form strings**, not closed
   enums, so binding Facilities semantics onto them required no Finance enum change.

### Audit matrix

| FACILITY FACT | EXISTING FINANCE PRIMITIVE | ADAPTER REQUIRED? | NEW FINANCE PRIMITIVE REQUIRED? |
| --- | --- | --- | --- |
| `FacilityMaintenanceNeed` | none by design (a need is not an expense) | No | No |
| `FacilityMaintenanceNeed` (DEFERRED) | none by design | No | No |
| `FacilityOperationalIncident` | none by design (incident ≠ expenditure) | No | No |
| `FacilityInspection` | CF8 `AuthorizedOperatingCostFact` if an action is authorized | Reuses maintenance adapter | No |
| `FacilityMaintenanceAction` (routine/corrective/repair) | CF8 `AuthorizedOperatingCostFact` (authority `FACILITY`, category `FACILITY`, `facilityId`) | Yes — `authorizeFacilityMaintenanceExpenditure` | No |
| `FacilityMaintenanceAction` → recognition/payable/posting | CF3 `FinancialCommitment` + `ExpenseRecognition` + CF1 ledger transaction | Yes — same adapter, `recognizeImmediately` | No |
| `FacilityDevelopmentProject` (capital commitment) | CF3 `FinancialCommitment` (category `FACILITY_DEVELOPMENT`) | Yes — `prepareFacilityProjectFinance` | No |
| `FacilityDevelopmentProject` (payment) | CF3 `ExpenseRecognition` + CF1 `FinancialTransaction` | Yes — `executeFacilityProjectCapitalPayment` | No |
| `FacilityDevelopmentProject` (debt financing) | CF9 `DebtInstrument` + drawdown transactions | Yes — `bindFacilityProjectDebtFinancing` (reference only) | No |
| `FacilityDevelopmentProjectPhase` | CF3 commitment / CF5 schedule, optional | No (not forced) | No |
| Facility OPEX totals | CF8 `getOperatingExpenseByFacility` | Thin alias only | No |
| Facility budget presence | CF6 `FinancialBudget`/`BudgetLine` over ordinary recognitions | No | No |
| Facility ownership / valuation / depreciation | none — Finance has no asset-accounting authority | No | **Deliberately not added** (see §42) |
| Facility → Finance discoverability | *(gap)* | Yes | **One Facilities-side entity: `FacilityFinancialBinding`** (non-monetary; see §11) |

The only new persisted entity in this wave is `FacilityFinancialBinding`, and it is a Facilities-side
cross-reference, not a Finance primitive. No Finance type was extended, and no Finance file was
modified by the CFI7 feature commits.

## 11. Facilities audit

CFI1-CFI6a entities were re-read to confirm none already carries monetary state, and none does. After
CFI7 that is still true: `grep` for `maintenanceCost|constructionCost|renovationCost|monthlyExpense|
loanBalance|amountPaid` in `src/domain/facilities` returns zero, and tests 15/31/32 assert the absence
of `cost`, `budget`, `loanBalance`, `amountPaid`, `depreciation`, `bookValue`, `marketValue`,
`fairValue` and friends on the stored project/facility.

`FacilityFinancialBinding` fields: `id`, `sourceKind`, `sourceId`, `facilityId`, `factKind`, `factId`,
`organizationId`, `createdOn`, `role`. There is deliberately no `amount`, `currencyCode`, `status` or
`balance`. `sourceKind` is closed to `FACILITY_MAINTENANCE_ACTION` and `FACILITY_DEVELOPMENT_PROJECT`
— needs and incidents are *not* bindable, enforcing "a need is not an expense" at the type level.

## 12. Authority boundaries

```
FACILITIES  "what physically exists and what is being done"
            Facility, FacilityComponent, MaintenanceNeed/Action, Inspection,
            OperationalIncident, DevelopmentProject/Phase, lifecycle status
    |
    |  src/integration/facilitiesFinance   (the ONLY place importing both domains)
    v
FINANCE     "what it costs, how it is committed, recognized, paid and financed"
            Accounts, transactions, postings, commitments, recognitions,
            payables/receivables, operating cost facts, budgets, debt
```

`src/domain/facilities` and `src/engine/facilities` contain **zero** `@/domain/finance` imports
(verified; the two grep hits in `FacilityFinancialBinding.ts` are prose in its header comment).
`src/domain/finance` contains zero Facilities imports.

**Deviation from the brief, deliberate and worth flagging.** The brief suggested the integration layer
own the binding type. It cannot: `FacilityFinancialBinding` is normalized `GameWorld` state, so
`src/domain/world/GameWorld.ts` must construct and validate it, and Domain may not import a layer
sitting above it in the `UI -> Application -> Engine -> Domain` direction that `docs/ARCHITECTURE.md`
fixes. The inherited draft did exactly that and inverted the dependency. The entity therefore lives in
`src/domain/facilities/FacilityFinancialBinding.ts` (pure, Finance-free, `factId` typed as plain
`string` precisely so it needs no Finance import; referential integrity is enforced at validation time
against collections passed in structurally). `src/integration/facilitiesFinance/` keeps all
Finance-coupled behavior. This preserves the brief's intent — one explicit seam, no Finance leakage
into pure Facilities models — without breaking the layering rule.

## 13. Facilities → OPEX integration

`authorizeFacilityMaintenanceExpenditure(world, {maintenanceActionId, organizationId, amount,
financialDate, recognizeImmediately?, ledger?, idempotencyKey?})`.

Requires an **already-completed** `FacilityMaintenanceAction` (`completedAt !== null && outcome !==
null`); a need or in-progress action is rejected with a `RangeError`. Creates a CF8
`AuthorizedOperatingCostFact` with `authority: 'FACILITY'`, `category: 'FACILITY'`, `costNature:
'OPERATING'`, `facilityId` and provenance `{kind:'FACILITY_MAINTENANCE_ACTION', id: actionId}`.

With `recognizeImmediately: true` it additionally creates a CF3 `FinancialCommitment`, an
`ExpenseRecognition` derived from it, and the CF1 ledger transaction, via Finance's own
`createExpenseRecognitionFromCommitment` / `createExpenseRecognitionLedgerTransaction`. With `false` it
records only the authorized fact — committed and recognized cost are allowed to diverge in time.

`executeFundedMaintenanceAction(...)` composes CFI5 action creation + `applyFacilityMaintenanceAction`
+ the above in one atomic call.

## 14. Facilities → capital / debt integration

- `prepareFacilityProjectFinance(...)` — records a `FinancialCommitment` (category
  `FACILITY_DEVELOPMENT`) for a project *without* starting it.
- `executeFundedFacilityProjectStart(...)` — commitment + real CFI6
  `startFacilityDevelopmentProject` atomically.
- `executeFacilityProjectCapitalPayment(...)` — one payment: commitment + recognition + ledger
  transaction, callable any number of times per project.
- `bindFacilityProjectDebtFinancing(...)` — binds an existing CF9 `DebtInstrument` to a project.
- `completeFundedFacilityDevelopmentProject(...)` — thin pass-through to the CFI6 completion command,
  explicitly gated on nothing financial.

CFI7 never creates, schedules or amortizes debt; `DebtEngine` remains the sole authority. All eight
CFI6 project types work unchanged — CFI7 binds money to a project, it does not branch on project type.

## 15. Maintenance flow

```
FacilityMaintenanceNeed            (no financial consequence, ever)
   -> FacilityMaintenanceAction    (authorized/completed — CFI5 authority)
      -> AuthorizedOperatingCostFact          CF8   ("authorized")
         -> FinancialCommitment               CF3   ("committed")
            -> ExpenseRecognition             CF3   ("recognized")
               -> FinancialTransaction        CF1   (posted to the ledger)
```

Each arrow is an explicit call. Nothing is automatic, and no step is reconstructed inside Facilities.

## 16. Development-project flow

```
FacilityDevelopmentProject  (CFI6 physical authority: PLANNED -> IN_PROGRESS -> COMPLETED/CANCELLED/PAUSED)
   |-- FinancialCommitment            role CAPITAL_COMMITMENT
   |-- DebtInstrument (CF9)           role DEBT_FINANCING
   |-- payment 1: commitment + recognition + transaction   roles CAPITAL_PAYMENT_*
   |-- payment N: ...                                      (1:N, never 1:1)
```

Physical status and financial state advance independently in both directions (tests 10 and 11).

## 17. Budget integration

No `FacilityBudget` exists. Facility expenditure reaches CF6/CF8 budget and forecasting because it is
recorded as ordinary `ExpenseRecognition` rows in operating categories (`FACILITY`) or capital
categories (`FACILITY_DEVELOPMENT`), which existing budget queries already consume. Operating vs
capital expenditure is distinguished by Finance's own pre-existing semantics (`costNature`, category),
not by a Facilities-side flag. Test 16 asserts the recognition category and the absence of any
`facilityBudgetsById` collection.

## 18. Debt integration

A project may reference any number of `DebtInstrument`s through bindings with role `DEBT_FINANCING`.
Facilities stores no principal, interest rate, drawdown, schedule or outstanding balance — test 12
asserts the project object has no `principal` key. `isFacilityProjectUnderfundedAt` reads drawn debt
through CF9's own `DEBT_DRAWDOWN` transactions and their `dimensions.reference` to the instrument.

## 19. Financial references / bindings

`FacilityFinancialBinding` is 1:N by construction: many bindings may share one `sourceId`. This is how
"one project, many financial facts" and "multiple funding sources" (club cash + loan + owner injection
+ grant, once Finance models the latter two) are represented structurally. There is deliberately no
`project.financialTransactionId` 1:1 field. `factKind` is closed to six real CF1-CF9 primitives:
`FINANCIAL_COMMITMENT`, `EXPENSE_RECOGNITION`, `FINANCIAL_TRANSACTION`, `OPERATING_COST_SOURCE`,
`OPERATING_COST_FACT`, `DEBT_INSTRUMENT`. Validation rejects a binding whose referenced fact does not
exist in the corresponding Finance collection.

## 20. Atomicity

Every orchestration command threads one growing `GameWorld` value and returns it only on full success.
No command mutates in place and none catches its own exceptions, so any failure — physical or
financial — propagates before a value is returned and the caller keeps its original, untouched
`world`. There is no separate commit step that could apply half a result.

- Test 19: financial validation failure (recognize without a ledger mapping) leaves no recognition and
  no binding.
- Test 20: invalid amount leaves no commitment and no binding.
- Test 21: failed physical validation (double start) creates no financial side effect.
- Test 22: failed financial validation (unknown organization) leaves no new maintenance action.

## 21. Idempotency

All generated ids are content-addressed from a natural key (`action.id`, `project.id` + role, or
`project.id` + payment sequence), never random — consistent with the repository-wide "no
`Math.random()` in `src/`" rule (verified: zero occurrences). Re-running a command with the same key
reproduces the same ids, which `GameWorld`'s existing append-only/duplicate-id guards reject rather
than silently duplicating. No new idempotency ledger was introduced. Test 23 asserts a re-run throws
and leaves exactly one operating cost fact and one binding.

## 22. Traceability

Bidirectional and deterministic (ordered by `createdOn`, then id):

- Forward: `financialFactsForFacility`, `financialFactsForMaintenanceAction`,
  `financialFactsForDevelopmentProject`.
- Reverse: `facilitySourceForFinancialCommitment`, `facilitySourceForFinancialTransaction`.
- Independently, every Finance fact CFI7 creates carries a `provenance` naming its Facilities source,
  so "why did this money leave?" is answerable from the Finance side alone.

Tests 6, 24, 25, 26 cover both directions; test 29 confirms traceability survives a save round-trip.

## 23. Cancellation behavior

`cancelFacilityDevelopmentProject` is unchanged CFI6 behavior. CFI7 deletes nothing: commitments,
recognitions, transactions and debt bindings already recorded remain. Test 17 asserts a CANCELLED
project retains its full fact count and its 2,000,000 recognized expenditure. Financial history is
history.

## 24. Paused-project behavior

`pauseFacilityDevelopmentProject` is unchanged CFI6 behavior and freezes nothing financial. Test 18
asserts a PAUSED project still reports 10,000,000 outstanding commitments.

## 25. Physical completion vs financial settlement

Explicitly decoupled in both directions:

- Test 10 — `COMPLETED` with 10,000,000 still outstanding.
- Test 11 — the original commitment fully recognized while the project is still `IN_PROGRESS`.

`completeFundedFacilityDevelopmentProject` performs no funding check and triggers no payment.

## 26. GameWorld changes

One added collection, `facilityFinancialBindingsById`, plus its entry in `CreateGameWorldInput`, its
`indexById` construction, its append-only guard and its validation call in both `createGameWorld` and
`updateGameWorld`. All CFI1-CFI6a and CF1-CF9 collections are untouched.

## 27. Save changes

`GameWorldSaveV4` gains one optional field, `facilityFinancialBindings?`, with a parser, serialize
entry, migrate-path empty default and destructure exclusion. Schema version remains **4** — no new
version was needed because the field is additive and optional. Plus the §9 deserialize-chain fix.

## 28. Backward compatibility

- A V4 payload without `facilityFinancialBindings` loads with an empty collection (test 28).
- V1→V4 and V3→V4 migration paths are unchanged and still pass.
- Facilities-only and Finance-only saves both load, since each domain's collections default
  independently.
- The full `src/save` suite (28 files, 197 tests) passes, including every pre-existing CF and CFI
  persistence test.

## 29. Rich combined round-trip

Test 29 builds a world containing a Place, Facility, component, operational incident, completed
maintenance action, development project, a started+funded project, a capital payment and an authorized
maintenance expenditure, then serializes and deserializes it and asserts equality of facilities,
incidents, commitments, recognitions, operating cost facts and bindings — then re-runs the
traceability queries against the *restored* world and confirms 4 project facts and 1 maintenance fact.

## 30. Validation

`validateFacilityFinancialBindingCollection` rejects duplicate binding ids, unknown Organization,
unknown Facility, unknown source (maintenance action / development project) and a referenced Finance
fact that does not exist in its collection. It runs on every world construction and update.

Two genuine defects in the inherited integration draft were found *by* these tests and fixed:

1. **Provenance collision.** `executeFacilityProjectCapitalPayment` reused
   `{FACILITY_DEVELOPMENT_PROJECT, projectId}` as the commitment provenance for every payment. CF3's
   `assertUniqueRecognitionSource` enforces globally unique `kind:id` per commitment, so a project
   could never take a second payment — silently defeating the headline "one project, many financial
   facts" requirement. Provenance is now the payment's own natural key
   (`FACILITY_DEVELOPMENT_PROJECT_PAYMENT`); the binding still carries the 1:N project relationship.
2. **Unreachable recognition.** A capital payment creates three Finance facts but bound only the
   transaction, leaving the `ExpenseRecognition` undiscoverable from the project, so
   `recognizedFacilityExpenditureAt` always returned empty. All three facts are now bound.

## 31. Queries

In `FacilityFinanceQueries.ts`, all pure projections, nothing cached or persisted:

`financialFactsForFacility`, `financialFactsForMaintenanceAction`, `financialFactsForDevelopmentProject`,
`facilitySourceForFinancialCommitment`, `facilitySourceForFinancialTransaction`,
`committedFacilityExpenditureAt`, `recognizedFacilityExpenditureAt`, `paidFacilityExpenditureAt`,
`facilityOperatingExpenditureAt` (thin alias over CF8's `getOperatingExpenseByFacility`),
`facilityCapitalExpenditureAt`, `outstandingFacilityCommitmentsAt`, `facilityProjectFundingAt`,
`isFacilityProjectUnderfundedAt`.

`isFacilityProjectUnderfundedAt` returns `boolean | null` and yields `null` — never a guess — when no
commitment exists or when funding facts are in a different currency from the commitment (CF9 has no
FX). No arbitrary "funding %" was invented.

## 32. RPG / event seams

`FacilityFinanceIntegrationOutcome` is returned, never persisted (it is fully derivable). It carries
`facilityEntityId`, `facilityActionOrProjectId`, `createdCommitmentIds`, `createdTransactionIds`,
`createdBindingIds`, `debtInstrumentIds`, `physicalOutcome`
(`MAINTENANCE_ACTION_RECORDED`/`PROJECT_STARTED`/`PROJECT_COMPLETED`) and `financialOutcome`
(`FACILITY_EXPENDITURE_AUTHORIZED`/`FACILITY_EXPENDITURE_COMMITTED`/`FACILITY_PAYMENT_MADE`). All are
derived from facts that actually exist. No complaints, board reactions, press, morale, relationships,
news or promises were created.

## 33. Tests added

33 tests in `src/integration/facilitiesFinance/FacilityFinanceIntegration.test.ts`, matching the
brief's required list one-to-one. **33 passed, 0 failed.**

1. merged GameWorld contains both domains ✅ · 2. Save round-trip preserves both ✅ · 3. maintenance
action produces canonical operating fact ✅ · 4. need alone creates no expense ✅ · 5. deferred
maintenance creates no expense ✅ · 6. maintenance link traceable both directions ✅ · 7. project
creates/links capital fact ✅ · 8. project supports multiple financial facts ✅ · 9. multiple payments
per project ✅ · 10. physical completion ≠ fully paid ✅ · 11. fully funded ≠ physically complete ✅ ·
12. project associated with debt ✅ · 13. multiple funding sources structurally ✅ · 14. Finance is
amount authority ✅ · 15. no duplicate ledger state ✅ · 16. budget uses Finance primitives ✅ ·
17. cancellation preserves history ✅ · 18. pause preserves liabilities ✅ · 19. maintenance execution
atomic ✅ · 20. project execution atomic ✅ · 21. failed physical → no financial effect ✅ · 22. failed
financial → no physical effect ✅ · 23. idempotent ✅ · 24. traceability by Facility ✅ ·
25. traceability by MaintenanceAction ✅ · 26. traceability by DevelopmentProject ✅ · 27. historical
query deterministic ✅ · 28. pre-CFI7 Save loads ✅ · 29. CFI7 rich round-trip ✅ · 30. CFI6a funded
renovation restores lifecycle ✅ · 31. no depreciation ✅ · 32. no valuation ✅ · 33. no duplicate
Finance authority ✅

No extra tests were added; each protects a distinct rule.

## 34. Facilities regression result

`src/domain/facilities` + `src/engine/facilities` — **all passing**, including the CFI6a lifecycle
restoration suite. CFI6a behavior is additionally re-proved through the financed path by test 30:
a funded renovation of a `TEMPORARILY_CLOSED` facility goes `UNDER_RENOVATION` on start and restores
`TEMPORARILY_CLOSED` on completion. Financing does not reintroduce "UNDER_RENOVATION forever".

## 35. Finance regression result

`src/domain/finance` — **all passing** (CF1-CF9, including DebtEngine, OperatingCostEngine,
BudgetForecasting, CompetitionEconomy, Recognition, Treasury, ContractFinancialSchedule,
EconomicEventAdapters, RevenueEngine). No Finance source file was modified by CFI7.

## 36. Save result

`src/save` — 28 files, 197 tests, **all passing**, after the §9 deserialize fix.

## 37. Typecheck

`npx tsc --noEmit -p tsconfig.json` — **clean, zero errors**.

## 38. Build

`npm run build` (`tsc -b && vite build`) — **success**, built in 6.04s. The >500 kB chunk warning is
pre-existing and unrelated.

## 39. git diff --check

**Clean** — no whitespace errors, no conflict markers. `grep` for `<<<<<<<` across `src/` returns zero.

## 40. Skipped gates

- **Full `npm test`**: intentionally not run, per the brief's reduced-gate policy. The focused gate
  (`src/save`, `src/domain/world`, `src/domain/facilities`, `src/engine/facilities`,
  `src/domain/finance`, `src/integration`) covers **61 files / 620 tests, all passing**, and no
  evidence of cross-cutting regression appeared.
- **Cargo / Rust**: skipped — no Rust file was touched.
- A broader `src/app` + `src/engine/world` run was started as a cross-cutting sanity check and exceeded
  the 600s tool timeout without completing. This matches the pre-existing slow-suite/timeout condition
  the brief warned against re-investigating without new evidence; typecheck and a successful
  production build both pass over the whole tree, and no world-construction API was changed
  incompatibly (the new collection is optional everywhere).

## 41. Technical debt

- **FX remains unimplemented** (inherited CF9 debt, explicitly kept). All cross-currency query paths
  return per-currency rows and never convert; `isFacilityProjectUnderfundedAt` returns `null` rather
  than comparing across currencies.
- `FacilityFinancialBinding.id` and `factId` are plain `string`s, not branded entity ids. Branding
  `factId` would require a Finance import in a pure Facilities Domain file; branding the binding id
  would mean a new id type in `EntityIds.ts`. Deferred deliberately, noted here.
- `role` on a binding is a free-form string rather than a closed enum. The current values
  (`CAPITAL_COMMITMENT`, `DEBT_FINANCING`, `CAPITAL_PAYMENT`, `CAPITAL_PAYMENT_COMMITMENT`,
  `CAPITAL_PAYMENT_RECOGNITION`, `MAINTENANCE_EXPENSE_AUTHORIZED`, `MAINTENANCE_EXPENSE_RECOGNIZED`)
  are conventions, not type-enforced.
- `paidFacilityExpenditureAt` derives settlement from CF2 payables and treasury settlements, but CFI7
  creates no payable itself (recognitions are posted straight to the ledger), so it returns empty for
  CFI7-created facts until a payable-based flow exists.
- `authorizeFacilityMaintenanceExpenditure` requires a *completed* action. Authorizing spend for an
  approved-but-not-yet-executed action is not yet expressible.

## 42. Deliberately deferred scope

Not implemented, per the brief's explicit NO list: accounting depreciation (physical deterioration in
CFI5 is *not* accounting depreciation and stays separate); facility valuation / `marketValue`;
disposal or sale accounting and gain/loss — Finance has no asset-valuation authority, so creating one
here would have invented a financial authority; FX; taxes; FFP; tender/procurement; contractors;
dynamic market pricing; construction inflation; new grant or subsidy systems; facility staff payroll;
sporting/training/medical effects; attendance; ticketing; AI decisions; a new board approval flow; RPG;
News; UI.

**Governance**: CFI7 decides nothing about who may approve spend. No authority grant was duplicated.
The `organizationId` on every binding and Finance fact is the seam a future Governance→Finance
authorization check would use.

**advanceDay**: deliberately **not** wired. All CFI7 entry points are explicit commands. Automatic
periodic facility operating costs remain a later integration wave.

## 43. Proposal for CFI8

**CFI8 — Facility Operating Cost Recurrence & Calendar Activation.**

CFI7 left explicit APIs and no automation. CFI8 should close that loop, in this order:

1. **Recurring facility operating costs.** Use CF8 `OperatingCostSource` (which already has
   `facilityId`, `generationPolicy` ONE_OFF/ANNUAL/SEASONAL/EXPLICIT_SCHEDULE, and a `paymentSchedule`)
   to model utilities, cleaning, security and routine operations per Facility. Build **no** second
   scheduler: CF8 already materializes facts from sources. CFI8's work is deciding which facilities
   generate which sources, and binding the materialized facts back through
   `FacilityFinancialBinding`.
2. **advanceDay activation.** Wire CF8 materialization into the calendar behind an explicit,
   deterministic, idempotent-per-date checkpoint, following the existing monthly-checkpoint precedent
   (coach finances, memory decay). This is the first time Facilities costs money without a user
   command, so it needs its own certification of determinism and idempotency.
3. **Payable-based settlement.** Route facility expenditure through CF2 `Payable` +
   `TreasurySettlement` instead of posting recognitions straight to the ledger, which would make
   `paidFacilityExpenditureAt` meaningful and give "committed / recognized / paid" three genuinely
   distinct values (see §41).
4. **Incident → need → action → cost chain.** Let a `FacilityOperationalIncident` deterministically
   produce a `FacilityMaintenanceNeed`, preserving the CFI7 rule that only an *authorized action*
   creates an expense.
5. **Closed `role` enum + branded binding id**, retiring the §41 debt.

Explicitly still out of scope for CFI8: FX, depreciation, valuation, disposal accounting, procurement,
contractors, market pricing. Asset valuation/depreciation should not be attempted until Finance grows a
canonical asset-accounting authority — that is its own Finance-side milestone (CF11+), not a Facilities
one.

---

*Certified on branch `club-facilities-infrastructure-v2-cfi7-finance-integration` at
`d87a16acfef192e45834b28b5e850afc45971ab3`. No push, no PR, no merge to main.*
