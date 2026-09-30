# BS10E-C Trade Negotiation Lifecycle

## Delivered

Added a canonical `TradeNegotiation` collection that is separate from the ephemeral `TradeProposal` command and completed `TradeRecord` history. It stores a pursuit identity, participant clubs, status, an exact current revision, append-only package revisions, active player contract snapshots, and attributed actions with team, actor and date.

The application service validates each proposal, counter and acceptance against current season/ecosystem, current trade rules, the open window, assets and contracts. It rejects cash with `CASH_SETTLEMENT_UNAVAILABLE`. Revisions retain multi-asset movements, retention and exceptions. The current production initiation path is limited to two teams; the domain state and all-participant acceptance rule support N teams.

Each action independently resolves its club authority. USER actions are limited to the current coach-controlled team. STAFF actions require that club's own current eligible delegated `negotiatePlayerTrade` holder. Rejections and withdrawals are attributed terminal outcomes. Counters append to the same negotiation; prior acceptances remain historical but do not carry forward. AGREED is reached only after every participant accepts the exact current revision.

The store exposes only USER-scoped trade actions to the Trade Center. The screen can propose a validated package, inspect negotiation status, accept/reject incoming packages, withdraw its own package, and counter with the currently built package when it has the same participants. A pending incoming package with READY user response is `ACTION_REQUIRED`; unavailable AI responses are never presented as user decisions.

AI counterparty response readiness returns `MORE_INFORMATION_REQUIRED`. The audit found no truthful acceptance policy: synthetic player-evaluation priors are not a fairness model, and hidden global market truth is outside club knowledge. No automatic AI proposal or response caller was added.

Save V2 market runtime now carries optional `tradeNegotiations`. Old payloads missing that field load an empty collection. V3/V4 inherit the V2 payload; the schema version is unchanged.

## Explicit non-effects

This milestone never calls `executeTrade`. Proposing, countering, accepting, rejecting, withdrawing or agreeing does not move rosters, contracts, picks or rights; settle cash; create retained salary or mutate exceptions; write TradeRecord or PlayerTransaction history; or create/execute Governance decisions.

`AGREED` retains the exact `negotiationId` and `currentRevisionId` for a future independent authorization boundary. BS10E-D still needs bilateral `PLAYER_TRADE_COMMITMENT` Governance, exact-revision validation, all-package revalidation and atomic execution across all involved assets and histories. Cash must remain unsupported until ledger settlement can join that transaction.

## Validation performed

- Focused lifecycle, package intelligence, responsibility, trade engine, Save V2 and breakpoint tests: 7 files, 80 tests passed.
- Typecheck passed.
- Production build passed. Vite reported the existing large-chunk advisory.
- No full test suite or long-horizon simulation was run, per milestone policy.
