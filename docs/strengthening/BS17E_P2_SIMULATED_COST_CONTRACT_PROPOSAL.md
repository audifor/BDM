# BS17E-P2 · Simulated Facilities cost contract proposal

**Status:** `PROPOSED_NOT_APPROVED` · documentation only.
**Baseline:** BS17E-P V1 `9469478380f84a4e10432ba2d662a92204f987b6`.
**Execution:** `BLOCKED_BY_BS16_COMPLETE`. No offer generator, quote, price, schema, or Finance write is introduced.

## Approved principle and scope

V1 approved a hybrid cost model: use documented cost evidence; allow simulated offers only through a canonical approved economic model; return `UNKNOWN_COST` without adequate sources. V1 did not approve prices, parameter values, formulas, calibration, counterparties, or offer behavior. This subcontract proposes those decision boundaries for approval and is limited to estimates/offers for Facilities physical operations. It does not define recurring OPEX or general supplier procurement.

An offered/estimated amount is not an accepted contract, Finance commitment, expense recognition, payable, or payment. Keep these meanings distinct:

| Concept | Proposed meaning | Binding? |
|---|---|---|
| `REAL_DOCUMENTED` | Cost supplied by an authentic, attributable, scope-matched quote/contract/invoice or approved source record. | Only its underlying accepted contract can bind. |
| `SIMULATED_APPROVED` | Nonbinding offer produced by a versioned Finance-owned model and approved source parameters. | No. |
| `ESTIMATED_NON_BINDING` | Planning range or estimate from an explicitly approved estimation source that is not offer-grade. | No. |
| `UNKNOWN_COST` | No valid, scope-compatible source supports an amount or estimate. | No amount may be committed. |

These labels are conceptual classifications, not a request to add four enum values. Finance owns amount/currency and any canonical economic source. Facilities supplies the physical operation identity and accredited scope, and consumes the result; it must not price work.

## Focused source audit at the V1 base

| Existing source/model | What it can establish | What it does not establish for Facilities |
|---|---|---|
| `EconomicEnvironment.ts` | Dated, provenance-bearing `INFLATION_INDEX`, `COST_INDEX`, and `GROWTH_INDEX` observations; rational factors; explicit exchange-rate records; `FIXED`, externally supplied, or observation-linked indexation. | No base price, work units, materials/labor mapping, Facilities calibration, or shipped quote source. An index cannot create a missing base cost. |
| `CompetitionEconomicProfile` / `EconomicSourceProvisioning` | Deterministic, idempotent conversion of an approved competition profile into canonical Finance sources. | Scope is the approved competition source families (participation distribution and match operations), not repairs or construction. Do not copy their values or imply they calibrate Facility works. |
| `AcbDemoEconomicPolicy.ts` | Explicit demo competition amounts and timing approved for its own game-data purpose. | Not a Facilities price list, supplier market, or evidence of real-world contract amounts. |
| `OperatingCostEngine.ts`, Finance ledger and Treasury | Canonical money, source, cost recognition, due items, counterparties and settlement authorities. | Accounting infrastructure does not produce a Facility quote or approve a price. Generic `EXTERNAL` counterparty support is not a supplier catalogue. |
| `EconomicSourceAuthority.ts` / BS16K audit | Records that Facility capacity/usage are physical-only; maintenance actions carry no amount; World DB `facility_development_project.cost_amount` has no populated source; budget is authorization, not cost. | No shipped Facility work amount, timing authority, construction price, or recurrence source. |
| Facilities operation/scope models | Physical need/action/project and supported scope types; source identity and dates where modeled. | No monetary field and no authoritative quantity/area/labor/material decomposition. Physical condition/severity is not itself a price multiplier. |

Therefore, no production calibration source was found. `COST_INDEX` is a usable canonical observation type only when a valid observation with source, region/currency, effective date, and provenance exists; the audited repo does not provide a Facility-specific base amount or calibrated index series. Do not infer a local price from country, club tier, Facility level, capacity, prestige, quality, condition, dimensions, or sport.

## Recommended canonical model — proposal

If the product approves simulation, make the producing authority a Finance-owned, versioned economic source policy. Facilities may request an offer for an identified physical operation and pass only facts its canonical scope model can prove. The existing Finance economic environment may supply explicitly approved date/region/currency observations; it is an input, not a Facilities price formula. Avoid a parallel Facilities price table or a second accounting source.

An offer-grade model must have an approved, provenance-bearing base source matching operation kind and scope. It may transform that base only through approved factors whose evidence and applicability are explicit. Use integer minor-unit money and canonical organization currency resolution; no implicit FX. Use physical units only when the Facilities source supplies a defined compatible unit and quantity. A project scope label without measured quantities cannot support a per-unit calculation.

Recommended missing-input rule: if a required base amount, scope match, unit, currency, date-effective source, or approved calibration input is absent, incompatible, expired, or unverified, return `UNKNOWN_COST` with the missing reason. If the approved model permits a nonbinding range from weaker evidence, label it `ESTIMATED_NON_BINDING`; never promote it to an offer or binding amount. A valid cost index can adjust a sourced base only if a later approved rule names its type, region, currency, date selection and application; no index is applied by default.

### Variables and exclusions

