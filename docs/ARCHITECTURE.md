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

## Training V1

Each Team has a persisted `TrainingPlan` with intensity (`light`, `normal`, or
`high`) and a focus (balanced or one basketball rating). Calendar advancement
recovers persistent Career Fatigue, then runs one deterministic TrainingSession
for every team without a game that day. User and AI teams use the same plan,
execution, fatigue and development pipeline; AI V1 keeps the default normal /
balanced plan.

Training never changes Player ratings directly. It accumulates per-player,
per-rating Development Stimulus. The canonical offseason PlayerDevelopment
transition consumes that stimulus as a bounded input to its existing age and
potential logic, then resets it, so it cannot be applied twice. Plans, sessions,
stimulus and Career Fatigue are canonical GameWorld state and save/load data;
legacy saves default to normal/balanced plans, no sessions, neutral stimulus and
zero fatigue.

Career Fatigue is persistent 0--100 training load with daily recovery and a
moderate training-efficiency penalty. It is intentionally separate from the
transient MatchSession Fatigue projection: Training V1 does not affect
MatchEngine. The UI exposes the user team's plan, latest session, fatigue summary
and training progress without presenting stimulus as already-earned ratings.

`WorldGenerator` belongs to Engine and creates a `GameWorld` through its canonical
factory. Its procedural content uses deterministic `RandomSource`; generated IDs
are deterministic sequence strings independent of that random stream. The same
seed and generator options reproduce the same world.

`ScheduleGenerator` belongs to Engine. It reads participants from `Competition`,
returns scheduled Domain `Game` data, and never modifies `GameWorld`. The current
schedule is a deterministic home-and-away round robin with no RNG or simulation
logic.

## Competition Rules

`Competition.rules` is canonical, serializable configuration; fixtures, results,
standings and season history are competition state. The current single-competition
ruleset is a league round robin with two balanced home/away meetings per pair,
standings ordered by wins, point difference, points scored and TeamId, completion
only after every scheduled game is completed, and champion as the final standings
leader. `ScheduleGenerator`, standings and season finalization consume these rules;
no derived team count or standings is persisted. Save V1 preserves rules and enriches
legacy competitions with this canonical ruleset deterministically. Hito 047 supports
only the current single competition; multi-competition world coordination belongs to
Hito 048 supports multiple simultaneous competitions using the current league/
round-robin rules engine. `GameWorld.competitions` is the canonical normalized
collection; a Team may occur in multiple Competition participant lists, while every
Game explicitly belongs to exactly one CompetitionId. Calendar and training operate
over all world Games, and GameWorld rejects two games for one Team on one date.
Standings, completion and champions are Competition-scoped; the world season is
complete only when all concurrent competition seasons are complete. Save V1 already
persists normalized competitions and games, so legacy single-competition saves load
as the same one-entry collection. The starter career now demonstrates a primary
eight-team league and an offset four-team secondary league with deterministic IDs.
## Sports ecosystems

`SportsEcosystem` is the organizational boundary above a `Competition`. The first
starter ecosystem is a fictitious `fibaLike` federation; its competitions retain
their own participants, rules, Games and Season editions. A Competition explicitly
references its ecosystem, while teams remain shared entities and their membership is
derived from competition participants. Competition editions do not share a mandatory
global season window: each Season supplies its own start/end window, and the global
calendar merely advances `GameWorld.currentDate`. Standings and champions remain
competition-scoped; a later-starting competition may complete while another remains
active. Ecosystems and competition links persist in Save V1; legacy saves enrich to
the deterministic default FIBA-like ecosystem. Promotion/relegation belongs to Hito
050, and NBA-like/NCAA-like rules remain outside this milestone.

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
separate future domains. Staff is normalized in `GameWorld` through people and
assignments rather than role-based person subtypes. The shared profile is intended
to be adaptable to Head Coaches later, without conflating professional ability with
future RPG skills, traits or perks.

Staff v1 world integration stores normalized `staffPeopleById` and
`teamStaffAssignmentsById`. The Alpha generator deterministically assigns one
Assistant Coach, Scout and Medical person to each generated Team; this is fixture
data, not a universal vacancy rule. No Staff effects exist yet.

