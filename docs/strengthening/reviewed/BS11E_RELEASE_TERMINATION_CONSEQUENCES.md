# BS11E · Release, Termination & Contract Consequences

## Status

**BS11E PASS.** Release now terminates the full active same-club successor chain while preserving each contract and its guaranteed Finance schedule. Capped releases without an approved termination-cap rule fail closed.

## 1. Reuse audit

| Concept | Existing authority | BS11E use |
|---|---|---|
| Release | `MarketService.releasePlayer` and `player.release` action | Compatibility wrapper to the canonical execution service |
| Contract state | `PlayerContract.termination` and derived status | Records release without deleting original contract terms |
| Cash forecast | `ContractFinancialSchedule` | Keeps guaranteed annual amounts; removes conditional exposure after termination |
| Cap payroll | Salary Engine, `SalaryRules`, `DeadMoneyCharge` | Existing active payroll remains separate; no generic release charge is inferred |
| Roster/free agency | roster membership and `PlayerTransaction` | Removes the player once and records one release transaction |
| Successor chain | `predecessorContractId` and GameWorld validation | Terminates linked same-team successors atomically |
| RolePromise | existing `ACTIVE` / `FULFILLED` / `BROKEN` status | Marks active promises `BROKEN`, retaining evidence |
| Governance | `PLAYER_CONTRACT_SIGNING` for signing only | No release authority exists; BS11E adds no approval requirement |
| History and Save | `PlayerContract`, `PlayerTransaction`, Save V4 | Existing persisted structures are sufficient; no schema collection added |
| Trade and expiry | `TradeEngine`, `ContractLifecycle` | Left as separate lifecycle authorities |

The repository has no release buyout/settlement producer and no cap rule that maps a released BASE_SALARY or EXPLICIT_SCHEDULE contract to a dead-money charge. `CONTRACT_BUYOUT_DUE` and `CONTRACT_TERMINATION_PAYMENT` are accepted Finance event names, not settlement policies. Existing retained salary remains trade-specific.

## 2. Terminology

- **Release** is the unilateral club action.
- **Termination** is the dated state recorded on each affected contract.
- **Expiry** remains the ordinary end-of-term lifecycle.
- **Buyout** and **mutual termination** require settlement authority that does not exist; both remain unsupported.
- **Waiver** has no separate BDM lifecycle and is not added.
- **Trade** remains an independent movement lifecycle.

## 3. Preview and execution authority

`assessContractRelease(world, teamId, playerId)` is a pure preview. It returns the affected contract IDs, future guaranteed schedule entries, cap treatment, and a structured blocker. The existing release confirmation surface displays this result, including scheduled successors and any unresolved rule/currency context.

`executeContractRelease` re-runs the assessment against the supplied world, then applies all contract terminations, roster removal, lineup cleanup, one release transaction, RolePromise changes, and club planning review as one immutable transition. `releasePlayer` remains the application compatibility entry point and delegates to this service. It returns unchanged state for a repeated release and throws the structured blocker reason to legacy callers.

## 4. Contract and chain behavior

The released contract remains in `GameWorld` with the same ID, original dates, compensation, guarantees, and successor links. Its termination reason remains the existing `released` value.

If the active contract has scheduled descendants, the release terminates the entire same-player, same-team linked chain on the same date. A scheduled successor is preserved with explicit termination evidence, including when termination predates its start date. GameWorld enforces that a successor of a released predecessor has matching termination evidence. Unlinked scheduled contracts, cross-team links, branches, and malformed chains block execution.

The roster is removed once after validation. One `PlayerTransaction` records the player’s departure and references the active contract at the release root. Each contract retains its own termination evidence, so the successor’s pre-activation termination remains inspectable without duplicating player-movement events. The player becomes available to the existing free-agent query after successful termination.

## 5. Guarantees and Finance

`ContractFinancialSchedule` remains the cash authority. It continues to derive annual `GUARANTEED` entries from the original terms after termination. Conditional salary exposure remains only for complete periods before termination; it is not promoted into a surviving guarantee. A scheduled successor’s guarantees remain visible even when that successor is terminated before activation.

