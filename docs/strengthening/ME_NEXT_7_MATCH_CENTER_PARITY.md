# ME-NEXT 7 · Match Center feature parity

## Scope and result

ME-NEXT 7 restores the useful Match Center layer over Match Next's canonical
frame, events and completed result. The viewer remains presentation-only. The
legacy Match Center is a product reference; its simulation and result
calculations are not imported into the Match Next path.

## Parity matrix

| Feature | Legacy Match Center | Match Next before ME-NEXT 7 | Canonical data exists? | ME-NEXT 7 action |
|---|---|---|---|---|
| Court and player positions | CourtCanvas and MatchCourt | LiveCourtStage rendered the current frame | Yes: active MatchFrame players and ball | KEEP; court remains prominent and token selection opens player inspection |
| Scoreboard and game clock | LiveScore: teams, score, period, game clock, shot clock | MatchScoreboard already exposed teams, score, period, both clocks | Yes: MatchFrame score, period, game clock, shot clock | KEEP |
| Timeouts, team fouls, ruleset badge | LiveScore displayed timeout and foul counts and a ruleset badge | Not displayed | No authoritative timeout/foul counts in Match Next | DEFER_NO_CANONICAL_TRUTH; do not display placeholder zeroes |
| Competition, phase, date, venue | Header and arena metadata | Competition, date, arena and location; no stage key | Yes: Game, Competition, venue projection and optional `competitionStageKey` | IMPROVE; expose the available stage key in the existing metadata header |
| Playback controls | Pause, speed, quarter and match simulation, management controls | Pause/resume, speeds 1/2/4, next possession, simulate final, continue | Yes: UI controls over the canonical live controller | KEEP; no simulation authority moved into the viewer |
| Tactical controls | Legacy control panel exposed editable tactical and timeout actions | No equivalent user editing surface | Setup contains fixed tactical plans; no Match Next live-edit contract | DEFER; do not add legacy gameplay controls to this presentation milestone |
| Play-by-play | Legacy event feed with legacy event descriptions | Match Next event projection showed the newest 20 lines and names for some event kinds | Yes: canonical MatchNextEvent stream and projected PBP | IMPROVE; show the complete supported event feed, newest first, with player names |
| Starting five | Legacy stats did not provide canonical Match Next lineup truth | Starter flag existed only in the rotation/debug disclosure | Yes: `MatchSetup.initialLineups` and MatchFrame starter state | RESTORE; list starters in the match roster surface |
| Current five and bench | Legacy lineup was available through the legacy screen and substitution flow | Rotation/debug disclosure showed active/bench | Yes: MatchFrame active player state plus the dressed setup squads | RESTORE; show current five and all other dressed players as bench |
| Player minutes | Legacy boxscore rendered the supplied minute value | Actual court time existed only in the debug disclosure | Yes: `MatchState.courtTimeTenthsByPlayerId`, projected by the frame | RESTORE; render actual elapsed court time, never target minutes |
| Fatigue | Legacy screen had a fatigue projection | Current match and pre-match values existed in the debug disclosure | Yes: `matchSessionFatigue` and `preMatchCareerFatigue` | RESTORE; show current match fatigue in the boxscore and label both values separately in player inspection |
| PTS, FG M/A, 2PT, 3PT | Legacy boxscore rendered supplied values | PTS, rebounds, steals and FG M/A were in the rotation disclosure | Yes: shot release/made events include shot value and player; score validates points | RESTORE; expose canonical PTS, FG, 2PT and 3PT in live and final boxscore |
| Rebounds and steals | Legacy boxscore rendered supplied values | Rebounds and steals were in the rotation disclosure | Yes: `reboundSecured` and `passIntercepted` events | RESTORE |
| Assists, blocks, turnovers, fouls and free throws | Legacy boxscore showed these columns and derived shooting rates | No corresponding Match Next presentation authority | No complete event attribution/attempt truth for these statistics | DEFER_NO_CANONICAL_TRUTH; omit them instead of presenting synthetic zeros |
| Team totals | Legacy result rows were passed into BoxScore | No normal Match Next team boxscore | Yes: sums of supported canonical player events and frame score | RESTORE; show team points, FG, 3PT, rebounds and steals totals |
| Substitutions | Legacy substitution modal/actions | Canonical substitutions were visible only in the debug disclosure | Yes: Match Next substitution event with player IDs, reason, period and clock | RESTORE; lineups reflect the MatchFrame active state, PBP names OUT/IN, and a compact diagnostic list retains event evidence |
| Player inspection | Legacy MatchCourt selection navigated to a player | Court tokens navigated directly to a player workspace | Yes: player identity/position, live stats, minutes and fatigue in world plus MatchFrame | IMPROVE; selecting a court token or boxscore row opens a compact match inspection with a route to the full player workspace |
| Final whistle | Legacy viewer retained score, PBP and boxscore | Score/result appeared, while detailed player rows were hidden in a result disclosure | Yes: the completed Match Next result retains events, player stats and final state | RESTORE; keep full PBP and the same player/team boxscore visible after completion |
| Live/Instant parity | Legacy had its own match simulation path | Match Next live and instant already share the Match Next kernel/result | Yes: one canonical `MatchNextResult` | KEEP; this milestone changes only the presentation projection |
| Defensive/rotation validation | Not part of the legacy boxscore surface | Detailed Match Next diagnostic trace and rotation table | Yes: responsibilities, assignments, events and rotation state | KEEP AS DEBUG; the normal match experience now shows player usage, minutes, fatigue and substitutions |

