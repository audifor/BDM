import type { Game } from '@/domain/game'
import type { CompetitionId, GameId, TeamId } from '@/domain/ids'
import type { MatchResolution } from '@/domain/stats/MatchStatLog'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

/**
 * WSR1 simulation resolution policy: decides, for each Game of a day, whether it is simulated exactly by Match Next (FULL when the user
 * watches it live, FAST otherwise) or by the World Simulation BACKGROUND tier. The decision lives outside Match Next and reads only the
 * canonical world and the user's simulation settings, never the hardware, so the same save resolves the same world on every machine.
 *
 * V1 rules, in priority order:
 *  1. MANDATORY exact: the user's own Game (FULL if watched, else FAST); a Game observed by an active LIVE_GAME scouting assignment.
 *  2. User's competition: FAST (the safest high-detail bubble), except at MINIMAL detail.
 *  3. Low-detail competitions (settings): BACKGROUND.
 *  4. Everything else is exact while the day's exact budget lasts, in priority order (high-detail competitions, then knockout Games when
 *     enabled, then the rest), in schedule order within a priority; the remainder is BACKGROUND.
 */
export type SimulationDetailLevel = 'MINIMAL' | 'STANDARD' | 'DETAILED'

export interface SimulationDetailSettings {
  readonly level: SimulationDetailLevel
  /** Competitions the user (or world context) wants exact whenever the budget allows. */
  readonly highDetailCompetitionIds: readonly CompetitionId[]
  /** Competitions that always resolve in BACKGROUND (unless a Game is mandatory exact). */
  readonly lowDetailCompetitionIds: readonly CompetitionId[]
  /** Exact Games per day beyond the mandatory ones; omitted: the level's default. */
  readonly exactBudgetPerDay?: number
  /** Promote elimination and final Games ahead of regular ones within the budget. */
  readonly promoteKnockoutGames: boolean
}

/** Default exact budgets per level (conservative: the current worlds, at most nine Games a day, stay fully exact at STANDARD). */
export const DEFAULT_EXACT_BUDGET: Readonly<Record<SimulationDetailLevel, number>> = { MINIMAL: 0, STANDARD: 24, DETAILED: 64 }

export const DEFAULT_SIMULATION_DETAIL: SimulationDetailSettings = {
  level: 'STANDARD', highDetailCompetitionIds: [], lowDetailCompetitionIds: [], promoteKnockoutGames: false,
}

export type ResolutionReason =
  | 'COMMAND_DETAIL' | 'OBSERVED_GAME' | 'FOLLOWED_CONTEXT'
  | 'USER_GAME' | 'LIVE_SCOUTING' | 'USER_COMPETITION' | 'HIGH_DETAIL_COMPETITION' | 'KNOCKOUT_GAME' | 'WITHIN_BUDGET'
  | 'LOW_DETAIL_COMPETITION' | 'OVER_BUDGET' | 'MINIMAL_DETAIL'

export interface ResolutionDecision {
  readonly gameId: GameId
  readonly resolution: MatchResolution
  readonly reason: ResolutionReason
}

export interface ResolutionContext extends SimulationResolutionContext {
  /** The user's Game being watched live today, if any (FULL). */
  readonly liveGameId?: GameId
}

