# BS10D-G Authorized Signing Audit

## Scope and starting point

This audit is based on reviewed HEAD `66d8b98088db73e6979a36704797aa9747e58a6b`
after archiving the BS10D-F review documents. BS9 through BS10D-F are present on
that history. This document maps existing authorities before the BS10D-G
implementation.

## 1. Canonical contract creation authority

`createPlayerContract` in `src/domain/contract/PlayerContract.ts` validates and
constructs the JSON-safe contract value. It requires player/team IDs, standard
kind, `startsOn`, exclusive `expiresOn`, and positive annual salary. Contract
creation is currently orchestrated by `signFreeAgent` in
`src/app/market/MarketService.ts`, ecosystem transitions, and draft/rookie
flows. There is no lower free-agent signing mutation shared with negotiation.

The existing `signFreeAgent` is not reusable as-is: it calls
`getFreeAgentMarketTerms`, derives salary and years from ratings plus seeded
market generators, and cannot consume accepted negotiation terms.

## 2. Roster authority and contract/roster invariant

`Team.rosterPlayerIds` is the canonical roster membership. `PlayerContract.teamId`
is canonical contract affiliation and supplies current/scheduled salary data.
`GameWorld` validates entity references and roster entries, but does not enforce
a general one-to-one active contract/roster invariant at construction. The
existing `RosterContractIntegrity` repair reports inconsistencies; signing must
therefore update both the contract collection and the team's roster together.
Availability queries consider contracts and roster membership separately.

## 3. PlayerTransaction authority

`PlayerTransaction` is the canonical player-history record. Its existing
`signedFreeAgent` kind accepts a `contractId`, team, player, and `occurredOn`.
`signFreeAgent` creates it alongside the contract and roster update. Stable IDs
are ordinary typed strings, so BS10D-G can derive one from the accepted
negotiation and return unchanged state on an exact retry.

## 4. RolePromise authority

`RolePromise` is an existing market-domain record with player, organization,
role, acceptance date, and `ACTIVE | FULFILLED | BROKEN` status. It is persisted
by Save V2. It represents a role promise distinct from salary and gameplay role
assignment. No signing path currently creates one. Signing should create one
only when accepted terms explicitly contain a role.

## 5. Agent-fee accounting authority

The negotiated fee is not part of `PlayerContract` or the salary schedule.
Finance V2 does provide canonical `FinancialCommitment` records with amount,
organization, effective dates, category, provenance, counterparty, and
dimensions. Amounts use the organization's minor-unit currency representation.
There is no existing agent-fee-specific adapter or payable lifecycle. The
commitment ledger can preserve an explicit agreed fee as a sourced obligation;
no direct cash subtraction is justified. A fee must be written exactly once
with the signing, or signing must block if the organization currency/accounting
context cannot support it.

## 6. PLAYER_CONTRACT_SIGNING Governance semantics

`PLAYER_CONTRACT_SIGNING` is an existing decision type. It accepts only a
`GENERIC` subject and uses `EFFECT_REQUIRED`. Rights are resolved from dated,
institution-specific authority grants plus participation grants; no matching
rights produces empty proposer/approver/executor sets. `PLAYER_BUDGET` and
`BUDGET` use budget subjects and cannot satisfy this decision type. Offer
submission and payroll checks do not authorize signing.

A generic subject can refer to the exact negotiation ID. That scopes the
decision to the accepted agreement without introducing a global standing
permission. The decision's institution must match the team's organization
Governance institution.

## 7. Governance request/approval lifecycle

Governance decisions are persisted with immutable lifecycle events. An
`EFFECT_REQUIRED` decision needs a valid `PROPOSED` event, every required
approver's `APPROVED` event, and a separately authorized `EXECUTED` event for
its effect. `GovernanceDecisionExecutionService` currently implements coach
firing only; there is no player-signing executor.

Governance requests and their issued/accepted/declined/fulfilled events are
modeled and surfaced as breakpoints. There is no Application request-creation
or autonomous institutional approval path for player signing. BS10D-G must not
invent approval or create a request with an invented institutional actor. An
unapproved/missing/blocked signing decision waits with a structured result.

