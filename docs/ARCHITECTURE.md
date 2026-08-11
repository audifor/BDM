# BDM architecture

## Layers

The dependency direction is `UI -> Application -> Engine -> Domain`.

- **Domain** contains framework-independent game concepts and invariants.
- **Engine** contains framework-independent simulation systems. It may depend on
  Domain, but never on React, Zustand, Tauri, UI, or Application.
- **Application** coordinates use cases for the UI and persistence boundaries.
- **UI** is React presentation. Feature composition and Zustand stores are UI-side
  concerns; neither is a game engine.

The Domain and Engine must run and be testable with plain TypeScript, without
React, Zustand, or Tauri.

## Zustand

Zustand is only a bridge between Application services and React. Stores hold
UI-facing state and commands; they do not own domain rules or simulation state.

## Tauri and Rust

Rust is reserved for native Tauri capabilities such as filesystem operations and
save validation where native enforcement is appropriate. Game rules and simulation
remain TypeScript. Tauri is an outer adapter and is not imported by Domain or Engine.

## Matches and deterministic simulation

`MatchEngine` and `MatchViewer` will remain separate systems: the engine simulates
and produces match data, while the viewer presents it. The viewer must not influence
simulation results.

Every future simulation must be deterministic for a supplied seed. Direct
`Math.random()` is prohibited in simulation code; it must use a seed-driven random
source through the `RandomSource` boundary.

## Domain primitives

Entity IDs are nominal TypeScript string types: they prevent accidental mixing at
compile time while remaining directly JSON-serializable and reconstructible from
saved strings. `GameDate` is a calendar-only `YYYY-MM-DD` value, independent of
timezone; JavaScript `Date` is not a persisted game-calendar representation.

Simulation services receive `RandomSource` (or an equivalent abstraction) rather
than sourcing randomness themselves.

## Domain entities

Domain entities are plain serializable data created through validating factories.
Relationships have one canonical direction: teams hold their roster and optional
coach reference, while players and coaches do not hold a team reference.

`Competition` is the enduring institution and `Season` is one dated edition of it.
`Game` is independent of `MatchEngine`; it records only a scheduled/completed state
and a completed game's basic final score.

## GameWorld

`GameWorld` is the canonical, serializable persistent state of one BDM game. It is
pure TypeScript, not a Zustand store, and stores normalized entity collections by
ID. Relationships are references by ID and are validated when the world is created.

Derived data is not persisted when it can be resolved from canonical entities.
Future engines may define controlled world updates, but that behavior is not part
of `GameWorld` itself.

`WorldGenerator` belongs to Engine and creates a `GameWorld` through its canonical
factory. Its procedural content uses deterministic `RandomSource`; generated IDs
are deterministic sequence strings independent of that random stream. The same
seed and generator options reproduce the same world.

`ScheduleGenerator` belongs to Engine. It reads participants from `Competition`,
returns scheduled Domain `Game` data, and never modifies `GameWorld`. The current
schedule is a deterministic home-and-away round robin with no RNG or simulation
logic.

`MatchEngine` belongs to Engine and is separate from both state transition and
`MatchViewer`. It receives a `RandomSource` externally and returns only a final
`MatchSimulationResult`; it never changes `GameWorld` or `Game`. MatchEngine v0
uses temporary `TeamStrength` inputs, which are not persisted in Team or GameWorld,
and does not yet create possessions or events.

The match pipeline is `MatchEngine -> MatchSimulationResult -> Match Result
Application -> GameWorld`. Simulation does not mutate state; result application
does not simulate. `MatchSimulationResult` is transient, while `Game.result` is
the canonical persisted final score. The current transition rebuilds GameWorld via
the canonical validator; future optimization requires profiling evidence.

`Standings` belongs to Engine and is a derived projection of completed `Game.result`
data for a Season. Wins, losses, and points are not persisted in Team or GameWorld;
the table can be recalculated at any time. Its current neutral tie-break order is
wins, point difference, points scored, then TeamId; future competition rules may
replace it.

`CalendarEngine` controls temporal progression. `advanceDay` creates a new
GameWorld with only `currentDate` changed; simulating or applying games remains a
separate responsibility. Date-based game queries and `CurrentDateStatus` are
derived projections with no persisted date index. The user team is derived through
`userCoachId -> Team.coachId`, so a user coach may validly have no team.

