# BS9E-A · GM workflow orchestration

## Audit and orchestration authority

The workflow/action audit is in `BS9E_A_GM_WORKFLOW_ORCHESTRATION_AUDIT.md`. BDM has concrete action authorities for signing, release, trade, negotiation, scouting assignment, Finance proposal, Governance request/decision, and domain-specific recruiting/development. Advisory and transaction records carry their own domain meaning and cannot be reused as a broad workflow record.

`reviewGMPlanWorkflows` is the explicit Application review entry point. It uses BS9D-B's existing `reviewGMPlans` for AI plan retention, invalidation, reselection, and persistence; user-club preferences remain recommendations. It then rebuilds the current `GMDecisionContext` and returns derived `GMWorkflowDecision`s. The pure `assessGMPlanWorkflow(s)` engine reuses BS9D-B's selector to check current validity. No derived workflow decision is persisted.

## Revalidation and decision contents

Each decision reports team, need, plan, response family, current validity and planning eligibility, current execution readiness, current Governance status, route, status, responsible system, review date, need severity/urgency, coordination flags, reasons, and blockers. The engine compares the current option and current strategy with the accepted plan through `selectGMPlans`; a missing, blocked, replaced, or strategy-stale plan has route `NONE` and is marked `STALE`. A blocked existing option has status `BLOCKED`; other stale plans have status `REVIEW_REQUIRED`. BS9D-B's Application review persists any AI reselection before the new current plan is assessed. The stale plan itself is never routed.

`executionReadinessAtSelection` is historical only. Current `executionReadiness` and Governance policy come from the newly assessed option. `AUTHORIZED` allows a workflow destination to be identified; it never authorizes a concrete transaction. `UNKNOWN_AUTHORITY` can reach an analysis or advisory destination only. `REQUIRES_APPROVAL` produces `APPROVAL_PATH_UNRESOLVED` and `WAITING_APPROVAL`; no request is created because no concrete proposal plus issuer/recipient can be resolved truthfully. `BLOCKED` does not route to any workflow. `WAIT_AND_MONITOR` always remains a valid `NO_ACTION` decision.

## Response-family routing

| Response family | Route and responsible system | Result |
| --- | --- | --- |
| `WAIT_AND_MONITOR` | `NO_ACTION` · GM planning | `NO_ACTION` |
| `EXTERNAL_ACQUISITION` | `MARKET_INTELLIGENCE_REQUIRED` · future BS10 | `WAITING_INFORMATION`; no player discovery or transaction |
| `OUTGOING_MARKET_REVIEW` | `MARKET_INTELLIGENCE_REQUIRED` · future BS10 | `WAITING_INFORMATION`; no outgoing player selected |
| `SCOUTING_EXPANSION` | `ROUTE_TO_SCOUTING` · Scouting | `WAITING_INFORMATION`; target/evaluator and assignment require a later explicit boundary |
| `CONTRACT_RETENTION_REVIEW` | `ROUTE_TO_CONTRACT_REVIEW` · Basketball Operations advisory | `WAITING_INFORMATION`; no target, salary, offer, or renewal |
| `FINANCIAL_CONTAINMENT` | `ROUTE_TO_FINANCE` · FinanceAI | `WAITING_INFORMATION` when authority is unknown; `READY_TO_ROUTE` for authorized Finance review; no proposal is generated or recorded |
| `INTERNAL_ROLE_REALLOCATION` | `NO_SUPPORTED_WORKFLOW` | `UNSUPPORTED` |
| `INTERNAL_DEVELOPMENT` | `NO_SUPPORTED_WORKFLOW` | `UNSUPPORTED` |
| `SHORT_TERM_COVER` | `NO_SUPPORTED_WORKFLOW` | `UNSUPPORTED` |
| `SUCCESSION_PLANNING` | `NO_SUPPORTED_WORKFLOW` | `UNSUPPORTED` |

Any current `REQUIRES_APPROVAL` status overrides a family route and reports unresolved approval context. Any current block prevents a route. No route in this milestone dispatches work.

## Supported and unsupported destinations

The `NO_ACTION`, Scouting review, Basketball Operations contract review, Finance review, and future BS10 intelligence routes are truthful next-subsystem destinations. Scouting, contract advisory, and Finance are route-only; their existing producers/mutation seams are not called. BS10 does not yet exist, so both market routes wait for that milestone.

No safe team-level workflow was found for internal role reallocation, internal development, short-term cover, or roster succession. Match tactical plans, automatic training/development, organization succession, and concrete market actions have different scope/authority and are not substituted.

## Finance, Governance, and coordination

FinanceAI's recommendation projection, proposal recording, and proposal resolution remain separate. BS9E-A only routes Finance review. A required approval has no resolved concrete approval path, so it does not fabricate a Governance request, decision, approver, or recipient. Existing `GovernanceOptionPolicy` is recalculated in the fresh GM context.

When a current external acquisition coexists with another active financial-containment plan, the decision exposes `FINANCIAL_CONTAINMENT_PLAN_PRESENT`. BS9C's current financial context adds `CURRENT_FINANCIAL_CONTEXT_CONSTRAINS_ACQUISITION` when it is constrained or stressed. Neither plan is deleted and no global optimizer is introduced.

## User and AI behavior, persistence, and idempotency

AI review may persist only the current accepted `GMPlanState` changes through BS9D-B. The user's same-family output is `USER_RECOMMENDED_WORKFLOW` and the original world is returned unchanged. Both use the same pure routing engine.

Workflow decisions are derived and not saved. Assessment creates no scouting assignment, advisory outcome, Finance proposal, Governance request, market job, or action intent. Repeated review at the same world/date produces the same decisions and stable plan IDs; because this milestone dispatches nothing, it cannot duplicate workflow records. A future dispatcher must reuse the destination subsystem's idempotency identity or introduce a destination-owned stable key before any creation.

## Lifecycle, knowledge boundary, and future contracts

The Application API is explicit and is not wired to daily `advanceDay`. BS9E-B can call it after plan review and on material strategy, roster, financial, contract, scouting-completion, market-window, or approval-resolution checkpoints. It should not run every simulation day by default.

The workflow engine reads only the current BS9C/BS9D context and plan-family identifiers. It does not select external players, read hidden external player ratings, or create target-bearing records. BS10 owns external candidate intelligence. A later dispatcher must resolve a concrete target only through the authorized domain service, recheck action-specific legality and current Governance, and honor the destination's idempotency boundary.

## P0/P1 findings

- **P0:** None found in the routing and no-dispatch boundary.
- **P1:** BS10 market intelligence is not implemented, so external and outgoing market plans correctly wait. No existing Analysis view consumes the result API; UI visibility remains future integration work.
