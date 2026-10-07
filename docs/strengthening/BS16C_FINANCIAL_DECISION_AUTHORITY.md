# BS16C — Financial Authority, Liquidity & Affordability

**Branch:** `bdm-stage2-bs16-finance-strengthening`
**Worktree:** `C:\BDM-BS16-FINANCE`
**Baseline:** `main` lineage `a682646` (BS16A audit, BS16B activation foundation)
**Scope:** build the canonical affordability decision contract and the reservation authority that makes it concurrency-safe. **No consumer is switched**: live gameplay affordability remains the legacy `TeamFinances` budget rule (see §8).

## What BS16C adds

BS16B made canonical Finance *capable of existing*. BS16C makes it *capable of deciding*:

```text
Organization + currency + as-of date
-> cash (derived) - already-incurred obligations
-> capacity before reservations
-> minus OPEN reservations            = available capacity
-> structured decision (status + reasons + amounts)
-> reservation that later decisions cannot spend twice
```

Implementation:

| File | Role |
| --- | --- |
| `src/domain/finance/FinancialReservations.ts` | reservation model, deterministic provenance id, idempotent append, release/consume |
| `src/domain/finance/FinancialDecision.ts` | capacity snapshot, obligation components, `evaluateFinancialCommitment`, `reserveFinancialCapacity` |
| `src/domain/ids/EntityIds.ts`, `src/domain/ids/index.ts` | additive `FinancialReservationId` |
| `src/domain/world/GameWorld.ts` | `financialReservationsById` collection, patch/indexer wiring, append-only + transition guard, world validation |
| `src/save/GameWorldSaveV4.ts` | optional additive `financialReservations` payload collection |
| `src/domain/finance/FinanceDecision.test.ts` | certification |

## 1. Canonical decision contract

`evaluateFinancialCommitment(world, { organizationId, amount, category?, asOfDate?, excludeReservationId? })`

The result is never a bare boolean:

```ts
interface FinancialCommitmentEvaluation {
  asOfDate; organizationId; currencyCode: CurrencyCode | null; requestedAmount: Money
  status: FinancialCommitmentDecisionStatus
  reasons: readonly FinancialCommitmentReasonCode[]
  affordable: boolean; requiresFinancing: boolean; reservationConflict: boolean
  fundingGapMinorUnits: number            // amount - capacityBeforeReservations
  reservationBlockedMinorUnits: number    // amount - availableCapacity
  existingCommitments: readonly FinancialObligationComponent[]
  requestedCategoryCommittedMinorUnits: number | null
  capacity: FinancialCapacitySnapshot | null
  availableAuthorizedHeadroomMinorUnits: number | null   // always null today
  budgetAuthorization: 'BUDGET_AUTHORIZATION_NOT_MODELLED'
}
```

| Status | Emitted when | Reported amounts |
| --- | --- | --- |
| `AFFORDABLE_NOW` | `amount <= availableCapacity` | gaps `0` |
| `RESERVED_CAPACITY_CONFLICT` | `availableCapacity < amount <= capacityBeforeReservations` | `reservationBlockedMinorUnits`, `reservationConflict: true` |
| `INSUFFICIENT_LIQUIDITY` | `amount > capacityBeforeReservations` | `fundingGapMinorUnits`, plus reason `REQUIRES_FINANCING`, `requiresFinancing: true` |
| `CURRENCY_MISMATCH` | requested currency ≠ profile base currency | no conversion is attempted (`capacity: null`); caller must convert explicitly or fail |
| `FINANCE_PROFILE_UNAVAILABLE` | Organization has no financial profile | `currencyCode: null`, `capacity: null` |
| `REQUIRES_FINANCING` | reason code for the liquidity case | — |
| `INSUFFICIENT_AUTHORIZED_HEADROOM` | **declared, never emitted**: no authorization model exists | — |

Every result also carries:

