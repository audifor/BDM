# BS10E-D Trade Governance and Execution Audit

## Scope and baseline

Reviewed the BS10E-C application negotiation service, persisted revision model, canonical TradeEngine, Governance decision lifecycle, responsibility assignments, TradeRecord and PlayerTransaction models, salary/retention handling, Save V2 round-trip coverage, Trade Center and GM planning checkpoint. The branch starts at archival commit `cc4f5fa75eedfbb60dc620f3542a5e1450743251`; the archive commit preserves the reviewed BS10E-C documents unchanged.

## Findings

1. **Exact binding subject.** `TradeNegotiation.currentRevisionId` identifies the only package a binding command may consume. Revisions include the participant set, movements, exception uses, retained salary and active player contract snapshots. Governance uses a generic subject encoding negotiation, revision and participant team, so each participant has distinct decision identity.
2. **Governance decision identity.** Stable IDs derive from `PLAYER_TRADE_COMMITMENT`, institution, negotiation, revision and team. Existing exact decisions are reused. A new revision produces a different subject and decision.
3. **Per-club proposal authority.** The Application service resolves current decision rights and requires a real active appointment to a proposer body. Negotiation and execution responsibilities do not confer Governance rights.
4. **Per-club approval authority.** Proposal-time required approver bodies are retained by the Governance model. Each approval/rejection/veto event is accepted only from a current appointee with the relevant right. One club’s event applies only to its institution’s decision.
5. **Per-club Governance execution.** Each participant decision requires its own current EXECUTE body and actual appointee. Execution events are appended together with the completed effect.
6. **Operational execution responsibility.** A user-controlled team resolves to explicit USER action. An AI team needs a current eligible delegated holder for `executePlayerTrade`; there is no automatic delegation and `negotiatePlayerTrade` is separate.
7. **Package reconstruction.** The Application boundary rebuilds an ephemeral `TradeProposal` directly from the persisted agreed revision. It does not accept caller-supplied terms or persist the proposal as a second source of truth.
8. **Stale revision behavior.** Non-AGREED states fail. A revision that is not current returns `STALE_PACKAGE`; an exact already-executed retry returns `ALREADY_EXECUTED`, while a different revision conflicts.
9. **Atomicity.** TradeEngine runs once on the original immutable world. The linked record, terminal negotiation and all participant EXECUTED events are applied to local immutable worlds; if validation fails, the service returns the unchanged input world. GM planning review is applied only after the whole result validates.
10. **Completed negotiation state.** Successful execution records `EXECUTED`, completion date, TradeRecord ID and decision IDs keyed by participant. Existing revision and action history remains intact.
11. **Idempotency.** The completed negotiation is the durable retry gate. Stable engine-derived IDs plus the terminal state prevent duplicate trades, transactions, obligations, exceptions or Governance events.
12. **Cash limitation.** TradeEngine already rejects cash settlement as unavailable. The Application path propagates that validation and returns no partial world.
13. **User flow.** Trade Center exposes a user team commitment start action and approval buttons only for currently appointed user-coach approver bodies. Other participants remain pending until their own configured Governance actions occur.
14. **AI flow.** AI Governance is not synthesized. A caller can initiate a decision only with an actual configured staff/external/coach appointment; an AI team also needs an eligible delegated operational executor. Missing institutional actors or delegation remains blocked.
15. **Multi-team implications.** Decision IDs and completion maps are keyed by participant team. The readiness projection and atomic barrier iterate the persisted participant list rather than assuming two teams. Negotiation initiation UI remains two-team as previously scoped.
16. **Exact convergence gap after execution.** Prior to this milestone, BS10E-C ended at AGREED, with no per-team commitment, executor validation, atomic execution boundary or canonical terminal negotiation linkage. BS10E-D closes that application gap by using TradeEngine and linking its effect to Governance evidence.

## Known limits

The Governance event schema records the authorized body and grant evidence, not the human or staff actor ID. The Application boundary validates the supplied actor against a current appointment when recording the action; persisted validation can independently verify body rights and grant evidence, consistent with existing Governance conventions. The general simulation does not create club Governance institutions by default, so those clubs remain truthfully unauthorized until configuration exists.
