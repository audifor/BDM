# BS9D-A · Selection Safety Foundations

## Scope and result

BS9D-A establishes derived information for future GM option selection. It does
not choose options, submit Governance requests, approve decisions, or mutate
rosters, contracts, finances, or strategy. The existing BS9C response families
and their ordering inputs remain intact; each option now also carries Governance
policy and a conservative selection-safety projection.

## P1-A · Knowledge-bounded club needs

### Original finding and exact path

`assessClubNeeds` built `activeCompetitionPlayers` from all rosters participating
in active seasons. For every position it then called `calculatePlayerImpact`
against those external `Player` records to build `peerValues`. It compared the
club's available starter and backup against that hidden-truth pool using a
league/competition percentile. A bottom-quartile result created a
`STARTER_QUALITY_GAP` or `BENCH_QUALITY_GAP` need with MEDIUM severity,
PLANNED urgency, and MODERATE confidence. The low percentile was also embedded
in need evidence. The percentile did not alter the fixed severity, urgency, or
confidence; it only determined whether that need existed. Its presence could
shift need priority ranks and the `HIGH_PRIORITY_NEED` reason on other options
when a rank crossed BS9C's top-two threshold. The MEDIUM/PLANNED quality need
itself does not pass the current BS9C option importance filter, so it did not
directly add or reorder response families.

### Correction and knowledge boundary

The shared needs engine accepts an explicit `USER_ANALYTICS` or
`ORGANIZATION_KNOWLEDGE` perspective. When callers omit it, the engine derives
the conservative perspective from team control: `USER_ANALYTICS` for the
user-controlled club and `ORGANIZATION_KNOWLEDGE` for other clubs. GM context
also passes that perspective explicitly.

Under the autonomous perspective, the engine does not calculate external
competition impact values or create starter/backup comparative percentile
needs. The assessment reports `externalComparisonStatus: UNKNOWN`, because the
current sparse `OrganizationKnowledge` dimensions do not provide a canonical
mapping to every input of `calculatePlayerImpact`. BS9D-A does not invent
scouting data or silently use player truth as a substitute. User-facing
analytics retain the established factual comparison behavior.

Own-roster truth remains available to both perspectives. The engine continues
to use a club's own player ratings for its own role-function coverage, starter
selection, availability, and related roster evidence. Positional depth, role
gaps, eligibility, contracts, age, and finance continue to use their existing
canonical inputs. The correction is narrow to external comparative truth.

Existing `OrganizationKnowledge` remains the authority for external market
readiness in GM context. Its coverage/provenance dimensions can change
`externalKnowledgeReadiness` and market-facing option factors, but are not
misrepresented as a complete competition-wide impact benchmark. No Overall
rating was added.

### Regression evidence

Focused tests radically change external players' hidden ratings with
OrganizationKnowledge fixed and compare the AI needs and complete ordered BS9C
option projection. Own roster role-rating evidence still creates a role gap.
Existing GM-context coverage tests show that a legitimate scouting estimate can
change knowledge readiness without exposing the external player ID or estimate
in options. Repeated assessments remain deterministic.

## P1-B · Governance option policy

### Original finding and Governance V2 facts

BS9C had broad option families and displayed open Governance requests as generic
blockers, but it had no derived policy connecting a family to Governance
decision authority. Governance V2 already has institutions, bodies, directed
authority grants, decision participation grants, decision types, and dated
request lifecycles. `resolveGovernanceDecisionRights` is the canonical
date-aware authority resolver. Existing decision types include BUDGET,
PLAYER_BUDGET, STRATEGIC_PLAN, staff/coach decisions, and institutional domains;
there is no universal transfer, signing, trade, contract-retention, internal
development, or scouting approval type. Appointments identify mandates but do
not themselves create decision rights. Requests and commitments are separate
records; budget pressure and board pressure are not permission.

### Response-family mapping

The mapping is explicit and intentionally conservative:

| BS9C family | Governance domain | Interpretation |
| --- | --- | --- |
| `FINANCIAL_CONTAINMENT` | `BUDGET` | Existing budget decision authority is relevant to budget containment. |
| All other families | Unknown | Governance V2 does not supply a sufficiently direct domain for the broad family. |

In particular, `EXTERNAL_ACQUISITION` is not treated as a signing, transfer, or
trade. A future transaction must be checked at its actual action boundary.
Likewise a mapped budget domain does not authorize a concrete contract or
transaction.

### Policy, request, and selection gate

