# BDM Current Game Loop

Audit base: `c23771ff51146ff7ce7a738504d54c443438b3ca` (`origin/main` and BS0 branch were equal at start). This describes executable routes present at that revision; it does not infer a single lifecycle from the subsystem inventory.

## Runtime routes

```text
Create/load GameWorld
  ├─ createNewGame / WorldDbGameBootstrap
  └─ GameSaveService → Save V4 deserializer → createGameWorld/updateGameWorld validation

User advances a day
  └─ app/game/advanceGameDay.advanceGameDay
       ├─ simulateRemainingGamesToday
       │    └─ each scheduled Game today → prepareMatch → MatchSession/rotations
       │         → applyCompletedMatch → post-match injuries
       ├─ engine/calendar.advanceDay (increments GameWorld.currentDate by one)
       ├─ rejects any scheduled Game now stranded in the past
       └─ may create a pre-match media opportunity for a user game on the new date

Continue
  └─ app/game/ContinueFlow.continueGame
       └─ checks media → user game today → (when no next user game) completed primary season
            before repeating advanceGameDay

Simulate until date
  └─ app/game/simulateUntilDate.tickSimulateUntilDate
       ├─ rolls supported completed competitions first
       ├─ stops with an explicit diagnostic for a completed unsupported lifecycle
       ├─ skips pending media, instant-resolves a user game, or advances one ordinary day
       └─ returns at target morning or when one of its recognized interruptions is met

World DB day
  └─ app/game/WorldDbDailyAdvance.advanceWorldDbGameDayV1
       ├─ materializes World DB physical fixtures before the day
       ├─ calls the same advanceGameDay route
       └─ rematerializes fixture progression after the day
```

The regular app route and World DB route share daily advancement, but there is no global `START DAY → ordered processing → event aggregation → AI reactions → breakpoint evaluation → END DAY` object or event bus. `CalendarEngine.advanceDay` is an explicit, order-sensitive composition function; match execution and result application are separate boundaries. The React/Zustand UI delegates to application services and stores the `GameWorld`, not an independent simulation clock.

## Actual daily order in `CalendarEngine.advanceDay`

The date is incremented first, then the current season pointer may migrate if the prior season is complete and finalized and its next edition has started. Processing then occurs in this order:

1. **Annual development:** on July 1 only, `progressAnnualPlayerDevelopment` applies deterministic Player Development once per annual cycle and clears development stimulus.
2. **Contracts, fatigue, training:** `reconcileExpiredPlayerContracts`; `recoverCareerFatigueForDay`; `executeScheduledTrainingSessions`.
3. **Recruiting and academics:** recruiting cycles change status, generate pools, run AI/advisory/commitment logic, and deliver arrivals; academic support and term resolution run January 1 and July 1.
4. **NIL, boosters and coach finances:** NIL lifecycle daily; NIL AI on day 1; booster AI, monthly Coach Finances, and Memory decay on day 1 of each month.
5. **Enforcement and scouting requests:** NCAA enforcement, then delegated scouting, scouting advisories, and opposition-scouting report generation.
6. **Medical, operations and scouting execution:** medical advisories, basketball-operations advisories, then scouting assignments/reports.
7. **Drafts:** open eligible drafts, make prospect advisories, then progress AI picks until the user owns the current pick.
8. **Staff:** refresh Human State, conflicts, culture/cohesion, political cases, career-autonomy appraisal, career market agency, autonomous offer decisions and resignations.

This order is real but scattered across nested calls and chained return expressions in `src/engine/calendar/CalendarEngine.ts`. Club Finance V2, Facilities deterioration/maintenance lifecycle, and a general Governance cadence are not invoked by this daily composition. Season finalization is triggered by completed-match application, not as a general daily phase.

## Match result path and consequences

