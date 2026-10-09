# BS17D-C1 physical allocation certification

**PASS · BS17D-C1 PHYSICAL OCCUPANCY & RESERVATIONS**

Focal tests, typecheck, build and diff/static gates PASS. Scope is the approved C1 V1 contract; BS17D global remains PARTIAL.

## Contract and isolation

The [approved C1 V1 policy](BS17D_C1_PHYSICAL_ALLOCATION_POLICY.md) is the product authority. Base: `a5576a9b70552c896ef589438f21380e3234a6f2`. Branch: `bdm-stage2-bs17d-c1-physical-allocations`. Worktree: `C:/BDM-BS17D-C1-ALLOCATIONS`. Final SHA is the local commit containing this certificate, reported in delivery; no self-referential hash is embedded.

Ancestry verified: V2 `fbe788ce01f1dd34fc40b360b4661ebaad63457c`, T `64abd26a50e93fd827f27dccabaa486e0e73dd04`, T1 `582f517e178ae8a7159237fd3d75e2db4c9d8f87`, consolidation `eb12f9670b2c99a6cf3c8ddef0ae2d73fd5e78c9`, and C base. The source C worktree is clean. Protected main remains `8a0b359e9ae48fe372668241788c9d5aa7a33b03`; origin/main remains `94c077092224a9f75c861a853d9d52fceae526fe`. No other worktree was changed. No Finance import, fetch, pull, merge, rebase or push.

## Minimal audit and canonical model

1. Training already supplies date, HH:MM start and explicit duration; no second agenda or default hours are added.
2. Individual Training has its canonical PlayerId. Team Training previously used its roster without explicit attendance; optional selectedPlayerIds now supply authoritative selected participants.
3. Demand counts unique selected PlayerIds; unspecified team attendance stays unknown. The individual target supplies demand one.
4. FacilityComponent, CFI8, Team rights, conditions, hierarchy and scoped works already identify physical resources and constraints.
5. Only scheduled sessions can request confirmation. Completed history remains immutable. Allocated cancelled sessions retain source/history and never execute.
6. Existing Training scheduling is the rescheduling command. Availability is checked before replacing an existing confirmed reservation; failure preserves the prior world.
7. Facilities domain and engine own PhysicalAllocation and its transitions. Records are subordinate to the canonical Training session in GameWorld, without a parallel collection or scheduler. Team organization is resolved through the owning Team rather than redundantly persisted.
8. Save V4 restores optional sharing facts, selected participants, physical records and history. Old saves do not acquire fictional reservations. References are rehydrated after Facilities exist, followed by full snapshot and allocation validation; this is Save construction, not a command mutating completed Training.
9. Existing Training Workspace and Facilities inspector expose the real manager commands, record results/history and navigate to the selected Facility.

Allocation records preserve stable request/session/resource/team identities, real interval, demand/unit, explicit status, causes and append-only history. Capacity and sharing at confirmation are historical proof, not a persisted current occupancy percentage. Current occupancy and operating capacity are derived. States: PENDING, CONFIRMED, RELEASED, CANCELLED, BLOCKED. IDs depend on canonical command identity, with no clock or RNG.

## Capacity, rights and conflicts

Intervals are half-open [start,end), including midnight. Consecutive sessions do not overlap. Only SIMULTANEOUS_PLAYERS can be compared to actual Training participants. SEATS, BEDS, TREATMENT_STATIONS and court counts are never converted into player capacity.

FULL permits documented nominal capacity after capability, condition, rights and work checks. Known OUT_OF_SERVICE or incompatible work blocks the affected operation with usable capacity zero. LIMITED without quantified evidence remains UNVERIFIED_PHYSICAL_CONTEXT, without an invented reduction. Unknown capacity, unit or demand produces no confirmed reservation and preserves P0 continuity; an explicitly absent, inaccessible, occupied or insufficient resource receives its distinct cause.

Team rights are checked across the interval, including expiry across midnight. Ownership or Organization rights alone do not grant Team access. SHARED rights do not prove divisible physical space. Simultaneous sharing requires explicit component occupancySharing=SHARED_CAPACITY, compatible units, identical physical scope and sufficient peak capacity. Missing sharing semantics prohibit double assignment. Ancestor/descendant scopes cannot be double-booked; partial works are scoped through the existing operations authority. Peak occupancy is swept over actual overlapping intervals, without summing groups that never coexist.

A prior confirmed reservation remains binding. Incompatible pending requests stay pending until the manager resolves the conflict; neither request iteration nor gender/category assigns priority. Compatible shared pending groups can each confirm without a priority choice. Confirmation reads one current GameWorld and publishes once. Explicit manager alternatives use actual components and recorded occupied-interval endpoints, checked against sports scheduling and resource availability. No automatic move occurs. Rescheduling into an occupied or conflicting pending interval preserves the old reservation atomically.

