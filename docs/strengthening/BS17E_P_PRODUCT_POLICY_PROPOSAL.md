# BS17E-P · Facilities economic policy proposal

**Status:** E-P01, E-P02, and E-P04 contain `APPROVED_PRINCIPLE` decisions recorded in [the V1 ratification](BS17E_P_V1_APPROVED_POLICY.md). Their detailed contracts remain `DETAIL_PENDING`. E-P03 and E-P05–E-P10 remain `PROPOSED_NOT_APPROVED`.
**Basis:** BS17E-0 readiness audit at the supplied E0 base `cfa13c4b3808f24949620e8343615540acb1a671`.
**Execution boundary:** documentary contract only. BS17E implementation remains `BLOCKED_BY_BS16_COMPLETE`.

This proposal records only the approved principles and preserves unresolved detail as pending. It does not authorize code, assign institutional rights, generate prices, or alter Finance. The BS17E-0 audit and authority matrix remain the evidence for existing capabilities; this document does not repeat their inventory.

## Authority and evidence labels

- `EXISTING_CERTIFIED_AUTHORITY`: a committed, certified Finance, Governance, or Facilities contract.
- `APPROVED_PRINCIPLE`: a product decision expressly ratified by the product owner, while implementation details can remain pending.
- `DETAIL_PENDING`: an approved principle does not settle its operational source, values, or transitions.
- `PROPOSED_NOT_APPROVED`: recommendation requiring express approval.
- `PROPOSED_POLICY`: recommendation requiring express approval.
- `MISSING_SOURCE`: a required amount, contract, right, or event is not present as an approved source fact.
- `BLOCKED_BY_BS16`: economic implementation cannot proceed until BS16 global completion and integration are certified.

BS17E-0 observed BS16L as PASS, BS16M as partial pending M-B2, and BS16N as approved but not implemented; therefore BS16 global was partial at that audit. Uncommitted Finance work is not certification evidence. Recheck the canonical certified state before any later implementation milestone.

## E-P01 · Classification by nature and evidenced scope

**Status:** `APPROVED_PRINCIPLE` · `DETAIL_PENDING`.

Classify an operation by its nature and accredited scope. Maintenance and restorative repair are OPEX candidates. Structural improvements, expansion, and construction are CAPEX candidates. Replacement and mixed work depend on evidenced scope and a legitimate breakdown. No additional accounting treatment is approved. Exact Finance category mapping and accepted breakdown evidence remain pending.

The existing Finance categories `FACILITY` (OPEX) and `FACILITY_DEVELOPMENT` (CAPEX) are accounting dimensions, not a policy that classifies every physical action. Classification follows the approved scope and source evidence, not the asset's level, name, price, or physical completion.

| Physical operation | Ratified principle | Remaining detail |
|---|---|---|
| Routine maintenance | OPEX candidate | Exact Finance category and cost evidence. |
| Restorative repair | OPEX candidate | Exact mapping and any separately scoped improvement. |
| Replacement | Depends on evidenced nature and scope | Legitimate breakdown for mixed work; no automatic classification. |
| Structural improvement | CAPEX candidate | Approved project scope and exact category mapping. |
| Expansion / construction | CAPEX candidate | Approved project scope and exact category mapping. |
| Recurring service | Not decided by E-P01 | E-P07 remains proposed; no charge from facility existence. |

Do not split or capitalize mixed work automatically. E-P01 approves the scope-based principle; accepted evidence format for a breakdown remains `DETAIL_PENDING`.

## E-P02 · Hybrid cost evidence

**Status:** `APPROVED_PRINCIPLE` · `DETAIL_PENDING`.

The approved model is hybrid: use documented costs; allow simulated offers only through a canonical, approved economic model; return `UNKNOWN_COST` when adequate sources are absent. This ratification generates no prices or offers. The model's sources, reference values, calibration, versions, offer creation, acceptance, and validity rules are deferred to `E-P02-SIM`.

Until E-P02-SIM is approved and implemented, simulated offers are not LIVE. A budget remains an authorization ceiling, not a price.

### E-P02-SIM · Pending sub-contract

Define approved offer sources, reference values and provenance, calibration, model versions, offer identity/generation, acceptance/expiry, and validity dates. Specify how documented costs and simulated offers coexist and when missing inputs yield `UNKNOWN_COST`. This sub-contract approves no values, formulas, or generation mechanism.

## Documented cost evidence

Documented evidence may include an accepted contract/award or registered offer with explicit scope, amount, currency, supplier, validity dates, and source identity; or an approved world/economic source carrying equivalent facts. The accepted evidence set remains part of E-P02-SIM. An estimate is usable only if its approved source contract permits it. A budget is a ceiling/authorization input, not a price quote.

