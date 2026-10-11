# BS17D-C — Operational capacity and shared facility usage

## Result and scope

**BLOCKED_BY_PRODUCT_DECISION** for quantitative operational allocation.
**PARTIAL · BS17D-C** for the authorized factual projection fallback.
BS17D GLOBAL remains **PARTIAL**. BS17E/F remain deferred. No Finance work.

Base: `eb12f9670b2c99a6cf3c8ddef0ae2d73fd5e78c9`.
Worktree: `C:/BDM-BS17D-CAPACITY`.
Branch: `bdm-stage2-bs17d-capacity`.
The final local commit containing this report identifies the final SHA; machine-readable validation accompanies it in `BS17D_C_OPERATIONAL_CAPACITY_EVIDENCE.json`.

The base preserves V2 `fbe788ce01f1dd34fc40b360b4661ebaad63457c`, Talent T `64abd26a50e93fd827f27dccabaa486e0e73dd04` and Recruiting T1 `582f517e178ae8a7159237fd3d75e2db4c9d8f87` in ancestry. This run creates no merge and imports no Finance commits. It does not extend the bounded V2 certificate or explain the historical 2029 `UNRESOLVED_HISTORICAL_CAUSE`.

## Existing facts and missing authority

- `src/domain/training/TrainingSchedule.ts` owns dated Training sessions, HH:MM start, duration (1–240 minutes), team/individual scope, optional individual PlayerId, participation overrides, status and execution evidence. There is no assigned Facility/component, quantitative resource demand, booking or allocation record. Recorded participants after execution do not prove simultaneous occupancy. The current roster is not a measured resource demand.
- `src/engine/training/ScheduledTrainingEngine.ts` owns scheduling and execution. Existing batching, date index and incremental validation remain unchanged. It resolves physical requirements against the actual effective Training definition before effects. A pending planned definition may change under delegated planning; the new timetable never claims to resolve that future physical requirement or venue.
- `src/engine/training/TrainingPhysicalRequirements.ts` owns the explicit approved court requirements. Independent modules do not acquire physical requirements merely by appearing in the timetable.
- `src/domain/facilities/FacilityComponentSpecification.ts` distinguishes COURT geometry from CAPACITY amount/unit. `SIMULTANEOUS_PLAYERS` is a supported nominal unit; SEATS, SPECTATORS, LOCKERS, BEDS and other units are not interchangeable. Legacy component capacity has no unit. Quantity, full-court geometry and spectator capacity do not establish simultaneous player capacity. Even a nominal SIMULTANEOUS_PLAYERS fact lacks the operating-capacity/allocation policy needed here.
- `src/engine/facilities/FacilityPhysicalOperations.ts` owns dated component service, scoped physical work, closures and access projection. It explicitly returns `operationalCapacity: null`. AVAILABLE/LIMITED/OUT_OF_SERVICE/UNKNOWN describe physical facts, not occupancy guarantees or percentage penalties.
- `src/domain/facilities/FacilityUsageRight.ts` owns temporal Team/Organization rights, component scope, exclusivity and PRIMARY/SECONDARY/TERTIARY. Its priority is explicitly a fact for **future** conflict resolution; CFI2 implements no allocator. SHARED rights are not reservations. Organization ownership, association or rights never automatically grant Team access.
- CFI8 `usableComponentsForTeamAt` remains the purpose-agnostic Team entitlement query. The projection calls it at the scheduled date and keeps access separate from serviceability. These are date-based entitlements, not intraday reservations.
- `src/domain/facilities/FacilityConflict.ts` detects EXCLUSIVE rights incompatibilities. It does not allocate simultaneous Training sessions or settle priority ties; SHARED/NON_EXCLUSIVE rights may legitimately coexist.
- `src/domain/facilities/FacilityUsageLoad.ts` is a caller-supplied transient deterioration signal. Its documentation says no real Match/Training/Events utilization producer exists. It is not an occupancy or reservation authority and is not consumed here.
- Youth Training uses the same canonical sessions and Training owner, with explicit BS15 Team pathways. Capacity cannot set intake quotas or change supply, identity or probabilities. Male/female and senior/youth use the same rights/physical architecture; test scenarios do not add shared facilities to the shipped universe.
- `src/engine/recruiting/RecruitingFacilityDemonstration.ts` owns the optional T1 subordinate visit demonstration. A capability and optional component selection are real, but no activity-specific duration/occupancy demand is modeled. Recruiting calendar contact windows and visit dates are not demonstration intervals. T1 is not Training or medical treatment and does not receive a fabricated booking.

Approved boundary: `BS17D_P0_SPORTING_OPERATIONS_POLICY.md` §7 requires known capacity, comparable unit, known demand, common interval, valid rights and allocation authority without double reservation. It directs unknown operating capacity when those conditions are absent. No approved rule found supplies the missing demand/assignment/conflict policy. A deterministic sort by time/ID or a right's priority field cannot become that policy.

## Implemented fallback and UI

`src/app/facilities/FacilityCapacityReadModel.ts` is a transient application projection. It reads canonical components, dated CFI8 access, BS17C physical evidence and pending Training sessions in the current seven-day window. There is no second agenda, world field, RNG, allocator, command or Save schema change.

