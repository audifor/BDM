# BS17C - Physical operations, work progression and availability truth

**PASS · BS17C PHYSICAL OPERATIONS, WORK PROGRESSION AND AVAILABILITY TRUTH**

## Lineage and scope

- Base: `9158d0272763759a12078ba301022bd934ff4507` (certified BS17B).
- Branch: `bdm-stage2-bs17c-physical-operations`, created from that clean base.
- Final SHA: the containing local BS17C commit, resolved with
  `git log -1 --format=%H -- docs/strengthening/BS17C_PHYSICAL_OPERATIONS_CERTIFICATION.md`.
  The execution result reports the literal SHA; embedding a commit's own hash is impossible.
- Canonical main remains `8a0b359e9ae48fe372668241788c9d5aa7a33b03`.
- No merge, push, dependency installation or worktree removal. Historical BS17A/B evidence is retained.

The Fast Loop preserved CFI1-CFI8, CFI2S, CFI6A, MX0 and BS17B. This certification covers
physical operations and truthful projections; it does not certify construction economics,
new sporting outcomes, AI or a duration policy that does not exist.

## Audit decisions grounded in existing authority

CFI4 permits finite numeric condition from 0 to 100, not just integers. CFI5 already defines
continuous loss using elapsed UTC days, 30.436875 days per month, wear profiles and utilization.
Rounding each resulting snapshot had made loss depend on evaluation cadence. BS17C preserves
continuous loss in the existing numeric field and rounds only presentation. Monthly partitions
and single-interval evaluation agree within floating-point precision (regression tolerance
12 decimal places); each path is exactly repeatable for equivalent input and reload.
No wear coefficient or threshold was recalibrated.

The utilization documentation incorrectly claimed the default was 1x base wear. Actual approved
code uses ratio 1 through `1 + ratio`, therefore 2x. The comment is corrected; behavior is not
changed. No real Match/Training/occupancy utilization source exists. This provisional fallback is
not presented as measured sporting use.

CFI6 planned dates are plans, not executable durations. The approved completion command records
explicit physical completion and realizes its scope. A planned date, even overdue, never causes
completion. Existing phase facts provide additional evidence: any unfinished phase or actual
completion after the requested date blocks completion. No minimum duration, percentage, automatic
phase finish or new scheduler is inferred. A project without phases can still be completed by
its legitimate explicit CFI6 command, including same-day completion; this is not duration proof.

## Condition, repair and history

- Missing condition remains null; no new component or imported Facility receives condition 100.
- Wear progresses from the latest canonical observation, so an interval replay cannot overwrite
  a newer repair or repeat an already evaluated period. Unknown condition produces no wear fact.
- Maintenance thresholds and open-need queries remain canonical. Need opening is unique;
  successful explicit physical repair closes its related need once.
- Repair condition records carry the action identity. Retry after Save or subsequent wear is a
  no-op, with no new idempotency ledger. Resulting serviceability uses an explicit declared result
  when provided, otherwise the existing condition thresholds; renovation/replacement use the same
  threshold authority instead of imposing FULL at a limited resulting condition.
- Condition and lifecycle records have optional non-negative same-day `sequence`. Absence remains
  absent in legacy payloads and resolves as zero; new commands record real execution order.
- Same-day observations are retained without negative date intervals. Unique sequences are required;
  superseded observations cannot outlive their successor or resurrect. Different-day contradictory
  overlaps remain rejected. Older open/bounded records are closed when superseded on a later day.
- Save V4 preserves sequence with strict constructor validation and optional-key compatibility.
  Condition and status queries use date, sequence and the existing ID fallback deterministically.

## Projects, overlap and physical state

Multi-replacement identity includes the retired component ID as well as project identity, avoiding
the previous shared `replacement` ID. Old components remain CLOSED records, never deleted. A
separate demonstrated bug in the active-component query excluded retired components even before
their retirement date; historical queries now include them before closure and exclude PLANNED
components from active truth.

Disjoint component operations may coexist. Existing scope identifies affected components for
renovation, replacement, removal and reconfiguration; additions do not close unrelated assets.
Conflicting scopes, duplicate targets and already planned/retired/demolished targets are blocked.
Demolition affects the Facility; ordinary component work does not close the whole asset.

Concurrent facility-wide lifecycle changes retain the actual pre-work status. The first project's
cancellation/completion cannot restore the Facility while another relevant project remains active
or paused. The final operation restores the recorded original status, not an assumed ACTIVE.
Same-day start/finish/cancel status IDs include the project/operation and ordered history.

Pause/resume/cancel propagate to existing active phase records, preserving actual dates and completed
phase history. Paused works retain physical restrictions: pause is not evidence that unfinished work
has been removed. Repeated invalid project transitions are rejected before any physical facts are
applied twice. Cancellation does not delete partially constructed assets or fabricate commissioning;
new construction retains its existing physical truth when no prior Facility status existed.

