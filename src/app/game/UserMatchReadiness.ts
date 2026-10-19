import type { Game } from '@/domain/game'
import type { PlayerId, TeamId } from '@/domain/ids'
import { BENCH_SLOTS, getLineupSlotForPlayer, type LineupSlot } from '@/domain/tactics'
import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import { getCareerFatigueForPlayer, getTeamLineup, getTeamRoster, resolveGameClockRulesForGame, type GameWorld } from '@/domain/world'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import type { MatchTacticalPlan } from '@/engine/match'
import { classifyLineupCandidate, type LineupBlockReason } from '@/engine/tactics/LineupAvailability'
import { getGamePlan } from './TacticalPlanning'
import { PlayUserGameError, prepareMatchOptions } from './playUserGame'

export type MatchReadinessRole = 'STARTER' | 'BENCH' | 'RESERVE' | 'UNAVAILABLE'

export interface MatchReadinessPlayer {
  readonly playerId: PlayerId
  readonly position: BasketballPosition
  readonly role: MatchReadinessRole
  /** The lineup slot the user gave the player (Plantilla/Pizarra), when there is one. */
  readonly slot?: LineupSlot
  readonly expectedMinutes: number
  readonly fatigue: number
  readonly blockReason?: LineupBlockReason
  readonly blockDetail?: string
}

/**
 * What the user's next game will actually field, read from the same preparation the simulation uses (`prepareMatchOptions`):
 * Plantilla, Pizarra and the MatchEngine cannot disagree because this is not a third copy of the lineup, it is the engine's input.
 * Derived on demand; never persisted.
 */
export interface UserMatchReadiness {
  readonly game: Game
  readonly userTeamId: TeamId
  readonly opponentTeamId: TeamId
  readonly isHome: boolean
  readonly isToday: boolean
  readonly competitionName: string
  readonly periodCount: number
  readonly periodMinutes: number
  readonly lineupSource: 'SAVED_USER_LINEUP' | 'CONTEXTUAL_COACH_SELECTION'
  readonly starters: readonly PlayerId[]
  /** The opponent's starting five as the same preparation fields it. */
  readonly opponentStarters: readonly PlayerId[]
  readonly players: readonly MatchReadinessPlayer[]
  readonly tactics: MatchTacticalPlan
  readonly hasGameTacticalOverride: boolean
  readonly matchupCount: number
  readonly rotationSource: 'USER_MINUTES' | 'COACH_PLAN'
  /** Things the user prepared that the match will not use as prepared, in the language of the UI. */
  readonly issues: readonly string[]
  /** Set when the match cannot be started (not enough available players). */
  readonly blockedReason?: string
}

const SEED_FOR_PREPARATION = 0

