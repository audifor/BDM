import type { Game } from '@/domain/game'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { TeamRotationIntent } from '@/domain/tactics'
import { getTeamLineup, resolveGameClockRulesForGame, type GameWorld } from '@/domain/world'
import { getGamesToday, getUserTeam } from '@/engine/calendar'
import {
  applyCompletedMatch,
  createDefaultRotationPlan,
  createRotationPlanFromMinutes,
  createMatchPlayerProfile,
  simulateMatchWithRotations,
  type MatchTacticalPlan,
  type MatchSimulation,
  type SimulateMatchWithRotationsOptions,
} from '@/engine/match'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateTeamStrength } from '@/engine/team'
import { createCoachRotationPlan, type CoachRotationPlan } from '@/engine/tactics/CoachRotationEngine'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import type { WorldRepairReport } from '@/domain/repair'
import { applyPostMatchInjuries } from '@/engine/injury'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { MINIMUM_MATCH_SQUAD_SIZE } from '@/engine/match'
import { LiveMatchController } from './LiveMatchController'
import { getEffectiveTacticalPlan, getGamePlan } from './TacticalPlanning'
import { applyPlayerMatchConsequences, initialMatchFatigue } from './PlayerMatchConsequences'

type PreparedMatchOptions = SimulateMatchWithRotationsOptions & {
  readonly matchSeed: number
  readonly repairReports: readonly WorldRepairReport[]
  readonly coachingPlans: { readonly home: CoachRotationPlan; readonly away: CoachRotationPlan }
}

export class PlayUserGameError extends Error {
  public constructor(message: string, public readonly code: 'INSUFFICIENT_AVAILABLE_PLAYERS' | 'INVALID_MATCH_CONTEXT' = 'INVALID_MATCH_CONTEXT') {
    super(message)
    this.name = 'PlayUserGameError'
  }
}


export type MatchSeedFactory = () => number

/** One entropy draw at the application boundary; simulation consumes only seeded streams. */
export function createMatchSeed(): number {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('crypto.getRandomValues() is required to create a match seed')
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!
}