Every productive `GameWorld` transformation unrelated to Staff must preserve
`staffPeopleById` and `teamStaffAssignmentsById` exactly. Season transitions do
not currently alter Staff: identity, professional truth and assignments remain
unchanged until an explicit Staff lifecycle system exists. Missing runtime Staff is
corruption, not a signal to regenerate it during persistence.

## Staff v1 presentation

`StaffScreen` presents canonical `StaffPerson` and `TeamStaffAssignment` data for
the user Team. Every assignment uses the same professional capability framework;
role-specific presentation never hides human capabilities. Role proficiency and
cross-role evaluation are derived outside React, and cross-role capability is not
contextual Fit. Staff v1 has no actions or bonuses: professional attributes are
bootstrap truth, not Personality, and no Staff Knowledge layer exists yet.

The presentation may later grow from the same `StaffPersonId` toward personality,
traits, career, reputation, relationships, memory, history and drama without
replacing identity. A future Staff Knowledge/Perception layer and contextual Fit
remain distinct from Staff Truth and role proficiency.

> Staff UI presents people, not role-specific stat containers. Every staff member
> exposes the same professional capability framework.

> React consumes canonical Staff queries and derived role proficiency; it must not
> reimplement role weights or business rules.

## Coach RPG domain foundation

Coach RPG is a pure Domain foundation reusable by any `Coach`, never a user-only
subsystem. Head Coaches will converge on the same common professional attribute
framework as Staff, but 040.1 does not yet integrate a profile into `Coach`,
`GameWorld`, generation or saves; 040.2 owns that integration.

Professional attributes, accumulated experience, Skills, Professional Traits,
Perks and Personality are separate concepts. Experience is an unbounded,
decimal-capable aggregate ledger rather than micro-event history. Development
Points are scarce player-directed choices for future Skills and Perks, never a
direct currency for arbitrary professional attributes. Professional attributes will
primarily develop through targeted experience in 040.3, with diminishing returns
to be defined then.

Professional Traits describe career-developed professional characteristics, not
deep Personality. Perks should primarily unlock contextual capabilities,
information, options or system interactions rather than defaulting to flat stat
bonuses. Future paid education buys learning opportunities that enter this same
experience architecture, never direct attributes. Losses may also teach; experience
is not a reward for winning. Future XP allocation will consider difficulty,
relevance, novelty, responsibility and competitive level to prevent farming.

040.1 defines only types, validation, optional rookie presets and pure profile
initialization. 040.3 will add XP/development, 040.4 catalogues and unlocks, and
040.5 persistence/UI. Personality, relationships, memory, drama, finances and
courses remain outside this milestone.

> Coach RPG progression must be modeled for Coach entities generally, not as a
> user-only subsystem.

> Professional attributes, accumulated experience, skills, professional traits,
> perks and personality are separate concepts and must not be flattened into one
> progression number.

> Experience may accumulate granularly and indefinitely; canonical state stores
> aggregated experience rather than every micro-event.

> Development Points represent scarce player-directed RPG choices and must not
> become a direct currency for purchasing arbitrary professional attribute values.

> Professional Traits remain distinct from deep Personality. Perks should favor
> contextual capabilities over universal flat percentage bonuses.

## Coach RPG world setup

`GameWorld` normalizes `coachProfessionalProfilesByCoachId` and
`coachRpgProfilesByCoachId` separately. Any Coach may participate; the
user-controlled Coach is not a special RPG entity. Coach identity, nationality and
team assignment remain authoritative in the existing `Coach` and `Team` models.

Head Coaches use the same thirteen professional attributes as Staff. Their
bootstrap role weights only evaluate and generate a Head Coach professional profile;
they are not a new capability taxonomy or contextual Fit. The user starts from a
deterministic rookie baseline, where `blank` means no preset modifier rather than
zero attributes. Optional presets are applied once during setup and are not stored
as canonical identity or classes. AI profiles use CoachId/attribute-isolated
deterministic streams.

Every generated Coach starts with a zeroed RPG ledger, progress, points, Skills,
Traits and Perks. Initial professional truth and tracked experience are deliberately
different: a capable generated Coach still begins with an experience ledger of zero
in this bootstrap phase. Runtime transformations unrelated to Coach RPG preserve
both maps exactly.