export function getUserMatchReadiness(world: GameWorld): UserMatchReadiness | undefined {
  const team = getUserTeam(world)
  if (team === undefined) return undefined
  const today = getGamesToday(world).find((game) => game.status === 'scheduled' && (game.homeTeamId === team.id || game.awayTeamId === team.id))
  const game = today ?? getNextUserGame(world)
  if (game === undefined) return undefined
  const isHome = game.homeTeamId === team.id
  const opponentTeamId = isHome ? game.awayTeamId : game.homeTeamId
  const clock = resolveGameClockRulesForGame(world, game)
  const base = {
    game, userTeamId: team.id, opponentTeamId, isHome, isToday: today !== undefined,
    competitionName: world.competitions[game.competitionId]?.name ?? '—',
    periodCount: clock.periodCount, periodMinutes: clock.periodSeconds / 60,
  }
  const roster = getTeamRoster(world, team.id)
  const savedLineup = getTeamLineup(world, team.id)
  const statuses = new Map(roster.map((player) => [player.id, classifyLineupCandidate(world, team.id, player.id)]))
  const gamePlan = getGamePlan(world, game.id, team.id)
  let options: ReturnType<typeof prepareMatchOptions>
  try {
    options = prepareMatchOptions(world, game, undefined, SEED_FOR_PREPARATION)
  } catch (error) {
    if (!(error instanceof PlayUserGameError)) throw error
    return {
      ...base, lineupSource: 'CONTEXTUAL_COACH_SELECTION', starters: [], opponentStarters: [],
      players: roster.map((player) => {
        const status = statuses.get(player.id)!
        return { playerId: player.id, position: player.basketball.primaryPosition, role: status.selectable ? 'RESERVE' : 'UNAVAILABLE', expectedMinutes: 0, fatigue: getCareerFatigueForPlayer(world, player.id), ...(status.reason === undefined ? {} : { blockReason: status.reason, blockDetail: status.detail }) }
      }),
      tactics: gamePlan?.tacticalOverride as MatchTacticalPlan ?? world.tacticalPlansByTeamId[team.id]!.instructions,
      hasGameTacticalOverride: gamePlan?.tacticalOverride !== undefined, matchupCount: gamePlan?.matchups?.length ?? 0,
      rotationSource: 'COACH_PLAN', issues: [], blockedReason: error.message,
    }
  }
  const coaching = isHome ? options.coachingPlans.home : options.coachingPlans.away
  const tactics = isHome ? options.tacticalPlans!.home : options.tacticalPlans!.away
  const rotationIntent = gamePlan?.rotationOverride ?? world.rotationPlansByTeamId[team.id]
  const rotationSource = rotationIntent?.minutesByPeriod !== undefined && coaching.minutesByPeriod === rotationIntent.minutesByPeriod ? 'USER_MINUTES' : 'COACH_PLAN'
  const starters = coaching.startingLineup
  const issues: string[] = []
  const unusableStarters = BASKETBALL_POSITIONS.map((position) => savedLineup.starters[position]).filter((playerId): playerId is PlayerId => playerId !== undefined && !starters.includes(playerId))
  for (const playerId of unusableStarters) {
    const status = statuses.get(playerId)
    const name = world.players[playerId] === undefined ? String(playerId) : `${world.players[playerId]!.firstName} ${world.players[playerId]!.lastName}`
    issues.push(status?.selectable === false ? `${name} no puede jugar este partido (${(status.detail ?? '').replace(/\.$/, '').toLowerCase()}): el entrenador elige a su sustituto.` : `${name} no abrirá el partido: el entrenador reorganiza el quinteto.`)
  }
  if (rotationIntent?.minutesByPeriod !== undefined && rotationSource === 'COACH_PLAN') {
    issues.push('Los minutos guardados ya no encajan con tu quinteto y banquillo (incluyen a jugadores que ya no están entre los doce o no disponibles): el cuerpo técnico reparte los minutos hasta que los guardes de nuevo.')
  }
  const players: MatchReadinessPlayer[] = roster.map((player) => {
    const status = statuses.get(player.id)!
    const slot = getLineupSlotForPlayer(savedLineup, player.id)
    const inSquad = options.squads[isHome ? 'home' : 'away'].includes(player.id)
    const role: MatchReadinessRole = starters.includes(player.id) ? 'STARTER'
      : !status.selectable || !inSquad ? 'UNAVAILABLE'
        : (coaching.expectedMinutesByPlayerId[player.id] ?? 0) > 0 || (slot !== undefined && BENCH_SLOTS.includes(slot as never)) ? 'BENCH' : 'RESERVE'
    return {
      playerId: player.id, position: player.basketball.primaryPosition, role,
      ...(slot === undefined ? {} : { slot }),
      expectedMinutes: coaching.expectedMinutesByPlayerId[player.id] ?? 0,
      fatigue: getCareerFatigueForPlayer(world, player.id),
      ...(status.reason === undefined ? {} : { blockReason: status.reason, blockDetail: status.detail }),
    }
  })
  return {
    ...base, lineupSource: coaching.diagnostics.lineupSource, starters, opponentStarters: (isHome ? options.coachingPlans.away : options.coachingPlans.home).startingLineup, players, tactics,
    hasGameTacticalOverride: gamePlan?.tacticalOverride !== undefined,
    matchupCount: gamePlan?.matchups?.length ?? 0, rotationSource, issues,
  }
}
