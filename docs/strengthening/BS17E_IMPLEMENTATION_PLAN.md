# BS17E · Minimum implementation plan after policy approval

**Status:** plan remains proposed; only E-P01/E-P02/E-P04 principles are ratified. No implementation is authorized by this plan.
**Current gate:** `BS17E EXECUTION: BLOCKED_BY_BS16_COMPLETE`.

This is the smallest reasonable sequence that delivers end-to-end economic gameplay without repeating Finance. Each phase is a functional vertical slice; do not ship a cosmetic screen or an isolated schema as a milestone. E-P01, E-P02, and E-P04 principles are approved, but their detailed contracts (including E-P02-SIM and E-P04-GOV-BOOTSTRAP) and E-P03/E-P05–E-P10 remain unresolved. Do not begin implementation until required details and organization grants are approved.

## Preconditions for any implementation

- BS16 global has a committed PASS and its canonical integration base is explicitly selected.
- Product owner has resolved E-P01 category/breakdown details, approved E-P02-SIM and E-P04-GOV-BOOTSTRAP, ratified/replaced E-P03 and E-P05–E-P10, and approved the Governance operation/level mapping.
- Real source-backed cost/contract evidence exists for the operation being certified; unsupported worlds remain unknown.
- Finance confirms the adapter contract for reservation, commitment, recognition, payable, settlement, currency, period, recurrence, and cancellation.
- One isolated milestone branch/worktree is created from the approved base; no Finance or main worktree is modified incidentally.

## E-A · Authorized maintenance and repair

Deliver one full manager-to-Finance vertical slice for routine maintenance and repair: discover need → submit sourced proposal → resolve effective Governance rights → obtain permission → apply Finance authorization/reservation → create obligation at the approved binding event → execute physical work through Facilities → record Finance recognition/payable/settlement through Finance commands → inspect traceable status in existing manager workspaces.

**Gameplay:** the manager sees a real need, a sourced cost or unknown-cost explanation, the actual institutional decision, funding blockers, physical progress, and separately recorded amount owed and amount paid. Rejection or missing funding prevents the policy-gated action; it never fabricates repair completion.

**Focused proof:** allowed and denied proposer/approver; expired/revoked grant; rejection/veto; missing price/currency/account/category/period; authorization versus cash shortage; reservation failure/retry/release once; idempotent commitment; action failure atomicity; physical completion versus recognition/payable/settlement; cancel before/after commitment; Save/reload; existing CFI7 regression; no duplicate ledger entries; no Finance or Governance bypass.

**PASS:** one approved OPEX operation reaches a reconciled canonical Finance ledger and persisted physical result through production commands; each lifecycle phase is attributable and idempotent; physical, recognized, payable, and settled states remain distinct; denial/failure leaves valid prior facts intact. If no legitimate cost source exists, report the supported scope as blocked/unknown rather than fabricating one.

**Risk/blocker:** CFI7 maintenance expenditure is post-completion at the audited baseline. A pre-work reservation/commitment adapter is required. Never work around it with direct collection writes.

## E-B · Capital projects, replacement classification, and cancellation

Extend the same boundaries for explicitly approved capital projects: source-backed project scope/offer → `CAPITAL_EXPENDITURE` permission → Finance authorization/reservation/commitment → Facilities project progress → approved recognition milestones → payable and one or more Treasury settlements. Include replacement only under the ratified E-P01 classification. Preserve physical project state independently of economic payment.

**Gameplay:** manager proposes only evidenced projects, sees the authorized scope and funding state, tracks paused/incomplete work and actual Finance obligations, and can request cancellation through the approved institutional route.

**Focused proof:** new-project subject identity before Facility existence; CAPEX permission and missing grant; multi-stage/partial obligation and settlement; pause/resume; cancellation before and after binding commitment; preserve incurred costs/payables/settlements; valid release/credit source; idempotent save/reload; no project completion from payment; no payment from physical completion.

**PASS:** a source-backed CAPEX project is traceable from approved decision to physical history and canonical Finance ledger/settlement; cancellation retains incurred facts and changes only authorized unincurred amounts; no depreciation or valuation is introduced without a separate approved Finance contract.

**Risk/blocker:** Finance may need a narrowly scoped typed provenance adapter, but remains sole owner of financial collections and rules.

## E-C · Explicit recurring services and lifecycle closure

Only if an approved service contract/source exists, connect its recurring OPEX source to Finance and the single Calendar processor. Complete the manager view and cross-system closure for supported maintenance, repair, capital project, cancellation, and recurring-source operations. Unsupported operation classes stay explicitly unsupported.

**Gameplay:** manager can inspect service period, next due item, source and termination authority; Finance reports generated obligations/payables/settlements. Calendar replay cannot duplicate a charge. Facilities never creates its own scheduler.

**Focused proof:** contract active/expired/cancelled; supported recurrence and boundary dates; exactly-once across replay and Save/reload; renewal authority; currency/category/period validation; partial settlement; source provenance; no charge without source; Finance and Governance rights remain canonical; E-A/E-B causal suites plus established convergence/Facilities regression gates justified by changed code.

**PASS:** each advertised operation has a production command and reachable manager workflow; all money is Finance-owned and reconciled once; each physical/economic phase is auditable and Save-safe; known unknowns remain visible; typecheck/build/diff and required focused regressions pass. Do not declare BS17E complete if any in-scope lifecycle or decision remains unresolved.

**Risk/blocker:** no recurring source means no recurring-cost LIVE claim. BS17F AI is deferred and must use exactly the same commands and gates after BS17E closure.

## Authority and certification discipline

Facilities owns physical need, work, condition, and progress. Governance owns institutional permission. Finance owns currency, budget authorization, reservation, commitment, recognition, payable, settlement, Calendar processing, and ledger. Save stores canonical facts and validated references. UI explains and invokes these authorities; it does not decide policy. BS17F AI receives no special authority.

At each phase, certify only the demonstrated operation and data scope. Do not claim universal production cost coverage from enriched fixtures. No new Finance rules, Board, spend thresholds, pricing formulas, debt, depreciation, FX, or recurring charges may be introduced without their own explicit approval and canonical authority.
