# BS17E-P2 · Simulated Facilities cost contract proposal

**Status:** SIM-01–SIM-05 principles are `APPROVED_PRINCIPLE`; calibration, values, formulas, counterparties and lifecycle detail are `DETAIL_PENDING`. Documentation only.
**Baseline:** BS17E-P V1 `9469478380f84a4e10432ba2d662a92204f987b6`.
**Execution:** `BLOCKED_BY_BS16_COMPLETE`. No offer generator, quote, price, schema, or Finance write is introduced.

## Ratified principles and limits

The product owner ratified SIM-01–SIM-05 in [BS17E-P2 V1](BS17E_P2_V1_APPROVED_POLICY.md): (1) hybrid documented/simulated/unknown source model; (2) a canonical versioned Facility reference-cost catalog may exist; (3) issued offers are immutable and retain the specified identity, operation/scope, provenance, model/source evidence, date/validity, sourced amount/currency, and history; (4) estimate, offer, selection, contract, commitment, recognition, and settlement remain distinct; and (5) synthetic counterparties may exist as explicitly simulated canonical entities.

The ratification approves none of the numerical values, formulas, multipliers, regional coefficients, physical/economic units, calibration methods, supplier generation/distribution/specialty/territory/capacity/selection, offer expiry durations, or Finance/Governance transitions. These remain `DETAIL_PENDING`. This contract remains a proposal for those details and is limited to Facilities operations; it does not define recurring OPEX or general procurement.

An offered/estimated amount is not an accepted contract, Finance commitment, expense recognition, payable, or payment. Keep these meanings distinct:

| Concept | Ratified boundary / proposed meaning | Binding? |
|---|---|---|
| `REAL_DOCUMENTED` | Cost supplied by an authentic, attributable, scope-matched quote/contract/invoice or approved source record. | Only its underlying accepted contract can bind. |
| `SIMULATED_APPROVED` | Nonbinding offer from a versioned canonical model/catalog and approved source parameters. | No. |
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

## Canonical catalog — approved architecture principle; details pending

The approved architecture permits a canonical versioned catalog of Facility reference costs, distinguishing operation nature/scope, source, and version. It is not a populated price list and confers no authority to generate a numeric amount. Catalog ownership interface, source governance, schema, calibration and data release process remain pending. Finance remains the authority for money and economic source facts; Facilities must not become a parallel price authority.

## Recommended canonical model — proposal

If detailed policy approves simulation, use a Finance-canonical, versioned economic source policy/catalog. Facilities may request an offer for an identified physical operation and pass only facts its canonical scope model can prove. The existing Finance economic environment may supply explicitly approved date/region/currency observations; it is an input, not a Facilities price formula. Avoid a parallel Facilities price table or second accounting source.

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

## SIM-03 · Immutable offer contract

**Status:** `APPROVED_PRINCIPLE`; field representation and lifecycle details `DETAIL_PENDING`.

An issued offer is immutable across calendar advancement and Save/reload. It must retain stable identity, operation/scope, provenance, model version, parameter/source evidence, issue date, explicit validity, sourced amount/currency when available, and persistent history. The offer may not state an unsupported amount. No expiry duration is set by this decision; validity must come from a future approved source or rule. If no valid expiry can be established, the offer cannot be treated as currently selectable/contractible until a policy decides the behavior.

## Determinism, identity, and persistence proposal

Proposed request identity is a caller-supplied stable idempotency key tied to the Facilities operation and request action. Issued offer identity should be stable from that request, model/policy version, and immutable source revision; retries of the same request return the same issued result. A distinct request is a new historical request, not an overwrite. Do not use unseeded RNG or regenerate an accepted/issued offer during load. Prefer deterministic calculation from a frozen input/source snapshot. If product later wants stochastic market variation, it requires a separate approved rule, injected deterministic RNG seed, and persisted draw evidence.

