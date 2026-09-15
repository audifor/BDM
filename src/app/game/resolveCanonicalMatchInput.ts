import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { getTeamLineup } from '@/domain/world'
import { BENCH_SLOTS, getLineupAssignments, PLAYERS_ON_COURT, type DefensiveMatchupAssignment } from '@/domain/tactics'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import type { PlayerId, TeamId } from '@/domain/ids'
import {
  createDefaultRotationPlan,
  createMatchPlayerProfile,
  MINIMUM_MATCH_SQUAD_SIZE,
  type MatchLineups,
  type MatchPlayerProfiles,
  type MatchSquads,
  type MatchTacticalPlan,
  type TeamRotationPlan,
  type TeamStrength,
} from '@/engine/match'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateTeamStrength, selectStartingFive } from '@/engine/team'
import { getEffectiveTacticalPlan, getGamePlan } from './TacticalPlanning'
import { PlayUserGameError } from './PlayUserGameError'

/**
 * Everything a specific Game needs to initialize a Match runtime — resolved once,
 * before either the live session or Instant Result touches the engine (MG3).
 * A frozen photograph of how the match begins: `LiveMatchState`/`MatchSession`
 * describes what changes after tip-off (score, clock, active lineup, fatigue,
 * live tactics, fouls, stats); this type describes only how it starts. Nothing
 * in here should be re-derived by MatchEngine, LiveMatchController, or
 * RotationPlan from GameWorld directly once this has been resolved — see
 * "Known architectural debt" in docs/match/MATCH_GAMEPLAY_V3_MG3_REPORT.md for
 * the one remaining exception (SimulateMatchOptions.world/gameId, used only to
 * resolve the Game record and ruleset inside createMatchSession).
 */
export interface CanonicalMatchInput {
  readonly gameId: Game['id']
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly squads: MatchSquads
  readonly lineups: MatchLineups
  readonly playerProfiles: MatchPlayerProfiles
  readonly homeStrength: TeamStrength
  readonly awayStrength: TeamStrength
  readonly homeRotationPlan: TeamRotationPlan
  readonly awayRotationPlan: TeamRotationPlan
  readonly tacticalPlans: { readonly home: MatchTacticalPlan; readonly away: MatchTacticalPlan }
  readonly defensiveMatchups: { readonly home: readonly DefensiveMatchupAssignment[]; readonly away: readonly DefensiveMatchupAssignment[] }
  readonly random: SeededRandomSource
  readonly decisionRandom: SeededRandomSource
  readonly actorRandom: SeededRandomSource
}

export interface ResolveCanonicalMatchInputOptions {
  /**
   * Overrides the effective tactical plan for one side (e.g. a live pre-match
   * tactics draft the user is actively editing). When omitted for a side, the
   * team's persisted tactical configuration (`TeamTacticalInstructions` +
   * any `TeamGamePlan.tacticalOverride`) is used — the same resolution AI-vs-AI
   * simulation already uses via `getEffectiveTacticalPlan`. This is the single
   * point where Live Match and Instant Result previously diverged (MG3): before
   * this resolver existed, the live path took a raw UI draft directly and never
   * consulted the persisted plan at all, while Instant Result read only the
   * persisted plan unless a draft was explicitly threaded through a different,
   * narrower code path. See "Live vs Instant convergence" in the MG3 report.
   */
  readonly tacticalPlanOverrides?: { readonly home?: MatchTacticalPlan; readonly away?: MatchTacticalPlan }
}

/**
 * The single canonical pre-match resolution boundary (MG3). Resolves everything
 * a Match runtime needs to begin `game` — participant squads, MG2A-authoritative
 * starters, MG2C bench priority, initial tactics (persisted config, with an
 * optional live-draft override), defensive matchups, team strength, and the
 * three deterministic RNG streams — without ever handing the caller (or the
 * runtime) unrestricted access to GameWorld beyond what was already required.
 * Both `createLiveUserMatch` and `prepareMatch` build their engine input by
 * calling this function; neither one re-derives any of these values on its own
 * anymore.
 */
