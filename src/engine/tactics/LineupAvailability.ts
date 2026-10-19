import type { PlayerId, TeamId } from '@/domain/ids'
import { getActiveInjuryForPlayer, type GameWorld } from '@/domain/world'
import { getNextScheduledGameForTeam } from '@/engine/calendar'
import { isPlayerCareerActive } from '@/engine/career/PlayerCareerLifecycle'
import { evaluatePlayerEligibility } from '@/engine/eligibility'

/** Why a roster player cannot be put into the match squad. */
export type LineupBlockReason = 'NOT_ON_ROSTER' | 'INACTIVE_CAREER' | 'INJURED' | 'INELIGIBLE'

export interface LineupCandidateStatus {
  readonly playerId: PlayerId
  readonly selectable: boolean
  readonly reason?: LineupBlockReason
  /** Human-readable explanation of the block, in the language of the UI. */
  readonly detail?: string
}

export class LineupSelectionError extends Error {
  public constructor(public readonly status: LineupCandidateStatus) {
    super(status.detail ?? `Player ${status.playerId} cannot be selected`)
    this.name = 'LineupSelectionError'
  }
}

/**
 * The one rule for who may be part of a team's match squad: the same predicates the match preparation applies
 * (`getAvailablePlayersForCompetition`: career active, eligible for the competition, not injured on the game date), evaluated for the
 * team's next scheduled game. Without a scheduled game only roster membership, career status and injuries apply.
 */
export function classifyLineupCandidate(world: GameWorld, teamId: TeamId, playerId: PlayerId): LineupCandidateStatus {
  const team = world.teams[teamId]
  if (team === undefined || !team.rosterPlayerIds.includes(playerId)) return { playerId, selectable: false, reason: 'NOT_ON_ROSTER', detail: 'No pertenece a la plantilla del equipo.' }
  if (!isPlayerCareerActive(world, playerId)) return { playerId, selectable: false, reason: 'INACTIVE_CAREER', detail: 'No está en activo.' }
  const game = getNextScheduledGameForTeam(world, teamId)
  const onDate = game?.date ?? world.currentDate
  const injury = getActiveInjuryForPlayer(world, playerId, onDate)
  if (injury !== undefined) return { playerId, selectable: false, reason: 'INJURED', detail: 'Lesionado: no estará disponible para el próximo partido.' }
  if (game !== undefined && !evaluatePlayerEligibility(world, { playerId, teamId, competitionId: game.competitionId, seasonId: game.seasonId, onDate }).eligible) {
    return { playerId, selectable: false, reason: 'INELIGIBLE', detail: 'No es elegible para esta competición.' }
  }
  return { playerId, selectable: true }
}

export function assertLineupCandidate(world: GameWorld, teamId: TeamId, playerId: PlayerId): void {
  const status = classifyLineupCandidate(world, teamId, playerId)
  if (!status.selectable) throw new LineupSelectionError(status)
}
