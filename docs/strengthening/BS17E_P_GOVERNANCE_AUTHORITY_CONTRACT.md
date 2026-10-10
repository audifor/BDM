# BS17E-P · Governance authority contract

**Status:** `APPROVED_PRINCIPLE` for three authority levels; `DETAIL_PENDING` for operation mapping, grants, and bootstrap. No authorization mechanism is implemented.
**Implementation:** blocked by BS16 global completion; no rights or commands are added here.

## Existing institutional boundary

At this base, Governance already models generic `FACILITIES` and `CAPITAL_EXPENDITURE` decision types, bodies, appointments, time-effective authority grants, rights (`PROPOSE`, `REVIEW`, `APPROVE`, `VETO`, `EXECUTE`), decision subjects, and events. The BS17E-0 statement that Facility spending permission is missing means there is no approved operation-to-type mapping, effective grant topology for Facility expenditure, or operational approval command/CFI7 gate. It does not mean generic decision types do not exist.

`BoardGovernanceCommands.ts` currently routes only supported player-contract/trade decisions; unsupported types remain read-only. The CFI7 certification explicitly excludes a spending approval flow. Therefore an existing decision type or a Facility ownership fact does not itself grant anyone spending authority. No universal manager permission, monetary threshold, new Board, or body hierarchy is assumed.

## Ratified Governance principle

Facilities decisions use three levels: **operational**, **institutional**, and **strategic**. Resolve every permission through explicit, effective, traceable grants. This does not assign grants. Do not infer grants from role, manager status, ownership, club category, or sport. The manager has no universal authority; no parallel Board is created.

`E-P04-GOV-BOOTSTRAP` is a pending sub-contract for simulated organization initialization. It must define source-backed institutions, bodies/appointments, grant provenance and effective dates, and absent/unknown-grant behavior. Until approval, assign no default grants and do not claim simulated organizations can execute these permissions.

## Authorization details pending

1. **Permission is institutional.** Resolve actor, body, decision type, subject, authority level, effective date, and rights from explicit effective grants. Missing, revoked, expired, or ambiguous grants block the action. Exact level/type mapping remains pending.
2. **Proposal is not approval.** A manager or Facilities lead may propose only if an effective `PROPOSE` right permits it. Proposal does not reserve money, contract work, or start a physical operation.
3. **Approval type follows approved classification.** Reuse `FACILITIES` and `CAPITAL_EXPENDITURE` subject to an approved operation/authority-level mapping. The E-P01 principle does not finalize this mapping.
4. **Finance remains separate.** Governance approval grants institutional permission only. Finance independently validates currency, account, category, fiscal period, authorization/headroom, reservation, commitment, payable, and settlement under its certified contract.
5. **Execution is gated.** A Facilities physical command that creates economically dependent work must require its linked approved decision and the Finance phase required by the approved lifecycle. A decision event by itself cannot create Finance facts or physical completion.
6. **AI uses identical authority.** BS17F must call the same commands and receives no implicit `APPROVE` or `EXECUTE` rights. Any AI grant requires explicit policy and an effective grant.

## Decision/event contract proposal

Reuse canonical decision events (`PROPOSED`, `REVIEW_STARTED`, `APPROVED`, `REJECTED`, `VETOED`, `EXECUTED`, `WITHDRAWN`) and existing rights. Store a stable link from the decision to the Facility operation/project. The current `GovernanceDecisionSource` only identifies a manager evaluation; the exact typed Facility source reference and command adapter require approval and design. For a new facility that does not yet have a Facility entity, current subject typing may require a `CAPITAL_EXPENDITURE` generic subject with a stable project reference; approve that mapping explicitly rather than inventing a facility ID.

Current transition rules allow `WITHDRAWN` from proposal/review states, not after `APPROVED`. The recommended cancellation contract is a new linked Facilities decision using the existing decision type/rights, preserving the original approved decision and adding a cancellation outcome. Finance then releases only what its own policy permits. If product wants an `APPROVED → WITHDRAWN` event instead, that is a distinct event-state policy and must be approved; it must not be silently encoded as withdrawal.

Rejection, veto, withdrawal, and execution must remain distinguishable. A rejected/vetoed proposal cannot start physical work or create a Finance commitment. An `EXECUTED` Governance event records the authorized institutional action; it is not proof of physical completion, expense recognition, or payment.

## Illustrative authority matrix — mapping not ratified

The approving body and individual actor are intentionally resolved per organization from real effective grants. This matrix proposes operation-to-type mapping only; it does not grant rights.

| Operation | Proposed decision type | Proposer | Approver / rights source | Approval and execution evidence | Cancellation |
|---|---|---|---|---|---|
| Routine maintenance | `FACILITIES` | Actor with `PROPOSE` grant | Effective `APPROVE` grant for the organization and subject | Canonical approved decision; separate Finance gate before any binding work | `WITHDRAWN` before approval; linked cancellation decision after approval |
| Repair restoring function | `FACILITIES` | Same rule | Same rule | Approved source-backed scope, then Finance gate | Same rule; preserve incurred facts |
| Replacement | Unresolved until E-P01 classification | Same rule | `FACILITIES` if approved OPEX mapping; `CAPITAL_EXPENDITURE` if approved CAPEX mapping | Never infer from asset replacement alone | Linked decision, plus Finance reconciliation |
| Renovation / refurbishment | `CAPITAL_EXPENDITURE` when explicitly classified CAPEX; otherwise unresolved | Same rule | Effective `APPROVE` grant for selected type | Approved project scope and independent Finance gate | Linked cancellation decision |
| Expansion / construction / new facility | `CAPITAL_EXPENDITURE` proposed | Same rule | Effective `APPROVE` grant; subject may need approved project reference before a Facility exists | Approved project source; no invented asset or amount | Linked cancellation decision |
| Recurring service | `FACILITIES` for institutional service permission; capital element separately classified | Same rule | Effective grants for applicable type(s) | Contract/source plus Finance-owned recurring source | Authorized termination; Finance closes future source while preserving accrued obligations |
| Withdraw/cancel | Existing operation's type, linked decision | Actor with applicable `PROPOSE` right | Approver with applicable `APPROVE` right; post-approval route is a product decision | Preserve original decision; distinguish uncommitted from binding facts | No automatic release, credit, or refund |

For every row, rejection/veto must persist the canonical decision and leave the physical state and Finance collections unchanged, except for explicitly authorized source/proposal facts. Missing, expired, or conflicting grants produce a specific blocked result. There are no monetary thresholds in this proposal.

## Approval needed

The three levels and explicit-grant principle are approved. Product owner must still define operation/type/level mapping; proposer eligibility; institutional body and grant source; review/veto stages; simulated-organization bootstrap; new-facility subjects; post-approval cancellation; and the point where Governance gates reservation, binding obligation, and physical start. Effective grant topology remains organization data, not a universal default.
