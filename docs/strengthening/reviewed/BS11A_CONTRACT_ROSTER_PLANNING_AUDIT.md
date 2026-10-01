# BS11A Contract and Roster Planning Audit

## Scope and result

BS11A audits existing contract, roster, finance, strategy, market, planning, responsibility, and Governance authorities and establishes a read-only contract/roster projection. Contracts and roster membership remain canonical inputs. The projection is derived on request, is not persisted, and performs no contract or market action.

## Lifecycle and contract truth

1. **Contract lifecycle.** `PlayerContract` in `src/domain/contract/PlayerContract.ts` carries team, player, start and exclusive expiry dates, compensation, and contract kind. `getPlayerContractStatus` is the status authority. Daily lifecycle handling in `src/engine/market/ContractLifecycle.ts` reconciles expired contracts and records `contractExpired` transactions; season startup also reconciles. No BS11 lifecycle mutation was added.
2. **Expiry semantics.** A contract is scheduled before `startsOn`, active from `startsOn` through the day before `expiresOn`, and expired at `expiresOn`. A termination date makes it terminated. The planner evaluates these exact dates using `GameDate` and the contract status helper.
3. **Scheduled commitments.** A same-player, same-team contract that starts on or before an existing contract's exclusive expiry and runs beyond it is continuous future coverage. It suppresses a false unresolved expiry. A future contract for a player outside the current roster is reported as a scheduled arrival only at horizons where the contract is active.
4. **Release and non-renewal.** `releasePlayer` is an explicit release path for an active contract, with minimum roster/availability checks, lineup and roster updates, termination, and transaction history. There is no separate non-renewal action: a contract naturally expires and lifecycle reconciliation processes the roster transition. BS11A performs neither action.
5. **Renewal and extension.** No player contract renewal or extension service was found. Staff renewals are a separate workflow. BS11A does not create offers, terms, or salary demands.
6. **Roster truth.** `Team.rosterPlayerIds` is the current roster source of truth. Current roster count comes from that list; future retention and arrivals derive from canonical team contracts and their dates.
7. **Integrity.** `RosterContractIntegrity` repairs only when contract and transaction evidence support an unambiguous roster result; it fails closed on ambiguity. Planning does not repair or reconcile world state.

## Planning evidence

8. **Salary context.** Finance's `getContractFinancialSchedule` in `src/domain/finance/ContractFinancialSchedule.ts` remains authoritative. The projection reports guaranteed and conditional player payroll totals by actual season when Finance can provide them; the as-of horizon uses the active season when one exists. Missing Finance context is `null`/unavailable. It makes no salary prediction. Each unresolved expiry also carries the final contract-year cash salary from the canonical term.
9. **Age and development.** Expiry context includes age derived at the requested date from player birth truth and the existing development stage. It does not project future ratings or infer contract value.
10. **Strategy.** The projection is attached to the existing BS9 `assessClubNeeds` result. Existing club strategy determines the fit of actionable BS9 needs; the planner does not add a strategy authority.
11. **Position continuity.** At each actual horizon, the projection compares current primary-position counts with players whose contracts are active at that horizon. It reports a continuity risk when a position currently has at least two rostered players but at most one is contractually retained. This is a factual flag, not a roster move recommendation.
12. **Roster limits.** The modeled five-player minimum is a playable/emergency floor, not a normal roster target. AI emergency repair is limited to WORLD_REPAIR and does not process the user team. No general competition registration maximum is configured in the inspected model, so the projection explicitly reports `NOT_CONFIGURED` and derives no roster-space pressure.
13. **AI planning.** Existing BS9 club needs are consumed by GM planning and BS10 acquisition intelligence. This milestone only refines the existing contract-continuity need to exclude covered expiries and supplies the projection as additional BS9 evidence. It creates no parallel needs engine.
14. **User visibility.** The Analysis screen now shows current roster count, configured maximum status, actual-date horizons, retained players, scheduled arrivals, unresolved expiries with role/position, and positional risks. The section is informational and adds no action controls.

## Governance, ownership, and triggers

15. **Responsibilities.** `contractRecommendation` and `recommendSignings` are advisory. Negotiation/contact/offer/sign authority remains in the BS10 market responsibilities. Existing release execution is explicit. No new responsibility is required for derived planning.
16. **Governance.** `PLAYER_CONTRACT_SIGNING` is an existing Governance action boundary. A planning review is not an approval request, and BS11A does not alter Governance state or introduce new Governance types.
17. **Triggers.** Existing calendar expiry reconciliation, preseason, season rollover, and material roster/contract rechecks remain the relevant checkpoints. The projection is pure and computed at read/review time; a daily persisted planner or new trigger is unnecessary for this foundation. A dedicated approaching-expiry checkpoint can be considered with BS11B's decision workflow.
18. **Exact gaps.** BDM has no player renewal/extension lifecycle, no explicit non-renewal decision, no common future roster projection, and no modeled general roster maximum. Existing need logic looked at near-term key contract expiry but did not recognize a continuous successor. BS11A closes the projection and duplicate-expiry gap; contract decision execution, threshold policy, and new review workflows remain later work.

## Canonical implementation

`src/engine/clubNeeds/ContractRosterPlanning.ts` derives as-of, active season-end, and next same-competition season-end horizons from actual season dates. It reports current roster count, players under active contracts at a horizon, future scheduled arrivals, unresolved active expiries, positional continuity risks, and Finance payroll context. It does not persist, mutate the world, create hidden contracts, predict departures, invent salary demands, or run acquisition actions.

BS9 owns the single club-needs authority and now carries `contractRosterPlanning`. Existing `CONTRACT_CONTINUITY` need classification uses the same successor rule, so covered expiries do not trigger duplicated review. Existing BS10 acquisition and transaction boundaries remain unchanged.