040.2 does not serialize or regenerate Coach profiles. Save loads therefore create
empty runtime maps until 040.5 adds persistence and legacy handling; missing maps
after a normal runtime transformation remain corruption, not a signal to regenerate.
Coach and StaffPerson technical identities also remain distinct for now, while the
shared professional profile keeps a future Staff-to-Coach career path open. Future
paid education will feed targeted Experience, never direct professional attributes.

> Every Coach may participate in the same Coach RPG architecture; the
> user-controlled coach is not a separate RPG entity type.

> Starting presets are setup conveniences, not permanent classes or canonical
> identity. Gameplay depends on the resulting professional profile, never preset name.

## Coach experience and development

`engine/coach` owns the pure Coach Experience boundary. Sources emit a small
`CoachExperienceGain` and `applyCoachExperienceGain` updates a professional profile
and its RPG profile without mutating either input. In this bootstrap version the
experience ledger means available, consumable professional XP; it is deliberately
not a lifetime event history. Values are normalized to four decimal places.

Match completion is the only productive source in 040.3. The canonical result
application derives one gain for each involved head coach from pre-match TeamStrength,
final margin and result, after the Game is completed. The existing scheduled-to-
completed Game guard makes that application exactly once; MatchEngine has no Coach
RPG dependency. Loaded 040.2--040.4 saves may have no Coach profiles, in which case
their sporting result still applies and progression is safely skipped without
regeneration. Save persistence remains 040.5.

Specific XP pays an increasing `20 + attribute² × 0.12` cost for each integer
professional-attribute level. Remaining XP stays available, including at 100.
Global progress creates unspent Development Points at 100 progress and carries the
remainder. Skills, professional traits and perks are unchanged here; spending and
unlocks belong to 040.4. Future sources may use this same gain boundary, and future
anti-farming can consider novelty, familiarity, responsibility, relevance and stakes
without storing micro-events.

## Coach skills, traits and perks

Coach Skills are a closed declarative catalog of deliberate ranks 0--3. They cost
1/2/3 Development Points sequentially, require their current primary professional
attribute only at ranks 2 (45) and 3 (60), and reduce the matching learning cost by
2% per rank. The reusable development boundary caps all learning reductions at 15%;
it does not create Experience, global progress or Development Points.

Professional Traits are a separate permanent identity layer. Generic, non-negative
evidence is accumulated without micro-event history and reconciliation deterministically
adds the approved Trait only after its threshold and Skill prerequisite are met.
Perks are one-time contextual capabilities, queried through the catalog rather than
rechecked by consumers. Four Career Focus perks exist and a Coach may acquire at most
two. Skills, Traits and Perks have no direct MatchEngine effect in 040.4. Missing
runtime Coach profiles make all of these operations fail safely until 040.5 persistence.

> Coach Professional Profile and Coach RPG Profile are separate canonical concepts:
> current professional ability is not equivalent to accumulated tracked experience.

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

## Coach Reputation

## Relationships v1

Relationships are canonical sparse `GameWorld` state keyed by a directed pair of
existing people (Coach, Player, or StaffPerson). A missing profile means Neutral
at 0 on the -100--100 scale; profiles are only materialized after a non-zero
Relationship Event. Events are immutable, deterministic caller-supplied records
and idempotent per relationship by event ID. Applying an event returns a new
world, clamps the value, and never affects MatchEngine. Save V1 persists the
materialized profiles and reads pre-043 saves as an empty relationship collection.

The current UI exposes only materialized relationships involving the user Coach.
It derives that display from `GameWorld` through Zustand selectors; it has no
independent relationship state. Automatic gameplay consequences are intentionally
deferred: no present subsystem supplies a non-arbitrary interpersonal signal.

## Personality and Morale v1

Every Player, Coach and StaffPerson has a deterministic, persisted Personality with
six 0--100 dimensions: ambition, professionalism, loyalty, resilience,
temperament and teamOrientation. It is generated from stable identity for legacy
saves, so repeated loads are identical. Morale is separate canonical person state:
it starts at 50, has derived Very Low/Low/Stable/Good/Excellent bands, and keeps
immutable idempotent events. Personality moderately and deterministically adjusts
an event's morale impact without altering the event itself.

