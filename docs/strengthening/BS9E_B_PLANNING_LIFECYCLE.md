# BS9E-B · GM planning lifecycle and observability

## Lifecycle audit and coordinator

`docs/strengthening/BS9E_B_PLANNING_LIFECYCLE_AUDIT.md` records the lifecycle and application seam audit. `reviewClubManagementPlanning(world, teamId, trigger)` is the single Application coordinator. It calls the existing strategy review, BS9D plan review and BS9E-A workflow review; it adds no duplicate needs, options, selection, or routing logic.

## Trigger vocabulary and implemented integration

| Trigger | Integrated checkpoint | Scope |
| --- | --- | --- |
| `INITIAL_SETUP` | Final `createNewGame` construction boundary, after world data, recruiting cycles, and AI strategy setup | Coached AI clubs, stable TeamId order |
| `PRESEASON` | Completed `startNextSeasonTransitionFor`, after schedule, repair, recruiting, and board setup | AI clubs participating in the new primary season |
| `MATERIAL_ROSTER_CHANGE` | Successful player release, completed trade commands, or actual roster differences observed after calendar processing | Only changed, coached clubs |
| `MAJOR_INJURY` | New serious injury records detected at the completed-match application boundary | Only the injured player's club; serious uses the existing 22–60 day recovery category |
| `CONTRACT_CHANGE` | Successful free-agent signing, after the canonical contract and roster are written | The signing club |
| `EXPLICIT_REVIEW` | Public coordinator entry point | Requested club |

The market service now applies its contract/roster/transaction update through `updateGameWorld`, preserving strategy and plans and all other canonical state. Application trade and staff-recommendation commands review only when a player roster actually changed. Rejected proposals and non-player asset changes do not trigger planning.

## Initialization and preseason

New prototype careers review AI strategy and initialize selectable plans only after the full world has been built. Clubs with no currently selectable high-priority response do not receive invented plans; Analysis reports that no selected response plan exists. The user's club is never given a persisted AI plan.

At competition rollover, only coached AI clubs in the new primary edition's participant snapshot are rechecked. This uses the existing rollover boundary and does not add calendar or competition responsibilities. An already materialized successor is returned by the existing idempotent path, so its planning checkpoint does not run twice.

## Roster, contract, and injury changes

Successful signing and release calls review the affected club after the canonical MarketService mutation. Completed player trades review each participant whose roster changed. Calendar processing compares actual team rosters before and after daily systems; contract expiry and other real daily roster changes therefore refresh just those clubs. The ordinary day path adds no planning checkpoint when rosters are unchanged.

Completed-match application compares newly created Injury records and triggers review only for the canonical `serious` severity, whose existing Injury Domain recovery range is 22–60 days. Minor and moderate injuries do not trigger a full plan review. Medical advisory acceptance and return-date changes are not new injury events and do not trigger a second review. No severity model is added.

## Finance, Governance, scouting, and market checkpoints

Club Finance V2 has no global lifecycle processor or material-distress callback. Governance has no calendar resolver and currently exposes a narrow coach-firing execution seam rather than a single general policy-change service. Scouting assignments progress daily but have no consolidated organization-knowledge completion callback. The shared ecosystem calendar does not define a professional transfer window. These triggers are deferred until a truthful higher-level seam exists; BS9E-B does not poll these systems or add daily club-wide reviews.

The caller can use the coordinator's explicit trigger API when such a canonical checkpoint is later introduced. No Finance proposals, Governance requests, scouting assignments, market jobs, contract offers, or other concrete management actions are created here.

## Daily advance, team scope, and idempotency

Ordinary `advanceDay` continues to run its existing subsystems without recomputing every club's planning stack. The Application day boundary observes the roster delta already needed for post-transition integrity repair and adds a planning checkpoint only for clubs whose canonical roster changed. Clubs with no coach are skipped.

All multi-club work is sorted by TeamId. BS9D selection inertia remains in force for routine initialization and review; actual material triggers use its existing invalidation/reselection behavior. Repeating an unchanged checkpoint preserves selected dates and yields equal canonical plan and strategy state. No checkpoint ID/history or derived workflow state is added.

## Persistence and AI/user behavior

Only existing `ClubStrategicState` and `GMPlanState` are persisted. Needs, decision contexts, and `GMWorkflowDecision`s remain derived. AI clubs may refresh accepted broad planning intent; user clubs receive `USER_RECOMMENDED_WORKFLOW` output and retain the original world unchanged. Neither route dispatches a concrete action.

## Analysis surface

The existing Club Strategy Analysis screen now shows strategy, current top needs, and each selected or recommended response with its selected date and selection reason. It also shows the current route, status, readiness, and responsible system. User output is labeled `Recommended plan` / `Recommended next workflow`; AI output is labeled `Selected plan` / `Planned next workflow`. Unsupported routes remain visible as “Not yet supported.” Evidence values that are player/team/staff/contract IDs are omitted from the normal view; player names remain available where already shown. No action controls were added.

The screen uses a read-only inspection API for persisted AI plans. User recommendations use the same BS9D/BS9E-A assessment path without persistence. Workflow decisions are never stored.

## Deferred integration and findings

Dispatch remains behind later subsystem-specific boundaries. BS10 owns external market intelligence and exact candidate discovery; BS9E-B does not select targets or construct transactions. P0 findings: none. P1 findings: Finance, Governance, scouting-knowledge, and market-window callbacks await canonical lifecycle seams; unsupported internal routes remain visible to guide later systems work.
