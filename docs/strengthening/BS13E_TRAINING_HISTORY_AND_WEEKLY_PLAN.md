# BS13E · Training history and weekly plan

Status: **TECH READY / AWAITING VISUAL VALIDATION**

## 1. Observed bug and reproduction

After scheduling and executing a team Training session, its completed result existed in
`GameWorld.scheduledTrainingSessionsById`. Advancing the world and navigating to the
original week showed an empty day. A focused UI regression test reproduced this after
execution, an eight-day date advance, and one click on **Anterior**: the original weekly
slot rendered zero session cards.

## 2. Root cause and previous lifecycle

The canonical lifecycle was already correct. `ScheduledTrainingEngine` changes the
scheduled entity to `completed`, attaches execution evidence, and keeps the same stable
session ID and map entry. `advanceDay` advances the global date and executes due sessions;
it does not remove completed sessions. `GameWorld` also rejects removal or mutation of a
completed session.

The weekly UI projection in `TrainingPcbPage` was the loss point. Its per-date selector
filtered for `status === 'scheduled'`, so completed sessions were hidden even though the
team selector and completed-session panel still found them.

## 3. Final canonical history authority

`GameWorld.scheduledTrainingSessionsById` remains the one persisted authority for both
future and historical sessions. There is no second history store and the weekly result is
not persisted. A session keeps its ID and original date while transitioning from
`scheduled` to `completed`; completion adds immutable factual execution evidence.

Completed sessions cannot be edited or removed through the application update boundary.
Future scheduled sessions keep their existing create, edit, executor assignment, and
cancel workflows.

## 4. Weekly projection and presentation

The pure `sessionsForTrainingWeek` domain query scopes canonical team sessions to the
requested Monday-through-Sunday range and sorts by date, start time, then ID. The UI uses
that projection for the seven day cards. Previous Week remains an unbounded date offset,
so it works across years and season transitions; current and next week remain available.

Scheduled sessions retain the existing editable controls. Completed sessions render once
in their original day as a **COMPLETED** disclosure, with no edit, Load, reschedule, or
delete controls. Opening it shows planned versus effective module/intensity, recorded plan
Staff and intensity advice when present, executing Staff and snapshotted role, execution
quality, participation, fatigue, development stimulus, and injury counts. Saves that
contain a completed record but no detailed execution evidence show a factual-history
fallback instead of inventing evidence.

## 5. Evidence and immutability

The completed entity preserves its stable identity, team, date, scope, planned definition,
planned intensity, duration, and participation settings. Execution evidence preserves
planned and effective module names, effective intensity, executing Staff IDs and role
snapshots, quality, participants, fatigue/morale deltas when recorded, development
stimulus references, injury IDs, and cohesion delta. Existing `DelegationOutcome` records
remain the source for planner identity, decision-time role, quality, and workload; the UI
joins them by session ID. It does not substitute current Staff assignments for historical
snapshots.

## 6. Advance day, save/load, and old saves

`advanceDay` completes due sessions in place and leaves completed sessions in the map on
subsequent days. The existing Save V3 payload persists that same session collection
through its Training session data. A Save V3 reload preserves completion, date, execution
evidence, and the original week projection. No UI strings or derived weekly lists are
saved.

Legacy saves with no stored scheduled/completed session entries continue to load with an
empty collection; migration does not synthesize historical sessions. Any completed
session and evidence actually present in a save remain available.

There is no explicit Training history retention policy or automatic cleanup. Completed
sessions are immutable and retained for the career. The existing cancellation operation
removes pending scheduled work; the GameWorld invariant rejects cancellation of completed
history.

## 7. Recent Impact, season transition, and performance

Staff **Recent impact · 30 days** remains a separate rolling UI query over completed
session evidence and recorded Staff outcomes. Its date window never deletes Training
history. The weekly calendar is anchored to the global current date, and Previous Week
continues to navigate across calendar years and season boundaries; Training history itself
is not season-scoped.

The weekly projection sorts only the selected team's entries and the calendar renders the
selected seven dates. The Completed Sessions panel remains useful, reads the same canonical
map, sorts newest-first, and reveals up to 40 entries at a time. It does not act as a
second source of history.

## 8. Focused validation

Focused coverage checks the reproduced weekly disappearance, one completed card in its
original date slot, historical read-only presentation, completed-record immutability,
execution evidence after Save V3 reload, and retention at +1, +7, and +30 canonical
`advanceDay` checkpoints. Existing delegated Training tests cover the persisted planner
and executor evidence path. The Training workspace history panel test remains included.

Run the manual visual scenario below before declaring the milestone PASS.

## 9. Manual validation

1. In **Training → Team**, schedule **Catch and Shoot** for a Monday with an eligible
   executor.
2. Advance to that Monday and verify the session becomes **COMPLETED**.
3. Advance at least seven in-game days.
4. Open Training weekly planning and click **Anterior** until the original Monday is
   visible.
5. Confirm the session appears once in Monday's slot. Open it and inspect completion,
   planned/effective module and intensity, planner attribution, executor and role, quality,
   participants, and recorded consequences.
6. Save and reload. Navigate back to the same week and confirm the same completed session
   and evidence remain.

## 10. Remaining Training issues

The automatic focus mapping selects Team Cohesion for the balanced focus and maps other
configured focuses to their existing modules. The reported behavior of selecting cohesion
even after changing focus was not reproduced in this history audit and was not changed.
No automatic executor assignment was added. Visual persistence after advance and
save/reload remains awaiting user confirmation.