Match results apply small post-result morale events to the involved players and
coaches; MatchEngine remains unaware. Save V1 persists both profiles and event
history; legacy saves receive deterministic Personality and empty 50 morale.
Coach and Squad presentation derive their displays from GameWorld. Memory, media,
board systems, narratives, factions, daily decay and MatchEngine morale bonuses
remain out of scope.

## Inbox and News v1

Inbox is coach-directed canonical state while News is a public chronological world
feed. `GameWorld` stores normalized inbox and news collections. Inbox has
unread/read/archived statuses, low/normal/high priority, broad categories and
typed action references; read/archive are immutable world operations. Queries own
the deterministic date-descending, ID-ascending ordering and unread count.

Pending user Coach job offers create high-priority actionable Inbox items. Coach
appointments, dismissals and season champions create idempotent News from their
canonical career/season facts. Save V1 persists these items; legacy saves start
with empty collections and do not reconstruct history. HOME derives recent Inbox
and News directly from GameWorld. Dynamic narratives, media, press conferences,
desktop notifications and mail threads remain out of scope.

## Coach Career v1

Coach Career is canonical world state: every Coach has Employment and append-only Career History, while Teams retain the authoritative optional `coachId`. GameWorld validates both directions and persists employment, history, job openings, candidacies, interviews and offers. Legacy saves enrich assigned coaches with an initial appointment at the saved current date and leave unassigned coaches unemployed.

The Application career boundary creates deterministic openings, evaluates the existing Reputation requirement, and drives candidacy, scheduled/completed interview, offers, hiring, moves and firing atomically. AI ranks eligible candidates using the temporary equal-weight mean of the four Reputation dimensions with CoachId tie-break; it is not stored as an overall reputation. AI accepts automatically, whereas User Coach offers remain pending for the UI.

Coach UI presents current employment, chronological history, active processes and pending offers. Accept/decline commands delegate to Application boundaries through Zustand without duplicating career state or rules. Global job markets, contracts/salary, negotiation/agents, Board Confidence, automatic firing, media/relationships and complex interviews remain future work.

Coach Reputation is a persistent, Coach-owned career perception layer. `GameWorld`
stores one `CoachReputationProfile` per `CoachId`; it is never Team state, has no
overall/average score, and uses four independent dimensions: Competitive,
Development, Professional, and Public Standing. Each dimension is canonical on a
0--1000 scale, starts at 200 for every new User and AI Coach, and exposes a derived
band from Unknown through Legendary. Profiles persist their current values and
immutable event history; bands, recent-event lists, opportunity eligibility, and UI
labels are derived and are not saved. Older saves are enriched once with neutral,
empty profiles and never receive invented historical events.

Match consequences run after the canonical result application, outside
`MatchEngine`. They reuse the real TeamStrength calculation and a deterministic
expectation of `0.5 + (own - opponent) / 100`, adjusted by +0.05 at home or -0.05
away and clamped to 0.15--0.85. A win/loss produces `surprise = actual -
expectation`, then `round(surprise * 12)` Competitive and `round(surprise * 4)`
Public Standing. The event records its contextual strength and expectation snapshot
and has a deterministic game-and-coach ID, so User vs AI and AI vs AI outcomes are
idempotent and use the same rules. Normal match results do not change Development
or Professional reputation and never influence simulation RNG, score, lineups, or
player performance.

Season finalization reuses the canonical champion and awards that Team's Coach one
deterministic `champion` event for +40 Competitive and +20 Public Standing. The
Domain requirement evaluator is the future opportunity boundary; it reports unmet
dimensions without creating a job market. Domain also owns recent-event ordering.
Zustand exposes derived selectors only, while `CoachScreen` presents the four bands,
values/progress, and up to five recent changes.

Job markets, offers, interviews, firings, career transitions, relationships, media,
board confidence/objectives, reputation decay, geographic reputation layers, new
dimensions, and reputation-based MatchEngine bonuses remain out of scope.

## FIBA-like promotion and relegation

FIBA-like ecosystems may own an ordered domestic hierarchy through `domesticTiers`
and adjacent `tierMovementRules`. A rule exchanges the top N teams from the lower
tier with the bottom N teams from the upper tier, consuming the canonical final
standings without adding a separate tiebreaker system.