- `BUDGET_AUTHORIZATION_NOT_MODELLED` — budgets are informational (`financialBudgetsById`, `budgetLinesById`, …) and no consumer enforces them, so a decision must never be read as "the budget authorized this";
- `availableAuthorizedHeadroomMinorUnits: null` — there is no authorized headroom to report;
- `existingCommitments` — the already-incurred claims the decision was measured against.

The currency question is answered twice on purpose: a missing profile and a mismatched currency are *different* failures, and neither is resolved by guessing an Organization currency (BS16A/BS16B finding: no Organization/Team/Country/Ecosystem field stores one) or by applying FX (`exchangeRatesById` exists, but inventing a conversion policy is a product decision).

`REQUIRES_FINANCING` is deliberately source-agnostic: the contract reports that external money is required and by how much, and never assumes a bank lender, a loan product or an owner contribution. Any future funding authority (lender, owner, league, collective) closes the same gap.

## 2. Capacity model — one definition, three separate concepts

`getFinancialCapacitySnapshot(world, organizationId, currencyCode?, asOfDate?, { excludeReservationId? })`

```text
unrestrictedCash(currency, asOf)          // derived from the ledger, CASH_OPERATING_BANK only
- payables(currency, asOf)                // open/partially settled payable remainders
- commitments(currency, asOf)             // outstanding financial commitment remainders
- recognizedWithoutPayable(currency, asOf)// expense recognitions that never reached a payable
= capacityBeforeReservations
- openReservations(currency, asOf)        // OPEN FinancialReservation amounts
= availableCapacity
```

Deliberately **not** part of capacity:

- **restricted cash** — reported as `restrictedCashMinorUnits`, never spendable;
- **receivables and entitlements** — expectation is not capacity (`getOpenReceivables` / `getOutstandingEntitlements` are excluded);
- **budgets** — planning records, not money;
- **other currencies** — capacity is currency-scoped; capacity is never summed across currencies.

Double counting is structurally avoided: an expense recognition that *did* reach a payable is counted once through the payable remainder (the payable equals the recognition), and an expense recognition without a payable reduces the outstanding commitment remainder, so both components are added without overlap. `FinancialObligationComponent` exposes `kind` (`PAYABLE` | `PROGRAMMATIC_COMMITMENT` | `RECOGNIZED_WITHOUT_PAYABLE`), `id`, `category`, `remainingMinorUnits` and `dueOn` for every measured claim.

Cash, liquidity and authorization are therefore preserved as **three distinct questions**: cash = ledger balance, liquidity = cash minus incurred obligations, authorization = not modelled.

## 3. Reservation authority

```ts
interface FinancialReservation {
  id; organizationId; currencyCode; amount; category: string | null
  sourceAuthority; sourceEntityId; createdOn; dueOn: GameDate | null
  status: 'OPEN' | 'CONSUMED' | 'RELEASED'
  resolvedOn: GameDate | null; consumptionFactId: string | null
  provenance: FinancialSource
}
```

- **Identity is derived, never chosen**: `financial-reservation:<sourceAuthority>:<sourceEntityId>`. A factory validates that the stored id matches its provenance, so one provenance can never hold two reservations, and world validation enforces provenance uniqueness.
- **Authorities are a closed product set**: `CONTRACT`, `MARKET`, `STAFF`, `FACILITIES`, `TRADE`, `GOVERNANCE`, `OWNERSHIP`, `ORGANIZATION`, `MANUAL_SYSTEM_ACTION`. Persisted data therefore rejects unknown authorities instead of silently accepting them.
- **Lifecycle**: `OPEN` → `CONSUMED` (a real obligation now carries the claim) or `OPEN` → `RELEASED` (abandoned). Both are terminal; `resolvedOn` is required on resolution and immutable afterwards; `consumptionFactId` is only ever set for `CONSUMED` and is immutable once set.
- **`reserveFinancialCapacity(world, { organizationId, amount, category?, sourceAuthority, sourceEntityId, createdOn?, dueOn? })`** is the only public entry point that claims capacity. It evaluates first and only records a reservation when the decision is `AFFORDABLE_NOW`; otherwise it returns `REJECTED` with the full evaluation and a machine-readable `rejectionReason`. Repeating an identical request returns `ALREADY_RESERVED` with the identical world reference; reusing a provenance with different content is a `FINANCIAL_RESERVATION_PROVENANCE_CONFLICT`; reusing a resolved provenance is `FINANCIAL_RESERVATION_PROVENANCE_RESOLVED`.
- **Reservation creates no money**: no ledger transaction, no account, no payable/receivable, no commitment is touched (§14 assertion in the tests). `recordFinancialReservation` is the mechanical append; it never evaluates and is not the gameplay entry point.

