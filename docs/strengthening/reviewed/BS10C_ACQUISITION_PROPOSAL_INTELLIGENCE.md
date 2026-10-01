# BS10C · Acquisition Proposal Intelligence

**Status:** Implemented for review
**Scope:** Read-only, derived proposal intelligence from the current GM plan, need, BS10A candidate set, and BS10B feasibility assessment.

## 1. Outcome

BDM can name the exact candidate it currently prefers, explain the supported acquisition route and evidence, and expose missing information and alternatives. The result is an advisory planning object. It does not contact a player or club, make an offer, open a negotiation, create a transaction, or persist a second proposal authority.

The pipeline is:

`current GM plan + club need → BS10A candidates → BS10B feasibility → preferred proposal intelligence`

The selector consumes the ordered BS10B assessment. It does not rediscover candidates or recalculate fit, economics, or hidden ratings. BS10B already supplies the necessary stable candidate ordering, so BS10C takes the first proposal-eligible candidate rather than adding another score.

## 2. Authority audit and boundaries

The audit is recorded in [BS10C_ACQUISITION_PROPOSAL_INTELLIGENCE_AUDIT.md](./BS10C_ACQUISITION_PROPOSAL_INTELLIGENCE_AUDIT.md). Existing basketball-operations recommendations can produce `DelegationOutcome` values; they are not a derived BS10A/BS10B proposal view. `MarketEngine.openNegotiation` creates persisted negotiation state, while free-agent signing and trade execution have separate mutating services. `TradeEngine.validateTrade` requires a concrete `TradeProposal`.

Existing recommendation/signing logic may derive salary and contract years from player truth; BS10C must not reuse it to fill unknown club knowledge. Existing trade recommendation logic constructs outgoing assets and uses synthetic valuation priors; it is not a defensible neutral fairness authority. Organization valuation does not establish perceived trade value. No canonical player-transfer fee or execution model was found.

No general incoming acquisition proposal persistence or idempotency authority exists. Governance decision mappings do not resolve transaction-specific signing/trade approval. The routed market workflow names `BS10_MARKET_INTELLIGENCE` as the responsible system, but the responsible execution role and transaction authority remain unknown.

## 3. Candidate selection and proposal model

`AcquisitionProposalIntelligence` is derived and contains a stable ID, team/plan/need context, proposal type/readiness, the exact preferred BS10B candidate and rank, route, current plan execution readiness, governance readiness, responsible system/role, known salary/term/player-interest/seller-willingness evidence, affordability, package/value status, missing information, blockers, reasons, alternatives, and an explicit no-proposal reason where applicable.

Only candidates with supported `FREE_AGENT_SIGNING` or `TRADE` routes and no BS10B hard blockers can become actionable proposal types. Unknown information does not by itself disqualify a candidate. A candidate with an unknown route is retained in an explicit no-action result when it has no hard blocker. A candidate with a known affordability blocker is skipped; when all candidates are blocked only by the known salary budget limit, readiness is `FINANCIAL_BLOCK` and the candidate-specific blockers remain visible. Unsupported cross-ecosystem transfers yield `NO_ACTIONABLE_PROPOSAL` with `NO_CANONICAL_TRANSFER_MODEL`.

The selector uses the source assessment order and stable PlayerId tie-breaking already established upstream. It exposes at most two alternatives after the preferred candidate. Repeated calls on unchanged input produce the same ID, candidate and output. IDs are deterministic derived values, not stored proposal IDs.

## 4. Free-agent approach

A supported free-agent candidate can produce `FREE_AGENT_APPROACH`. BS10C carries the exact known expected salary and player-interest signal from the acting organization’s `MarketKnowledge`, plus known expected years as a term signal. Every signal retains its source, confidence and assessment date. If no signal exists, it remains missing/unknown. Affordability is carried from BS10B.