## Training, gameplay and persistence

Training retains modules, loads, delegation, results, participants and stimulus authority. The effective module is revalidated at execution. Known physical obstruction keeps the affected session pending, persists physicalAttempt/cause and produces no Training stimulus or fatigue effect. Modules without approved physical requirements remain independent. No new intensity, duration, development, injury or RTP factors are introduced.

Participant changes are checked again before effects. Breakdown, works and expired rights after confirmation can block execution. Restoration and explicit rescheduling allow later execution once. Completion records release while its actual interval still binds occupation, including overnight sessions. Cancellation releases future occupancy but retains allocated history; duplicate confirmation/release/cancel/retry is idempotent. Save/reload retains identity and history; forged active references and incompatible overbooking are rejected.

The existing optimized executor retains batching, pending flush, session caches, publication and incremental validation. The physical validation index is a non-persisted WeakMap derived from changed Training records; daily execution does not scan the accumulated allocation history. Full history validation remains at the Save boundary. Manager history/alternative queries may read retained history outside the daily hot path. No world-simulation performance program was reopened.

The manager can select real participants and components, request/confirm, inspect demand/capacity/occupation/causes, choose alternatives, edit explicit date/time/duration, reprogram, release, cancel, inspect history and open the selected Facility. UI/store are bridges to the canonical engine; no allocation authority lives in Zustand. The production workflow is reachable in both existing workspaces. Controlled test components and participants are confined to tests. No production Players, capacities, rights or ACB facts were generated. LIVE allocation is conditional on legitimately documented physical data; incomplete real-world datasets remain UNKNOWN, not generalized verified utilization.

## Validation and autocorrection

[Machine evidence](BS17D_C1_PHYSICAL_ALLOCATION_EVIDENCE.json) records each assertion and latest effective report, with raw artifact hashes. The focal validation union is **374 passed tests across 31 files**; repaired files were rerun instead of repeating the entire suite. The 29 allocator tests cover causal capacity 10/demand 8 and 10/demand 12, unknown and incompatible facts, LIMITED/OOS, simultaneous/consecutive/partial/overnight intervals, dated rights, multi-Team male/female youth and senior use, shared/exclusive resources, hierarchy, actual alternatives, unresolved pending conflicts, confirmed priority, idempotence, atomic failed moves, participant changes, restoration, Save and real sporting execution. The manager test uses the actual workspace/store/engine/save/navigation path.

Regressions cover Training scheduling/delegation/staff/batching/P0, youth Training, Recruiting NCAA/RPG/permissions/T1 demonstrations, Talent supply/identity/pathways, Facilities CFI8/rights/works, Save V4, Calendar exactly-once, consolidation and the five cross-system V2 tests. Existing bounded cross-system assertions preserve Talent, Finance, Governance, Medical/Recovery and MatchEngine projections. Production diff contains no edits to those authorities, economic reservations, costs, budgets, ownership or probabilities.

CURRENT_DEFECT repairs: missing midnight date import, legacy session referential shape, immutable-history diagnostics, completed-session Save hydration, actual Player name fields, independent module handling, and pending-conflict checks on rescheduling. STALE_TEST updates are limited to approved explicit individual demand/new Training allocation authority and legitimate duplicate workspace text. No test was deleted. Concurrent build/test CPU contention produced two timeouts; isolated one-worker reruns passed with unchanged timeouts. Original failure reports remain retained locally and hashed. No unresolved new focal regression remains.

Typecheck and build completed with exit 0. Vite retains its bundle-size advisory. Diff check passed; src contains zero Math.random calls and production Domain/Engine contain zero React/Zustand/Tauri imports. Gate results and artifact hashes are recorded in the evidence. Rust, dependencies and Tauri are unchanged; no install or network step was needed. Validation follows the milestone's focal gates rather than rerunning the full known-failure suite or 30-year certification.

## Limits and next action

The [V2 historical limitations](../integration/BS15_BS16_BS17_CONVERGENCE_V2_CERTIFICATION.md) remain intact. The 2029 World DB stop stays UNRESOLVED_HISTORICAL_CAUSE; it is neither explained nor reclassified. Historical full-suite accounting remains 4916 total / 4819 passed / 38 failed / 59 pending, not newly certified here. No longitudinal simulation was rerun.

No indispensable product decision remains for approved C1 V1. Quantified LIMITED availability, additional datasets, specialized Medical, Facilities AI, Finance integration and other future consumers require their own documented authorities/contracts; this implementation invents none. **BS17D GLOBAL: PARTIAL.** C1 does not certify Medical or complete BS17D, BS16, BS17E/F or a longitudinal World DB run.

Next action: review this local C1 commit as the completed physical allocation foundation. Do not start BS17E/F or integrate main within this execution.
