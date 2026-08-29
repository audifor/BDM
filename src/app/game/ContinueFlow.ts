import type { GameId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getPendingMediaOpportunities } from '@/domain/world'
import { advanceGameDay } from './advanceGameDay'

export type ContinueStopReason =
  | { readonly type: 'userGame'; readonly gameId: GameId }
  | { readonly type: 'mediaOpportunity'; readonly opportunityId: string }
  | { readonly type: 'seasonComplete' }
  | { readonly type: 'safetyLimit' }

export interface ContinueResult { readonly world: GameWorld; readonly daysAdvanced: number; readonly finalDate: GameWorld['currentDate']; readonly stopReason: ContinueStopReason }
export interface NextKnownEvent { readonly type: 'userGame'; readonly gameId: GameId; readonly date: GameWorld['currentDate']; readonly opponentTeamId: TeamId }
export const DEFAULT_CONTINUE_DAY_LIMIT = 366

export function getContinueStopReason(world: GameWorld): ContinueStopReason | undefined {
  const media = getPendingMediaOpportunities(world, world.userCoachId)[0]
  if (media !== undefined) return { type: 'mediaOpportunity', opportunityId: media.id }
  const team = getUserTeam(world)
  const userGame = team === undefined ? undefined : getGamesToday(world).find((game) => game.status === 'scheduled' && (game.homeTeamId === team.id || game.awayTeamId === team.id))
  if (userGame !== undefined) return { type: 'userGame', gameId: userGame.id }
  return Object.values(world.games).every((game) => game.status === 'completed') ? { type: 'seasonComplete' } : undefined
}

/** Repeats the canonical daily application flow until a supported interruption. */
export function continueGame(world: GameWorld, dayLimit = DEFAULT_CONTINUE_DAY_LIMIT): ContinueResult {
  if (!Number.isInteger(dayLimit) || dayLimit < 1) throw new RangeError('Continue day limit must be a positive integer')
  let current = world; let daysAdvanced = 0
  while (daysAdvanced < dayLimit) {
    const interruption = getContinueStopReason(current)
    if (interruption !== undefined) return result(current, daysAdvanced, interruption)
    current = advanceGameDay(current)
    daysAdvanced += 1
  }
  return result(current, daysAdvanced, getContinueStopReason(current) ?? { type: 'safetyLimit' })
}

export function getNextKnownEvent(world: GameWorld): NextKnownEvent | undefined {
  const team = getUserTeam(world); const game = getNextUserGame(world)
  if (team === undefined || game === undefined) return undefined
  return { type: 'userGame', gameId: game.id, date: game.date, opponentTeamId: game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId }
}
function result(world: GameWorld, daysAdvanced: number, stopReason: ContinueStopReason): ContinueResult { return { world, daysAdvanced, finalDate: world.currentDate, stopReason } }