## One physical availability projection

`src/engine/facilities/FacilityPhysicalOperations.ts` derives physical state, active work, affected
scope, current team rights and capacity facts without persistence. Explicit OUT_OF_SERVICE/LIMITED
facts are distinct from unknown condition; the CFI4 FULL fallback is not operational proof.
Facility lifecycle closure and project restrictions are consumed consistently by CFI8 capability
and court projections and the club read-model inventory. No sporting multiplier is applied.

Existing CFI2 rights remain temporal, scope-based and independent of descriptive purpose. Shared
access is preserved, not converted into exclusive occupancy. Canonical validation still rejects
incompatible exclusive rights; no invented occupancy calendar or usage allocator is introduced.

Nominal capacity uses the existing CAPACITY specification's recorded amount and unit, otherwise the
legacy amount with unknown unit. Court quantity never becomes simultaneous player capacity.
Measured operational capacity remains null because no such source authority exists. Limited capacity
is not multiplied by an invented factor. Shared rights likewise provide no free-capacity measurement.

The existing NG workspace and PCB redirect show physical availability, nominal unit, unknown operating
capacity, affected work, temporal/shared right facts, actual/planned dates, phase blockers and physical
history including retired identities. No new screens, local levels, bonuses or economics are added.
Existing CFI4 condition/readiness and CFI8 capability facts retain their distinct documented meanings.

## Calendar, Save and actual production evidence

Calendar continues its existing FACILITY_CONDITION monthly phase and history-based service.
There is no second scheduler, pause advancement, automatic completion or new financial processor.
Regression coverage includes a calendar advance with a paused project, repeat condition evaluation,
monthly partitions with reload, and multiple-day source-world progression across the monthly seam.

The actual BS17B native DDL-12 Spain ACB payload (18 Facilities, 1 Place, 18 associations) traverses
production bootstrap, Save V4, the club read model and four Calendar days including month start.
Imported assets keep their recorded identities/capacities, unknown administrative/physical facts,
zero invented components, zero conditions and zero maintenance needs.
A source-absent baseline receives the same Save normalization and Calendar calls; all nonphysical
world collections compare identically, including Players, Finance, Governance, Training/Medical
state and matches. The existing real MatchEngine production smoke also passes unchanged.
Fixture repair/project tests prove operations, not source-world anatomy or live economic reachability.

BS17B provisioning, deterministic IDs and source-absent Prototype/ACB/shared generators retain their
existing regression coverage. Talent integration is not recreated: BS15 `a20ea25` remains outside
this ancestry. BS17D must resolve that lineage. BS16 remains the required authority for BS17E/F;
this run changes neither FinancialAuthority nor Governance permission rules.

## Validation and autocorrection

- Final focused suite: **25 files, 393 tests PASS, zero failed/skipped**, including all relevant
  BS17A/B regressions, 10 new physical-operation tests and a new canonical inspector UI test.
- Machine report: `%TEMP%/BS17C-focused-tests.json`.
- `npm run typecheck`: PASS.
- `npm run build`: PASS (existing large-chunk advisory).
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: PASS.
- `cargo check --offline --manifest-path src-tauri/Cargo.toml`: PASS; native production code unchanged.
- `git diff --check`, scoped diff review, zero `Math.random(` and no forbidden Domain/Engine imports: PASS.
- Focused independent read-only review: no remaining concrete blockers after repairs.
- No global npm-test or long-horizon certification claim: the milestone requires focused regressions.

The Fast Loop repaired strict Save readers and same-day period validation after adding ordering.
Stale assertions were updated to require physical work outages and block unfinished phases, not
removed. New test authoring errors (required canonical name/component blueprint and table activation
by double-click) were corrected. The source Calendar comparison was corrected to apply the same
Save V4 normalization to both worlds; no Player/Save enrichment rule was altered to make it pass.

## Explicit deferred decisions

`BLOCKED_BY_PRODUCT_DECISION` applies to absent automatic work-duration/progress policy, measured
utilization, measured operating capacity/occupancy, partial-capacity factors and any new physical
hierarchy dependency rule. Those unapproved behaviors remain unknown/unimplemented, not certified.
Existing explicit commands, actual phase facts and monthly wear are the only progression authority.
No new manager phase-completion policy or economic maintenance/construction workflow is authored.

BS17D owns approved sporting consequences after canonical BS15 lineage. BS17E owns economic and
Governance authorization, budgets, reservations, prices, accounts and maintenance spending after
BS16. BS17F owns AI/alerts. No costs, players, sporting bonuses or MatchEngine changes were introduced.

Next action: BS17D, subject to those canonical dependencies; do not start BS17E/F from this run.
