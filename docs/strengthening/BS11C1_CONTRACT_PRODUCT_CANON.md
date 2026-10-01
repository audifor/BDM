# BS11C1 · Contract Product Canon & Terms Architecture

**Status:** architecture/product audit; no production behavior changed
**Base:** `5b060a5d2683e68ddc80af164d1b3ca009f4919c`
**Scope:** contract product decisions and implementation boundaries before BS11C2+

This document separates approved product rules from current implementation,
recommendations, unresolved product decisions, and deferred features. A
recommendation is not a product decision. Unresolved items in
[the decision register](BS11C1_PRODUCT_DECISIONS_REQUIRED.md) must not be
implemented by inference.

## 1. Approved product rules

These are binding for later milestones:

- Support team, player, and mutual options. Each has an explicit holder,
  covered period, decision window/deadline, pending/exercised/declined state,
  deterministic lifecycle, and history/evidence. Declining an option is not a
  release.
- Support evidence-verifiable contractual incentives through typed,
  extensible conditions. A condition is allowed only when BDM has a canonical
  evidence source. Do not add dozens of unrelated fields to `PlayerContract`.
- Support typed no-trade, player trade-consent, trade-kicker, buyout, release,
  and deterministic conditional clauses. No arbitrary script/eval engine.
- Competition conditions may use only outcomes with canonical BDM authority;
  do not infer unsupported competition events.
- `RolePromise` remains distinct from salary, options, and contract lifecycle.
  Breach may affect morale, relationships, future negotiation, retention
  willingness, and player/agent reaction. Breach does not terminate a contract;
  a contractual exit right requires an explicit approved clause.
- Agent fees are real negotiation/financial effects and their model must
  represent a fee payer (`CLUB`, `PLAYER`, or a safely supported split). The
  settlement/accounting rule is not yet selected.
- Historical `PlayerContract` terms must not be retroactively rewritten to
  simulate renewal. Product preference is a new contractual record with an
  explicit effective date.
- Future behavior must be deterministic, serializable, inspectable, and
  evidence-backed; preserve existing authority boundaries and Save V4
  compatibility. BS11C1 itself changes documentation only.

## 2. Existing canonical implementation

### Contract and roster

`PlayerContract` currently has `id`, `playerId`, `teamId`, `kind: 'standard'`,
`term.startsOn`, exclusive `term.expiresOn`, compensation (`annualSalary` and
optional per-year `cashSalary`, `capHit`, `guaranteedAmount`), and optional
termination (`terminatedOn`, reason `released`). Status is derived as
scheduled/active/expired/terminated. There are no extension links, options,
clauses, incentives, guarantee dates, or bonus fields. Per-year compensation
validates guaranteed amount not exceeding cash salary; compensation fallback
uses annual salary for all three values.

BS11A contract-roster planning is derived and read-only. BS11B persists a
nonbinding user review intent (`PURSUE_EXTENSION`, `ALLOW_EXPIRY`,
`REVIEW_RELEASE`, `DEFER`); it does not negotiate or mutate a contract. BS11C0
certifies the execution precondition:

```text
assessActiveContractRosterIntegrity(...) === 'VALID'
```

Before any extension/successor execution, revalidate that condition and that
the exact selected `ContractId` is still the unique active contract. The
scheduled-contract activation/roster-arrival gap is a P1 handoff: repair is
recovery, never ordinary execution.

### Compensation, finance, and salary

`ContractFinancialSchedule` derives annual periods from contract dates. It
splits each year's cash salary into the guaranteed amount and the remaining
conditional exposure. That `CONDITIONAL` label has no condition trigger. The
current contract has no payment dates or currency; materialization requires an
explicit currency and `ON_RECOGNITION` due-date policy. Recognition creates
Finance events/obligations. Finance V2 owns organizational cash, ledger,
recognition, and payables; it is not the cap authority.

Salary Engine owns season-scoped cap/floor/tax/apron/min-max/exception and
trade-matching rules. Payroll cap hit is derived from active contract `capHit`
plus separately modeled dead money and retained salary. These values must not
be merged with cash salary, guaranteed amount, Club cash, or legacy budget.
Salary exceptions are separate season obligations. `DeadMoneyCharge` and
`RetainedSalaryObligation` are separate types and authorities.

### Market, agents, Governance, and history

