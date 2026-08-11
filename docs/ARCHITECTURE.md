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
stream. The detailed simulation reuses the same base score calculation, so the
same game, strengths, and seeded random source produce the same final score for
Instant Result and MatchViewer.

Events are Engine output, not persisted in `GameWorld`. MatchViewer is a UI
consumer of that output: it reveals events with its own pause and playback-speed
state, but never chooses sporting outcomes. Viewer state lives in a separate
ephemeral Zustand store and is discarded after the match. Playback speed changes
only the visual interval between already-generated events.

Application prepares a user match while its Game remains scheduled. It applies
the final score to `GameWorld` through `applyMatchResult` only when playback
reaches `gameEnd` or the user skips to the end. This keeps the future MatchViewer
and Instant Result paths on one deterministic simulation boundary.

## Possession simulation v2

MatchEngine v2 simulates team-level possessions rather than choosing a final
score first. Each possession consumes a seeded duration, resolves to `shotMade`,
`shotMissed`, or `turnover`, and appends an event with the accumulated score.
`finalScore` is derived from those events. Misses provisionally end the
possession, representing an implicit defensive rebound; no player-level action,
rebound, or individual attribution exists yet.

The current temporary rules are four ten-minute periods and five-minute overtime
periods until a winner exists. These remain prototype rules pending future
CompetitionRules. TeamStrength remains an external temporary abstraction: it
adjusts possession outcome probabilities, including a small home advantage, and
is never stored in Team or GameWorld. RNG is consumed for the opening team and,
per possession, duration then outcome; MatchViewer only replays those generated
events and does not influence them.

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
MatchEngine consumes but never selects it. Lineups are not persisted and events
remain team-level until the later player-action milestone.

Sporting events now carry a transient PlayerId selected uniformly from the
attacking lineup. Actor selection uses the separate deterministic stream
`match-actors-v1:${gameId}`, so attribution does not alter the established
match-outcome RNG. Player ratings do not yet affect individual possession results,
and MatchViewer does not yet consume PlayerId.