Completed competition editions retain their participant snapshot. A deterministic,
persisted `PromotionRelegationResolution` records the resulting movement, and only
the next edition consumes it when generating participants and a new schedule.
Promotion/relegation is resolved between linked Competition Editions; it does not
require a globally synchronized season transition or synchronized competition
windows. Middle tiers can independently move teams in both directions.

Normal `GameWorld` transitions preserve unrelated canonical state via the canonical
world update boundary. Save/load persists hierarchy, rules, participant snapshots,
and completed resolutions; legacy saves without them remain unconfigured and do
not invent historical movement. NBA-like closed-league behavior and promotion
playoffs remain outside this boundary.

## NBA-like ecosystem v1

`SportsEcosystem.kind` supports `nbaLike` alongside `fibaLike`. NBA-like ecosystems
are closed franchise leagues: they own ordinary Teams and Competitions but cannot
have domestic tiers or promotion/relegation rules. They reuse the shared schedule,
calendar, standings, champion, roster and match systems while retaining independent
competition windows. New games generate a deterministic, separate franchise league;
legacy saves do not receive one implicitly. Draft, salary-cap and trade rules remain
future ecosystem extensions.

## NCAA-like ecosystem v1

`ncaaLike` is a third independent ecosystem, not NBA-like without salaries. Programs reuse canonical `Team`, `Player`, `Coach`, Staff, Training, Development, Calendar and MatchEngine boundaries; no college-specific parallel engine exists. Conferences are structural Domain entities, not UI labels. Each NCAA-like Season stores an immutable conference-membership snapshot so future realignment cannot reinterpret historical editions.

NCAA-like schedules explicitly classify games as `conference` or `nonConference`. Overall standings consume both kinds; Conference standings and the derived Conference Regular Season Champion consume only conference games. NCAA-like competitions keep their own window in the global Calendar. They do not receive NBA Salary Cap, Trade Rules or Drafts, and cannot own FIBA promotion/relegation tiers. Recruiting belongs to Hito 056; Eligibility belongs to Hito 057. Academic eligibility, NIL, collectives and boosters are intentionally not implemented; NIL is not professional team salary.

## Recruiting v1

Recruiting is canonical `GameWorld` state: cycles, recruit profiles, sparse program interest and boards, capacity, action history, offers, visits, commitments and signings are all serialized. A `RecruitProfile` only references a canonical, unrostered `Player`; it never duplicates identity, ratings or potential. Pools are generated from isolated deterministic streams, while public rank/tier is deliberately imperfect and is separate from true ratings and potential.

The shared Recruiting Engine is the only action boundary for user and AI programs: contact, preference-sensitive pitch, visit and offer consume configured capacity and leave immutable history. Commitments select one offered program deterministically; commitment is not signing. A signing locks the future destination but does not add a player to a roster. Calendar progression promotes cycle phases and idempotently delivers signed recruits only when their target season arrives. Recruiting offers are not professional salary contracts. Eligibility, NIL, academic systems and transfers remain outside Hito 056.

## NBA-like Draft v1

Drafts are owned by an `nbaLike` `SportsEcosystem`. `DraftRules` configure the V1
reverse-standings order, scheduled offset and number of rounds; future WNBA-like
ecosystems may reuse the infrastructure with different rules. A Draft is created
against a completed source Competition Edition, and the global `CalendarEngine`
opens and progresses it on its scheduled date. This lifecycle is independent from
FIBA-like competition windows.

`Draft.prospectPlayerIds` references deterministic canonical `Player` entities.
Prospects have no roster until selected; undrafted prospects remain Players without
a roster. `DraftPick` has a stable identity, `originalTeamId` records its origin,
and `ownerTeamId` records the current selection rights. Draft Picks are transferable
assets by design, and ownership changes never change Pick identity. Trades will
modify ownership in Hito 054.

V1 supports multiple rounds and deterministic AI selection through
`chooseAiDraftProspect`; `progressDraftAi` stops for the user and resumes after
the canonical `makeDraftSelection` assigns the Player to `ownerTeamId`. Drafts,
Picks, prospects and selections persist mid-Draft without regeneration. The UI is
a thin application boundary over these queries and operations; it does not own
Draft state. Salary Cap, trades, lottery, rookie scale, Draft-specific Inbox and
advanced scouting remain out of scope.

