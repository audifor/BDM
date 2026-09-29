# BS10D-B Canonical Free-Agent Contact

## Decision and mutation authority

BS10D-B creates only one state: a canonical, term-free `ContractNegotiation` with `status: 'CONTACTED'`. The Domain constructor produces the record; `MarketEngine.createNegotiationContact` is the only new GameWorld mutation. The explicit Application use case `initiatePreferredFreeAgentContact` recomputes current state before it calls the Engine.

The Engine validates organization/team identity, player existence and current free-agent status, current date, non-empty action and source IDs, actor authority, and active team/player uniqueness. A user actor is accepted only for the user-controlled team. A staff actor is accepted only when it is the exact live eligible holder of delegated `initiateNegotiationContact` responsibility.

## Live revalidation chain

The Application service uses the expected proposal ID only to identify the user's intended row. It rebuilds the current routed GM workflow, BS10A candidate intelligence, BS10B feasibility, BS10C proposal, A3 contact authority, and A3 attempt key from the current `GameWorld`. Mutation stops with a structured result when the proposal is no longer current, the plan is stale, the candidate is no longer eligible, authority is unavailable, or another active negotiation exists.

The current plan must still be an external-acquisition plan for the current team and need; the current BS10C preferred candidate and proposal must match the selected row. The Engine independently repeats the facts within its boundary that do not depend on the broader Application pipeline.

## Persisted contact record

The sole persistent state is the existing negotiation record. A new contact carries:

- organization, team, and player IDs;
- current `startedOn` date;
- the exact A3 `actionKey` verbatim and its canonical composite `openingKey`;
- source plan and proposal IDs;
- the truthful responsible actor.

The `CONTACTED` variant has no salary, years, role, agent fee, or offer round. It does not create a Contract, PlayerTransaction, role promise, roster change, Finance proposal, Governance request or decision, market signal, or MarketKnowledge update. No response is inferred; BS10D-C owns contact responses and expectations.

## Actor, authority, and retry behavior

For a user club, the explicit Application path records `{ kind: 'USER' }`. The user path is not called by AI lifecycle or calendar simulation. No action control is added in this milestone.

For an AI club, contact occurs only at an existing planning checkpoint and only if the club already has a valid delegated contact responsibility with a live eligible staff assignment. The record identifies the exact StaffPerson ID, not a title. BS10D-B never creates or changes responsibility rows. AI clubs without delegated authority remain unable to act; this is a P1 configuration gap.

An exact replay returns `ALREADY_EXISTS` and the same unchanged `GameWorld`. A different action key while a contact, open offer, or counter is active for the team/player returns an active-negotiation result. Closed records remain unchanged and do not block a new A3-derived key.

## Lifecycle and observability

AI contact is attempted after plans are reviewed at the existing setup, preseason, explicit review, material roster, major injury, and contract-change checkpoints. Career initialization uses the existing AI planning initializer. No daily market polling or new breakpoint is introduced. Autonomous AI contact requires no user intervention, so it does not create an `ACTION_REQUIRED` breakpoint.

The Analysis view now shows a canonical contact's status, date, actor name, whether the active attempt matches the current plan/proposal, and that a formal offer has not been submitted. It adds no offer controls.

Save V2 already serializes and validates the existing negotiations collection, including the term-free `CONTACTED` branch. No parallel contact state, new save schema, or migration is needed. The repository has no contact event stream; `ContractNegotiation` remains the source of truth.

## Boundaries and findings

`maintainAiTeamMinimumRosters` remains a separate emergency repair path with its prior ambiguity; BS10D-B neither changes it nor routes ordinary market contact through it. Formal-offer authority, Governance, salary/term/role/fee selection, responses, and signing remain outside this milestone.

- **P0:** none found in the implemented contact path.
- **P1:** AI clubs without explicitly delegated contact authority cannot contact; responsibility is not auto-assigned.
- **P1:** formal-offer and signing authorities remain unresolved and are not implied by contact.
- **P1:** minimum-roster direct-sign repair remains a separate behavior for future audit.

## Focused verification

Focused tests cover Engine validation, user and delegated actor truth, term-free creation, action-key persistence, same-key idempotency, active-key conflicts, closed history, live proposal/plan/authority/free-agent rechecks, AI checkpoint creation and retry, and user non-autonomy. BS10D-B does not run the full test suite or long-horizon simulation.
