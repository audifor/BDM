# BS17E-A · Authorized maintenance & repair · certification

**Status: `PARTIAL · BS17E-A` — `TECHNICAL_IMPLEMENTATION_PASS`, `IMPLEMENTED_WITH_VALID_INPUTS`, no production reachability.**
Not `PASS · BS17E-A AUTHORIZED MAINTENANCE & REPAIR`: see "Certification level" for the exact reason. BS17E as a whole is **not** complete after E-A.

## 1. Base and isolation

- Base: `67c61edc77198ca87579108379e41ab5bd1a1bc4` (BS15 + BS16 final + BS17D, Staff V4-01, Save V4, Calendar, Medical M1, Training/C1; Convergence V3.1 certified).
- Worktree `C:\BDM-BS17E-A`, branch `bdm-stage2-bs17e-a-maintenance-repair`. No merge, no push, `main` and every source worktree untouched.
- Contracts consulted (read-only) in `C:\BDM-BS17E-P2-CONTRACTS` at `dc63d604723e81c7f09416ce8364efb67b88648f`: `BS17E_P_V1_APPROVED_POLICY.md`, `BS17E_P2_V1_APPROVED_POLICY.md`, `BS17E_IMPLEMENTATION_PLAN.md`. Provenance of the user-approved Economic Gameplay V1 decisions (E01–E07, OPEX/CAPEX, GOV-05–07, E-P03, E-P05–E-P10) is the E-A mission statement of 2026-10-10; those decisions are *principles*, and every numeric/data decision below remains unapproved.
- `BLOCKED_BY_BS16_COMPLETE` is not used: BS16 final is in the base. The remaining limits are data/policy limits, listed in section 9.

## 2. What was built

| Layer | Artifact | Role |
|---|---|---|
| Domain | `src/domain/facilityEconomy/FacilityEconomy.ts` | One append-only world collection `facilityEconomyRecordsById` with four immutable record kinds: `COST_CATALOG_ENTRY`, `PROVIDER`, `OFFER`, `OPERATION_EVENT`. Finance-free and Governance-free (ids only). The operation lifecycle is **derived** from its events; there is no second mutable state machine. |
| World / Save | `GameWorld.ts`, `GameWorldSaveV4.ts` | New collection wired like `facilityFinancialBindings`: append-only, referentially validated in full and incremental modes, strict per-kind Save parser, older V4 saves default to empty. |
| App | `src/app/facilityMaintenance/FacilityMaintenanceCommands.ts` | Pure commands: register evidence, open proposal, select offer, request decision, record decision event, reserve-and-contract, start work, complete work, cancel. |
| App | `FacilityMaintenanceReadModel.ts`, `FacilityMaintenanceUiCommands.ts` | Per-operation view (cost, Governance, funding, execution, economics, history, alerts) and action availability computed by **dry-running the real command**. |
| Store / UI | `gameStore.executeFacilityMaintenance`, `FacilityMaintenanceOperationsPanel.tsx`, `FacilitiesWorkspace.tsx` | Panel inside the existing "Condition & maintenance" tab. Replaces the old "not yet a club action" note. Board approvals reuse the same canonical command (`BoardGovernanceCommands`). |
| Finance (one narrow change) | `ClubFinanceLifecycle.ts` | See section 4. |

## 3. Authorities used (no parallel economy)

- **Facilities** own the need, the `FacilityMaintenanceAction`, the condition restoration (`applyFacilityMaintenanceAction`) and the operation history. No monetary balance is stored in Facilities.
- **Governance** owns permission: a per-operation `FACILITIES` decision (`subject: FACILITY`). PROPOSE, APPROVE (all-of), VETO and EXECUTE come from `resolveGovernanceDecisionRights` and active appointments; each event cites its supporting grant ids. The user and an AI actor call the same commands with the same rights. No manager has implicit authority.
- **Finance** owns money: `reserveOrganizationFinancialCommitment` (authorization, liquidity, currency, period, idempotency) and `AuthorizedOperatingCostFact`, which the single Calendar owner (`CLUB_FINANCE_V2`) turns into commitment, expense recognition, payable and Treasury settlement. `FacilityFinancialBinding` links the action to the cost fact.

## 4. Finance change, documented

`src/engine/finance/ClubFinanceLifecycle.ts`: the operating-cost step ran only when the organization had an `OperatingCostSource`; an `AuthorizedOperatingCostFact` alone was never materialized (`runWhenSourcesExist`). The condition now also accepts an organization's authorized fact. This is the minimal adapter; no policy, rule, account or formula changed. An earlier idea (consume the reservation inside `EconomicEventAdapters`) was **reverted** once a better discipline was found (below).

## 5. Lifecycle and economic sequence

`proposal → offer selected → approval requested → decision events → reserve funds → accept contract (EXECUTED) → work started → work completed (+ cost fact authorized) → [Calendar] expense recognized + payable → [Calendar] Treasury settlement`.

