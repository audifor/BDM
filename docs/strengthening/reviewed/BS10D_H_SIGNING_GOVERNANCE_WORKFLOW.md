# BS10D-H Player Contract Signing Governance Workflow

## Governance audit

The pre-implementation audit is recorded in
[`BS10D_H_SIGNING_GOVERNANCE_WORKFLOW_AUDIT.md`](BS10D_H_SIGNING_GOVERNANCE_WORKFLOW_AUDIT.md).
Governance already models decision lifecycle events, dated authority grants,
decision participation rights, body appointments, addressed requests, and
breakpoint details. Before H, the only Application decision writer was the
coach-firing executor. No generic proposal/approval writer, Governance UI
resolver, or autonomous board AI exists. A Governance request is not a signing
decision and is not created for this path.

## Decision creation and exact subject

`ensurePlayerContractSigningDecision` revalidates the ACCEPTED formal
negotiation, current team/organization, exact expected proposal ID, current
player availability, current payroll, and the institution covering that team.
It creates or reuses one stable decision identity derived from
`PLAYER_CONTRACT_SIGNING`, institution ID, and negotiation ID. The decision
subject is `GENERIC` with `referenceId` equal to that exact negotiation ID.
No salary, term, role, fee, or negotiation status is changed.

The operation records the decision and PROPOSED event together. Retries return
the existing exact workflow; conflicting or incomplete decision records are
reported without creating another decision. The stable identity also prevents
a second workflow from being started after signing.

## Proposer, approver, and executor authority

PROPOSE rights come only from current, institution-local, dated
`PLAYER_CONTRACT_SIGNING` authority and participation grants. Proposal can be
attributed only to an actual active `GovernanceAppointment` for the initiating
actor and an eligible proposer body. The user entry point uses the user coach
only when that coach is actively appointed. The AI accepted-deal checkpoint
uses the negotiation's persisted formal-offer staff actor only when that staff
member is actively appointed to a proposer body. Ambiguous or missing actors,
appointments, or rights produce a structured no-authority/unknown result; no
titles or staff responsibilities are converted into Governance authority.

Approvals use all required bodies resolved at proposal time. Each response must
come from an active appointee of the addressed body with the applicable
current dated APPROVE or VETO right. REJECTED uses APPROVE authority, VETOED
uses VETO authority, and WITHDRAWN uses proposal authority. `PLAYER_BUDGET`
and `BUDGET` remain unrelated. No approval is created by affordability,
acceptance, or AI execution.

The existing BS10D-G service remains the only binding effect executor. It
rechecks current availability, payroll, staff signing responsibility, and
Governance EXECUTE evidence, then records EXECUTED atomically with successful
contract completion. If current state blocks signing, approval history remains
and the decision receives no EXECUTED event.

## User and AI workflow

`startUserPlayerContractSigning` represents an explicit user request to start
the exact approval process. It does not make the user every institutional
actor. Approval completion does not automatically sign a user club; the user
must explicitly invoke the G signing operation after approval.

AI may propose only when its persisted offer actor has the real appointment
and PROPOSE right. No generic Governance AI approval behavior was found, so
required approvals remain pending for real approved actors. The AI accepted
checkpoint runs only for negotiations newly accepted in Calendar or
counter-response phases. It does not scan old ACCEPTED negotiations daily.

`recordPlayerContractSigningDecisionEvent` is the canonical event-driven
approval seam. After a real APPROVED event, it checks the exact decision's
proposal-time approval set. Once complete, it immediately attempts the exact G
signing path for an AI club. It does not approve for any body. A user club
returns approved/awaiting explicit signing confirmation. Duplicate approvals
are idempotent by decision, body, kind, and effective date.

## Rejection, breakpoint, and UI behavior

REJECTED, VETOED, and WITHDRAWN decisions remain terminal. The ACCEPTED
negotiation and Governance history are preserved; no negotiation reopening or
signing occurs. Player and payroll checks do not reserve or freeze state.

Accepted user negotiation breakpoints remain `IMPORTANT`, never dead-end
`ACTION_REQUIRED`. Their diagnostics identify whether no signing decision has
been proposed, which exact decision awaits which body approvals, or whether
approval is complete and explicit user signing is still required. Existing
Governance approval candidates remain `IMPORTANT` because no compatible
decision-control UI exists. This milestone adds Application functionality
and truthful breakpoint details, not a large UI.

## Direct-sign paths and remaining findings

The legacy Market UI direct `signFreeAgent` path and the AI minimum-roster
repair direct-sign path remain unchanged, as required. They do not create a
decision through this workflow and remain convergence work for the next
milestone. This H workflow does not call `signFreeAgent`, recalculate terms,
change negotiation rounds, or alter accepted salary, years, role, or fee.

- **P0:** None found in this Governance workflow.
- **P1:** There is no Governance/signing approval UI, so user approval and final
  confirmation are available only through the Application seam. AI proposal
  starts only for accepted negotiations whose persisted offer actor has a
  matching active Governance appointment and PROPOSE right; other clubs retain
  a structured no-authority result. Legacy direct-sign paths remain outside
  this decision workflow.

The ordinary authorized transition is now
`ACCEPTED -> exact PLAYER_CONTRACT_SIGNING decision -> real required approvals
-> explicit user confirmation or event-triggered AI attempt -> BS10D-G atomic
signing`. End-to-end execution remains conditional on real current Governance
authority and signing readiness; no authority or approval is synthesized.
