# BS17E-P · Facilities economic policy proposal

**Status:** `PROPOSED_POLICY — NOT APPROVED`
**Basis:** BS17E-0 readiness audit at the supplied E0 base `cfa13c4b3808f24949620e8343615540acb1a671`.
**Execution boundary:** documentary contract only. BS17E implementation remains `BLOCKED_BY_BS16_COMPLETE`.

This proposal resolves the shape of E-P01–E-P10 for an explicit product decision. It does not authorize code, assign institutional rights, price work, or alter Finance. The BS17E-0 audit and authority matrix remain the evidence for existing capabilities; this document does not repeat their inventory.

## Authority and evidence labels

- `EXISTING_CERTIFIED_AUTHORITY`: a committed, certified Finance, Governance, or Facilities contract.
- `APPROVED_POLICY`: a product rule expressly ratified by the product owner. No new E-P policy in this package has this status.
- `PROPOSED_POLICY`: recommendation requiring express approval.
- `MISSING_SOURCE`: a required amount, contract, right, or event is not present as an approved source fact.
- `BLOCKED_BY_BS16`: economic implementation cannot proceed until BS16 global completion and integration are certified.

BS17E-0 observed BS16L as PASS, BS16M as partial pending M-B2, and BS16N as approved but not implemented; therefore BS16 global was partial at that audit. Uncommitted Finance work is not certification evidence. Recheck the canonical certified state before any later implementation milestone.

## Proposed operation and accounting treatment (E-P01)

The existing Finance categories `FACILITY` (OPEX) and `FACILITY_DEVELOPMENT` (CAPEX) are accounting dimensions, not a policy that classifies every physical action. Classification follows the approved scope and source evidence, not the asset's level, name, price, or physical completion.

| Physical operation | Proposed treatment | Boundary / approval needed |
|---|---|---|
| Routine maintenance that preserves existing function | OPEX, `FACILITY` | Proposed mapping; amount and scope still need a legitimate source. |
| Repair restoring existing function | OPEX, `FACILITY` | Proposed default. A separately scoped capital improvement must be classified separately. |
| Replacement | Unclassified until scope is approved | Like-for-like replacement may be OPEX or CAPEX under the chosen accounting policy; no automatic rule is asserted. |
| Renovation/refurbishment | CAPEX candidate, `FACILITY_DEVELOPMENT` only when the approved scope is a capital project | Product approval required; “renovation” alone does not establish treatment. |
| Expansion, new construction, or new facility | CAPEX candidate, `FACILITY_DEVELOPMENT` | Requires an approved project and source-backed scope. No depreciation, useful-life, impairment, or tax rule is proposed. |
| Recurring service (for example, a contracted service) | OPEX only from an explicit economic source | Facility existence alone creates no recurring cost. |

Do not split or capitalize a mixed repair/replacement automatically. If a source contract contains multiple scopes, the product contract must define whether it supplies separate priced lines; otherwise the classification remains unresolved.

## Cost evidence (E-P02)

Proposed evidence order: an accepted contract/award or registered offer with explicit scope, amount, currency, supplier, validity dates, and source identity; or an approved world/economic source carrying equivalent facts. An estimate is usable only where an approved source explicitly identifies it as an estimate and supplies its currency, scope, source, and validity. A budget is a ceiling/authorization input, not a price quote.

Manager-entered amounts are not a default source. Product approval must explicitly decide whether a manager can submit a quote, who verifies it, and whether it is evidence for a proposal or a binding amount. Missing or expired evidence yields `UNKNOWN_COST`; it must not be replaced with a formula based on facility category, level, capacity, area, club tier, or a fabricated vendor price.

## Economic lifecycle proposal (E-P03, E-P05)

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