An issued result should retain or reference: offer/request ID; source operation ID and scope snapshot; provenance classification; model and policy version; parameter/source IDs and revisions; issue/expiry dates; amount/currency or explicit `UNKNOWN_COST`; any estimate range and nonbinding flag; issuer/counterparty identity only when a source-backed entity exists; and terminal event references. Persist the canonical source/result once or persist a stable Finance source reference; never duplicate amount as a Facility fact. Save/reload must preserve exactly the same issued offer, status, source/version, and expiry. Old saves missing these facts remain `UNKNOWN_COST`; do not generate a backfilled quote.

Calendar must not reprice or regenerate offers daily. A date change does not alter an issued offer; an offer's current validity is evaluated against its explicit validity fields. Any renewal/reissue process is pending detail and must create new linked history without rewriting an issued offer.

## SIM-04 · Contractual separation

**Status:** `APPROVED_PRINCIPLE`; exact commands and transitions `DETAIL_PENDING` and dependent on E-P03/E-P05.

Keep estimates, issued offers, selection, contractual acceptance, Finance commitment, recognition, and settlement as separate facts. Estimates are nonbinding; selecting an offer alone creates no obligation. Contractual acceptance requires applicable Governance and Finance authorization. This principle does not define who can issue or accept an offer, when a reservation is made, or when an obligation legally arises.

## Offer lifecycle and Finance boundary proposal

`REQUESTED → ISSUED → SELECTED_PENDING_GOVERNANCE_FINANCE → CONTRACTED` is the recommended conceptual route; `DECLINED`, `WITHDRAWN`, and `EXPIRED` are separate terminal outcomes. An estimate can be viewed/compared but not contracted. Issuance records a nonbinding offer. Selecting it records user intent only and creates no institutional approval, reservation, or Finance obligation. The binding contract/award event is created only after the still-pending E-P04 permission contract and E-P03/E-P05 Finance stage contract pass. Recognition and payment remain separate Finance authorities.

Do not invent a named vendor to satisfy a screen. SIM-05 approves the possibility of canonical synthetic counterparties that are visibly simulated, but does not create any. Recommended initial display can remain an anonymous modeled offer until a separate counterparty-generation policy defines identity, source/provenance, distribution/count, specialty, market/territory, capacity, offer selection, continuity/disappearance, and Finance references. Do not overload this catalog with an unapproved supplier registry or present synthetic entities as documented real companies.

## Details still requiring ratification

- Whether modeled offers require direct source amounts only, or an approved calibrated reference schedule may generate amounts.
- Accepted source types, data stewardship, provenance, scope/unit matching, source precedence, and validity.
- Whether nonbinding estimates may be shown, and their range/confidence semantics.
- Calibration evidence, coverage, applicability, review cadence, approval owner, and model/policy version lifecycle.
- Whether offers remain anonymous or use a separately specified synthetic-counterparty contract; SIM-05 approves only the possibility, not the choice or model.
- Offer comparison/default selection, expiration period source, renewal, withdrawal, and price-change behavior.
- Persisted offer representation and Save migration/reference validation; Finance-owned source vs read-only derived view.
- Any stochastic variation; none is approved.

## Future causal tests (not run in this documentary phase)

- Identical operation and frozen source/version produce identical request result and stable ID across retry and reload.
- Change only source scope, date validity, market, or an approved index observation and verify only an authorized input changes the offer; absent/incompatible data returns reasoned `UNKNOWN_COST`.
- A documented price, simulated offer, and estimate remain visibly distinct; estimate and offer selection create no payable, commitment, recognition, or payment.
- Expired/withdrawn offer cannot be contracted; a renewed request creates a new linked record without rewriting history.
- Currency mismatch/unknown currency blocks without FX; budget amount never substitutes for source price.
- No Facilities/local table, World DB physical quantity, or existing competition demo value is misused as an unapproved Facility rate.
- Save/reload preserves issued/accepted history exactly; Calendar replay does not reissue or reprice.
