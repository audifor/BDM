# BS1 · Canonical World Lifecycle

## Canonical phases and order

The daily operation is an immutable, ordered application transition. The exact application order is:

1. `PRE_ADVANCE_VALIDATION`
2. `MATCH_RESOLUTION`
3. `DATE_ADVANCE`
4. `ANNUAL_PLAYER_DEVELOPMENT`
5. `PLAYER_AND_CONTRACT_STATE`
6. `TRAINING`
7. `RECRUITING`
8. `ACADEMICS`
9. `NIL_LIFECYCLE`
10. `MONTHLY_NIL_AUTONOMY`
11. `MONTHLY_BOOSTER_AUTONOMY`
12. `COACH_FINANCE`
13. `MEMORY_DECAY`
14. `ENFORCEMENT`
15. `SCOUTING_INTAKE`
16. `MEDICAL_AND_ROSTER_ADVISORIES`
17. `SCOUTING_ASSIGNMENTS`
18. `DRAFT`
19. `STAFF_HUMAN_STATE`
20. `STAFF_CONFLICTS`
21. `STAFF_CULTURE_COHESION`
22. `STAFF_POLITICAL_CASES`
23. `STAFF_APPRAISAL`
24. `STAFF_CAREER_AUTONOMY`
25. `FACILITY_CONDITION`
26. `CLUB_FINANCE_V2`
27. `GOVERNANCE`
28. `EVENT_COLLECTION`
29. `SCHEDULE_INTEGRITY`
30. `PRE_MATCH_MEDIA`
31. `BREAKPOINT_EVALUATION`
32. `DAY_COMPLETE`

The first 28 phases are the named Calendar Engine order. Application phases handle the pre-transition match boundary, integrity check, existing media operation, and BS2 post-check. `WORLD_DB_REMATERIALIZATION` and `WORLD_DB_BREAKPOINT_RECONCILIATION` are appended only by the World DB path.

The phase map records owners, cadence, mutation/failure expectations, and breakpoint potential. Skipped cadence phases appear in the trace with `ran: false` and a diagnostic reason. The named phases split the old nested chain for evidence and failure localization; subsystem operations retain their existing call order and authority.

## Subsystem ownership

BS1 selects when existing operations run and in what order, then reports their result. Contract reconciliation, fatigue, training, recruiting, academics, NIL, boosters, personal Coach Finance, memory, enforcement, scouting, medical/roster advisories, Draft, staff systems, Facilities and match handling remain owned by their existing engines/application services. No subsystem rules are duplicated in the lifecycle coordinator.

`advanceDayWithTrace` advances the calendar and runs the Engine phases. `advanceGameDayWithResult` owns the application boundary and BS2 checks. The Zustand store retains the latest transient result for presentation; it is not a lifecycle authority.

## Finance V2 activation

BS1 reviewed the available Finance V2 operations and does not activate any automatically. The canonical account/ledger materializers require explicit event or source records, ledger mapping, date policy/currency, or authorization inputs. The repository does not define a safe generic daily, monthly, period-close, or season-close Club Finance processor. Event-driven operations continue to run only through their owning event/application path. Finance recommendations remain advice and do not become approvals, funding, or autonomous club actions.

The `CLUB_FINANCE_V2` phase is explicitly skipped and explains why. BS1 does not call legacy salary-cap, affordability, or Team budget logic. The existing monthly `COACH_FINANCE` operation is personal coach finance and remains unchanged.

## Facilities activation

The existing condition deterioration engine defines elapsed-period deterioration and a default utilization load. BS1 connects it at the first day of each month, the supported monthly cadence, and calculates each active component from its latest canonical condition record through that date. This preserves elapsed wear even when a new component record was written between monthly checkpoints, without persisting a duplicate checkpoint.

The phase reports condition changes and newly opened maintenance needs. Maintenance actions, inspections, and development project start/completion remain explicit operations; no daily AI, UI, project scheduling, or sporting effect was added.

## Governance cadence

Governance has dated meetings and decisions but no automatic calendar resolver or general daily cadence. `GOVERNANCE` therefore appears as an explicitly skipped phase. BS1 creates, holds, approves, executes, or resolves no governance records. User-attributable unresolved governance remains `IMPORTANT` under BS2 until a supported resolver exists.

## Breakpoint interaction

BS2 remains the only authority that projects breakpoint candidates, orders them, and decides whether time may advance. The application boundary evaluates BS2 before mutation and after processing. It does not duplicate classification inside daily phases. Direct day advance may resolve today's user game through the existing match boundary, as before; other required user decisions stop before mutation.

Continue and Simulate Until use the same `advanceGameDay` lifecycle. Simulate Until's competition-lifecycle preflight remains in its coordinator. World DB reprojects BS2 after physical fixture rematerialization so the final result describes the world it returns.

## Lifecycle result and observability

`advanceDayWithTrace` returns status, world, ordered phases, aggregate diagnostics, and whether the current-season pointer changed. `advanceGameDayWithResult` adds before/after breakpoint projections and application phases. Each phase carries ID, order, date, ran, world-changed, diagnostics, summary, and optional elapsed milliseconds. Timing is diagnostic only. The trace is in memory and is not serialized or persisted.

Statuses are:

- `COMPLETED`: transition and post-check completed with no stopping breakpoint.
- `BREAKPOINT_PREVENTED`: BS2 stopped before mutation; the original world is returned.
- `BREAKPOINT_AFTER_PROCESSING`: processing completed and BS2 found a stopping candidate for the next transition; the advanced world is returned.
- `FAILED`: an invariant or technical lifecycle failure occurred; the original input world is returned.

Legacy world-returning adapters retain their existing exception behavior. The direct store action uses the structured application result and only replaces the world for completed/after-processing outcomes.

## Failures and diagnostics

An unsupported automatic lifecycle is represented by a skipped phase (`PHASE_SKIPPED`) with an explanation, not by an exception. Recoverable subsystem observations remain phase diagnostics and do not stop advancement. A scheduled game left in the past is an `INVARIANT_VIOLATION`; phase `TypeError`/`RangeError` failures are classified as invariant failures, and other thrown errors as `TECHNICAL_FAILURE`. Failures are not swallowed: the application result identifies the phase, kind, and message and returns the untouched input world. BS2 blocking candidates stay breakpoints, not lifecycle failures. BS1 performs no self-healing repair.

## World DB path

World DB still materializes external physical fixtures before simulation so today's fixtures can use the existing match boundary. It then calls `advanceGameDayWithResult`, rematerializes fixture mapping after successful processing, and runs a final BS2 reconciliation against that rematerialized world. It has no separate daily simulation engine. A precluded/failed day returns the pre-transition materialized world without performing post-day rematerialization.

## Season boundary and remaining scope

Date advance still owns the existing current-season pointer migration check and reports `seasonPointerChanged`. A season-completion candidate remains visible through the before/after BS2 projections. Future competition/season creation remains owned by its existing competition lifecycle coordinator; it is not hidden in player development or another unrelated phase.

**BS3 remaining:** universal competition/season lifecycle coverage, including unsupported ecosystem next-season generation and broader season-transition behavior.

**BS4 remaining:** legitimate recovery rules for invalid rosters, contracts, schedules, Facilities, staff, registrations, and other integrity failures. BS1 diagnoses and propagates these states without silently repairing them.