## First playable prototype

`app/game` is the application boundary for the first UI loop. It creates the
prototype world and schedule, coordinates MatchEngine with result application,
and resolves today's games before requesting CalendarEngine to advance the date.
Zustand stores only the current `GameWorld` and delegates each command to that
layer; React only renders derived information and invokes store commands.

Team strength is temporarily a non-persisted value of 50 for every team. Match
randomness is provisionally seeded from a stable explicit hash of each `GameId`;
this makes one game's instant result reproducible without introducing persistent
career RNG state. A future ratings and save-system design will replace both
prototype choices.

## Match simulation and viewer

`MatchEngine` can produce either a final `MatchSimulationResult` for Instant
Result or a transient `MatchSimulation` containing a chronological `MatchEvent`
stream. Its core is a transient MatchSession: it retains immutable sporting state
and the supplied sporting and actor RNG runtimes while advancing one logical
possession or period transition at a time. `simulateMatchDetailed` simply steps a
MatchSession until completion, so it remains the convenient complete-simulation
API and no second sporting algorithm exists.

Events are Engine output, not persisted in `GameWorld`. MatchViewer is a UI
consumer of that output: it reveals events with its own pause and playback-speed
state, but never chooses sporting outcomes. Viewer state lives in a separate
ephemeral Zustand store and is discarded after the match. Playback speed changes
only the visual interval between already-generated events. It still consumes a
complete MatchSimulation in this milestone; MatchSession has no timers and is the
future seam for coaching decisions, substitutions, rotations, fatigue, and tactics,
none of which exist yet. Mid-match sessions and RNG state are not persisted.

Application prepares a user match while its Game remains scheduled. It applies
the final score to `GameWorld` through `applyMatchResult` only when playback
reaches `gameEnd` or the user skips to the end. This keeps the future MatchViewer
and Instant Result paths on one deterministic simulation boundary.

## Possession simulation v2

MatchEngine v2 simulates team-level possessions rather than choosing a final
score first. Each possession consumes a seeded duration, resolves to `shotMade`,
`shotMissed`, or `turnover`, and appends an event with the accumulated score.
`finalScore` is derived from those events. Every missed field goal is followed by
an explicit rebound: sporting RNG resolves ownership from the active fives'
rebound-impact strengths, while actor RNG chooses the winning team's rebounder.
An offensive rebound keeps the attacking team in possession, while a defensive
rebound changes it. The next action still consumes normal possession time.

The current temporary rules are four ten-minute periods and five-minute overtime
periods until a winner exists. These remain prototype rules pending future
CompetitionRules. TeamStrength remains an external temporary abstraction: it
adjusts possession outcome probabilities, including a small home advantage, and
is never stored in Team or GameWorld. RNG is consumed for the opening team and,
per possession, duration then outcome; MatchViewer only replays those generated
events and does not influence them.

Shooting fouls are a separate prototype possession outcome. A provisional 10%
sporting-RNG decision emits a `foul` attributed to the primary matchup defender, then
exactly two same-clock free throws by the attacking actor. Each provisional 75%
free-throw outcome uses sporting RNG; after the second attempt possession changes
to the defender. Free-throw misses do not yet create rebound events. This is not a
universal FIBA/NBA/NCAA rule: bonus, foul-out, substitutions, and future variants
are deferred to CompetitionRules. The previous abstract one-point field goal has
been removed from productive simulation.

## Player basketball domain

Player now persists a `BasketballProfile` with one primary position and seven
source ratings. No overall is stored. MatchEngine does not consume these ratings
yet; WorldGenerator uses a temporary constant profile only to satisfy the new
contract until its procedural player-profile migration in the next milestone.

WorldGenerator now creates deterministic player profiles with a provisional
2 PG / 3 SG / 2 SF / 3 PF / 2 C roster composition. Each profile uses a
Player-derived RNG stream independent of names; ratings have soft positional
tendencies and no persisted overall. MatchEngine still uses its provisional
TeamStrength and does not consume player ratings.

Match preparation derives each Starting Five before entering MatchEngine. The
resulting transient `MatchLineups` is stored in MatchSimulation as a snapshot;
MatchEngine consumes but never selects it. Lineups are not persisted.

