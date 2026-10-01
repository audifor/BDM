# BS11C · Contract Implementation Plan

**Planning status:** proposed sequence; no milestone is authorized to infer
open product rules from this plan. Each stage must reread the applicable
decisions in [BS11C1 Product Decisions Required](BS11C1_PRODUCT_DECISIONS_REQUIRED.md).

## Dependency order

| Milestone | Reused | New | Dependencies / product decisions | Focused test surface |
|---|---|---|---|---|
| **BS11C2 · Extension/renewal negotiation** | BS11A planning; BS11B review intent; BS10 negotiation rounds, term sets, counters, idempotency; Agent/Agency/MarketKnowledge; SalaryRules validation; existing Governance vocabulary | Specialized retention eligibility and negotiation workflow; typed extension/renewal reason; nonbinding successor proposal; cooldown/reopen policy only if approved | Decide eligibility windows, date rules, extension vs renewal identity, successor uniqueness/invalidation, cooldown, applicable competition limits, fee inclusion/payer, actor ownership, information boundary. Preserve mandatory BS11C0 revalidation for any execution. | Eligibility edges; exact active ID uniqueness; stale predecessor; term legality; counters/accept/reject/withdraw idempotency; cooldown; knowledge boundary; no contract/roster mutation before authorized execution |
| **BS11C3 · Options + guarantees** | `PlayerContract` dates/compensation; Finance schedule; Salary Engine; competition rules; typed history/event integration | Typed option and guarantee terms/states/events; deterministic deadline/vesting resolver; successor materialization for exercised options if approved | Decide option identity; holder/default/AI owner/mutual order; guarantee date/condition and termination effects; cap/Finance treatment; applicable ecosystem policies | Team/player/mutual authority; each state transition and missed deadline; guaranteed/conditional schedule; duplicate/retry; release/termination interactions; Save V4 migration |
| **BS11C4 · Bonuses + conditional terms** | MatchStatLog; player match stats; competition standings/postseason/title/promotion/relegation authorities; Finance and Salary adapters | Typed condition/evidence model; approved consequence integration; immutable result evidence | Decide aggregation/window, qualification authority, posting dates, cap treatment, escalation/reduction/vesting semantics. Awards remain deferred. | Source evidence and threshold boundaries; unsupported source rejection; idempotent resolution; season crossing; Finance recognition; cap/legal effect; save/reload |
| **BS11C5 · Clauses + consent + buyouts** | TradeEngine/TradeRecord; player representation; Governance; Finance; SalaryEngine; existing release path | Typed no-trade, consent, kicker, buyout, and release-clause terms and validation; proposal-revision consent evidence | Decide holders, waiver/consent authority/default, Governance, kicker accounting, buyout payer/payee/payment and cap/guarantee consequences. | Trade blocked before mutation; exact revision consent invalidation; waiver history; concurrent proposal/state; buyout atomicity; existing release regression; cap/cash mapping |
| **BS11C6 · Agent + RolePromise convergence** | Agent abilities/personality; representation; MarketKnowledge; RolePromise; starts/minutes/rotation evidence; morale/relationship systems | Approved actor model, promise observation evaluator, at-risk/breach evidence, approved consequence adapters | Decide AI/staff authority, player preference weights/knowledge, role thresholds/windows, agent authority, downstream effect limits. No automatic termination absent explicit clause. | Determinism; information access; role evidence windows; state transitions; morale/relationship idempotency; no contract termination; Save V4 |
| **BS11D · Authorized execution + successor activation** | BS11C0 integrity assessment; Governance `PLAYER_CONTRACT_SIGNING`; signing execution authority; contract status; roster; Finance schedule; event/idempotency patterns | Atomic successor execution and activation/arrival lifecycle; typed contract history; conflict diagnostic/recovery boundary | Resolve all binding successor, Governance, team-change invalidation, activation date, finance switch, and retry decisions. AI execution stays deferred until authority exists. | Valid roster precondition; exact ID still uniquely active; stale/concurrent execution; activation boundary; roster/finance continuity; all-or-nothing failure; deterministic retry; restart/save/load; repair not invoked on normal path |

## Sequencing notes

1. Keep negotiation nonbinding in C2. If C2 is limited to proposal and terms,
   it need not implement successor activation or resolve every later option
   and clause decision.
2. Establish a narrow typed ContractEvent/history and backward-compatible
   persistence design before the first durable new term. Avoid building a
   general scripting or legal-language framework.
3. Implement each financial consequence only alongside its explicit Finance
   and Salary authority mapping; do not create ledger postings from labels or
   derived schedule remainder.
4. Implement clause checks at the owning mutation boundary (especially before
   TradeEngine state changes), with the exact decision evidence tied to the
   operation revision.
5. BS11D owns binding execution/activation and the BS11C0 guard. Any earlier
   milestone that creates a binding record must move this boundary forward
   explicitly and carry the same integrity invariants.

## Persistent constraints for all stages

- Never retroactively mutate historical `PlayerContract` terms to represent a
  new agreement.
- Before successor execution require
  `assessActiveContractRosterIntegrity(...) === 'VALID'` and verify the exact
  selected `ContractId` is still the unique active contract.
- Scheduled date change alone is not roster arrival. Ordinary activation must
  be explicit and atomic; repair is recovery only.
- Keep Finance cash/ledger, Salary cap/legal calculations, contract
  entitlement, RolePromise, trade obligation, and player movement authorities
  distinct.
- Preserve deterministic behavior, stable event identity, Save V4
  compatibility, and user-approved information boundaries.
- Do not implement AI contract authority, awards conditions, unsupported
  competition triggers, or product decisions that remain open.
