# BS11D1 · Binding retention execution

## Reuse check

The implementation reuses `materializeBindingContractCompensation` from BS11D0, `PLAYER_CONTRACT_SIGNING` Governance decisions and events, the canonical player-contract factory, `RolePromise`, `ContractFinancialSchedule`, roster integrity assessment, contract status/date semantics, and `reviewClubManagementPlanning`. The retention-specific gap was the lack of a single application transition from an accepted retention negotiation to a successor contract, plus a persisted successor relationship and signed evidence.

## Execution boundary and revalidation

`executeAcceptedRetentionAgreement` owns the transition for both user and AI agreements. It revalidates accepted terms, the exact predecessor ID/player/team/organization, predecessor activity, unique active contract, valid roster/contract integrity, current team coach, execution owner, materialized compensation, and existing successors. It does not retarget or repair stale negotiations.

The service returns structured status, reason, compensation, Governance, Finance, and successor evidence. Expected failures preserve the incoming world. A valid attempt with no Governance decision may add exactly one proposal and returns `GOVERNANCE_REQUIRED`; repeated attempts reuse that decision. Approval is still required before contract creation.

## Successor identity and dates

`PlayerContract.predecessorContractId` is the canonical chain link. GameWorld validates that the predecessor and successor belong to the same player and team, that dates touch exactly, and that a predecessor has at most one explicit successor. The successor ID is deterministic from the accepted negotiation.

The successor starts at the predecessor's exclusive `expiresOn` and expires after the accepted number of years. The predecessor is never edited. Before `startsOn`, the successor is `scheduled`; at that exact date, existing contract status and calendar processing make it active. Expiry reconciliation already preserves a rostered player while an active or scheduled same-team contract exists, so there is no free-agent gap or second scheduler.

## Compensation and unsupported terms

The service passes the accepted salary and guarantees to the BS11D0 materializer and maps its year schedule into `PlayerContract`. It does not recalculate service time, salary legality, guarantee amounts, or cap hits. `PlayerContract` now stores explicit cap treatment. `NOT_APPLICABLE` carries no numeric cap hit; the derived cap-burden helper returns zero for cap accounting consumers.

Options, incentives, trade-consent clauses, and non-club-paid agent fees block signing explicitly. Accepted guarantees remain in the year schedule. A club-paid agent fee is excluded from the salary materializer and recorded once as a separate `PLAYER_AGENT_FEE` Finance commitment, matching the existing free-agent fee treatment. An unavailable organization currency/profile blocks the fee. An accepted role proposal creates the same active `RolePromise` shape used by free-agent signing; the role is not put on the contract.

## Governance and actors

Retention uses the existing `PLAYER_CONTRACT_SIGNING` decision type, actor appointments, authority grants, approval events, and execution event. Its generic decision subject is `retention:<negotiationId>`, which resolves to the immutable accepted terms and exact predecessor. The retention Governance helper is an adapter in the existing signing Governance service, not a second approval model.

User acceptance calls the binding execution service, which proposes Governance after validating binding prerequisites. Newly accepted AI retention agreements call that same service from the application day checkpoint. Neither acceptance path grants approval or bypasses the decision. On the last valid user approval, the existing store action invokes the binding service; AI agreements remain pending until authorized Governance action.

## PlayerContract and Finance

One scheduled standard contract is created with the player, current team, exact dates, predecessor link, annual salary, per-year guarantees, and cap treatment. No roster membership is added or removed at signing because the player remains with the same team.

Future salary is derived once from `ContractFinancialSchedule` using the contract as source of truth; no duplicate salary commitment or manual cash/budget mutation is added. The service checks schedule admissibility when an organization financial profile supplies the canonical currency. A missing profile does not create synthetic currency or block a salary-only contract; the Finance schedule remains a derived query that requires the caller's explicit currency policy. Agent fees require a profile to form their separate commitment.

## Atomicity and idempotency

Before the final `updateGameWorld`, the service prepares and validates the contract, Finance schedule where configured, fee commitment, RolePromise, and Governance execution event. The final update adds the successor, minimal negotiation execution evidence, optional role/fee effects, and execution event together. A deterministic contract ID and persisted evidence make repeated execution return `ALREADY_SIGNED`. A pre-existing linked or continuous successor returns `SUCCESSOR_EXISTS` and is never replaced.

## Negotiation evidence and Save

The accepted negotiation and round history remain intact. `execution` records only `SIGNED`, resulting contract ID, signed date, and Governance decision ID. Save V4 persists that evidence and the contract chain/cap treatment. During V4 load, retention execution events are deferred until the retention records are restored, then the canonical world validator checks their exact effects. Existing V4 saves without execution evidence remain valid.

## Roster, release, and trade

The existing expiry authority keeps the player rostered through a valid scheduled successor and sees the successor active at `predecessor.expiresOn`. Release is explicitly blocked while a scheduled linked successor exists; BS11E owns release/termination economics.

Trade movement is explicitly blocked for a player whose active contract belongs to a binding successor chain. This guard also covers an active linked successor so a later trade cannot move only one contract and violate the chain. Atomic movement of the entire contract chain is deferred to a trade milestone.

## UI, Governance breakpoint, and observability

No Contract Hub was added. The existing Analysis retention surface distinguishes accepted-but-unsigned agreements, pending Governance, denied/withdrawn Governance, and signed successor evidence. Governance approval continues through the existing breakpoint/surface. A signed agreement shows its contract ID and date. Service results carry negotiation and predecessor IDs, compensation/Finance/Governance outcomes, successor outcome, and final reason.

## P0/P1 findings

- **P0:** None found in the audited transition.
- **P1 addressed:** Trade previously moved only the active contract, and release ignored a scheduled successor. Trade now fails closed for a linked chain; release fails closed for a scheduled successor.
- **P1 deferred:** Moving every contract in a chain atomically through a trade requires a dedicated trade lifecycle change. Full release and termination finance remain BS11E scope.

## Handoffs

- **BS11E:** define buyout, termination, guarantees after release, and other release economics; replace the temporary release guard only when those consequences can be preserved.
- **BS11F:** expose the full contract lifecycle and chain in the final contract integration surface; no Contract Hub was built here.

## Focused validation

The D1 test scope covers the retention execution service, retention negotiation compatibility, Governance signing, PlayerContract, Finance schedule, expiry/activation, Save V4, trade-chain guard, release guard, typecheck, build, and whitespace diff check. The full suite and long-horizon simulation were not run.