Application also prepares `MatchSquads` from the two Team rosters. They define
eligible players for one transient match; MatchEngine never queries GameWorld for
roster data. `MatchSimulation.lineups` remains the historical initial-five
snapshot. A MatchSession separately retains `initialLineups` and `activeLineups`:
an explicit substitution event reconstructs the latter without advancing clock or
score and without consuming either RNG stream. Actors are selected from
`activeLineups`. Base TeamStrength remains fixed for the full match, while live
fatigue applies a transient effective-strength penalty. PlayerMatchStats introduces an
incoming bench player only once its substitution event is revealed, preserving
partial-viewer anti-spoiler behavior.

Automatic rotations are a separate Engine orchestration layer: MatchEngine can
execute a requested substitution but never decides when a player rests.
Application builds deterministic per-team RotationPlans from the prepared squad,
starters, and PlayerImpact, then the RotationController applies due instructions
between `stepMatchSession` calls through `substitutePlayer`. Rotation v1 uses up
to ten players (starters plus one unique primary backup per position), with a
temporary Q1--Q4 pattern; deeper bench players may not play. Plans and their
controller state are transient, consume no RNG or clock, and do not change score.
The user team and AI teams both use this automatic plan temporarily. MatchViewer
reconstructs court tokens from revealed substitution events, so playback, pause,
and skip cannot reveal a future lineup. Base TeamStrength remains fixed while
fatigue adjusts effective strength; no fatigue-aware rotation policy,
manual controls, or overtime-specific rotation policy exist. Future
manual substitutions will need to reconcile user choices with a pending plan.

Player minutes are a separate derived projection, not live match state. The
chronological `MatchSimulation` timeline (period starts/ends, event clocks, and
substitutions) is the source of truth for integer `secondsPlayed` in
`PlayerMatchStats`. Each clock delta is assigned to the five active players per
team; same-clock events add no time, outgoing players stop accumulating, incoming
players start at zero, and re-entry continues the same row. Partial Viewer event
subsets cannot expose future players or future seconds. This projection is not
persisted and does not affect results, TeamStrength, or player ratings. Future
fatigue is intentionally different: it will be live transient MatchSession state
because it influences what happens next, rather than a reconstruction of what
already happened.

Live fatigue is transient `MatchSession` state on a 0--100 scale. The provisional
gain/recovery constants are 0.04 and 0.025 per game-clock second, with a maximum
20% penalty based on the active five's average fatigue. Active players gain and
bench players recover only during game-clock seconds; quarter breaks do not
recover fatigue in v1. Fatigue consumes no RNG, is not persisted, does not add
events, and does not use stamina or athleticism. Viewer condition (`CON`) is
derived from the same revealed-event fatigue projection as `100 - fatigue`.

Sporting events carry transient PlayerIds from the active lineup. Detail
attribution uses the separate deterministic stream
`match-actors-v1:${gameId}`, so assists and rebounder identity do not alter the
established match-outcome RNG.

The seven persisted bootstrap ratings are not BDM's final attribute model.
Application adapts them into transient `MatchPlayerProfile` signals before a
match, so MatchEngine consumes usage, rim attack, shooting, creation, ball
security, defensive signals, and rebound impact rather than reaching into Player
ratings. Rebound impact currently derives from rebounding and athleticism. Future
larger attribute sets, traits, perks, tendencies, and contextual modifiers can
change this adapter or add composable modifiers without changing the possession
loop. There is no persisted overall.

Player-driven offense uses a dedicated deterministic decision RNG
(`match-decisions-v1:${gameId}`) for weighted offensive-actor and shot-zone
selection. Sporting RNG resolves the contextual sporting outcome, while actor RNG
remains detail attribution for assists and rebounders.
Field-goal events carry `rim`, `midRange`, or `threePoint`; zone determines points.
MatchPlayerProfile also adapts the persisted bootstrap ratings into defensive
point-of-attack, interior, and mobility signals; MatchEngine remains isolated from
persisted ratings. For each possession, deterministic one-to-one defensive
assignments are derived from active lineups, canonical PG-to-C positional distance,
then mobility and PlayerId tie-breaks. They are neither persisted nor random, so a
substitution automatically produces new assignments.