export function resolveCanonicalMatchInput(world: GameWorld, game: Game, options: ResolveCanonicalMatchInputOptions = {}): CanonicalMatchInput {
  const squads = resolveAvailableSquads(world, game)
  const lineups: MatchLineups = { home: resolveStartingFive(world, game.homeTeamId, game.date, squads.home), away: resolveStartingFive(world, game.awayTeamId, game.date, squads.away) }
  const playerProfiles: MatchPlayerProfiles = { home: squads.home.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)), away: squads.away.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)) }
  const tacticalPlans = {
    home: options.tacticalPlanOverrides?.home ?? getEffectiveTacticalPlan(world, game.id, game.homeTeamId),
    away: options.tacticalPlanOverrides?.away ?? getEffectiveTacticalPlan(world, game.id, game.awayTeamId),
  }
  const homeGamePlan = getGamePlan(world, game.id, game.homeTeamId)
  const awayGamePlan = getGamePlan(world, game.id, game.awayTeamId)

  return {
    gameId: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    squads,
    lineups,
    playerProfiles,
    homeStrength: calculateTeamStrength(world, game.homeTeamId, game.date, squads.home),
    awayStrength: calculateTeamStrength(world, game.awayTeamId, game.date, squads.away),
    homeRotationPlan: homeGamePlan?.rotationOverride ?? world.rotationPlansByTeamId[game.homeTeamId] ?? createDefaultRotationPlan({ teamId: game.homeTeamId, squad: squads.home, initialLineup: lineups.home, players: world.players, benchPriorityOrder: resolveBenchPriorityOrder(world, game.homeTeamId) }),
    awayRotationPlan: awayGamePlan?.rotationOverride ?? world.rotationPlansByTeamId[game.awayTeamId] ?? createDefaultRotationPlan({ teamId: game.awayTeamId, squad: squads.away, initialLineup: lineups.away, players: world.players, benchPriorityOrder: resolveBenchPriorityOrder(world, game.awayTeamId) }),
    tacticalPlans,
    defensiveMatchups: { home: homeGamePlan?.matchups ?? [], away: awayGamePlan?.matchups ?? [] },
    random: createPrototypeGameRandom(game.id),
    decisionRandom: new SeededRandomSource(hashStringToSeed(`match-decisions-v1:${game.id}`)),
    actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${game.id}`)),
  }
}

/**
 * Produces a stable 32-bit seed from a GameId. This is provisional until career
 * RNG state is persisted, but makes a game's result reproducible for the same
 * identity. Match seed ownership (MG3): the resolver is the single place all
 * three RNG streams are constructed; neither Live Match nor Instant Result
 * derives its own seed.
 */
export function createPrototypeGameRandom(gameId: Game['id']): SeededRandomSource {
  return new SeededRandomSource(hashStringToSeed(gameId))
}

/**
 * Resolves the actual match-starting five for `teamId`. The team's configured
 * canonical `TeamLineup` (domain/tactics/TeamLineup.ts) is authoritative whenever
 * it names exactly PLAYERS_ON_COURT distinct starters who are all present in
 * `availableSquad` (this game's eligible+available player pool) — MG2A. Any
 * other case — no lineup configured, fewer/more than five starters, or a
 * starter unavailable for this specific game (injury/suspension/ineligibility)
 * — falls back to the existing algorithmic `selectStartingFive`, which remains
 * the only mechanism for AI-controlled teams (they are never given a configured
 * TeamLineup).
 */
function resolveStartingFive(world: GameWorld, teamId: TeamId, onDate: Game['date'], availableSquad: readonly PlayerId[]): readonly PlayerId[] {
  const lineup = getTeamLineup(world, teamId)
  const starterIds = getLineupAssignments(lineup)
    .filter((assignment) => (BASKETBALL_POSITIONS as readonly string[]).includes(assignment.slot))
    .map((assignment) => assignment.playerId)
  const availableSet = new Set(availableSquad)
  const isValidConfiguredLineup = starterIds.length === PLAYERS_ON_COURT && new Set(starterIds).size === PLAYERS_ON_COURT && starterIds.every((playerId) => availableSet.has(playerId))
  return isValidConfiguredLineup ? starterIds : selectStartingFive(world, teamId, onDate, availableSquad)
}

/**
 * The team's configured bench priority (TeamLineup B1..B7 order), when one exists
 * (MG2C / MG1 BUG-4): this is the only signal RotationPlan's default-rotation
 * builder uses to break ties among an already-eligible bench pool. It never
 * ranks player quality — an unconfigured team (including every AI team) simply
 * has no priority list, and the rotation builder falls back to stable squad
 * order on its own.
 */
function resolveBenchPriorityOrder(world: GameWorld, teamId: TeamId): readonly PlayerId[] {
  const lineup = getTeamLineup(world, teamId)
  return getLineupAssignments(lineup)
    .filter((assignment) => (BENCH_SLOTS as readonly string[]).includes(assignment.slot))
    .map((assignment) => assignment.playerId)
}

function resolveAvailableSquads(world: GameWorld, game: Game): MatchSquads {
  const home = getAvailablePlayersForCompetition(world, game.homeTeamId, game.competitionId, game.seasonId, game.date)
  const away = getAvailablePlayersForCompetition(world, game.awayTeamId, game.competitionId, game.seasonId, game.date)
  for (const [side, players] of Object.entries({ home, away })) if (players.length < MINIMUM_MATCH_SQUAD_SIZE) throw new PlayUserGameError(`${side} team has ${players.length} available players; ${MINIMUM_MATCH_SQUAD_SIZE} are required`, 'INSUFFICIENT_AVAILABLE_PLAYERS')
  return { home, away }
}