## Salary Cap v1

`SalaryRules` is a frozen, per-Season snapshot owned by the shared pure Salary
Engine. An NBA-like season can define `none`, `soft`, or `hard` caps, a salary
floor, progressive luxury-tax tiers, any number of aprons, minimum/maximum bands,
exceptions, rookie scale, contract-length limits, and trade salary-matching rules.
NBA-like and future WNBA-like ecosystems share the engine while supplying their
own rules; FIBA-like competitions receive no cap rules automatically.

`TeamPayroll` is a derived projection only: active current-year contract `capHit`
plus canonical dead-money charges for the queried Team and Season. It never uses
cash salary or sums future years. Contracts may provide yearly `cashSalary`,
`capHit`, and `guaranteedAmount`; legacy annual contracts deterministically expose
the same value for all three without inventing historical financial state.

Salary exceptions and dead money are normalized `GameWorld` obligations. Exceptions
retain original and remaining amounts, support partial consumption, and preserve
consumed/expired history. Salary validation returns structured reasons for min/max,
term, soft/hard cap, exception, and apron restrictions. Rookie contracts are
deterministically created from the configured draft-pick scale for the Pick owner.
Save V1 persists rules, yearly compensation, exceptions, and dead money while older
saves load with no invented exceptions, charges, or historical rules.

The Salary Engine determines salary legality and provides configured incoming-salary
matching limits. Hito 054 executes Trades; it does not belong to this boundary.

## Trade system v1

The pure TradeEngine owns normalized `TradeProposal` validation and atomic execution.
It supports N-team asset movements rather than a two-team shape. A proposal is intent;
an immutable `TradeRecord` retains the executed date, participants, movements, and
relevant salary consequences. Validation reports global and per-team structured
reasons, and execution applies no partial change on failure.

Trade assets include Players, materialized Draft Picks, future-pick rights,
PlayerRights, swap rights and configurable cash consideration. Player trades move
roster membership without recreating the Player or Contract. PlayerRights are
separate: they may be traded across ecosystems without moving a Player's current
roster or contract. DraftPick identity and `originalTeamId` survive ownership changes.

Future pick ownership is a persistent right identified by ecosystem, cycle, round
and original team; it is applied when that draft materializes. Protections use generic
order ranges and may roll to a configured later cycle. Swap rights are distinct from
pick ownership and resolve once both concrete pick orders exist, preserving pick IDs.

Trade validation reuses Salary Engine matching and salary exceptions. Retained salary
is a distinct persistent obligation, never dead money. Rules are season/ecosystem
scoped, so NBA-like and future WNBA-like ecosystems can share infrastructure while
using different `TradeRules`; FIBA-like competitions receive no trade rules by default.
Save V1 persists trade state; legacy saves retain empty trade collections and invent
no historical trades or rights.

## NCAA-like eligibility v1

Eligibility is normalized NCAA-like canonical state: rules are ecosystem-scoped,
profiles belong to a Player and Program, and temporary restrictions are date-aware.
`evaluatePlayerEligibility` is the authoritative structured query. Participation is
derived only from completed MatchStatLog lines with `secondsPlayed > 0` and is
idempotent by GameId. At NCAA season resolution, a season with appearances at or
below the configured threshold is preserved; a season above it consumes one year
exactly once. Exhaustion derives from `seasonsUsed`.

Eligibility is enforced at the shared application pre-match boundary before
MatchEngine: canonical roster, eligibility, ordinary availability, rotation and
then MatchEngine. An insufficient eligible/available squad is a structured pre-match
failure; eligibility is never bypassed to satisfy the five-player minimum. New NCAA
programs use a seven-player rotation-capable roster, so ordinary injuries
do not make a standard match impossible. User and AI match flows share this same
availability boundary, while MatchEngine remains eligibility-agnostic.

Recruiting creates no eligibility state until a signed recruit arrives on their
program roster, where initialization is idempotent. Save V1 persists rules,
profiles, restrictions and season records; pre-057 saves receive neutral NCAA
profiles without invented history or restrictions. NCAA status is shown in the
existing squad inspector; FIBA-like and NBA-like players receive no NCAA display.

