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

## MatchViewer presentation time

Simulation Time and Presentation Time are separate. A live sporting step resolves
at the Engine boundary, while the UI converts its before/after snapshots into one
transient `MatchPresentationSegment`. The viewer presents every game-clock second
of that segment before requesting the next sporting step. Playback speed changes
only presentation duration, never sporting time, RNG, fatigue, or results.

Court positions and abstract motion are deterministic presentation projections,
not sporting state or invented basketball events. A future Engine may add timed
microactions inside the same segment model, and future highlight modes may choose
which segments to present. Coaching remains a sporting-boundary operation: it
cannot rewrite a segment that has already been resolved.

> Every second of game clock may be represented by MatchViewer even when MatchEngine resolves sporting outcomes at a coarser granularity.

> Playback speed changes how fast simulated time is presented, never how sporting time is simulated.

> MatchViewer must finish presenting the current resolved sporting segment before requesting future sporting simulation.

> Presentation may interpolate abstract movement, but it must never invent a sporting event that MatchEngine did not resolve.

## Derived match boxscore

`PlayerMatchStats` and `TeamMatchStats` are transient projections of MatchEvents,
MatchSquads, active lineups, and event sequence. Two- and three-point attempts are
derived from `ShotZone`; plus/minus is assigned to the active fives for each score
delta, including same-clock substitutions in sequence order. All MatchSquad players
have a row, even before playing.

`stealPlayerId` is optional attribution on a turnover and `blockedByPlayerId` is
optional attribution on a missed shot. Their bootstrap Alpha probabilities use the
existing actor RNG and MatchPlayerProfile defensive signals only; they never change
the sporting outcome, clock, possession, fatigue, or score. Live boxscores consume
only revealed events, never Presentation Time's already-resolved future. No stats
are persisted or aggregated; game logs, season, and career statistics remain 027.

## Historical statistics

Each completed Game now owns one immutable `MatchStatLog` in the normalized
`GameWorld.matchStatLogsByGameId` collection. Applying a completed simulation
atomically applies its result and log. Lines preserve the player, team, opponent,
home/away, starter, and full final stat context from that match, including DNPs.

Season and career statistics are pure projections over canonical logs; they are
never independently mutable counters. This supports future transfers and multiple
competitions because team context remains on each historical line. Logs are
JSON-safe in world state but 027 introduces no disk I/O, save schema, or loading;
028 owns that boundary. Future scale may cache projections without replacing logs
as the source of truth.

> A completed game has one immutable statistical log that is the canonical source for all later season and career statistical projections.

> Season and career totals must never be independently mutable counters when they can be derived from canonical game logs.

## Save / Load v1

`GameWorld` is the canonical persistent state. Save v1 serializes it to an explicit, JSON-only `SaveGameEnvelopeV1` (`schemaVersion: 1`, `savedAt`, and `GameWorldSaveV1` payload). Loading treats files as unknown data, validates their structure, and reconstructs the domain world through the canonical factories and semantic validation. Derived season and career statistics are rebuilt from `MatchStatLog`, never saved as counters.

The Tauri Rust layer owns the single manual slot at the application-data path `saves/main.json`. It performs basic envelope validation and writes through a flushed temporary file before replacing the slot. TypeScript invokes this only through the Application save repository; React never receives filesystem paths.

Live sessions, viewer presentation state, playback controls, coaching/substitution drafts, and tactical-plan UI state are transient. Save is unavailable while a live result is not applied; a successful load replaces the world and clears those transients. Future save-schema migrations belong to milestone 075.

Every runtime Team has exactly one `TeamFinances` profile. Save/load enrichment may
deterministically create only missing profiles for legacy or partial Alpha saves,
using active payroll at the world current date; existing persisted profiles remain
unchanged. UI financial projections rely on this invariant and must not mask missing
canonical finance state with fallback values.
Squad financial presentation consumes `TeamFinancialSnapshot`; it never computes or
persists an alternative financial state.

## Player knowledge / scouting v1

Player Truth, observer-relative Knowledge, and future Evaluation/Fit are separate
layers. `PlayerKnowledgeRecord` is sparse Team-owned canonical knowledge: v1 creates
records only for the user Team, with estimated basketball ratings and uncertainty.
Ranges and confidence are derived; a missing record is `UNKNOWN`, never a fallback
to hidden Player Truth. Knowledge is a dated observation and may be inaccurate or
stale after development. Saves preserve it and enrich legacy/partial Alpha saves
deterministically. Manager UI uses Knowledge, while MatchEngine and sporting logic
continue to use Truth. Potential knowledge, Staff, reports, assignments, decay,
Personality, Traits, Perks, Environment and Fit remain out of scope.

## Staff person domain

`StaffPerson` is a persistent human identity with one common bootstrap professional
attribute framework; Assistant Coach, Scout and Medical are assignment roles, not
different attribute schemas. Role proficiency is a rounded derived weighted score,
not stored state or Fit. Zero role weight does not imply the person lacks that
capability. Personality, knowledge, relationships, memory and contextual Fit remain
separate future domains. Staff is not yet integrated into `GameWorld`; 039.2 owns
that boundary. The shared profile is intended to be adaptable to Head Coaches later,
without conflating professional ability with future RPG skills, traits or perks.

## Season progression

A season completes only when every one of its Games has a completed result, never from the calendar date. Applying the final result automatically creates one immutable `SeasonHistoryRecord` in the canonical `seasonHistoryBySeasonId` collection. It snapshots the deterministic final standings, champion Team ID, and latest scheduled game date; it does not duplicate player statistics.