- Offer **selection is not contracting**; contracting needs an approved decision, a valid offer today, stated payment terms and an EXECUTE appointee.
- Reservation and contract acceptance are one atomic transition ordered reserve → accept. If Finance refuses, only a `FUNDING_BLOCKED` history event is persisted (not repeated for the same reason); the need, the proposal and the decision are untouched and no work can start.
- **Work completion** reads a real `FacilityInspection` (finding → outcome; observed condition/serviceability → result). It never invents a duration; the offer's own `executionDays` (source-provided, nullable) gates completion when present. A non-successful outcome returns the need to `OPEN` so it can be addressed by a new, separately authorized operation.
- **Recognition date.** The cost fact is incurred on the day **after** completion, because Finance's processor handles the current date before commands run. Recognition is therefore never "because the screen says completed"; it is produced by the Calendar owner, once.
- **Capacity discipline (BS16M-B1C pattern).** The `FACILITY` reservation holds capacity while the contract is open. When the fact is authorized it becomes visible to Finance's own commitment authority, so the reservation is `CONSUMED` in the same transition. Tests prove the amount is held exactly once at each stage (reserved → committed → recognized).
- OPEX only: `OPEX_ROUTINE_MAINTENANCE`, `OPEX_RESTORATIVE_REPAIR`, `OPEX_MINOR_REPLACEMENT`. Anything capitalizable, mixed or integral has no classification and is refused. No depreciation or amortization.

## 6. Adverse findings produced by the work (and what was done)

| # | Finding | Action |
|---|---|---|
| 1 | Authorized operating-cost facts were never processed without a source. | Narrow Finance condition (section 4). |
| 2 | Finance reservations are organization-scoped, so they do **not** protect the FACILITY budget line from a second concurrent operation. | Facilities-side guard that only **reads** Finance facts (`FACILITY_LINE_HELD_BY_OTHER_OPERATIONS`), active only when Finance alone would allow the amount. Test: second operation blocked on a tight line, accepted on a roomy one. |
| 3 | After completion, the open reservation and the visible future commitment counted the same amount twice. | Consume the reservation at fact authorization (B1C discipline); test. |
| 4 | A category with no authorization line is "not modelled": Finance allows on liquidity alone. | Finance's verdict is kept, **surfaced** (`BUDGET_AUTHORIZATION_NOT_MODELLED` on the funds event and the funding view), never overridden. Recorded as a product question (section 9). |
| 5 | The UI disabled "reserve" when Finance would refuse, so the blocker was never persisted. | The action stays available and states the predicted refusal; running it persists `FUNDING_BLOCKED`. |
| 6 | The first read-model draft would have advertised actions by guesswork. | Action availability is the result of dry-running the real command. |
| 7 | Observation (not changed): once an expense is recognized, the authorization line's `committed` no longer includes it (recognized spend becomes "actual"), so line headroom is restored while the payable is unpaid. This is BS16 authorization semantics; liquidity still governs cash. | Reported for the Finance owner; no change. |
| 8 | Tests fixed during the work: an unreachable fixture assumption (fixture world lacked any FACILITY line), tests reading the first row after a second need was added, and a missing real inspection. | Tests corrected; no assertion was weakened to pass. |

## 7. Tests (permanent)

New suites in `src/app/facilityMaintenance/` and `src/ui-ng/applications/facilities/`:

- **Costs** — shipped universe prices nothing; `UNKNOWN_COST`; documented/accredited offer accepted and immutable; unknown provider/need refused; simulated catalog/offer only with authorized calibration, market, currency and intervention match; synthetic provider must read "(simulated)"; unsupported classifications refused; wrong currency / not yet valid / expired / out-of-scope offers; offer unchanged across Calendar and double Save; old V4 save defaults to empty; malformed record rejected.
- **Governance** — no institution ⇒ `INSTITUTIONAL_AUTHORITY_UNVERIFIED`; outsider/unappointed/no-right bodies refused; approval cites grants and is idempotent; rejection and veto end the path; revoked grant and expired appointment give no authority; EXECUTE right required; AI actor has identical rights (cannot approve its own proposal); approval against an expired offer refused; Board surface records the same command and refuses a non-maintenance `FACILITIES` decision.
- **Finance** — reservation before work; idempotent reserve/contract; `FUNDING_BLOCKED` persisted with canonical reason and nothing started; not-modelled category surfaced; liquidity shortfall; line protected against a second operation; completion neither recognizes nor pays; payment never completes work; one recognition, one payable, one settlement; no double count at each stage; ledger balanced with no duplicates after double Save; execution window and inspection required; missing payment terms blocks contracting; expired offer after approval blocks contracting.
- **Lifecycle** — cancellation matrix A–G (proposal, withdraw pending, approved-before-contract with linked cancellation decision, rejected cancellation, reservation/contract release, partial execution, after cost authorized/recognized/settled ⇒ refused with Finance facts intact); condition restored from the real inspection; unsuccessful outcome reopens the need; Training/Medical collections untouched; every stage round-trips Save V4 twice with identical views; Calendar after a mid-flow reload equals the uninterrupted run (exactly once); one active operation per need; rival club refused.
- **End to end** — whole sequence from production commands to settlement and reload; production-reachability negative test.
- **UI** — unknown cost; request → select → approve → reserve → start through the store; blocked funding explained and preserved; unverified authority; cancel keeps history.