### Concurrency safety (§14)

Two authorities competing for the same cash cannot both succeed:

```text
cash 1,000,000
A reserves 600,000   -> OPEN, available capacity 400,000
B requests 400,001   -> RESERVED_CAPACITY_CONFLICT (rejected)
C requests 400,000   -> OPEN, available capacity 0
D requests 1         -> RESERVED_CAPACITY_CONFLICT (rejected)
```

Because a reservation is world state (`world.financialReservationsById`) and every canonical write goes through `updateGameWorld`, a second decision made from the *updated* world observes the first claim; decisions made from a stale world are detected at write time by the append-only/transition guard, which rejects removals, core-field mutations, illegal transitions (`CONSUMED`/`RELEASED` cannot change status) and rewrites of a resolution.

## 4. World integration and validation

- `GameWorld.financialReservationsById: Readonly<Record<FinancialReservationId, FinancialReservation>>`, created from `CreateGameWorldInput.financialReservations`.
- `collectionPatchTargets` / `collectionPatchIndexers` entries so `updateGameWorld(world, { financialReservations })` normalizes through the factory (canonical ids, immutable core) exactly like other finance collections.
- `assertFinancialReservationsAppendOnly` — append-only plus legal-transition-only, mirroring `assertRevenueRecognitionsAppendOnly` / `assertFinancialEntitlementsAppendOnly`.
- `validateReservationState` — factory normalization, Organization must exist, provenance must be unique across reservations.
- No derived value is persisted: capacity, gaps, statuses and reasons are always recomputed from the ledger, obligations and reservations.

## 5. Save / load

`financialReservations` is an **optional additive** Save V4 collection (the established pattern: payload field, `serializeGameWorldV4`, optional `deserializeGameWorldV4` read, destructuring exclusion, `withFinance` re-application, `parseFinancialReservations` with `exactKeys`). Consequences:

- worlds saved before BS16C load unchanged and start with `financialReservationsById = {}`;
- `OPEN`, `CONSUMED` and `RELEASED` reservations round-trip byte-identically, so a reservation can never be "forgotten" by saving (which would be a money-creation bug), and resolved claims stay terminal across save/load.

## 6. Determinism and framework boundaries

- no `Math.random(` anywhere in `src/`; reservations use caller-supplied ids and dates only;
- no wall-clock usage: `createdOn`/`resolvedOn`/`asOfDate` come from the world or the caller;
- `src/domain/finance` stays free of React, Zustand and Tauri imports;
- amounts are integer minor units in one currency; no floating-point money, no cross-currency arithmetic.

## 7. Tests (`src/domain/finance/FinanceDecision.test.ts`, 10 tests)