Manager-entered amounts are not automatically accepted. E-P02-SIM must define whether a manager can attach a documented quote and how it is verified. Missing, expired, or inadequate evidence yields `UNKNOWN_COST`; do not substitute an unsupported formula or fabricated vendor price.

## Economic lifecycle proposal (E-P03, E-P05)

**Status:** `PROPOSED_NOT_APPROVED`; economic execution is also `BLOCKED_BY_BS16_COMPLETE`.

Recommended conceptual lifecycle:

`physical need → sourced proposal → institutional permission → Finance authorization and reservation → binding contract/award → Finance commitment → physical work/progress → contract-defined recognition → payable → Treasury settlement → ledger`

This is a proposed default ordering, not a universal legal rule. Product approval must select the point at which a reservation is requested and the source event that creates a binding commitment. A proposal alone creates neither. Governance permission does not create Finance authorization, liquidity, a reservation, or an obligation. A reservation is not an obligation; commitment is not recognition or payment; physical completion is not settlement. Finance owns every financial fact and the single Finance temporal processor. Facilities owns physical state and source identity.

Recognition must follow an approved contract, invoice, or verified milestone source. Do not infer recognition from project start or completion. Payable and settlement must be separate, Finance-owned events; CFI7's current partial links do not establish a Facility payable/Treasury path.

## Insufficient funding (E-P08)

Keep these outcomes distinct: (1) institutional/budget authorization absent, (2) reservation/headroom unavailable, and (3) actual cash/liquidity unavailable. Proposed behavior is to retain the physical need and show the exact Finance blocker; do not authorize a new binding commitment or economically dependent physical start before the policy-defined gate. A validly incurred legal obligation remains recorded and due even if later work pauses. Allow retry only after explicit source/authorization/funding facts change. Never create a loan, grant, negative cash, or automatic alternative funding.

## Recurrence (E-P07)

Only an explicit service agreement or equivalent approved source may activate recurring OPEX. It must identify the organization, source/contract, supplier when applicable, amount or approved amount source, currency, category, effective dates, recurrence rule, fiscal period treatment, and renewal/cancellation authority. Finance owns the source and Calendar execution. No periodic charge is generated merely because a Facility exists, is open, or has a particular type.

## Currency and fiscal period (E-P09)

Use the currency resolved by canonical Finance organization/profile/economy authority (including `resolveOrganizationCurrency` where applicable), with a valid account, category, period, and supported minor-unit amount. Do not infer currency from country, convert FX implicitly, or derive a fiscal period from sports season. Missing or unsupported facts block the economic command with a specific reason. Renewal behavior follows certified Finance policy, not this proposal.

## Cancellations (E-P06)

Withdrawal before approval creates no financial fact. If approval exists but no binding obligation does, cancellation must use the approved institutional route and Finance may release only an unused reservation under its own rules. After a commitment, work, recognition, payable, or settlement exists, cancellation preserves each valid fact; it may reduce only an unincurred portion where Finance and the underlying contract permit. Refunds/credits require a real source and canonical Finance event. No penalty percentage, refund, or release is invented. Physical cancellation and financial cancellation are separate, linked actions.

## Traceability and idempotency (E-P10)

Facilities may hold stable references to source operation/need/project, Facility, organization, Governance decision, and Finance reservation, commitment, recognition, payable, and settlement identifiers. Finance collections remain canonical; no amount, balance, ledger, payable, or settlement is duplicated in Facilities. Replayed commands must resolve to the same operation and must not duplicate a Governance event or Finance phase. Save V4 must validate references and preserve older saves without synthesizing historical contracts, prices, grants, or equipment.

## Manager gameplay contract

After these policies and permissions are approved and implemented, the manager can inspect a physical need, compare only source-backed priced options, submit a proposal, see the institutional and Finance decision separately, understand unknown cost/headroom/cash blockers, follow physical progress, and inspect the linked obligation and actual settlement. The manager cannot bypass Governance or Finance. BS17F AI must use these same commands and gates. This package does not make any of those flows LIVE.

## Sources

- [BS17E-0 readiness](BS17E_0_FINANCIAL_INTEGRATION_READINESS.md) and [authority matrix](BS17E_0_AUTHORITY_MATRIX.md).
- [Facilities roadmap](BS17_FACILITIES_STRENGTHENING_ROADMAP.md), [BS17D global closure](BS17D_GLOBAL_CLOSURE_CERTIFICATION.md), and [CFI7 certification](../autopilot/CFI7_FINANCE_INTEGRATION_CERTIFICATION.md).
- [BS16 Finance system-truth audit](BS16A_FINANCE_SYSTEM_TRUTH_AUDIT.md) as cited by E0; only committed certified content is authoritative.
- Governance contracts: `src/domain/governance/Governance.ts`, `GovernanceDecision.ts`, and `src/app/governance/BoardGovernanceCommands.ts` at the base.