/** Derives the existing MatchEngine streams from one replayable match-run seed. */
export function createMatchRandomSources(matchSeed: number) {
  return {
    random: new SeededRandomSource(matchSeed),
    decisionRandom: new SeededRandomSource(hashStringToSeed(`match-decisions-v1:${matchSeed}`)),
    actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${matchSeed}`)),
  }
}

/** Prepares the user's current game for a viewer without changing GameWorld. */
export function prepareUserMatch(world: GameWorld, userTacticalPlan?: MatchTacticalPlan, matchSeed?: number): MatchSimulation {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) {
    throw new PlayUserGameError('The user coach is not assigned to a Team')
  }

  const game = getGamesToday(world).find(
    (candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id,
  )
  if (game === undefined) {
    throw new PlayUserGameError(`The user Team has no Game on ${world.currentDate}`)
  }
  if (game.status !== 'scheduled') {
    throw new PlayUserGameError(`The user Game ${game.id} is already completed`)
  }

  return prepareMatch(world, game, userMatchTacticalPlans(game, userTeam.id, userTacticalPlan), matchSeed)
}

export function createLiveUserMatch(world: GameWorld, userTacticalPlan?: MatchTacticalPlan, matchSeed?: number): LiveMatchController {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) throw new PlayUserGameError('The user coach is not assigned to a Team')
  const game = getGamesToday(world).find((candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id)
  if (game === undefined || game.status !== 'scheduled') throw new PlayUserGameError('The user Team has no scheduled Game today')
  return new LiveMatchController(prepareMatchOptions(world, game, userMatchTacticalPlans(game, userTeam.id, userTacticalPlan), matchSeed))
}

export function prepareMatch(world: GameWorld, game: Game, tacticalPlans?: Partial<{ home: MatchTacticalPlan; away: MatchTacticalPlan }>, matchSeed?: number): MatchSimulation {
  return simulateMatchWithRotations(prepareMatchOptions(world, game, tacticalPlans, matchSeed))
}

/** Builds the shared immutable pre-match input consumed by both instant and live execution. */
export function prepareMatchOptions(world: GameWorld, game: Game, tacticalPlans?: Partial<{ home: MatchTacticalPlan; away: MatchTacticalPlan }>, seedOrFactory?: number | MatchSeedFactory): PreparedMatchOptions {
  const squads = availableSquads(world, game)
  const resolvedTactics = {
    home: tacticalPlans?.home ?? getEffectiveTacticalPlan(world, game.id, game.homeTeamId),
    away: tacticalPlans?.away ?? getEffectiveTacticalPlan(world, game.id, game.awayTeamId),
  }
  const homeGamePlan = getGamePlan(world, game.id, game.homeTeamId)
  const awayGamePlan = getGamePlan(world, game.id, game.awayTeamId)
  const homeRotationIntent = homeGamePlan?.rotationOverride ?? world.rotationPlansByTeamId[game.homeTeamId]
  const awayRotationIntent = awayGamePlan?.rotationOverride ?? world.rotationPlansByTeamId[game.awayTeamId]
  const clockRules = resolveGameClockRulesForGame(world, game)
  const periodMinutes = Array.from({ length: clockRules.periodCount }, () => clockRules.periodSeconds / 60)
  const homeCoachPlan = createCoachRotationPlan({
    teamId: game.homeTeamId, squad: squads.home, players: world.players, fatigueByPlayerId: world.careerFatigueByPlayerId,
    savedLineup: getTeamLineup(world, game.homeTeamId), respectSavedLineup: world.teams[game.homeTeamId]!.coachId === world.userCoachId,
    rotationIntent: homeRotationIntent,
    matchTactics: resolvedTactics.home, opponentPlayers: squads.away.map((id) => world.players[id]!), coach: coachInput(world, game.homeTeamId), regulationPeriodMinutes: periodMinutes,
  })
  const awayCoachPlan = createCoachRotationPlan({
    teamId: game.awayTeamId, squad: squads.away, players: world.players, fatigueByPlayerId: world.careerFatigueByPlayerId,
    savedLineup: getTeamLineup(world, game.awayTeamId), respectSavedLineup: world.teams[game.awayTeamId]!.coachId === world.userCoachId,
    rotationIntent: awayRotationIntent,
    matchTactics: resolvedTactics.away, opponentPlayers: squads.home.map((id) => world.players[id]!), coach: coachInput(world, game.awayTeamId), regulationPeriodMinutes: periodMinutes,
  })
  const lineups = { home: homeCoachPlan.startingLineup, away: awayCoachPlan.startingLineup }
  const homeLineupReport = coachingLineupReport(world, game.homeTeamId, game.date, squads.home, homeCoachPlan)
  const awayLineupReport = coachingLineupReport(world, game.awayTeamId, game.date, squads.away, awayCoachPlan)
  const playerProfiles = { home: squads.home.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)), away: squads.away.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)) }
  const matchSeed = typeof seedOrFactory === 'function' ? seedOrFactory() : seedOrFactory ?? createMatchSeed()
  // Validate even seeds supplied by a replay/debug caller before returning prepared input.
  new SeededRandomSource(matchSeed)
  return {
    matchSeed,
    coachingPlans: { home: homeCoachPlan, away: awayCoachPlan },
    repairReports: Object.freeze([homeLineupReport, awayLineupReport]),
    world,
    gameId: game.id,
    homeStrength: calculateTeamStrength(world, game.homeTeamId, game.date, squads.home),
    awayStrength: calculateTeamStrength(world, game.awayTeamId, game.date, squads.away),
    lineups,
    squads,
    initialFatigueByPlayerId: initialMatchFatigue(squads, world.careerFatigueByPlayerId),
    playerProfiles,
    homeRotationPlan: resolveRotationPlan(world, game, game.homeTeamId, squads.home, lineups.home, homeRotationIntent, homeCoachPlan),
    awayRotationPlan: resolveRotationPlan(world, game, game.awayTeamId, squads.away, lineups.away, awayRotationIntent, awayCoachPlan),
    ...createMatchRandomSources(matchSeed),
    tacticalPlans: resolvedTactics,
    defensiveMatchups: { home: homeGamePlan?.matchups ?? [], away: awayGamePlan?.matchups ?? [] },
  }
}

function coachingLineupReport(world: GameWorld, teamId: TeamId, gameDate: Game['date'], squad: readonly PlayerId[], plan: CoachRotationPlan): WorldRepairReport {
  const saved = getTeamLineup(world, teamId)
  const savedStarters = BASKETBALL_POSITIONS.map((position) => saved.starters[position])
  const savedAvailableCount = savedStarters.filter((playerId): playerId is PlayerId => playerId !== undefined && squad.includes(playerId)).length
  const hasSavedAssignments = savedStarters.some((playerId) => playerId !== undefined)
  const classification: WorldRepairReport['classification'] = hasSavedAssignments && savedAvailableCount < 5 ? 'RECOVERABLE' : 'ALREADY_VALID'
  return {
    repairKind: 'MATCH_LINEUP',
    sourceDomain: 'TEAM_LINEUP',
    targetEntity: String(teamId),
    classification,
    previousStateSummary: `date=${gameDate}; starters=${savedStarters.filter((id): id is PlayerId => id !== undefined).join(',') || 'default'}`,
    actionApplied: `Used the ${plan.diagnostics.lineupSource === 'SAVED_USER_LINEUP' ? 'saved user lineup' : 'contextual coaching selector'} without changing persistent lineup data.`,
    resultingStateSummary: `date=${gameDate}; starters=${plan.startingLineup.join(',')}`,
    diagnostics: classification === 'RECOVERABLE' ? [{ code: 'COACH_SELECTED_AVAILABLE_STARTERS', message: 'The coaching plan kept the available saved starters and filled unavailable or empty slots from the legal match squad.' }] : [],
    worldChanged: false,
    userActionRequired: false,
  }
}

function userMatchTacticalPlans(game: Game, userTeamId: Game['homeTeamId'], userTacticalPlan?: MatchTacticalPlan): Partial<{ home: MatchTacticalPlan; away: MatchTacticalPlan }> | undefined {
  if (userTacticalPlan === undefined) return undefined
  return userTeamId === game.homeTeamId
    ? { home: userTacticalPlan }
    : { away: userTacticalPlan }
}

function resolveRotationPlan(world: GameWorld, game: Game, teamId: TeamId, squad: readonly PlayerId[], initialLineup: readonly PlayerId[], intent: TeamRotationIntent | undefined, coachPlan: CoachRotationPlan) {
  const options = { teamId, squad, initialLineup, players: world.players }
  const rules = resolveGameClockRulesForGame(world, game)
  const fallback = () => createRotationPlanFromMinutes({ ...options, minutesByPeriod: coachPlan.minutesByPeriod, periodMinutes: Array.from({ length: rules.periodCount }, () => rules.periodSeconds / 60) }) ?? createDefaultRotationPlan(options)
  if (intent?.minutesByPeriod !== undefined) {
    const rules = resolveGameClockRulesForGame(world, game)
    return createRotationPlanFromMinutes({ ...options, minutesByPeriod: intent.minutesByPeriod, periodMinutes: Array.from({ length: rules.periodCount }, () => rules.periodSeconds / 60) }) ?? fallback()
  }
  return intent?.instructions.length ? { teamId, instructions: intent.instructions } : fallback()
}

function coachInput(world: GameWorld, teamId: TeamId): { readonly id: string; readonly staff?: GameWorld['staffPeopleById'][keyof GameWorld['staffPeopleById']]; readonly rpg?: GameWorld['coachRpgProfilesByCoachId'][keyof GameWorld['coachRpgProfilesByCoachId']] } | undefined {
  const coachId = world.teams[teamId]?.coachId
  if (coachId === undefined) return undefined
  const coach = world.coaches[coachId]
  return coach === undefined ? undefined : { id: String(coachId), ...(world.staffPeopleById[coach.staffProfileId] === undefined ? {} : { staff: world.staffPeopleById[coach.staffProfileId] }), ...(world.coachRpgProfilesByCoachId[coachId] === undefined ? {} : { rpg: world.coachRpgProfilesByCoachId[coachId] }) }
}

function availableSquads(world: GameWorld, game: Game) {
  const home = getAvailablePlayersForCompetition(world, game.homeTeamId, game.competitionId, game.seasonId, game.date)
  const away = getAvailablePlayersForCompetition(world, game.awayTeamId, game.competitionId, game.seasonId, game.date)
  for (const [side, players] of Object.entries({ home, away })) if (players.length < MINIMUM_MATCH_SQUAD_SIZE) throw new PlayUserGameError(`${side} team has ${players.length} available players; ${MINIMUM_MATCH_SQUAD_SIZE} are required`, 'INSUFFICIENT_AVAILABLE_PLAYERS')
  return { home, away }
}


/** Applies a completed viewer simulation to GameWorld exactly through the result boundary. */
export function completeMatch(world: GameWorld, simulation: MatchSimulation): GameWorld {
  const completed = applyCompletedMatch(world, simulation)
  return applyPostMatchInjuries(applyPlayerMatchConsequences(world, completed, simulation), simulation.gameId)
}

/** Instant Result uses the same detailed simulation as MatchViewer, then applies it immediately. */
export function instantResult(world: GameWorld, tacticalPlan?: MatchTacticalPlan, matchSeed?: number): GameWorld {
  return completeMatch(world, prepareUserMatch(world, tacticalPlan, matchSeed))
}

/** Retained application alias for existing instant-result callers. */
export function playUserGame(world: GameWorld, matchSeed?: number): GameWorld {
  return instantResult(world, undefined, matchSeed)
}

export function simulateAndApplyGame(world: GameWorld, game: Game, matchSeed?: number, repairReports?: WorldRepairReport[]): GameWorld {
  const options = prepareMatchOptions(world, game, undefined, matchSeed)
  repairReports?.push(...options.repairReports)
  return completeMatch(world, simulateMatchWithRotations(options))
}
