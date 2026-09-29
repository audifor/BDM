# BS9E-A GM workflow orchestration audit

## Existing action and workflow authorities

- `BasketballOperationsAdvisory` creates date-keyed `DelegationOutcome` records. Signing and shortlist payloads may contain exact PlayerIds; contract recommendations include PlayerId and ContractId; trade recommendations contain a concrete pair. Its producer is an advisory lifecycle hook, not a broad plan router.
- `requestScouting` is the canonical assignment creation seam, but requires an exact PlayerId and evaluator StaffPersonId and mutates `scoutingAssignmentsById`. `progressDelegatedScouting` and `progressAdvisoryScoutingReports` may create assignments and `DelegationOutcome`s. They are not safe to call from a broad target-free plan.
- `MarketService.signFreeAgent` and `releasePlayer`, `TradeEngine.executeTrade`, and `MarketEngine.openNegotiation` are concrete mutation seams. Trade validation and transaction application remain their domain authorities.
- Recruiting, medical, player development, and training have their own lifecycle/advisory authorities. They do not provide a generic roster-intent executor. Calendar lifecycle processors must not be reused as a way to trigger every plan on every day.

## Advisory and delegation seams

- `StaffRecommendationService` is the explicit user decision boundary for applicable `DelegationOutcome`s. Canonical acceptance is currently limited to medical recommendations, recruiting recommendations, and trade recommendations. `contractRecommendation`, `recommendSignings`, and `shortlistPlayers` do not gain acceptance authority just because a broad GM plan names a related family.
- Basketball Operations contract advice is therefore a review destination only; it must not renew, extend, or submit an offer. An existing recommendation may contain target data, so BS9E-A will not invoke its producer.
- Scouting advice and delegated scouting can create concrete assignments. Routing to the Scouting subsystem is possible, but BS9E-A will not choose a target, evaluator, or mission and will not create an assignment.

## Finance and approval seams

- `recommendFinanceActions` is deterministic advice. `recordFinanceProposal` is a separate idempotent persistence seam, and `resolveFinanceProposal` requires a canonical Governance decision for approvals. These functions do not collectively define which proposal a broad financial-containment intent should create.
- Governance request records require a real issuer and recipient. Finance approval decisions reference a concrete proposal. `executionReadiness = REQUIRES_APPROVAL` alone supplies neither a concrete proposal nor a truthful actor/recipient, so BS9E-A must not create a request, proposal, or decision.
- `GovernanceOptionPolicy` in the current GMDecisionContext recomputes current mapped rights and pending requests. Its current option output is the source for orchestration readiness; selection-time readiness is historical only.

## Response-family destinations

- `WAIT_AND_MONITOR` has a truthful `NO_ACTION` route.
- `EXTERNAL_ACQUISITION` and `OUTGOING_MARKET_REVIEW` require future BS10 market intelligence. No target discovery or transaction is safe here.
- `SCOUTING_EXPANSION` can route to Scouting for review, but assignment creation waits for a later explicit action boundary with a target and evaluator.
- `CONTRACT_RETENTION_REVIEW` can route to the existing Basketball Operations contract-advisory/review system, with no invocation, acceptance, salary generation, or renewal in this milestone.
- `FINANCIAL_CONTAINMENT` can route to FinanceAI review. BS9E-A does not call FinanceAI, record a proposal, or start approval. If current readiness requires approval, the concrete approval path remains unresolved until a real proposal and responsible actors exist.
- `INTERNAL_ROLE_REALLOCATION`, `INTERNAL_DEVELOPMENT`, `SHORT_TERM_COVER`, and roster `SUCCESSION_PLANNING` do not have a distinct safe broad-plan workflow. Existing match tactics, automatic development/training, recruiting or organization succession are not equivalent authorities.

## Duplicate authority, idempotency, and gap

Calling an advisory producer from orchestration can create target-bearing outcomes; calling a market/scouting/Governance/finance mutation seam can create concrete work or actions. Creating a second pending workflow record would duplicate those owners. BS9E-A therefore persists no derived workflow decisions and dispatches no workflow. Its deterministic read-only output needs no workflow idempotency key and cannot duplicate assignments, proposals, requests, or advisories.

The gap is a current-context orchestration assessment over existing `GMPlanState`s. It must reuse BS9D-B's pure selection/invalidation boundary, re-read `GMDecisionContext` and current Governance/readiness, return a route/status/reasons/blockers per plan, and mark stale plans for review without routing them. AI and user plans share the same assessment; the user's result remains a recommendation. Actual dispatch, target resolution, workflow deduplication, and lifecycle triggers remain later explicit integration work.