## 8. Signing execution responsibility

`submitPlayerContractOffer` is explicitly used for nonbinding OPEN offer
submission. Its eligible staff roles and delegated/user-controlled modes do
not establish authority to execute a binding contract. The same person may
hold both responsibilities, but one responsibility cannot imply the other.
Signing therefore needs a separate `executePlayerContractSigning`
responsibility, resolved with the existing responsibility validator, unless
the explicit user Application action performs the operation. Governance
remains a separate institutional authorization check.

## 9. User authority

The Market Application exposes direct `signFreeAgent` for the user team. It is
an explicit user action but currently bypasses negotiations and signing
Governance. The user action can initiate the new accepted-negotiation use case;
it cannot substitute for a valid approved `PLAYER_CONTRACT_SIGNING` decision.
No existing signing-specific Governance UI was found, so the service must
return `REQUIRES_APPROVAL` until a canonical decision is approved and executable.

## 10. AI authority

`advanceGameDay` already runs a narrow AI offer-submission checkpoint for
current positive contacts. AI formal-offer ownership is delegated
`submitPlayerContractOffer`. There is no accepted-negotiation signing
checkpoint. AI final execution must require an accepted negotiation, current
availability and payroll, delegated `executePlayerContractSigning`, and
explicit Governance executor/approval rights. It must not manufacture a
request, approval, or authority grant.

## 11. Atomicity and idempotency

`updateGameWorld` creates and validates an immutable replacement world. A
single call can apply the contract, roster, transaction, negotiation terminal
state and signing actor, optional RolePromise, optional fee commitment, and Governance execution
event together. Current `GameWorld` validation rejects every
`EFFECT_REQUIRED` execution except coach firing, so BS10D-G must add a
canonical player-contract-signing effect check tied to the exact signed
negotiation before the event can be persisted. If validation throws, the input
world remains unchanged.
Negotiation identity already has a stable ID; persisted signing IDs/links on
that negotiation can make successful retries return `ALREADY_SIGNED` without
reapplying effects. A conflicting contract, roster owner, or transaction must
return a conflict without repair.

## 12. Contract dates and years

`GameDate` is a calendar date, not a timestamp. `addYears` adds calendar years
to the exact start date. `getPlayerContractStatus` treats `expiresOn` as
exclusive, so a one-year agreement starting on date D ends at `addYears(D, 1)`.
This is the canonical duration mapping; no day-count approximation is needed.

## 13. Breakpoints and GM planning

Negotiation ACCEPTED is already user-visible as an IMPORTANT market
breakpoint. There is no signing action in the current breakpoint model, and
the user cannot resolve Governance approval in the application, so
BS10D-G should retain IMPORTANT without creating a misleading ACTION_REQUIRED
breakpoint. Successful signing should call `reviewClubManagementPlanning` with
the material roster/contract change reason, not delete or directly edit GM
strategic state.

## 14. Direct-sign bypasses

- **Market UI:** calls `signFreeAgent`, which generates market terms and
  atomically writes contract, roster, and `signedFreeAgent` transaction. It
  skips negotiation, exact accepted terms, signing Governance, and the new
  signing responsibility.
- **AI minimum-roster repair:** `maintainAiTeamMinimumRosters` ranks affordable
  free agents then calls the same direct helper. It can mutate contracts,
  roster, and history without negotiation or Governance. This repair remains
  outside BS10D-G unless safely adopted with a very small scope; it is a P1
  bypass to report explicitly.

## 15. Exact BS10D-G gap

The repository can record ACCEPTED terms but has no application operation that
converts one exact ACCEPTED negotiation into an institutionally authorized,
current-payroll-valid, atomic contract/roster/history transition. It lacks
final-signing execution ownership, decision approval/execution enforcement,
the `GameWorld` validator for a player-signing effect, fee accounting at
signing, terminal SIGNED traceability, idempotent retry, and the narrow AI
accepted-signing checkpoint. The existing direct signing paths are separate
P1 bypasses and do not establish the canonical BS10D-G path.