ShotAttemptContext now contains the real shooter and primary defender with each
player's individual fatigue. Rim shots use 80% interior and 20% mobility; midrange
uses 65% point-of-attack and 35% mobility; threes use 75% point-of-attack and 25%
mobility. Defender fatigue subtracts up to 12 signal points before the provisional
defense adjustment. TeamStrength is no longer a field-goal defense proxy. Made and
missed shot events preserve `defenderPlayerId`, and shooting fouls are committed by
that primary defender.

Turnovers are a sporting-RNG result of the active ball handler's ball security
against the primary defender's point-of-attack/mobility pressure; fatigue reduces
both effective signals. Assists remain non-sporting actor-RNG attribution: their
zone baseline is adjusted by the other active teammates' average creation, then an
eligible non-scorer is selected by creation weight. Rebound ownership is a
sporting-RNG result of the active five's average rebound impact on each side; the
capturing active player is then selected by rebound-impact weight through
actorRandom. TeamStrength does not directly participate in shooting, defense,
turnovers, assists, or rebounds. Decision RNG remains limited to offensive actor
and shot-zone selection. Steals, blocks, schemes, new attributes, traits, and
perks do not yet exist; all current formulas are replaceable prototypes.

## Pre-match tactics v1

`MatchTacticalPlan` is transient match configuration, retained by MatchSession but
not persisted in Team, Coach, GameWorld, or saves. The balanced default is neutral:
pace changes only the existing possession-duration draw, shot profile changes only
shot-zone decision weights, defensive emphasis changes contextual effective defense
with explicit trade-offs, and a featured active player receives a usage-weight
multiplier. No tactic mutates ratings or MatchPlayerProfile. Application supplies
the user-selected pre-match plan to both Play and Instant Result; AI uses balanced.
There are no live tactical changes or events in 023, though the session boundary is
ready for a future between-steps update. Plays, schemes, scouting, tactical AI, and
the final tactical model remain intentionally open for a later overhaul.

## Live coaching v1

PLAY GAME owns a live MatchSession through an Application controller: sporting
steps are generated only when playback requests them, never precomputed ahead of
the viewer. Instant Result runs that same session flow to completion. MatchCoachingState
is the live-coaching boundary and currently contains only each team's current plan.
An atomic tactical change is validated between steps, consumes no clock, fatigue or
RNG, and is recorded as a historical `tacticalChange` event. It can affect future
steps but never rewrites sporting history. React and Zustand hold viewer/draft state
only; they do not run the engine. Future shouts, timeouts and staff insights remain
unimplemented.

Manual substitutions are live-coaching personnel commands, separate from tactical
context. A validated batch is atomic, uses the same `substitutePlayer` primitive
and emits one same-clock event per change with a `manual` source. It consumes no
clock, fatigue or RNG. Automatic RotationPlan instructions remain active but are
reconciled harmlessly when a user lineup has made an instruction incompatible;
future rotation systems may replace this Alpha behavior.

The manual-substitutions draft is ephemeral React UI state. It begins from the
currently revealed active lineup, derives its bench from the transient MatchSquad,
and submits only its final differences through the Application/store boundary.
React neither owns MatchSession nor validates or mutates it directly. Applying a
draft changes only future live steps; MatchViewer v2 remains a separate future
milestone.

> A viewed match must never precompute sporting outcomes that the user can still influence through future coaching decisions.

> Coaching decisions may alter the future simulation trajectory but must never rewrite already-resolved sporting history.

> A MatchSession is complete only after a non-tied final score exists. A tie at the
> end of regulation or overtime creates another overtime period, never `gameEnd`.
> Viewer and Application must rely on MatchSession's terminal `gameEnd`, not a
> period number, clock, or currently available event count.

MatchViewer consumes the transient lineup snapshot in MatchSimulation; it never
selects starters. UI resolves those PlayerIds and sporting-event PlayerIds through
GameWorld at render time, so names are not duplicated into MatchEvents. Court
coordinates are presentation-only UI slots derived from primary position, never
data on Player, Team, MatchSimulation, or GameWorld. Individual player statistics
are a transient Engine projection: PlayerMatchStats is reconstructed from
MatchSimulation lineups and MatchEvents and is never persisted. MatchViewer passes
only revealed events to that projection, so its live boxscore cannot expose future
events. This v1 contains points, field goals, turnovers, offensive and defensive
rebounds, assists, free-throw makes/attempts, and fouls committed; all remain
derived and non-persistent. Free throws are not field goals. Other player
statistics do not yet exist.