Production match resolution runs through Match Next (`src/app/game/matchResolution.ts`): each scheduled game is resolved at a `SimulationResolutionPolicy` tier — FULL (presented/live), FAST (exact non-presented) or BACKGROUND (low-detail scale) — and every result is applied through the single canonical boundary `completeResolvedMatch` (`src/app/matchNext/applyMatchNextResult.ts`) for the final score, stat log, coach reputation/experience, morale, narrative and media processing, competition postseason/dependency materialization, eligibility participation and season finalization, followed by post-match injuries. `src/app/game/playUserGame.ts` prepares teams, eligibility/availability, lineups, player truth projections, tactics, rotations and seeded RNG for the legacy viewer/instant path, whose `completeMatch` applies the same consequence semantics. The legacy MatchEngine is not the production simulation authority; normal AI/world simulation never falls back to it.

Connected consequences include score/standings/competition progression, player match history/stat logs, eligibility participation, injuries, coach experience/reputation, team/player/coach morale, user-facing media opportunities/news, and season/champion history. Match fatigue is transient to MatchSession; completed user matches also apply bounded Career Fatigue and mapped development stimulus through `PlayerMatchConsequences`, reached from both the legacy viewer path and the canonical resolved-match chain. This does not directly change Player ratings. Scouting evidence, match finance, facility usage/deterioration, relationship changes from ordinary wins/losses, and a general news article for every non-user game remain absent. Memory/narrative input is selective rather than a durable event record for all match events.

## Season lifecycle

`SeasonProgression.finalizeSeason` requires all scheduled games complete (and a postseason champion when applicable), derives standings/champion, stores a `SeasonHistoryRecord`, resolves eligibility, coach reputation/legacy/memories, emits championship news, evaluates the Board, releases the World DB season context, may resolve tier movement, and processes season content such as an NBA-like Draft.

`startNextSeasonFor` creates a future edition, uses promotion/relegation output for participants, creates schedule fixtures, reconciles expired contracts, attempts minimum rosters for AI teams, ensures NCAA eligibility/academics, and rolls Board state. `advanceCompetitionLifecycles` supports round-robin-shaped non-NCAA competitions with at least two participants and atomically linked cup editions. It deliberately diagnoses completed NCAA-like seasons as `UNSUPPORTED_FUTURE_LIFECYCLE`; the simulation does not invent a next NCAA season. Draft generation/AI picks and NCAA recruiting are date-driven but are not a universal season-transition pipeline. `initializeRecruitingCycle` is called at new-world creation; it is not called by `startNextSeasonFor`.

## Events, user surfaces and persistence

- Events are emitted directly to canonical collections by the subsystem that owns the transition (`newsItemsById`, `inboxItemsById`, `mediaOpportunitiesById`, `memoriesById`, histories, and subsystem records). They are not gathered into one common event stream with one priority evaluator.
- Inbox priority has `low`, `normal`, `high`; media has numeric importance. Continue/simulate-until interruption logic does not query general Inbox actions, pending Draft selections, pending trade proposals, Governance decisions/requests, or a unified action-required queue.
- User surfaces include calendar/competition, match viewer, player, medical, training, scouting, staff, finance, Board, recruiting, Draft, trades, media/news and other workspaces. Facilities has canonical domain/engine/integration seams but no equivalent user-facing Facilities workspace was found in `src/ui-ng/applications`.
- `GameSaveService` serializes the full world through Save V4 and reconstructs it through domain factories and `updateGameWorld` validation. MatchSession, match seed, and in-progress viewer state are transient; only completed match score/stat history persists.

## Observed lifecycle edge cases

- **Breakpoint miss:** `ContinueFlow` and `simulateUntilDate` recognize only a subset of interruptions. A user's Draft pick or another pending action can be skipped while time moves forward. Simulate-until also deliberately skips media and instant-resolves a user game on its route.
- **Unsupported NCAA continuation:** the limitation is explicit and returned as a diagnostic; it is not silently repaired.
- **Recruiting cycle generation:** only initial-world construction calls `initializeRecruitingCycle`; next season creation does not. Current NCAA continuation is already unsupported, so no later NCAA edition is automatically created through this route.
- **Recruiting pool repeatability defect:** the `simulateUntilDate.test.ts` comments identify a pre-existing duplicate deterministic player-ID failure when some recruiting cycles are advanced across certain date ranges. This audit did not reproduce it; the test suite works around it by clearing cycles for calendar-only checks.
- **Facilities and Club Finance activation:** facility deterioration and Finance V2 engines are callable and tested, but neither is part of the ordinary calendar order shown above.
