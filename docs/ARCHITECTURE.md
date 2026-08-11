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
an explicit rebound: a provisional 25% sporting-RNG offensive-rebound decision
keeps the attacking team in possession, while a defensive rebound changes it.
The actor RNG selects the rebounder from the winning lineup. The next action still
consumes normal possession time.

The current temporary rules are four ten-minute periods and five-minute overtime
periods until a winner exists. These remain prototype rules pending future
CompetitionRules. TeamStrength remains an external temporary abstraction: it
adjusts possession outcome probabilities, including a small home advantage, and
is never stored in Team or GameWorld. RNG is consumed for the opening team and,
per possession, duration then outcome; MatchViewer only replays those generated
events and does not influence them.

Shooting fouls are a separate prototype possession outcome. A provisional 10%
sporting-RNG decision emits a `foul` attributed by actor RNG to a defender, then
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
`match-actors-v1:${gameId}`, so attribution does not alter the established
match-outcome RNG. A provisional 60% actor-RNG attribution may add an assist to a
made two- or three-point field goal; the assister is another player in the scoring
lineup. Player ratings do not yet affect individual possession results, rebounds,
or assists.

The seven persisted bootstrap ratings are not BDM's final attribute model.
Application adapts them into transient `MatchPlayerProfile` signals before a
match, so MatchEngine consumes usage, rim attack, shooting, creation, and ball
security rather than reaching into Player ratings. Future larger attribute sets,
traits, perks, tendencies, and contextual modifiers can change this adapter or
add composable shot modifiers without changing the possession loop. There is no
persisted overall.

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
that primary defender. Schemes, switches, blocks, steals, turnover pressure, and
rating-weighted rebounds or assists remain future work; all current formulas are
replaceable prototypes.

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
