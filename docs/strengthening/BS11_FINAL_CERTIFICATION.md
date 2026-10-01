# BS11 Final Certification

## Certification: PASS ? BS11 ? Contracts + Roster Planning is CLOSED

This certification covers milestones BS11A through BS11F as a coherent gameplay capability. It does not require every advanced basketball contract mechanic. Core supported actions have a canonical authority, users can see their state, and unsupported terms or economic contexts fail closed with visible reasons.

## Capability progression

| Milestone | Capability delivered |
|---|---|
| BS11A | Contract and roster planning audit; contract continuity and planning context. |
| BS11B | Review intents (`PURSUE_EXTENSION`, `ALLOW_EXPIRY`, `REVIEW_RELEASE`, `DEFER`) distinct from offers, negotiation, signing, and release. |
| BS11C | Retention negotiation/history, deterministic player/agent response, proposed options/guarantees/incentives/trade consent, and AI retention ownership. |
| BS11D0 | Binding preconditions: active contract/roster integrity, service-time and SalaryRules authority, compensation materialization, and safe failure. |
| BS11D1 | Governance-backed binding retention signing, scheduled successor creation, Finance commitments, and continuity evidence. |
| BS11E | Release/termination, linked successor handling, surviving guarantees/Finance schedule, RolePromise breakage, free-agent transition, and historical evidence. |
| BS11F | Contracts / Planning hub, compact current/expiry/future/release/history projection, Player and Roster entry points, Club Strategy convergence, breakpoint routing, and final certification. |

## Canonical authorities

- **Contract truth:** `PlayerContract`.
- **Planning:** BS11B contract review decisions.
- **Retention negotiation and history:** BS11C retention engine and negotiation records.
- **Salary and cap legality:** `SalaryRules` and D0 binding compensation materialization.
- **Binding retention execution:** D1 `RetentionSigningService`, shared by user and AI accepted agreements.
- **Governance:** canonical Governance decision and appointed approval authority.
- **Finance:** Finance / `ContractFinancialSchedule` and financial commitments.
- **Release:** BS11E `ContractReleaseService`.
- **Expiry / successor activation:** `ContractLifecycle`.
- **Roster membership:** canonical team roster and contract integrity validation.
- **User visibility/actions:** Contracts / Planning projection and application/store actions; no UI-owned business rules.

## User and AI workflows

The player-facing workflow keeps intent, negotiation, accepted-in-principle terms, Governance approval, and signed future contract visibly separate. Users can review and set planning intent, initiate retention, respond to offers/counters, request the existing signing Governance workflow, inspect future successors and Finance exposure, and preview/execute supported releases. Player and roster views link to the hub. Club Strategy remains the strategic planning surface and routes detailed operations to the hub.

AI retention opens and responds through the same BS11C negotiation authority. An accepted AI agreement proceeds through the same D1 binding and Governance path; it does not bypass approval or persist private diagnostic math. Pending Governance leaves the agreement unsigned.

## Lifecycle and continuity

Focused coverage verifies expiring review and negotiation, Governance-required signing, successor visibility, unsupported-term blockers, supported release, preservation of canonical guarantees, and scheduled successor activation. Boundary tests check the day before expiry, expiry/activation date, and day after for both no-successor and valid-successor cases. Roster continuity is retained through successor activation; natural expiry without a successor transitions to free agency without a roster gap or duplicate expiry transaction.

History is reconstructed from contract predecessor links, termination data, transactions, retention execution, Governance evidence, and RolePromise. No UI event database was introduced.

## Remaining unsupported mechanics / P1 owners

These do **not** block BS11 closure. They must remain fail-closed or absent from production actions until their owner establishes approved rules:

- Capped release/dead money ? SalaryRules + Finance termination policy; product decision required.
- Atomic contract-chain trade movement ? TradeEngine/trade execution milestone.
- Option binding/exercise ? future contract binding-term and lifecycle owner.
- Incentive binding/evaluation/payment ? contract lifecycle + Finance, with approved MatchStatLog rules.
- Trade-consent binding/enforcement ? TradeEngine consent authority and Governance/product rules.
- Buyout and mutual termination ? product/economic rule decision, then Finance and termination lifecycle owners.
- Unknown imported-player service time ? canonical player import/service-time data owner, consumed by D0.
- Agent-fee payer variants ? negotiation binding terms + Finance commitment policy.
- RolePromise fulfillment/breach depth ? player-role lifecycle owner.
- Finance/cap edge cases ? Finance + SalaryRules.
- AI diagnostic visibility ? optional approved developer/debug surface; never private math in user-facing rival-club information.

The detailed disposition and evidence are in [BS11F Contract Hub Final Integration](./BS11F_CONTRACT_HUB_FINAL_INTEGRATION.md).

## P0 assessment

**No unresolved P0 blocks the approved BS11 core scope.** Unsupported advanced terms, unknown service-time inputs, capped release economics, and Finance/cap edge cases have explicit safe failures or are absent as actions. No duplicate authority or major missing system was discovered in BS11F.

## Certification evidence

- Focused regression set: **14 files, 110 tests passed**.
- Dedicated contract breakpoint route: **1 passed; 6 tests skipped by name filter**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**, with Vite's large-chunk advisory only.
- Full suite and long-horizon simulation: **not run**, as required by BS11F.

**Final status: BS11 PASS / CLOSED.**
