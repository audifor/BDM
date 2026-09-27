# BS2 Simulation Breakpoint Engine

## Contract

`evaluateSimulationBreakpoints(world, context)` is the read-only projection that answers whether an application command may advance simulation time. It reads canonical GameWorld subsystem records, normalizes attention candidates, sorts them, and reports the winning candidate plus the complete ordered candidate list. It does not write back to the world, persist duplicate state, or decide any subsystem's expiry policy.

| Level | Advancement effect |
|---|---|
| `BACKGROUND` | May advance; routine subsystem work |
| `INFO` | May advance; informational |
| `IMPORTANT` | May advance; prominent information |
| `ACTION_REQUIRED` | Stops before the relevant user-owned decision or transition |
| `BLOCKING` | Stops before a known unsafe or unsupported transition |

The result carries `level`, `reason`, `sourceKind`, `sourceId`, effective date, optional deadline, ownership, route/action target where a current workspace exists, a diagnostic, and a stable `orderingKey`. `mayAdvance` is false when an unhandled `ACTION_REQUIRED` or `BLOCKING` candidate exists. Extra application diagnostics may be supplied through context without becoming persisted state.

## Integrated canonical sources

- A scheduled game today for the team coached by `userCoachId` is `ACTION_REQUIRED`; the match workspace remains its action target.
- The first unselected pick in an in-progress Draft is `ACTION_REQUIRED` when its current owner is the user's team. AI progression remains owned by DraftEngine and never picks for the user.
- Pending media opportunities for the user coach are `ACTION_REQUIRED`. The record has no expiry/default response; response or skip remains the canonical resolution.
- Pending coach job offers whose `coachId` is `userCoachId` are `ACTION_REQUIRED`. Coach Career owns accept/decline, and its offer has no expiry field.
- Market negotiations for the user's team organization project `OPEN` as `INFO` (waiting on an external player response) and `COUNTERED` as `ACTION_REQUIRED` (the user organization must answer). Negotiations have no expiry. The current market workspace has no response command/detail flow for this model yet, so the blocker is surfaced with its negotiation ID until a later Market milestone provides its resolver.
- A Governance request addressed directly to the user coach is `ACTION_REQUIRED`; its existing `dueOn` is exposed as the deadline. The Governance lifecycle records overdue status but does not auto-resolve it.
- A pending Governance decision is `ACTION_REQUIRED` only when a missing approval belongs to a body with an active appointment for the user coach and canonical decision rights grant that body approval authority.
- A completed competition with no supported future-edition lifecycle is `BLOCKING`, using the existing lifecycle capability classification. A scheduled Game dated before `currentDate` is also `BLOCKING` before a day transition.
- Continue's existing completed-primary-season checkpoint is projected as `ACTION_REQUIRED`. Simulate Until Date may acknowledge this one lifecycle checkpoint while applying the existing supported season rollover behavior; it cannot acknowledge a user game, media, Draft, Governance, or offer decision.

The low-level `advanceGameDay` boundary calls the evaluator before simulating today's remaining games or changing the date. It throws `SimulationAdvanceBlockedError` with the structured evaluation when an unresolved blocking candidate remains. `simulateRemainingGamesToday` shares the same check. The direct Advance Day command explicitly retains its existing quick-simulation behavior for a user game; Continue and Simulate Until Date stop on that same `ACTION_REQUIRED` candidate and require a separate match action. Simulate Until Date's other explicit acknowledgement is its existing season-completion path.

## Ordering and diagnostics

Candidates sort by severity (`BLOCKING`, `ACTION_REQUIRED`, `IMPORTANT`, `INFO`, `BACKGROUND`), then the earliest effective date (or deadline when no effective date exists), earliest deadline, stable `sourceKind`, and stable `sourceId`. The key is a serialized form of those fields; array iteration order does not affect the winner. The returned `candidates` list and winning `breakpoint` expose the diagnostic and subsystem source for focused tests and future debug surfaces.

## Flow behavior

- **Continue:** calls the evaluator and stops on the same highest action-required/blocking candidate. Existing `userGame`, `mediaOpportunity`, and `seasonComplete` stop names are retained; other sources return a structured `breakpoint` stop. The existing system bar routes user games, media, Draft picks and coach offers to their available workspaces; Governance targets remain data-only because there is no Governance workspace yet.
- **Advance Day / World DB day:** route through `advanceGameDay`; unresolved Draft, Governance, media, offer, market-counter, lifecycle and schedule-integrity candidates block before today's games are simulated. A direct day command explicitly keeps its legacy quick-simulation behavior for today's user game. World DB still owns fixture materialization; MatchEngine and CalendarEngine are unchanged.
- **Simulate Until Date:** checks the canonical stop before lifecycle changes or a day transition. It now returns at unresolved user games and media opportunities instead of silently instant-resolving/skipping them. It retains automatic supported season rollovers and returns the same structured breakpoint as Continue for an interruption.
- **Save/load:** candidates are rebuilt from canonical persisted source collections. They are not serialized independently.

## Documented but not integrable as user-owned breakpoints yet

- Trade proposals are transient `TradeProposal` command inputs; persisted trade history contains completed trades only.
- There is no durable free-agent contract offer-response record beyond `ContractNegotiation`. User-owned counteroffers are integrated, but their canonical response command and Market detail UI are missing.
- Recruiting offers and commitments resolve through the recruiting cycle; no incoming response addressed to the user coach exists.
- Staff offers, career requests, scouting assignments, training sessions, injuries, eligibility records, Finance recommendations, Facilities projects, and ownership proposals have canonical lifecycle records, but the current architecture does not assign an unresolved approval/response in those records to `userCoachId`. Linked Governance requests/approvals are covered when their canonical actor/appointment proves user ownership.
- Board state is an objective/evaluation projection rather than a durable approval queue.
- A roster/registration failure may make a particular match unplayable, but no single durable user-owned decision record or pre-match diagnostic is exposed to the evaluator today. This remains a P1 integration gap.

## Remaining work

- **BS1:** define ordered day-phase transaction boundaries, return structured status from direct UI advance commands, and surface route metadata for non-match interruptions without moving decision authority out of the owning systems.
- **BS3:** extend source coverage only when a subsystem has a durable, attributable response lifecycle; add debug UI using the existing candidate list.
- **BS4:** add domain-specific market, roster, registration, medical and finance workflows only when their product lifecycle and user ownership are decided. Do not synthesize approval records in the breakpoint layer.