The standings projection is pure Domain logic, reused by Engine presentation and GameWorld history validation. A completed season stops calendar progression until the future offseason milestone; it does not create a following season. Save v1 persists season history while accepting pre-029 active saves that do not yet carry the optional history field.

## Offseason v1

`GameWorld` retains every Season by ID and identifies its only active Season with `currentSeasonId`; historical Seasons, Games, MatchStatLogs, and SeasonHistory records are never overwritten. Starting the next season is a direct deterministic transition: it requires the current completed Season and its history, creates a new season identity and a fresh schedule through the existing round-robin generator, then moves `currentDate` to the new start date.

The next Season starts one calendar year after the preceding Season start and keeps the same competition, teams, coaches, players, rosters, and ratings. It creates no players, development, aging, contracts, or offseason events. Season-specific statistics therefore reset naturally because they project over a new SeasonId; career statistics continue over all retained logs. Save V1 stores `currentSeasonId` and accepts legacy single-season saves by deriving it from their sole Season.

> Starting a new season must create new season and game identities without mutating or replacing any canonical historical season, game, statistical log, or season history record.

> The same season-finalization pipeline applies to every season; it is never specific to Season 1 or Season 2.

## Player bio and age

Players persist canonical `bio` metadata: `dateOfBirth` as a `GameDate`, plus integer `heightCm` and `weightKg`. Age is never stored; it is a pure calendar projection from date of birth and an arbitrary game date (or the world's current date). The Player Bio generator uses a separate deterministic stream keyed by PlayerId, so generating human metadata cannot change names, ratings, roster construction, schedules, or sporting simulation.

New Alpha players receive deterministic adult bios relative to the earliest Season start. Save V1 reads legacy players without bio by enriching them from that same earliest-season reference, then writes explicit bio data on the next save. Height, weight, and age do not affect MatchEngine, MatchPlayerProfile, ratings, fatigue, or team strength in this milestone; future systems may consume them deliberately.

## Player development v1

Offseason development is a pure Engine step invoked exactly once by `startNextSeason`, using each player's age at the target Season start. It changes only canonical bootstrap ratings; IDs, bio, rosters, coaches, logs, and history remain unchanged. The age curve and growth-room calculation are explicitly provisional and do not represent Potential.

Each Player/rating/season transition has an independent deterministic seed. This makes development independent of Player and rating-key ordering, and ensures adding a future rating cannot perturb existing rolls. Development results are transient diagnostics; only the updated Player ratings persist in Save V1. No development happens on load, calendar advance, birthday, or season finalization.

## Player Potential v1

`PlayerPotential.ceiling` is canonical hidden state. It is a bootstrap aggregate development ceiling proxy, not a player overall rating and not a hard maximum for any individual basketball rating. The arithmetic bootstrap ability proxy is used only by Potential and Development; it is neither persisted nor displayed.

The exact ceiling is never presented by UI. UI exposes only `PlayerPotentialBand` (`limited` through `elite`) directly during this pre-Scouting phase. Scouting can later layer knowledge, estimates, ranges, and confidence over the same canonical truth without changing it.

Potential is generated deterministically from its isolated `player-potential-v1:${playerId}` stream, persists across ordinary season transitions, and legacy saves lacking it are enriched deterministically from the player’s current ratings, age at the save world date, and id. Development consumes it only for positive growth; age decline remains unaffected. MatchEngine and MatchPlayerProfile do not consume Potential directly.

Future Potential models may replace this proxy with grouped or attribute-specific potential through the Development boundary. True player potential is canonical hidden information: presentation layers may expose an approximation, but must not expose the underlying exact value unless a future game system explicitly permits it.

## Injuries v1

`InjuryRecord` is canonical historical state in `GameWorld.injuriesById`; Player has no mutable injury flag. Availability is derived from injury dates and game date, with recovery occurring automatically on `expectedReturnDate`. Match squads filter unavailable players while Team rosters remain unchanged. New injuries are deterministic post-match records for players with minutes, using isolated injury RNG streams and a five-available-player Alpha safeguard. MatchEngine receives only available squads and has no medical knowledge. Save V1 persists injuries and legacy saves load an empty history.

## Contract lifecycle and free agency core

Roster membership and contractual rights are separate. Free-agent status is derived from roster membership, contract status and date; it is never a Player flag. Contract termination preserves the agreed term and records an effective early end separately. `PlayerTransaction` is canonical historical state. Expiry reconciliation removes rostered players with no active or scheduled right exactly once and records a deterministic `contractExpired` transaction. This subhito has no signing, release operation, market UI or AI market; those remain later 037 work. MatchEngine does not consume market state.

## Free agency operations v1

Release and signing are pure Application operations. A release terminates an active contract, removes roster membership and records `released`; signing uses deterministic, non-persisted market terms, affordability and a new contract before adding roster membership and recording `signedFreeAgent`. Neither operation changes budgets, player identity, ratings, potential, injuries or historical statistics. Market UI and AI market remain outside this subhito.

## AI roster maintenance v1

At the offseason transition, after development and contract-expiry reconciliation, Application maintains AI teams to a five-player roster minimum. AI teams are processed by TeamId and use the same `signFreeAgent` operation as the user, selecting affordable free agents by salary, then ability proxy, then PlayerId. It never changes budgets, releases players, replaces injuries, or signs for the user team. An explicit non-persisted result reports unresolved teams when no affordable free agent exists.