Reuse `Agent`, `Agency`, `PlayerRepresentation`, `MarketKnowledge`, negotiation
rounds/term sets, and current actor/responsibility patterns. Player
representation is canonical; market knowledge is organization-scoped and
distinct from hidden `MarketReality`. Free-agent response logic uses hidden
player willingness in a free-agent-specific pathway and is not directly
reusable as a retention decision without explicit privacy and lifecycle
adaptation. Current term sets include salary, years, optional role, and
optional agent fee. Current free-agent signing charges a positive agent fee to
the club via a Finance commitment due on signing.

`PLAYER_CONTRACT_SIGNING` Governance and authorized signing execution exist for
free-agent signing. BS11B review intent does not require Governance. There is
no extension-specific actor responsibility or AI review owner: BS11B fails
closed for AI ownership. Do not infer a new owner from recommendation or
signing responsibilities.

`RolePromise` is stored separately from contract compensation; accepted
free-agent signing can create an ACTIVE promise. FULFILLED/BROKEN statuses
exist, but this audit found no lifecycle evaluator or transition path. Observed
role should come from existing lineup/rotation/game evidence, not a second
playing-role authority.

`PlayerTransaction` currently represents contract expiry, release, free-agent
signing, and trade. It records player lifecycle/movement and should not become
a general contract-term event log. Trade preserves contract identity/terms
while updating team affiliation for active contracts. Trade has no no-trade,
consent, or kicker behavior. Retained salary is represented separately.

### Evidence and persistence

`MatchStatLog` supplies canonical game/player/team/competition/date evidence,
including started flag, seconds played, and box-score statistics. Competition
rules/postseason and promotion/relegation engines provide bounded authority for
configured standings, titles, postseason, and tier movement. Only an outcome
actually produced by the relevant configured competition authority may trigger
a term. There is no comprehensive awards authority; awards incentives remain
deferred. Qualification to another competition is usable only where a
canonical configured rule/result exists.

GameWorld Save V4 persists contracts and related market/world records. Any
future additive term needs explicit backward-compatible defaults and
deterministic identity. Derived schedule, status, and condition results should
not be persisted unless a source-of-truth event/history requires it. BS11C1
does not change the schema.

### Capability disposition

| Concept | Disposition | Boundary |
|---|---|---|
| Existing contract dates/status and compensation | REUSE | `PlayerContract`; preserve exclusive end semantics |
| Roster planning/review intent | REUSE | BS11A/BS11B remain projections/intents, not execution |
| BS11C0 integrity guard | REUSE | mandatory immediately before successor execution |
| Salary legality, cap hit, exceptions | REUSE / EXTEND | Salary Engine and season rules remain cap authority |
| Finance schedule/recognition | REUSE / EXTEND | explicit typed consequence adapters; do not treat conditional remainder as a trigger |
| Free-agent negotiation | REUSE / EXTEND | share term/round mechanics; specialize retention eligibility and execution |
| Agents/agency/representation/knowledge | REUSE / EXTEND | no AgentV2; preserve information boundaries |
| Governance signing flow | REUSE / EXTEND | exact extension approval subject/timing must be specified |
| Trade and retained salary | REUSE / EXTEND | add typed clause validation only after product/accounting decisions |
| PlayerTransaction | REUSE | only movement/lifecycle events; do not overload |
| Contract options, typed incentives, clauses, guarantee lifecycle | NEW | approved capability families; unresolved rules remain gated |
| Contract-specific immutable evidence history | NEW (recommended) | narrow typed ContractEvent; product/data shape needs approval |
| Extension/renewal negotiation and successor record | NEW | no current execution workflow |
| Award-based conditions / AI retention authority | DEFER | canonical authority/actor not present |
| Arbitrary clause scripting / generic legal DSL | NOT APPLICABLE | explicitly outside the approved architecture |

## 3. Extension and renewal semantics

**Extension (approved semantic):** negotiated and agreed while a current
contract is active; it establishes future employment without rewriting the
current contract's historical terms.

**Renewal (approved semantic):** agreement that establishes continued
employment after the current term. It also preserves the old record.

**Architecture recommendation:** share negotiation round, counteroffer,
term-set, deadline, and actor mechanics where their semantics match; use a
specialized retention workflow for current-contract eligibility, exact active
contract revalidation, and successor creation. Both should produce the same
kind of linked successor `PlayerContract`; distinguish extension vs renewal
in a typed agreement/event reason if that distinction is needed for history.
Do not make free-agent availability checks stand in for retention checks.