Expected years are knowledge only. `proposedContractTerm` remains `NOT_SELECTED`; BS10C does not choose an offer term. A result can identify a player while remaining `MORE_INFORMATION_REQUIRED` or `AUTHORITY_REVIEW_REQUIRED`. It never calls `getFreeAgentMarketTerms`, regenerates compensation from ratings, opens negotiations, or writes a contract.

## 5. Trade enquiry and transfers

A supported contracted-player route yields `TRADE_ENQUIRY`. The exact target and seller-willingness signal (if known) are carried through. The package is `NOT_CONSTRUCTED`; perceived value is `UNKNOWN`; package legality remains `NOT_ASSESSED`. BS10C does not select outgoing assets, invent asset equivalence, call `TradeEngine.validateTrade` with placeholder assets, create a `TradeProposal`, or execute a trade.

Transfer routes remain unsupported and return a reasoned no-action result. No transfer fee, proposal, or transaction model is added.

## 6. Knowledge, finance and governance

Selection and displayed proposal details remain bounded to BS10A/BS10B evidence and organization-scoped `MarketKnowledge`. Hidden external player ratings, potential, personality, `MarketReality`, and hidden seller reservation prices do not affect the derived proposal. Legitimate club-known signal changes can change the proposal evidence or readiness.

BS10C carries BS10B affordability and separately identified Finance V2 context; it does not create a Finance proposal or treat general financial context as transaction approval. Governance readiness is `AUTHORITY_UNKNOWN` because no canonical transaction-specific approval mapping was established. Planning execution readiness is shown separately and is not treated as signing/trade authority. The workflow responsible system is preserved; responsible role is `UNKNOWN`.

## 7. Persistence, user and AI behavior

Proposal results are recomputed from the current world and are not persisted. No parallel proposal database, proposal memory, negotiation, contract, transaction, trade history, Governance request, or Finance application is created. This also avoids duplicate proposal state and makes unchanged inputs deterministic without persistence-based inertia.

The user club receives the same advisory intelligence and no autonomous mutation. AI clubs may derive a preferred candidate for a current external-acquisition plan, but the proposal causes zero action. Plan, candidate, proposal intelligence, negotiation and transaction remain separate states.

## 8. Analysis UI

The Analysis screen presents a preferred acquisition proposal for the current routed plan, or a recommended advisory approach for the user club. It displays the target, need fit, route, readiness, authority status, known expected salary, affordability, known term signal without selecting a term, player/seller interest, missing information, blockers and up to two alternatives. Trade enquiries visibly state that the package is not constructed and value is unknown. No offer, negotiate, sign, trade, transfer or submit controls are provided.

## 9. BS10D handoff

BS10D should define the authorized action path from this intelligence. For a free agent, that likely means invoking the canonical negotiation seam only after role, approval, term and offer boundaries are resolved. For a trade, it must first establish trustworthy package/value intelligence and approval authority before creating a canonical `TradeProposal`. A no-action result can route to wait, scout or plan reconsideration. BS10D must consume this output rather than repeat candidate discovery or feasibility.

Outgoing-market intelligence remains deferred. Existing own-player recommendation and surplus logic should not be duplicated as part of incoming proposal intelligence.

## 10. Review findings

### P0

- No P0 defect found in the audited authority boundaries or implementation scope. Proposal derivation is read-only and keeps unknown salary, term, trade value, package legality and execution authority explicit.

### P1

- Transaction-specific Governance approval and responsible execution role are unresolved; keep proposal readiness advisory until BS10D maps the canonical authority.
- Trade package construction and organization-relative perceived value have no safe authority; keep trade output at enquiry level until a dedicated source of truth is established.
- Cross-ecosystem transfer economics and execution are absent; retain the unsupported no-action outcome.
- The derived proposal ID is suitable for a stable view only. A future persisted action needs canonical idempotency and lifecycle semantics.

## 11. Validation boundary

Use focused BS10C tests, directly affected BS10A/BS10B and UI tests, typecheck, and build because Analysis UI changed. Do not run the full test suite or long-horizon simulation for this milestone.