export function decideResolutions(world: GameWorld, games: readonly Game[], settings: SimulationDetailSettings = DEFAULT_SIMULATION_DETAIL, context: ResolutionContext = {}): ResolutionDecision[] {
  const userTeam = getUserTeam(world)
  const userCompetitions = new Set(userTeam === undefined ? [] : Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(userTeam.id)).map((competition) => competition.id))
  const scoutedGames = new Set(Object.values(world.scoutingAssignmentsById).filter((assignment) => assignment.missionType === 'LIVE_GAME' && assignment.status === 'ACTIVE' && assignment.gameId !== undefined).map((assignment) => assignment.gameId!))
  const high = new Set(settings.highDetailCompetitionIds)
  const low = new Set(settings.lowDetailCompetitionIds)
  const decisions = new Map<GameId, ResolutionDecision>()
  const candidates: { readonly game: Game; readonly priority: number; readonly reason: ResolutionReason; readonly order: number }[] = []
  games.forEach((game, order) => {
    if (context.forceDetail !== undefined) {
      decisions.set(game.id, { gameId: game.id, resolution: context.forceDetail === 'STANDARD' ? 'FAST' : context.forceDetail, reason: 'COMMAND_DETAIL' }); return
    }
    if (context.observedGameIds?.includes(game.id)) { decisions.set(game.id, { gameId: game.id, resolution: 'FULL', reason: 'OBSERVED_GAME' }); return }
    const userGame = userTeam !== undefined && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)
    if (userGame) { decisions.set(game.id, { gameId: game.id, resolution: context.liveGameId === game.id ? 'FULL' : 'FAST', reason: 'USER_GAME' }); return }
    if (scoutedGames.has(game.id)) { decisions.set(game.id, { gameId: game.id, resolution: 'FAST', reason: 'LIVE_SCOUTING' }); return }
    if (context.followedCompetitionIds?.includes(game.competitionId) || context.followedTeamIds?.some(id => id === game.homeTeamId || id === game.awayTeamId)) {
      decisions.set(game.id, { gameId: game.id, resolution: 'FAST', reason: 'FOLLOWED_CONTEXT' }); return
    }
    if (settings.level === 'MINIMAL') { decisions.set(game.id, { gameId: game.id, resolution: 'BACKGROUND', reason: 'MINIMAL_DETAIL' }); return }
    if (userCompetitions.has(game.competitionId)) { decisions.set(game.id, { gameId: game.id, resolution: 'FAST', reason: 'USER_COMPETITION' }); return }
    if (low.has(game.competitionId)) { decisions.set(game.id, { gameId: game.id, resolution: 'BACKGROUND', reason: 'LOW_DETAIL_COMPETITION' }); return }
    const knockout = game.stakes === 'elimination' || game.stakes === 'final'
    if (high.has(game.competitionId)) candidates.push({ game, priority: 0, reason: 'HIGH_DETAIL_COMPETITION', order })
    else if (settings.promoteKnockoutGames && knockout) candidates.push({ game, priority: 1, reason: 'KNOCKOUT_GAME', order })
    else candidates.push({ game, priority: 2, reason: 'WITHIN_BUDGET', order })
  })
  const budget = settings.exactBudgetPerDay ?? DEFAULT_EXACT_BUDGET[settings.level]
  const ranked = [...candidates].sort((a, b) => a.priority - b.priority || a.order - b.order)
  ranked.forEach((candidate, rank) => {
    decisions.set(candidate.game.id, rank < budget
      ? { gameId: candidate.game.id, resolution: 'FAST', reason: candidate.reason }
      : { gameId: candidate.game.id, resolution: 'BACKGROUND', reason: 'OVER_BUDGET' })
  })
  return games.map((game) => decisions.get(game.id)!)
}

export type SimulationDetail = 'FULL' | 'STANDARD' | 'BACKGROUND'
/** Command-scoped preferences. Derived decisions and detail are never persisted in GameWorld. */
export interface SimulationResolutionContext {
  /** Debug/reference validation choice, independent of sporting resolution detail. */
  readonly dailyValidationMode?: 'full' | 'incremental'
  readonly forceDetail?: SimulationDetail
  readonly observedGameIds?: readonly GameId[]
  readonly followedTeamIds?: readonly TeamId[]
  readonly followedCompetitionIds?: readonly CompetitionId[]
}

/** Compatibility vocabulary over the same policy; sparse exact budget for legacy fixtures. */
export function resolveSimulationDetail(world: GameWorld, game: Game, context: SimulationResolutionContext = {}): SimulationDetail {
  const user = getUserTeam(world)
  const watched = user !== undefined && (game.homeTeamId === user.id || game.awayTeamId === user.id)
    || Object.values(world.scoutingAssignmentsById).some(a => a.status === 'ACTIVE' && a.missionType === 'LIVE_GAME' && a.gameId === game.id)
  const resolution = decideResolutions(world, [game], { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: 0 }, { ...context, ...(watched ? { liveGameId: game.id, observedGameIds: [...(context.observedGameIds ?? []), game.id] } : {}) })[0]!.resolution
  return resolution === 'FAST' ? 'STANDARD' : resolution
}