The exact eligibility windows, date relationship, and any competition-specific
limits remain product decisions. Existing end dates are exclusive. A
recommended continuity date is successor `startsOn == predecessor.expiresOn`,
but this must be approved with the overlap/gap policy before implementation.

## 4. Successor lifecycle recommendation

Recommended sequence:

1. Review intent remains nonbinding. Open a specialized retention negotiation
   only under an approved eligibility rule.
2. On agreement, retain an immutable negotiated term set and negotiation
   history. Agreement alone is not a binding contract or roster mutation.
3. Obtain the required current Governance approval and authorized execution.
   Immediately before execution, require roster integrity `VALID` and confirm
   the exact selected predecessor ID remains the unique active contract.
4. Create one immutable successor contract with explicit dates and a typed
   predecessor link; keep it scheduled until its effective date. Reject or
   block conflicting activation rather than silently choosing a winner.
5. At the effective date, a deterministic lifecycle boundary validates the
   predecessor is no longer active, successor uniqueness and team/player
   consistency, then atomically resolves contract status, roster continuity,
   derived finance schedule, and a history event. If validation fails, return a
   blocking diagnostic and leave state unchanged. Retry is idempotent by
   stable event/operation identity.
6. Preserve both historical contract records and all negotiation, Governance,
   and Finance evidence. Repair is a separate recovery path.

**Recommended constraints, pending approval:** one scheduled successor per
predecessor; no active-term overlap; continuity at the exclusive end date;
explicitly invalidate/cancel or require a new decision if release, termination,
trade, or other affiliation change occurs before activation. Whether a player
may have multiple future agreements or transfer a successor is unresolved.
Roster arrival needs an explicit ordinary lifecycle event because date-derived
activation alone does not create the roster entry (BS11C0 P1).

## 5. Term architecture recommendations

Keep `PlayerContract` as core identity, parties, term, and base compensation.
Use typed, contract-linked structures rather than an expanding switch or
arbitrary JSON blob:

- `ContractOption`: holder(s), covered period, deadline/window, pre-agreed
  terms, state and decision evidence.
- `ContractCondition`/incentive: typed evidence source, metric/event,
  comparator, threshold, evaluation window, and one of the approved
  consequences. Evaluation is deterministic and idempotent; store the evidence
  and result in history.
- Typed guarantee terms/events for amount, guarantee date or condition, vesting
  resolution, and downstream financial/cap effects.
- Typed clause records for no-trade, consent, kicker, buyout, release rights,
  and other explicitly approved semantics. No arbitrary interpreter.
- A narrow `ContractEvent` history for agreement/execution/activation,
  option/guarantee/incentive/clause resolution, and supersession. Link to
  negotiation, Governance, Finance, Trade, and source evidence IDs. Do not
  encode these non-movement facts as `PlayerTransaction`.

Existing free-agent term sets should be extended through typed optional terms
or a bounded typed contract term collection so every negotiation service and
UI does not need an unrelated field switch. Exact wire shape and versioning are
technical design choices only after the product questions are resolved.

### Guarantees and incentives

Preserve existing per-year `guaranteedAmount`. Add a guarantee-on date or
canonical vesting condition only through an explicit rule-aware typed term;
record vesting evidence once. Finance must recognize only obligations under an
approved due-date policy. Salary Engine must determine guarantee/cap treatment
under the competition's rules; do not assume a universal NBA rule or infer
dead-money creation. Release/termination effect requires an explicit mapping
to supported Salary and Finance authorities.

Condition sources can include player appearances, starts, seconds/minutes, and
canonical stat-log metrics; supported team results, standings, postseason,
title, promotion/relegation, and configured qualification outputs. Evaluation
window and aggregation semantics need to be explicit. Awards conditions remain
DEFERRED until an awards authority exists.

Approved consequence families are one-time cash bonus, next-year salary
escalation, next-year salary reduction, or guarantee vesting. Finance owns cash
and ledger recognition; Salary Engine owns cap/legal treatment; contract terms
own entitlement and evidence. An explicit integration boundary must connect
them. No consequence is payable merely because a derived `CONDITIONAL` schedule
entry exists.

### Options

All three approved option families require holder(s), exact covered
year/period, a decision window/deadline, explicit pending/exercised/declined
states, deterministic deadline resolution, decision ownership, inspectable
evidence, and history. Terms/guarantees for the option period must be known
before exercise. Decline is not release.

**Recommendation:** exercise should materialize a linked scheduled successor
record with pre-agreed optional-year terms. This preserves historical
contract-term identity and works with date-derived status/Finance schedules.
The product must still choose the identity model and missed-deadline default.