| Requirement | Assertion |
| --- | --- |
| Decision contract | structured result, `BUDGET_AUTHORIZATION_NOT_MODELLED`, `availableAuthorizedHeadroomMinorUnits: null`, reason ordering |
| Cash ≠ liquidity | payables + commitments + recognitions without payable reduce capacity; 450,000 affordable, 450,001 `INSUFFICIENT_LIQUIDITY` with `fundingGapMinorUnits: 1` |
| Restricted cash | 500,000 restricted raises `restrictedCashMinorUnits` and leaves capacity unchanged |
| Currency mismatch | `CURRENCY_MISMATCH`, `capacity: null`, no FX |
| Missing profile | `FINANCE_PROFILE_UNAVAILABLE`; snapshot is `null`, or zero-capacity with an explicit currency |
| Reservation authority | reserve blocks later claims; conflicting request rejected without touching the world |
| Concurrency (§14) | 600,000 + 400,000 succeed, 400,001 and 1 are rejected |
| No money creation | ledger, accounts and payables are unchanged by reserving |
| Idempotency | identical repeat → `ALREADY_RESERVED` + identical world reference; changed amount → provenance conflict |
| Release / consume | release restores capacity, consume does not (`OPEN` only blocks), resolved provenance terminal, double release idempotent, illegal transitions throw |
| Immutability | removal, core-field rewrite, provenance rewrite, terminal-status change, resolution/consumption rewrite all rejected by `updateGameWorld` |
| Multi-Organization isolation | fully reserved Organization A blocks only A; B keeps its own capacity |
| Save / load | round-trip of `CONSUMED` + `RELEASED`; legacy payload without the field still loads |
| Legacy parity | characterization of budget-only affordability vs canonical liquidity (below) |

## 8. Legacy parity matrix (no consumer switch)

Live gameplay affordability is still the legacy rule; BS16C adds authority **beside** it and switches nothing.

| Question | Legacy (`src/domain/world/finances.ts`) | Canonical (BS16C) |
| --- | --- | --- |
| Input | annual salary number (integer, contract units) | `Money` in minor units of one currency |
| Basis | `TeamFinances.playerSalaryBudget` / `staffSalaryBudget` minus current payroll | unrestricted cash minus incurred obligations minus OPEN reservations |
| Currency | none (budget numbers are currency-less) | explicit; mismatch is reported, never converted |
| Time | `onDate` payroll snapshot | explicit `asOfDate` for every component |
| Double-spend protection | none (no reservation exists) | OPEN reservations + terminal provenance |
| Financing path | not modelled (a failed check simply fails) | `INSUFFICIENT_LIQUIDITY` + `REQUIRES_FINANCING` gap |
| Budget semantics | enforced budget ceiling | informational → `BUDGET_AUTHORIZATION_NOT_MODELLED` |

Characterized divergences (both directions are expected and documented, not bugs):

- legacy `true` + canonical `INSUFFICIENT_LIQUIDITY`: a budget with no cash behind it;
- legacy `false` + canonical `AFFORDABLE_NOW`: a budget ceiling with cash available — the ceiling is a *budget rule*, not a liquidity fact, and BS16C deliberately does not enforce it;
- a currency mismatch has no legacy equivalent at all.

Until a later milestone actuates canonical finance and migrates consumers, the legacy rule remains the gameplay authority for hires and signings.

## 9. Deferred (not in BS16C)

- switching any consumer (transfers, contracts, staff, facilities, AI, UI) to the canonical authority;
- budget authorization / `INSUFFICIENT_AUTHORIZED_HEADROOM` enforcement, and therefore authorized headroom reporting;
- financing instruments (loans, owner injections, capital calls) and the `REQUIRES_FINANCING` workflow;
- FX policy for cross-currency commitments;
- payroll/season scheduling of reservations (multi-period claim profiles);
- Person/Owner-level financing compatibility beyond the current Organization authority (the reservation authority is Organization-scoped, so an Owner/Person financing layer can later act as a funding source without changing this contract);
- global activation (`createNewGame` provisioning, `CalendarEngine` `CLUB_FINANCE_V2` phase, `advanceGameDay`), UI surfaces, and legacy bridge/dual-write.

## 10. References

- `docs/strengthening/BS16A_FINANCE_SYSTEM_TRUTH_AUDIT.md` — canonical map, invariants, dormant-activation findings.
- `docs/strengthening/BS16B_FINANCE_ACTIVATION_FOUNDATION.md` — account catalog, mapping authority, provisioning, currency gap.
- `docs/FINANCE_V2.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `docs/autopilot/PRODUCT_GUARDRAILS.md`.
