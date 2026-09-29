# BS10D-A2 Negotiation Preconditions and Signing Authority

**Status:** Implemented for review; no market action is executed.
**Architecture:** Path B — `CONTACTED` is a pre-offer state; `OPEN` is a formal offer.

See [the lifecycle audit](./BS10D_A2_NEGOTIATION_PRECONDITIONS_AUDIT.md) for the
source-by-source findings and P0/P1 list.

## Lifecycle boundary

`ContractNegotiation` remains the single canonical persisted lifecycle. A
`CONTACTED` record has team/player/organization identity, date, responsible
actor, stable action key and optional GM plan/proposal provenance. Its offer
fields are structurally absent. `OPEN` means a concrete first formal offer;
salary, selected years, promised role and opening agent fee belong to that
stage. `COUNTERED` is an agent counter in the current implementation.

This milestone adds the pre-offer data shape and contact-readiness projection,
and defines the same-record transition from `CONTACTED` to `OPEN` when exact
offer terms are supplied. It creates no contact record and adds no UI action.
It does not implement club counters, expiry, acceptance, rejection commands,
signing conversion or contract creation. Accepted offer state is not a signed
contract.

## Offer field authority

- **Salary:** current organization-scoped BS10C expected salary is shown with
  source/confidence/date and rechecked against current payroll. It is market
  expectation evidence, not a submitted offer amount. Unknown stays unknown.
- **Term:** no club selection authority exists. `expectedYears` stays an
  unselected signal; no default is used.
- **Role:** current need, depth and retention advice do not assign an incoming
  contract role. It remains unknown.
- **Agent fee:** representation can identify an agent. It supplies no opening
  fee. The `agentCounter` formula only applies after a formal offer exists.

Salary/payroll evidence, selected term, role, and agent fee remain separately
visible. Player ratings, hidden MarketReality, and generated market terms fill
none of them in this read-only path.

## Contact readiness and authority

Analysis now displays factual **contact readiness**, **contact authority**,
and **formal offer readiness** separately. Contact readiness is based on the
current candidate still being a free agent, a referenced GM plan still
selecting external acquisition for the same team/need, and there being no
active team/player attempt. It does not depend on offer terms. It does not
grant permission: contact authority remains unknown and no controls are shown.

The routed application service rebuilds proposal intelligence from the current
world. If a supplied proposal references a missing or changed GM plan, both
contact and formal-offer readiness report `STALE_PLAN_OR_PROPOSAL`. The eventual
mutation path must recompute the exact selected proposal/candidate and market
evidence immediately before acting; a historical BS10C result is never enough.
No market-evidence freshness threshold exists today, so none is invented.

## Responsibility, Governance, and finance

`recommendSignings` remains the closest incoming-player responsibility. A
valid current holder can be shown, but recommendation ownership does not grant
execution. `contractRecommendation` is retention advice, `shortlistPlayers` is
curation, and `recommendSignings` has no delegated execution mode. The user
Market screen's direct-sign action is an existing separate application path;
it does not provide a negotiation offer workflow.

Governance V2 has budget and strategic planning domains, but no player-contract
or signing decision domain. `PLAYER_BUDGET`, `BUDGET`, or selection of an
`EXTERNAL_ACQUISITION` plan do not imply authority to contact, offer, or sign.
No Governance domain or request is added. Finance V2 stays contextual unless a
canonical rule blocks a commitment. `canTeamAffordAdditionalSalary` is a
current payroll test only: affordability is not authorization.

## Identity, uniqueness, and current state

New formal offer IDs encode organization, team, player and a stable action key. A
replayed identical action against the updated world is idempotent. Reusing a
key with changed terms fails. A new legitimate attempt must receive a distinct
key representing a newly initiated attempt; no duplicate planning state is
persisted for this key. BS10D-B must preserve one key across retries and must
not mint a new key merely because the old action was retried.

There is at most one active contact/offer/counter for a team/player. A legacy
record without team identity conservatively blocks the same organization and
player. Closed historical negotiations stay addressable and do not block a new
attempt with a new key. Player free-agent status and team/organization identity
are rechecked at the formal-offer boundary. There is no supported parallel
negotiation model.

## User and AI behavior

The user remains able to use the existing direct Market signing path; it is
separate from the new contact/formal-offer intelligence. BS10D-A2 adds no user
or AI action. AI must not infer execution from advisory responsibility, broad
acquisition planning, affordability, or Finance V2 posture. AI negotiation
remains blocked until performer responsibility and institutional signing
authority are resolved.

The existing AI minimum-roster repair is a separate legacy direct-sign path
using deterministic bootstrap terms and payroll. It is not treated as a valid
BS10D negotiation authority path and requires a separate product/architecture
decision before ordinary autonomous acquisition relies on it.

## BS10D-B mutation contract

BS10D-B remains blocked. Before mutation it must:

1. Recompute the current selected GM plan, BS10C proposal, preferred candidate,
   and eligibility from the live world.
2. Recheck current free-agent status, exact team/organization ownership,
   current club-known market signals, and current payroll.
3. Resolve a real performer path and signing-specific Governance authority;
   keep those independent from one another and from affordability.
4. Require salary, selected term, incoming role, and opening fee only when
   creating a formal offer, each from a truthful authority.
5. Check one-active-team/player uniqueness and use a stable key for retries.
   Use a new key only for a genuinely new attempt.
6. Create only an authorized stage. Initial contact carries no offer terms.
   Acceptance alone must not sign or create a contract without a canonical
   signing transition and authority.
7. Keep trades, transfers, Finance proposals and Governance requests outside
   this boundary unless their own canonical milestone authorizes them.

## Persistence and validation

No save version changes. Existing formal-offer records retain their original
shape and meaning; new optional identity/provenance fields are additive. Save
V2 round-trip coverage proves that a term-free contact remains term-free and a
legacy formal offer keeps its terms. The test scope is focused; the full suite
and long-horizon simulation are intentionally not run.

## Findings

No P0 finding was found in the read-only BS10D-A2 path. P1 findings remain:
offer term/role/fee authority, signing Governance, AI execution responsibility,
the direct AI minimum-roster repair path, incomplete response/signing lifecycle,
and the caller-provided action-key lifecycle. BS10D-B is not safe to begin.