| Candidate input | Proposal |
|---|---|
| Intervention type and accredited scope | Required; derive from the Facilities need/action/project, not a free text price category. |
| Quantity and physical unit | Required only for an approved rate-based source; otherwise source must price the full scope. Unknown quantity blocks rate use. |
| Market/region | Use only an explicit source-backed market key; do not infer from nationality or team competition. |
| Currency and date | Resolve from canonical Finance organization policy and explicit source validity/effective date. |
| Component condition or severity | May explain/identify the physical need; do not use as a cost multiplier unless a calibrated source explicitly supports the relation. |
| Labor, material, contractor, tax, transport | Use only as explicit source line items with provenance; none may be synthesized from an unsupported assumption. |
| Prestige, category, league, club status, quality, capacity, dimensions | Exclude absent an independently approved and calibrated evidence source. |

### Calibration options

1. **Source-direct offer (recommended starting boundary):** a dated, scope-matched source supplies an offer amount; no modeled transformation beyond currency/validity validation. It is the lowest-inference route but depends on actual offer data.
2. **Calibrated reference schedule:** a later approved source dataset supplies baseline rates by physical scope/unit/market/date, with methodology, provenance, calibration sample, coverage, and model version. Formula and values require a separate express policy decision.
3. **Estimate-only model:** explicitly approved weaker evidence returns a labeled nonbinding range; cannot be selected as a contract amount. This provides planning without pretending to quote a supplier.

Do not combine sources by averaging, select the cheapest by default, or extrapolate outside calibrated coverage unless that behavior is approved. A source with an incompatible scope or unit is not “close enough.”

## Determinism, identity, and persistence proposal

Proposed request identity is a caller-supplied stable idempotency key tied to the Facilities operation and request action. Issued offer identity should be stable from that request, model/policy version, and immutable source revision; retries of the same request return the same issued result. A distinct request is a new historical request, not an overwrite. Do not use unseeded RNG or regenerate an accepted/issued offer during load. Prefer deterministic calculation from a frozen input/source snapshot. If product later wants stochastic market variation, it requires a separate approved rule, injected deterministic RNG seed, and persisted draw evidence.

An issued result should retain or reference: offer/request ID; source operation ID and scope snapshot; provenance classification; model and policy version; parameter/source IDs and revisions; issue/expiry dates; amount/currency or explicit `UNKNOWN_COST`; any estimate range and nonbinding flag; issuer/counterparty identity only when a source-backed entity exists; and terminal event references. Persist the canonical source/result once or persist a stable Finance source reference; never duplicate amount as a Facility fact. Save/reload must preserve exactly the same issued offer, status, source/version, and expiry. Old saves missing these facts remain `UNKNOWN_COST`; do not generate a backfilled quote.

Calendar should not reprice or regenerate offers daily. A date change may cause an offer to expire only under its explicit approved expiry rule. Renewal requires a new request/result and does not rewrite accepted or expired history.

## Offer lifecycle and Finance boundary proposal

`REQUESTED → ISSUED → SELECTED_PENDING_GOVERNANCE_FINANCE → CONTRACTED` is the recommended conceptual route; `DECLINED`, `WITHDRAWN`, and `EXPIRED` are separate terminal outcomes. An estimate can be viewed/compared but not contracted. Issuance records a nonbinding offer. Selecting it records user intent only and creates no institutional approval, reservation, or Finance obligation. The binding contract/award event is created only after the still-pending E-P04 permission contract and E-P03/E-P05 Finance stage contract pass. Recognition and payment remain separate Finance authorities.

Do not invent a named vendor to satisfy a screen. Recommended V1 shape is a modeled, nonbinding offer with no named supplier unless a genuine source identifies one. If gameplay requires reusable synthetic vendor identities, define a separate approved counterparty-generation contract covering identity, market, capability, competition, and Finance validation before using `TreasuryCounterparty`; do not overload this cost model with a fictional supplier registry.

## Decisions still requiring ratification

- Whether modeled offers require direct source amounts only, or an approved calibrated reference schedule may generate amounts.
- Accepted source types, data stewardship, provenance, scope/unit matching, source precedence, and validity.
- Whether nonbinding estimates may be shown, and their range/confidence semantics.
- Calibration evidence, coverage, applicability, review cadence, approval owner, and model/policy version lifecycle.
- Whether simulated offers may have a generic anonymous issuer or require a separate synthetic-counterparty contract.
- Offer comparison/default selection, expiration period source, renewal, withdrawal, and price-change behavior.
- Persisted offer representation and Save migration/reference validation; Finance-owned source vs read-only derived view.
- Any stochastic variation; the recommendation is none unless separately approved.

## Future causal tests (not run in this documentary phase)

- Identical operation and frozen source/version produce identical request result and stable ID across retry and reload.
- Change only source scope, date validity, market, or an approved index observation and verify only an authorized input changes the offer; absent/incompatible data returns reasoned `UNKNOWN_COST`.
- A documented price, simulated offer, and estimate remain visibly distinct; estimate and offer selection create no payable, commitment, recognition, or payment.
- Expired/withdrawn offer cannot be contracted; a renewed request creates a new linked record without rewriting history.
- Currency mismatch/unknown currency blocks without FX; budget amount never substitutes for source price.
- No Facilities/local table, World DB physical quantity, or existing competition demo value is misused as an unapproved Facility rate.
- Save/reload preserves issued/accepted history exactly; Calendar replay does not reissue or reprice.