Every BS9C option has `governancePolicy`. BS9D-A initially attached a single
`selectionSafety` gate; the A2 closure below replaces that field with distinct
planning and execution projections. Formal policy statuses remain:

- `AUTHORIZED`: an explicit active mapped-domain EXECUTE participation grant
  exists and no mapped APPROVE right is present. This permits consideration at
  that broad domain only; it is not transaction execution authority.
- `REQUIRES_APPROVAL`: the canonical resolver finds an active mapped APPROVE
  participation grant.
- `BLOCKED`: reserved for a future explicit canonical prohibition. BS9D-A does
  not infer it from missing grants.
- `UNKNOWN`: no truthful family mapping, no single relevant institution, or no
  decisive mapped authority evidence.

An unresolved active Governance request is returned separately as
`pendingRequestIds` (including an accepted request until it is fulfilled,
declined, or withdrawn). It does not alter the formal policy status. BS9D-A's
single-gate interpretation was superseded by A2: an open request affects
execution readiness but does not by itself prevent planning.

This is one pure derived resolver used for user and AI context. It does not
write Governance decisions/events, create requests, or execute a transaction.
Existing request blocker codes remain visible for inspection. Governance policy
does not absorb board pressure or strategic urgency.

## BS9D-A2 closure · Planning is not execution

**Planning != execution.**

The original gate conflated authority to select a broad planning option with
authority to carry out a concrete action. A2 splits those decisions. Every
option now carries `planningEligibility` (`SELECTABLE` or `NOT_SELECTABLE`)
and `executionReadiness` (`AUTHORIZED`, `REQUIRES_APPROVAL`,
`UNKNOWN_AUTHORITY`, or `BLOCKED`), alongside the unchanged `governancePolicy`.

Planning eligibility is `SELECTABLE` for an option BS9C has produced as
compatible with the need, except when formal Governance policy is explicitly
`BLOCKED`. `UNKNOWN` and `REQUIRES_APPROVAL` do not bar the club from preferring
that broad plan. No missing grant is interpreted as a prohibition.

Execution readiness is derived separately. `UNKNOWN` maps to
`UNKNOWN_AUTHORITY`; `REQUIRES_APPROVAL` remains `REQUIRES_APPROVAL`; an
explicit `BLOCKED` policy remains `BLOCKED`; and `AUTHORIZED` requires the
existing mapped-domain executor grant. Any unresolved `pendingRequestIds`
sets readiness to `REQUIRES_APPROVAL` while remaining distinct metadata.
Neither `UNKNOWN_AUTHORITY` nor `REQUIRES_APPROVAL` permits execution.

For example, `EXTERNAL_ACQUISITION` can be `SELECTABLE` for planning while its
execution readiness is `UNKNOWN_AUTHORITY`. Selecting it means only that the
club prefers to explore an external solution; it does not name a player, submit
an offer, spend funds, sign, transfer, or trade.

BS9D-B may choose among options whose `planningEligibility` is `SELECTABLE`,
including those with `UNKNOWN_AUTHORITY` or `REQUIRES_APPROVAL`. Its selected
decision must carry `executionReadiness` forward, and BS9D must not execute it.
BS9E must resolve the concrete action and re-check its actual Governance
decision domain, responsibility/delegation, budget authority, and
market/contract/trade rules. This patch changes no concrete action service; the
existing action boundaries continue to validate authority and approval.

Focused tests cover unknown, approval-required, explicit-block, missing-grant,
pending-request, non-mutation, stable ordering, and hidden-truth behavior.
Governance family mappings remain unchanged and no new action or request is
created.

## Determinism and integration

Needs, policy, request IDs, and gate reasons have stable sorting and no random
inputs. BS9A strategy continues to feed BS9B needs, which continue to feed BS9C
options. BS9C option families, feasibility, alignment, and ordering logic remain
unchanged; the new policy fields are inspection metadata. No Analysis UI was
changed in this milestone, and no action controls were added.

## Deferred work and findings

BS9D-B may begin implementing option selection under the planning/execution
contract above. Any selected broad option must retain its execution readiness,
and only BS9E may resolve and authorize a later concrete action.

No new P0 findings were identified. The original P1-A hidden external-rating
leak is corrected for autonomous assessments. Governance broad families without
a truthful mapped decision domain intentionally remain `UNKNOWN_AUTHORITY` for
execution; they may still be considered as plans. This remains a P1 boundary
for execution of concrete actions until their actual authority domains are
resolved.
