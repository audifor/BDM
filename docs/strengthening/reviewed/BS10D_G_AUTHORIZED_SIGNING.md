# BS10D-G Authorized Free-Agent Signing

## Audit and exact gap

The audit is recorded in
[`BS10D_G_AUTHORIZED_SIGNING_AUDIT.md`](BS10D_G_AUTHORIZED_SIGNING_AUDIT.md).
The former `signFreeAgent` helper recalculates market terms from player ratings
and writes a contract, roster entry, and transaction without the accepted
negotiation or signing Governance. BS10D-G adds an Application boundary that
executes one exact ACCEPTED negotiation; the direct Market and minimum-roster
paths remain separate P1 bypasses.

## Authority and execution

`completeAcceptedFreeAgentSigning` rederives all state from the current world
using the team, negotiation ID, and expected proposal ID. It accepts only the
exact current ACCEPTED negotiation with matching team, organization, and
proposal identity. It never accepts a cached readiness result.

Operational execution ownership is `executePlayerContractSigning`, separate
from nonbinding `submitPlayerContractOffer`. The user's explicit Application
call supplies USER execution for the user club. AI requires a current eligible
delegated signing executor. Either path independently requires an exact
`PLAYER_CONTRACT_SIGNING` decision with all proposal-time approvals and a
current authorized EXECUTE right. `PLAYER_BUDGET`, `BUDGET`, offer submission,
payroll feasibility, and a missing Governance map do not authorize signature.

An absent signing decision with mapped proposer/approver authority returns
`REQUIRES_APPROVAL` without mutating the world. An existing decision waits for
all its required approvals. Rejected, vetoed, withdrawn, or unexecutable
decisions are blocked. No request, approval, or institutional actor is
invented. A missing/ambiguous institution or missing rights returns UNKNOWN.
There is no signing approval UI in this milestone, so an ACCEPTED user deal
remains IMPORTANT; it is not changed to ACTION_REQUIRED.

## Accepted terms and current checks

Salary, years, optional role, and optional agent fee come directly from the
ACCEPTED negotiation. The Application does not call `getFreeAgentMarketTerms`,
read hidden ratings, read MarketReality to set terms, or rerun salary policy.
It rechecks that the player exists and has no current roster membership or
active/scheduled contract, and rechecks `canTeamAffordAdditionalSalary` with
the exact accepted annual salary. Changed team/proposal identity is STALE;
unavailability or an inconsistent new commitment is a structured conflict.

## Contract, roster, and history

The contract starts on the signing date and expires on `addYears(signingDate,
acceptedYears)`. Contract expiry is exclusive under the existing contract
status rules. Salary and duration remain exactly the negotiated values.
`Team.rosterPlayerIds` gains the player in the same world update, and the
contract's `teamId` names that team. One `signedFreeAgent` PlayerTransaction
records the signing date, team, player, and contract. The negotiation retains
its history and becomes SIGNED with signing date, contract ID, transaction ID,
Governance decision ID, and signing actor.

An explicit accepted role creates one active RolePromise. An absent role creates
none. An agreed positive agent fee becomes one Finance `FinancialCommitment`
in the organization's base currency, sourced to the negotiation and due on the
signing date. If the organization has no canonical currency profile or the fee
cannot be recorded, signing returns `FEE_ACCOUNTING_UNAVAILABLE` unchanged.
An absent or zero fee creates no fee obligation. The fee is not subtracted from
cash outside Finance authority.

## Atomicity, Governance effect, and retries

The contract, roster entry, PlayerTransaction, SIGNED negotiation, optional
RolePromise, optional agent-fee commitment, and Governance EXECUTED event are
applied in one `updateGameWorld` call. `GameWorld` now validates that an
executed `PLAYER_CONTRACT_SIGNING` decision points to the signed negotiation
and that its contract, roster, transaction, role promise, and fee commitment
match the accepted terms. A failure leaves the input world unchanged.

The stable negotiation ID and signed links make an exact retry return
`ALREADY_SIGNED` without writing any effect again. If the player is committed
to another roster/contract before signing, the call returns CONFLICT and does
not repair that state. The immutable contract/roster relationship is checked
again by Governance effect validation.

## User, AI, planning, and bypasses

User negotiations are never auto-signed. The exported Application use case is
the explicit user initiation seam; this milestone adds no UI button or
Governance decision-creation workflow. The AI calendar path checks only exact
negotiations newly moved to ACCEPTED (including an AI acceptance of a counter).
It signs only with current availability, payroll, delegated execution
responsibility, and approved signing Governance. It does not poll every team
or repeatedly issue approval requests. AI signing produces no user breakpoint.

After a successful roster/contract change, the service calls the existing
`reviewClubManagementPlanning` material roster-change checkpoint. It does not
delete or directly rewrite strategic plans. Signing does not update
MarketKnowledge.

- **Market UI direct signing:** still calls `signFreeAgent`; it creates
  generated terms and skips negotiation, signing Governance, and signing
  responsibility.
- **AI minimum-roster repair:** still ranks and directly signs affordable
  free agents through `signFreeAgent`; it skips negotiation and signing
  Governance. Neither bypass was rewritten in BS10D-G.

## Findings and completion

- **P0:** None found in the authorized ACCEPTED-negotiation signing path.
- **P1:** The legacy Market UI and AI minimum-roster paths still bypass the
  formal negotiation and Governance signing path.
- **P1:** A user agreement can wait indefinitely when no canonical decision
  authoring/approval UI or workflow is available; no authority is inferred.
- **P1:** AI signing requires explicit `executePlayerContractSigning`
  delegation and a fully approved Governance decision; defaults grant neither.

The BS10D-G Application path completes one agreed free-agent signing only when
player availability, payroll, execution ownership, Governance, fee accounting,
and all atomic effects are valid. The legacy direct paths remain outside that
canonical path.
