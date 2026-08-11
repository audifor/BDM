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