- **Team option:** club/authorized team actor holds the decision. The owner,
  AI authority, and default must be defined; a human decision should surface
  before a hard deadline.
- **Player option:** player holds the decision, with a defined player/agent
  decision actor and information constraints; the club cannot exercise it.
- **Mutual option:** both sides must give affirmative response under an
  approved order/window. Neither silence nor one-sided exercise should be
  treated as assent without an approved default.

Option outcome determines successor/continuation and roster effects only under
an approved lifecycle; Finance and Salary Engine consume the resulting typed
terms. Decline does not invoke `releasePlayer`.

### Clauses and trade

- **No-trade:** a typed movement prohibition. Trade validation checks the
  clause before Governance/execution. Any waiver is an explicit, authorized,
  recorded action under the approved holder rule.
- **Trade consent:** separate affirmative consent for the exact trade proposal
  revision. Pending consent blocks execution; changing the proposal invalidates
  prior consent. No-response/default, player/agent actor, and Governance
  interaction need decisions.
- **Trade kicker:** a separately triggered contractual entitlement. Existing
  Trade Engine and Salary Engine do not define whether it changes cash salary,
  cap hit, or both, and Finance does not currently derive such a payment.
  Require an explicit accounting/rule decision and typed integration before
  implementation.
- **Buyout:** a negotiated/contract-defined exit with explicit holder,
  trigger, amount, payer/payee, effective date, and Finance/Salary effects.
  Finance event category names alone do not implement this feature.
- **Release clause:** an explicit holder's right under typed trigger/amount and
  consequences. It is distinct from current unilateral `releasePlayer` and
  from buyout. Do not silently change existing release semantics.

Trade Engine remains the movement authority. It must validate clause/consent
before changing roster, contract affiliation, transaction, and TradeRecord.
Governance should authorize the actual decision where existing policy requires
it, without duplicating trade execution authority.

### RolePromise, agents, and player decisions

Keep promise terms separate from contract money/options. Promise is the agreed
role; observed role is derived from canonical lineup/rotation and match evidence;
fulfillment/at-risk/breach is a future projection/resolution, not another
playing-role authority. Existing starts, minutes, and roster role evidence can
inform evaluation, but thresholds, observation windows, and status transition
rules are unresolved. Any downstream morale/relationship/negotiation/agent
effect must be approved and must not terminate the contract absent an explicit
exit clause.

Reuse Agent/Agency/representation, MarketKnowledge, abilities/personality,
negotiation rounds, and actor boundaries. Future specialized retention actors
may make opening demands, counters, acceptance/rejection, patience, role,
economic, clause, and option demands only from authorized information.
Organization-specific knowledge must not be replaced by hidden universal
MarketReality or hidden PlayerTruth. Player decision factors can include
approved financial, role, opportunity, team, relationship, morale, career,
agent, and canonical ecosystem context; weights and geographic inputs remain
unresolved. Do not use arbitrary random acceptance.

BS10 free-agent negotiation is reusable for generic rounds/term exchange and
idempotent actions, but its free-agent eligibility, hidden willingness path,
signing side effects, and club-only fee settlement are specialized. Reuse those
only behind explicit retention checks and approved term/accounting rules.

## 6. Finance mapping