## Academic eligibility v1

Academic eligibility is a separate NCAA-like domain with deterministic profiles,
term records and limited program support. Academic failures create canonical
EligibilityRestrictions; Hito 057 remains the sole competition-availability
authority and MatchEngine remains unaware. Academic ineligibility affects games,
not roster membership. Support is not NIL money; NIL/collectives, donors/boosters,
and enforcement/sanctions remain 057B, 057C and 057D respectively.

## NIL and Collectives v1

NIL is NCAA-like athlete compensation and is never a SalaryContract, salary-cap or
payroll input. NCAA roster arrivals initialize one deterministic NIL profile exactly
once; marketability derives from public basketball ratings and stable identity, never
hidden potential. NIL opportunities have available/accepted/expired lifecycle state
and accepted opportunities create explicit NIL deals. Collectives are canonical,
resource-limited entities separate from Teams, Programs, donors and boosters;
collective-backed opportunities consume their persisted resources. User and AI use
the same NIL operations, with deterministic AI cadence. NIL can adjust recruiting
appeal only through its configured factor; recruiting remains the sole authority for
commitment and signing, and historical recruiting records are not modified.

## Donors and Boosters v1

Boosters are autonomous canonical NCAA actors, separate from Programs and
Collectives. They have limited resources, relationships, influence and agendas;
their only current contribution boundary funds a Collective, which remains the
sole NIL operator. User and AI invoke the same deterministic, resource-bound API
at monthly calendar checkpoints. Booster influence never bypasses Recruiting,
Eligibility, Academic Eligibility, NIL ownership or Salary systems. Enforcement
and sanctions remain the responsibility of Hito 057D.

## Enforcement and sanctions v1

Enforcement is a separate NCAA-like domain with persisted rules, violations,
investigations, findings, sanctions and program compliance state. Violations only
come from explicit system actions or fixtures. Deterministic investigations can
produce temporary sanctions; those affect other systems only through their
canonical boundaries: Enforcement creates EligibilityRestrictions, Recruiting
consumes its capacity state, and NIL/Collectives reject future restricted activity.
Hito 057 remains the authority for player competition eligibility; Recruiting,
NIL/Collectives and Boosters remain their own authorities. Boosters may be a
violation source but never decide enforcement. GameWorld updates preserve all
unrelated canonical state.

## Connected ecosystems

Ecosystems are connected through explicit transition gateways, never shared rules.
`PlayerId` and `CoachId` remain canonical across NCAA-like, NBA-like and FIBA-like
career moves. Each destination ecosystem retains authority for its own Draft,
Recruiting, contracts and eligibility: NCAA-to-NBA uses the NBA Draft gateway,
while professional signings create a destination contract and close the departing
professional contract. Cross-ecosystem player transitions are atomic, persistent
historical records, so a player cannot occupy incompatible rosters at once.

`GameWorld` owns global time only. Competition editions own their own windows;
there is no global offseason and ecosystem transitions do not synchronize seasons.

## Simultaneous men's and women's basketball

An ecosystem kind is not its identity: men's and women's instances use separate canonical ecosystem IDs and category-scoped data.

Men's and women's basketball share the same Domain and Engine architecture. Sports
category is ecosystem configuration and competition context, not a duplicated engine
hierarchy. A new world contains independent men's and women's FIBA-like, closed-league
and NCAA-like ecosystems; each owns its own competition and season windows.

Closed-league salary, Draft and trade configurations are ecosystem/season scoped, so
women's rules are independently configurable and never assumed equal to men's NBA-like
rules. Recruiting, eligibility, academics, NIL, boosters and enforcement remain scoped
by ecosystem, competition and season IDs. Coaches retain one canonical identity and may
move across men's and women's ecosystems under the existing career rules.

## Global coach job market

Coach Career is the single authority for global head-coach employment transitions. Vacancies carry canonical ecosystem and sports-category context; eligibility and deterministic candidate fit are distinct, and User and AI Coaches use the same candidacy, offer and employment lifecycle. CoachId, reputation, relationships and career history persist through cross-ecosystem/category moves. GameWorld owns time; there is no global offseason.