## Source inventory inspected

### Legacy reference

- `renderer/src/components/match/MatchViewer.jsx` — layout composition for score,
  controls, PBP, court and boxscore.
- `renderer/src/components/match/LiveScore.jsx` — score, period, game/shot clocks,
  timeout and foul display.
- `renderer/src/components/match/PlayByPlay.jsx` — legacy event feed presentation.
- `renderer/src/components/match/BoxScore.jsx` — supplied legacy stats rendered as
  a wide player table; the component does not establish their authority.
- `renderer/src/components/match/MatchControls.jsx` — legacy management controls.
- `src/ui/screens/MatchViewerScreen.tsx` and `src/ui-ng/applications/match/NgMatchViewer.tsx`
  — legacy/current screen composition and event-to-stat presentation consumers.
- `src/ui-ng/applications/match/engine/TeamBoxScore.tsx` — existing boxscore
  presentation; it consumes legacy `PlayerMatchStats`, including columns that are
  unsupported in Match Next and therefore was not reused for Match Next data.

### Match Next source of truth and surface

- `src/ui-ng/applications/match/NgMatchNextViewer.tsx` — Match Next scoreboard,
  playback, court, PBP and diagnostic trace.
- `src/engine/match-next/frame.ts` and `state.ts` — live player state, court time,
  fatigue, lineups and canonical events.
- `src/app/matchNext/MatchNextResult.ts` — completed stats, result and supported
  PBP projection.
- `src/app/matchNext/MatchNextLiveController.ts` and `MatchEnginePort.ts` — live
  and instant path/result boundaries.
- `src/ui-ng/applications/match/engine/MatchScoreboard.tsx` and
  `LiveCourtStage.tsx` — reused Match Next scoreboard and court presentation.

## Presentation adapter

`projectMatchNextPresentation` in `src/ui-ng/applications/match/MatchNextPresentation.ts`
projects the current frame or completed Match Next result to read-only team/player
rows. It does not persist or mutate match state. Starter lists come from
`MatchSetup.initialLineups`; current five comes from MatchFrame active-player state;
the bench is the setup squad outside that active five. Minutes use actual frame
court time in tenths of seconds. Current fatigue and pre-match career fatigue stay
separate. At the final whistle, player totals are read from the same completed
`MatchNextResult` as Instant.

The live and final boxscore shows PTS, FG M/A, 2PT M/A, 3PT M/A, REB and STL.
Team totals sum those supported player facts; points also agree with the frame
score. The UI deliberately omits AST, BLK, TO, PF and FT because Match Next does
not provide complete authoritative event attribution/attempt facts for them. Their
zero-filled compatibility fields in the shared historical `PlayerGameStatsSnapshot`
are not treated as evidence of a real zero.

The viewer continues to reuse Match Next scoreboard/court components and common
visual styles. It does not import the legacy MatchEngine, legacy stat calculators,
or legacy `MatchSimulation` result path. PBP, current five, substitutions and the
final boxscore all read the same Match Next frame/events/result.

## Focused manual validation

From `C:\BDM-STAGE2`:

1. Run `npm run dev` and open the normal BDM career screen.
2. Open a scheduled game and choose the normal Match Live action, not Instant Result.
3. Confirm both team names, competition/date/venue, score, period, game clock and
   shot clock remain visible above the court.
4. Watch the court and boxscore together. Confirm the active five is marked PISTA,
   the rest of the dressed squad is BANQUILLO, and starter labels remain visible.
5. After a player has spent time on court, compare MIN with the live game clock;
   inspect a player to see current match fatigue and separately labeled pre-match
   fatigue.
6. Confirm PTS, FG, 3PT, REB and STL update as Match Next events occur. Unsupported
   columns (AST, BLK, TO, PF, FT) are intentionally absent.
7. When a substitution occurs, verify the player leaving becomes BANQUILLO, the
   incoming player becomes PISTA, and the PBP identifies both players with period
   and game clock.
8. Scroll the PBP to confirm it retains the full supported match event sequence.
9. Pause/resume, change speed, then use Simular final. Confirm final score, PBP,
   minutes, lineups and the same player/team boxscore remain on screen.

Normal player usage/minutes/fatigue and canonical statistics are visually
inspectable without opening developer tools. Statistics omitted for absent
canonical truth cannot be validated until a future Match Intelligence/statistics
milestone adds those engine facts.

## Remaining gaps

- Match Next does not yet emit complete assists, blocks, player fouls, turnovers,
  free-throw attempts/makes, timeout counts or team-foul counts.
- Live tactical editing and user-requested substitutions are not added by this
  presentation milestone; the existing canonical Match Next coach rotation remains
  in charge of substitutions.
- Team logos remain the existing text marks/team colors rather than new logo assets.