| Term | Cash effect | Cap effect | Guarantee effect | Ledger effect | Timing | Authority |
|---|---|---|---|---|---|---|
| Salary | Annual cash salary source | `capHit` under season rules | `guaranteedAmount` source | Current derived schedule and explicit Finance recognition | Annual period; due date is not in contract | Contract + Finance schedule; Salary Engine |
| Signing bonus | No current contract field | No current rule mapping | Whether guaranteed is unresolved | Finance commitment/recognition path must be specified | Trigger/date unresolved | PRODUCT/ARCHITECTURE DECISION REQUIRED |
| Performance bonus | Approved one-time cash consequence only | Rule-specific treatment unresolved | May vest guarantee only when explicitly typed | Finance recognition after evidence resolution | Evaluation/payment date unresolved | Finance + condition resolver + Salary Engine |
| Guaranteed amount | Included in yearly salary cash model | Cap treatment remains Salary Engine rule | Existing guaranteed amount; no vest date | Current schedule recognizes guaranteed amount under explicit policy | Annual effective date; due-on null until materialized | Contract + Finance + Salary Engine |
| Guarantee vesting | No new cash separate from underlying amount unless rule says | Rule-specific | Changes guaranteed entitlement on typed date/condition | Must create an idempotent recognition/obligation effect under policy | Vest event/date | Contract event + Finance + Salary Engine |
| Trade kicker | Not modeled | Not defined by Trade/Salary | No current guarantee representation | No current derived payment | On qualifying trade if approved | PRODUCT/ARCHITECTURE DECISION REQUIRED |
| Buyout | Payment is part of approved exit terms | Dead-money/cap treatment unresolved | Settlement effect unresolved | Finance event type name exists; no PlayerContract producer | Approved exit date/payment schedule | Contract + Finance + Salary Engine; decision required |
| Agent fee | Current free-agent signing charges club | No cap treatment stated here | Not a player salary guarantee | Club FinancialCommitment, due on signing | Signing | Existing signing path; payer extensions require decision |
| Retained salary | Trade-specific cash effects not inferred from cap type | Separate retained-salary cap obligation | Not the contract guarantee field | Trade path does not define equivalent cash posting | Trade/season rule | Trade + Salary Engine; Finance relationship unresolved |
| Dead money | Cash effects not inferred from cap type | Separate `DeadMoneyCharge` in payroll | Separate from current guarantee field | No automatic Finance equivalence established | Rule/source date | Salary Engine; Finance relationship unresolved |

Do not equate legacy budget, cash salary, cap hit, guaranteed amount, retained
salary, dead money, or cash ledger entries.

## 7. Governance, breakpoints, history, persistence, and UI

**Governance:** review intent and negotiation are nonbinding. A binding
commitment may use existing `PLAYER_CONTRACT_SIGNING`; define its exact
agreement subject, approval timing/expiry, rejection behavior, and execution
revalidation before implementing successor execution. Approval must precede
the atomic execution. Do not create GovernanceV3.

**Breakpoints:** reuse `SimulationBreakpoints`. An owned, imminent option or
consent decision can be ACTION_REQUIRED; routine review horizons/counters stay
IMPORTANT or INFO according to the existing policy. Governance requests use
existing severity. An integrity/activation conflict is BLOCKING. A deadline
must not be elevated for an actor who has no decision authority. Mutual options
need separate visibility for each holder and a defined window before severity
can be fixed.

**History:** negotiation rounds remain negotiation history; approval/rejection
remains Governance history; cash recognition remains Finance history; player
movement remains `PlayerTransaction`; trade remains `TradeRecord`. Add a narrow
typed `ContractEvent` for contract-term decisions and lifecycle evidence, with
stable idempotency and references to those authorities. Events include
agreement/execution/activation/supersession, option decision, guarantee vest,
bonus earned, clause/consent/waiver, and buyout. Do not duplicate monetary
ledger facts in contract history.

**Save:** retain V4 compatibility. Prefer optional additive typed fields with
explicit migration defaults; introduce a version migration only if shape or
invariants require it. Derive status, schedules, and unresolved condition
projections from source data; persist immutable evidence/outcomes when needed
for replay/audit. IDs must be deterministic and collision-safe. No Save change
in this milestone.

**UI information architecture (future Contract Hub, not built here):**

- Player contract view: status/dates/remaining term; yearly cash/cap/guarantee;
  options, clauses, incentives, agent, RolePromise; review/negotiation state;
  linked history.
- Club planning: expiring players, successors, reviews, negotiations, option
  and clause deadlines, future commitments, payroll/guaranteed commitments,
  continuity risk.
- Label every item as **VISIBLE FACT**, **ESTIMATE**, **PENDING DECISION**,
  **CONTRACTUAL RIGHT**, or **CONTRACTUAL OBLIGATION**. Keep estimates and
  player/agent hidden information out of canonical contract facts.

## 8. Unresolved and deferred items

See the decision register for questions, evidence, options, recommendations,
and impacts. The immediate BS11C2 gates are retention eligibility/date and
competition limits; successor overlap/uniqueness and invalidation; retry/cooldown;
and whether negotiations may propose agent fees under current club-only
settlement. These must be explicitly answered before the related behavior is
implemented. Options, guarantees, incentives, clauses, buyouts, kickers,
RolePromise consequences, and AI retention ownership are separately gated for
their dependent milestones.

Deferred: awards incentives until canonical awards authority exists; AI club
review/negotiation/execution until BS13 or an explicit authority decision;
unsupported competition qualifications; arbitrary legal scripting; any
automatic roster repair as ordinary activation.