Facilities exposes this context in the selected Facility inspector; Training reuses the same view. Nominal amount/unit, physical state and Team access are distinct. Work blockers include their actual project IDs. An individual PlayerId is displayed as a target, never converted to occupancy. Demand and component assignment remain null; operating capacity is unverified. Missing information never becomes zero or a new Training block.

Other teams' pending sessions are shown only when their dated rights cover a component in the viewed scope. Own-team sessions remain visible without rights so a missing access record does not hide the agenda. A completed session is not a pending booking. Future entitlements may appear in the window; current physical facts are explicitly labeled as of the current date.

Timetable observations require overlapping recorded intervals and a common component entitlement on each session's date. Intervals touching at their endpoints do not overlap; actual sessions crossing midnight retain their dates/durations. The observation does **not** establish that either operation needs, requests or is assigned that resource. Independent Training modules also remain independent. The UI explicitly calls actual resource conflict unverified. No winner, occupied count, reservation, utilization percentage, sporting effect or guaranteed alternative is produced. Existing P0 alternatives remain under the sporting resolver.

## Validation interpretation

Final focal selection: **281/281 tests PASS across 25 files**, combining the initial selection with the affected-file and final projection rechecks. This includes **16 new read-model/owner cases**, **1 new shared-view case**, the two existing workspace integrations and all five V2 cross-system tests. Typecheck, production build and diff check PASS. The build retains its existing bundle-size advisory. No `Math.random()` in src or framework imports in production Domain/Engine were found. Test-only React rendering in the existing P0 test remains unchanged.

One UI query initially failed because the new panel legitimately repeats the existing project ID. Its presence assertion now supports multiple matches; all nine tests in that file pass on recheck. The original failure report is retained in the ignored diagnostic cache. No other failure or unresolved new regression was found in this selection. No suite-wide, longitudinal, Rust or external network validation was needed for this application/UI-only scope.

Main, origin/main and the source certification refs retain their observed SHAs. The Finance worktree acquired independent active changes during this execution; they were preserved, not modified, reset, imported or committed here. The clean-tree requirement applies to this independent capacity worktree, not to external active work.

New focal cases cover known/unknown nominal amount, a nominal simultaneous-player unit versus SEATS, individual targets without inferred demand, overlapping/disjoint/adjacent/midnight intervals, shared and disjoint component rights, expiry with no Organization inheritance, FULL/LIMITED/OUT_OF_SERVICE, scoped work/restoration, Save/reload and nonmutating repeat reads. Integration UI assertions verify both existing workspaces expose the context.

Two causal Training pairs differ only in nominal capacity (1 versus 80), separately for SIMULTANEOUS_PLAYERS and SEATS. They prove continued owner execution and identical shared world authorities apart from nominal physical evidence, with exactly-once Training re-execution. They do **not** certify a comparable real demand consumer or a capacity shortage gate. That gate is not implemented because its policy and source facts are missing.

Focused regression selection preserves Training P0, CFI8 rights/geometry/service alternatives, youth Talent and Training, optional Recruiting demonstrations/NCAA, Medical compatibility, Facilities Save V4, Calendar exactly-once and the five bounded V2 cross-system cases. Quantitative demand allocation, simultaneous reservations, shortage resolution and priority winners have **no LIVE consumer and no end-to-end capacity certificate**. They remain blocked, rather than being represented by synthetic fixtures as approved product behavior.

Only application/UI/test/documentation changes are made. Domain, Engine, Save, Calendar, Finance, Governance, Medical/Recovery, MatchEngine and BS15 supply/identity/probability formulas are unchanged. No Y1–Y30 or historical World DB run is executed. Existing performance certification is not reopened.

## Required product decisions — not approved here

1. Define the authoritative meaning and measurement of operational capacity per component/unit, including LIMITED compatibility and effective dates. Decide whether/how nominal SIMULTANEOUS_PLAYERS can qualify; do not assume it does.
2. Define physical demand for each real Training operation: simultaneous participants, participation exceptions, effective delegated module, component needs and interval. Identify the owner that produces those facts. Do not derive demand automatically from roster length or an individual target.
3. Approve component assignment and legitimate alternatives under Training's existing execution owner and CFI8. Decide which activities actually contend, including shared senior/youth, male/female and university facilities. T1 needs an explicit activity interval/demand contract before inclusion.
4. Approve conflict priority and ties for simultaneous eligible requests; whether PRIMARY etc. are binding; treatment of same-priority requests, existing rights conflicts, capacity shortages and any rescheduling/deferral. No ID/time/gender/seniority tie-break is authorized by this report.
5. Define the minimum assignment/reservation lifecycle and authority: atomic allocation, release/cancellation, restoration/retry, interval boundaries and dated rights across midnight, Save/reload and exactly-once behavior. Preserve the existing agenda and batch executor; do not create a parallel scheduler.

## Next executable action

Approve the concrete demand, operating-capacity and allocation/conflict contract above. Then scope a successor implementation on this local branch, under the existing Training owner, with causal shortage/conflict/alternative/restore/reload tests. Until then quantitative operational capacity remains NOT_IMPLEMENTED / BLOCKED_BY_PRODUCT_DECISION. Medical specialized and global capacity allocation remain pending; BS17D GLOBAL remains PARTIAL. BS17E/F and Finance are not started.