### Results (on the final tree; base `67c61ed`)

| Gate | Result |
|---|---|
| New `src/app/facilityMaintenance` suites + `EconomicEventAdapters` | **67/67 PASS** (Costs 12, Governance 13, Finance 14, Lifecycle 16, End-to-end 2, plus the unmodified adapter suite) |
| New UI suite `FacilityMaintenanceOperations.test.tsx` + updated `FacilitiesWorkspace.test.tsx` and existing Facilities UI | PASS (43/43 in that batch, run before the last commit-only edits) |
| Broad regression (140 files, 1485 tests: Finance engine/domain, integration/CFI7, Facilities domain/engine/app, Governance app/domain, Board UI, all of `src/save`, Convergence A–G, V3.1 Convergence, Finance continuity, Calendar, Training/C1, Medical M1, Staff V4-01) | 1445 PASS / 40 FAIL |
| Attribution of the 40 failures | Re-run on the untouched base `67c61ed`: **35 fail identically there** (pre-existing; MX0.7/Staff-job fixtures that pre-date BS16 final liquidity rules, and 5-second timeouts). The other 5 passed when re-run in isolation (load timeouts). Two timeouts also fail on the base in isolation. **No failure is attributable to BS17E-A.** These base failures are outside the V3.1 focal gate and were **not** repaired here (out of scope; listed so they are not mistaken for E-A regressions). |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | clean |
| Guards | no `Math.random` and no UI/store/app import added under Domain/Engine; no conflict markers in new files; `67c61ed` is an ancestor of HEAD; Finance diff limited to the one `ClubFinanceLifecycle` condition |

The broad run took 3921 s and used no timeout change in the repository. The only timeout configuration added is per-file `vi.setConfig` in the new BS17E-A test files (each scenario builds a full world, about 2.5 s).


## 8. Certification level

| Level | Result |
|---|---|
| `TECHNICAL_IMPLEMENTATION_PASS` | **Yes**, subject to the regression table above. Every phase from sourced offer to settlement is executable from production commands, with UI, Save and Calendar. |
| `SOURCE_BACKED_PRODUCTION_REACHABILITY` | **No.** A newly created production world contains no Facility, no maintenance need, no Governance institution, no `FACILITY` budget line, no cost catalog, no provider and no offer (asserted by tests). The flow runs only when those are supplied as valid input state, as the MX0.6/MX0.7 fixtures already do. Nothing was invented to change that. |
| `UNIVERSAL_WORLD_COVERAGE` | **No.** One constructed scenario proves the machinery, not coverage. |

Status therefore: `PARTIAL · IMPLEMENTED_WITH_VALID_INPUTS`, and for production worlds `BLOCKED_BY_APPROVED_DATA_POLICY` (no approved catalog values, provider policy, Governance bootstrap or Facility content).

## 9. Remaining product decisions (not invented)

1. Cost catalog **values**, units, calibration and the authorized simulation model; provider population policy. (Contracts exist; zero entries ship.)
2. Governance bootstrap per archetype (bodies, appointments, grants) and the Operational/Institutional/Strategic level mapping for maintenance vs extraordinary repair. Rights are resolved per body today; no level or threshold is applied.
3. Whether a budget category with no authorization line may spend on liquidity alone (Finance currently says "not modelled").
4. Recognition milestone beyond "work completed" (outcome-conditioned pricing, staged invoices) and any penalty, credit or refund on cancellation after partial execution.
5. Partial Treasury settlement: Finance's automatic settlement is all-or-nothing per due batch; partial payment is not exercised by E-A.
6. Facility content for production worlds (no Facility, need or inspection generation exists).
7. BS17E-B (capital, replacement classification) and BS17E-C (recurring services) remain open; BS17F AI is deferred and must reuse these commands.

## 10. Limits and risks

- The cost fact is recognized the day after completion by design (section 5).
- Work start has no physical-conflict check against Training/Medical use of the same facility (none exists for maintenance actions today).
- Fixture and test durations are not performance measurements; the new suites set generous per-file timeouts because each scenario builds a full world (about 2.5 s).
- No full-repository suite and no BS15 Y1–Y30 or World DB 2029 work was run or claimed.