No cash is deducted and no payment date is invented. Due dates remain absent until the existing Finance recognition policy supplies one. Where an organization has a base currency, the preview returns currency-coded Finance schedule values. Where it has no currency profile, the same Finance-owned projection is shown in original contract units and the UI identifies that currency policy is required. No synthetic currency is persisted.

No separate commitment is created for each future schedule row. Existing Finance recognition/materialization remains idempotent and consumes the derived guaranteed schedule. Previously recognized commitments, payables, and transactions remain historical Finance facts.

## 6. Cap and dead-money consequences

`NOT_APPLICABLE` contracts have no artificial release cap charge. The service does not equate cash guarantees with cap charges and does not create `DeadMoneyCharge` from `guaranteedAmount` or `capHit`.

For `BASE_SALARY` or `EXPLICIT_SCHEDULE` contracts in capped rulesets, no approved post-termination rule currently maps the remaining contract schedule into retained/dead-money treatment. The release preview therefore returns `ECONOMIC_TREATMENT_UNAVAILABLE` and execution leaves the world unchanged. Existing dead-money and retained-salary entries remain untouched.

## 7. RolePromise, Governance, and actors

An `ACTIVE` RolePromise for the released player and club becomes `BROKEN`; a fulfilled promise remains fulfilled. The promise is retained rather than deleted. GameWorld signing-evidence validation now accepts a broken promise only when a corresponding release transaction terminates that contract chain. No morale, agent, or relationship effects were added.

Release had no canonical Governance authority. BS11E reuses the current actor entry point and does not add Board approval. User release invokes the same execution service as any future authorized caller. No AI release owner or AI release pipeline exists today, so none was invented.

## 8. Idempotency, atomicity, and statuses

The preview and executor report `READY`, `RELEASED`, `ALREADY_TERMINATED`, `NO_ACTIVE_CONTRACT`, `INTEGRITY_INVALID`, `ROSTER_MINIMUM`, `SUCCESSOR_CHAIN_INVALID`, `ECONOMIC_TREATMENT_UNAVAILABLE`, or `FINANCE_REJECTED` as applicable. Repeated release returns `ALREADY_TERMINATED` and adds no roster, Finance, transaction, or promise effects.

All blockers occur before the final immutable world update. Finance schedule rejection, roster/contract mismatch, insufficient roster, unsupported cap accounting, or chain inconsistency leaves the original world unchanged. Planning review runs only after the coherent world update.

## 9. Trade, expiry, and persistence boundaries

The BS11D trade guard remains intact; trade-chain movement is not implemented here. Normal expiry continues through `ContractLifecycle` and does not create release economics. A terminated scheduled successor remains terminated when its original start date arrives.

No Save V4 collection or schema field was added. Existing contract termination, predecessor links, player transactions, RolePromise status, and Finance records already serialize. Older saves retain the same defaults.

## 10. UI and AI

The existing Player action confirmation shows which linked contracts are affected, future guaranteed schedules, and blockers. It uses the application preview and contains no UI-owned salary/Finance formula. No Contract Hub was added.

There is no active AI release pathway to route. Any later AI release owner must call `executeContractRelease`; it cannot use a separate economic path.

## 11. Findings and handoff

- **P0:** None.
- **P1:** Capped contract release is intentionally unavailable until an approved release cap/dead-money rule defines consequences for BASE_SALARY and EXPLICIT_SCHEDULE treatments.
- **Buyout and mutual termination:** Unsupported pending explicit trigger, payer/payee, amount, timing, and accounting rules.
- **Trade:** BS11D chain guard remains; atomic chain movement is outside this milestone.
- **BS11F:** Owns Contract Hub and final contract integration.

## 12. Validation

Focused tests cover release and pre-start termination, Finance guarantee/conditional schedules, successor-chain release, idempotency, RolePromise and Governance evidence, roster integrity, trade guard, market entry points, and release preview UI. No full suite or long-horizon simulation was run. No Save schema change was made.
