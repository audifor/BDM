# BS10E-D · Bilateral Trade Governance and Atomic Execution

## Implementation

BS10E-D binds asset movement to one exact `AGREED` trade revision. It adds an Application Governance and execution service, a terminal `EXECUTED` negotiation state, links from `TradeRecord` to the negotiation/revision and per-team decisions, GameWorld effect validation, minimal user controls in Trade Center, and focused tests. The initial audit is in [BS10E_D_TRADE_GOVERNANCE_EXECUTION_AUDIT.md](BS10E_D_TRADE_GOVERNANCE_EXECUTION_AUDIT.md).

### 1–8. Subject, authority and readiness

1. **Binding subject:** the current negotiation ID and `currentRevisionId`, with participant team ID appended for each independent commitment.
2. **Per-club decisions:** stable IDs derive from `PLAYER_TRADE_COMMITMENT`, institution, negotiation, revision and team. Every participant has its own decision; exact retries reuse it.
3. **Proposer:** `ensureTradeCommitmentDecision` requires an active appointment and current PROPOSE right. Staff title, negotiation responsibility and execution responsibility do not grant that right.
4. **Approver:** decisions retain the required approval bodies resolved at proposal time. APPROVED, REJECTED and VETOED events require an active appointee and applicable right. One club's approval cannot satisfy another club's decision.
5. **Governance executor:** each club independently needs a current EXECUTE body with a real active appointee. The service creates a body event with canonical authority grant evidence only as part of successful completion.
6. **Operational executor:** user-controlled clubs use an explicit user Application action. AI clubs require a currently eligible delegated `executePlayerTrade` holder. `negotiatePlayerTrade` is insufficient and no delegation is created automatically.
7. **Readiness:** `assessTradeCommitmentReadiness` returns an aggregate status and per-participant operational executor, decision ID, proposer body, required/completed approvals, Governance executor body and blockers. It distinguishes approval, execution-owner, window, package, financial and general blocks.
8. **AI behavior:** the service uses only configured Governance institutions, rights and appointments. No AI board actor or approval is invented. Default generated worlds without Governance remain awaiting real authority.

### 9–17. Revalidation and canonical trade effects

9. **Live revalidation:** immediately before execution the Application service checks AGREED status, exact current revision, current season/ecosystem and participant reachability, open window, exact contract snapshots, TradeEngine ownership/eligibility/salary/retention/exception validation, all per-team commitment approvals and Governance execution rights, and every operational executor.
10. **Command reconstruction:** it rebuilds one ephemeral `TradeProposal` from the stored revision's movements, exception uses and retained salary. Caller-provided terms and cached readiness do not enter the execution boundary.
11. **Window closure:** a closed window blocks execution with `WINDOW_CLOSED`; agreement remains historical.
12. **Stale package/assets:** a stale revision returns `STALE_PACKAGE`. Ownership or eligibility failures are surfaced as `ASSET_CONFLICT`/`BLOCKED`. The service does not substitute assets or repair terms.
13. **Contracts and salary:** TradeEngine preserves ContractId and contract terms while moving team affiliation; ordinary salary follows the receiving team. Agreed retained salary is sent unchanged to TradeEngine and linked to exactly the generated obligations.
14. **Picks, rights and swaps:** all supported agreed asset movements go through TradeEngine. GameWorld checks final ownership/holder against the agreement.
15. **Salary exceptions:** agreed uses are consumed and generated exceptions remain exactly those created by canonical TradeEngine behavior. The completed record must link existing generated exceptions.
16. **TradeRecord:** exactly one TradeEngine record is linked to negotiation ID, revision ID and every participant's decision ID. It keeps canonical movements, retention IDs and created exception IDs.
17. **PlayerTransactions:** TradeEngine creates one `traded` transaction per moved player with source/destination teams, date, preserved ContractId and the source TradeRecord ID. GameWorld checks each transaction against the completed movement.

### 18–25. Atomic completion and lifecycle

18. **Cash:** cash settlement remains unavailable. TradeEngine validation blocks it; no non-cash subset is committed.
19. **Atomicity:** `completeAgreedTrade` calls TradeEngine once on the input world, then stages linked record, executed negotiation and all participant Governance EXECUTED events in immutable local worlds. Any exception or mandatory validation failure returns the unchanged input world. The approval event that triggered a blocked attempt remains in the returned approved world.
20. **Effect validation:** GameWorld rejects `PLAYER_TRADE_COMMITMENT` EXECUTED evidence unless the exact negotiation/revision is completed, the TradeRecord links all parties/decisions, all participant execution events exist, and moved assets, contracts, transactions, retained obligations and exception references match the agreement.
21. **Terminal state:** successful execution sets the negotiation to `EXECUTED`, with completion date, TradeRecord ID and decision IDs by team. Revisions and negotiation action history are preserved.
22. **Idempotency:** exact retry returns `ALREADY_EXECUTED` and the same world object. A different expected revision conflicts. Deterministic engine IDs and terminal state prevent duplicate records, player transactions, retention, exceptions and execution events.
23. **Event-driven retry:** recording a final real approval tries only that negotiation/revision. If another blocker remains, approvals stay recorded and no EXECUTED event is emitted. There is no daily polling loop.
24. **Multi-team:** readiness, decisions and completion maps iterate all persisted participants. The initial negotiation UI still supports its prior two-team initiation flow.
25. **Planning and market boundaries:** after the completed world validates, `reviewMaterialRosterChanges` reevaluates affected clubs. Trade execution does not reveal MarketKnowledge, use MarketReality, add fairness/value scores or implement transfer/buyout routes.

### 26–30. User interface and validation

26. **User behavior:** Trade Center exposes commitment initiation for the user's controlled club and approval buttons only for currently appointed user-coach bodies with approval rights. Final user approval can trigger execution when all other clubs are ready.
27. **Other participants:** another club's approval remains pending until its own real authorized event arrives. The user UI cannot impersonate another club's Governance actor or directly call TradeEngine.
28. **Breakpoints:** existing response breakpoints remain limited to live PROPOSED/COUNTERED negotiations. No ACTION_REQUIRED item is created for an agreed package when no real user Governance action is available.
29. **Focused verification:** 104 tests passed across nine focused files after the added execution path; executed negotiations and linked Governance evidence round-trip through Save V3. Save V2 rejects executed negotiations because that legacy layer does not store Governance state. The selected files cover trade negotiation, TradeEngine, Governance signing conventions, responsibility, contract/roster lifecycle, planning review and Save V3. `npm run typecheck` passes. `npm run build` passes; Vite reports the existing large-chunk advisory.
30. **BS10E convergence state:** BS10E-A package intelligence, BS10E-B execution semantics, BS10E-C negotiation and this milestone's bilateral Governance execution now converge on one canonical TradeEngine movement path. No full-suite or long-horizon simulation was run, per the milestone test policy.

## Findings

**P0:** None found in this milestone's focused scope.

**P1:** Generated worlds do not configure club Governance institutions and the application has no general AI Governance approval scheduler. Such clubs remain blocked until real institutional actors, rights and approvals are configured; the service intentionally does not synthesize authority. UI approval controls are limited to the current user coach's valid appointments.

## Recommended closure

Run one BS10E convergence/closure review across A–D, confirming the archived C baseline, the cross-stage trade invariants and Save compatibility. Keep transfer/buyout and broader AI Governance simulation as separate future scopes.
