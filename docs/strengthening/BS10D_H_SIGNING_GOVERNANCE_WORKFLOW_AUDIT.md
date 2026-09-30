# BS10D-H Signing Governance Workflow Audit

## Scope and starting point

This audit is based on reviewed BS10D-G HEAD
`d34ec1ac113413cd3b3d5c65451f959febc1adad`, after the required archive commit
`9b82033984d5b36430e9330e93cbe93b3c4d2dd1`. BS9 through BS10D-G are present.
The active architecture and product guardrails remain authoritative; the older
`PCB/bu/Docs/1.ARQUITECTURA/Master blueprint.md` describes a superseded stack and
does not replace the repository's current architecture.

## 1. Canonical decision-authoring seam

`createGovernanceDecision` and `createGovernanceDecisionEvent` are Domain
factories. `updateGameWorld` validates their resulting canonical state. The only
Governance Application service found is
`executeGovernanceCoachFiringDecision`; it executes one effect and appends its
EXECUTED event. No general Application operation creates decisions or records
PROPOSED, APPROVED, REJECTED, VETOED, or WITHDRAWN events. No UI call site for
Governance decision execution or event authoring was found.

BS10D-G's `completeAcceptedFreeAgentSigning` consumes an already proposed and
fully approved decision. It correctly remains the sole signing-effect executor:
it atomically adds the contract and signing state with Governance EXECUTED.
H must create and progress the decision before that boundary without appending
EXECUTED separately.

## 2. Proposer authority and actor identity

`resolveGovernanceDecisionRights` derives PROPOSE bodies only from active,
institution-local, decision-specific authority grants and participation grants.
It resolves bodies, not people. `GovernanceAppointment` is the canonical
date-scoped link from a real COACH, STAFF, or EXTERNAL actor to a body. Neither
titles nor a team's offer-submission responsibility grants Governance PROPOSE.

A real proposal must therefore be attributable to an actual active appointee
of a body with PROPOSE rights. The initiating user coach or the existing
negotiation's persisted AI offer actor may start proposal processing only when
that same actor has such an appointment. If the actor, appointment, or right
cannot be resolved, return a structured no-authority/unknown result and leave
the world unchanged. Do not select a body and pretend an unidentified person
acted for it.

## 3. Approval and executor authority

Approval uses the exact `PLAYER_CONTRACT_SIGNING` decision's active grants and
the proposal-time required approver bodies. The existing coach-firing executor
uses every proposal-time approver body and current EXECUTE rights; it does not
create approval events. H must preserve all required approvers and require a
real actor with an active appointment to each acting body before recording an
event. `PLAYER_BUDGET` and `BUDGET` grants cannot satisfy signing rights.

The G signing service independently checks current signing execution
responsibility, exact decision approvals, and current Governance EXECUTE
evidence. It writes EXECUTED only in the same atomic update as a successful
signing. H must call G after a decision has become executable and leave the
decision unexecuted if G now reports player, payroll, or execution-owner
blockers.

## 4. Decision and request semantics

Governance decisions are the approval lifecycle (`PROPOSED`, `APPROVED`,
`REJECTED`, `VETOED`, `WITHDRAWN`, and optionally `EXECUTED`). Governance
requests are a separate addressed request lifecycle (`ISSUED`,
`ACKNOWLEDGED`, `ACCEPTED`, `DECLINED`, `WITHDRAWN`, `FULFILLED`). Requests do
not carry a decision type, signing subject, proposer/approver rights, or
authority to create a decision. A request is not a substitute for the exact
`PLAYER_CONTRACT_SIGNING` decision and is unnecessary when the user explicitly
initiates that decision workflow.

## 5. User workflow

The user may explicitly initiate signing at the Application boundary, but the
user coach is not automatically the Governance proposer, approver, or executor.
Proposal and approval event authority must be resolved from an active
appointment for the actual user coach and the corresponding event right.
If another body is required to approve, its decision remains pending and is
not auto-approved. Existing breakpoints label an approval `IMPORTANT` only
when the user has an active appointment to a required approver body; there is
no Governance UI/action resolver.

No existing user action semantics say an approval alone executes a contract.
The conservative behavior is to retain explicit user confirmation at the G
signing boundary for a user club. Approval readiness can be surfaced, but H
must not automatically bind a user club merely because the last approval was
recorded. Since there is no signing UI, the breakpoint must remain nonblocking
and the missing presentation/action route must be documented.

## 6. AI institutional workflow

Search found no generic Governance AI proposal or approval policy. Existing
AI manager option policy is a read-only authority assessment, not an
institutional actor or event writer. H must not invent an owner, board member,
approval, or signing-specific board AI. AI proposal initiation can proceed
only when the negotiation's persisted offer actor maps to an active
GovernanceAppointment whose body has current PROPOSE authority. Required
approvals remain separate; no automatic approval is inferred from AI
acceptance, affordability, or proposer identity.

## 7. Approval timing and signing retry

Signing is currently retried only for exact negotiations newly accepted in
calendar or counter-response phases. It is not retried when a Governance
approval is appended later, and global daily ACCEPTED polling is explicitly
out of scope. There is no generic Governance mutation service to hook.

H needs one canonical approval-event Application operation. After it appends a
legitimate APPROVED event, it should assess only that exact signing decision.
When all required proposal-time approvals now exist, an AI agreement can call
the exact G signing operation immediately; G still rechecks current
availability, payroll, staff signing responsibility, and Governance execution
evidence. For a user club, return approved/awaiting explicit signing
confirmation; the user must invoke G themselves. A failed AI signing attempt
leaves Governance approval history intact and creates no EXECUTED event.

## 8. Rejection, veto, and idempotency

The Domain lifecycle makes REJECTED, VETOED, WITHDRAWN, and EXECUTED terminal
for further decision events. H should preserve the ACCEPTED negotiation and
the terminal Governance decision, refuse signing, and never silently reopen
the negotiation. A stable ID derived from decision type, institution, and
exact negotiation must make proposal retries return the existing workflow.
Approval event IDs must also be stable per decision, body, kind, and effective
date so retries cannot duplicate approvals. Once SIGNED, existing G behavior
returns `ALREADY_SIGNED`; H must not restart or create another decision.

## 9. Breakpoints and UI

`SimulationBreakpoints.ts` surfaces attributable Governance requests and
missing approvals as `IMPORTANT`; it does not provide `ACTION_REQUIRED`
without a real resolver. Current Governance requests and decision actions
have no compatible user controls. The smallest honest H presentation is to
keep unresolved signing and approval candidates `IMPORTANT`, include the
decision/negotiation IDs and blockers in diagnostics, and avoid dead-end
`ACTION_REQUIRED`. No large UI is needed or justified by existing controls.

## 10. Exact remaining gap

An ACCEPTED negotiation has no ordinary idempotent Application route to create
its exact signing decision under a real appointed proposer, record real
institutional approvals, and trigger an exact signing attempt at the moment
approval becomes complete. AI has no generic autonomous Governance workflow,
and the user has no decision/action UI. H can provide Application operations,
truthful nonblocking breakpoint details, and an event-driven AI retry without
granting new authority, changing negotiation terms, or weakening G's atomic
execution boundary.
