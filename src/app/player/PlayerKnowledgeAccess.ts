import type { OrganizationId, PlayerId, TeamId } from '@/domain/ids'
import type { PlayerTruthRatings } from '@/domain/player'
import { DEVELOPMENT_DOMAINS } from '@/domain/player/PlayerDevelopmentProfile'
import { formatRatingEvaluation, getOrganizationRatingEvaluation, type RatingEvaluation } from '@/domain/intelligence'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

const CURRENT_DIMENSIONS = [
  ['finishing', 'Finishing'],
  ['shooting', 'Shooting'],
  ['creation', 'Creation'],
  ['perimeterDefense', 'Perimeter defense'],
  ['interiorDefense', 'Interior defense'],
  ['rebounding', 'Rebounding'],
  ['physical', 'Physical'],
] as const

export interface AuthorizedScoutingDimension {
  readonly id: string
  readonly label: string
  readonly evaluation: RatingEvaluation
  readonly displayLabel: string
  readonly coveragePercent: number
}

interface PlayerKnowledgeAccessBase {
  readonly organizationId: OrganizationId | null
  readonly viewingTeamId: TeamId | null
  readonly knownDimensions: readonly AuthorizedScoutingDimension[]
  readonly knownPotential: readonly AuthorizedScoutingDimension[]
}

export type PlayerKnowledgeAccess =
  | (PlayerKnowledgeAccessBase & {
      readonly kind: 'own-roster'
      readonly currentRatings: PlayerTruthRatings
    })
  | (PlayerKnowledgeAccessBase & {
      readonly kind: 'scouted' | 'unknown'
      readonly currentRatings?: never
    })

/** The single profile access projection. Same-organization membership grants knowledge sharing, not PlayerTruth access. */
export function derivePlayerKnowledgeAccess(
  world: GameWorld,
  playerId: PlayerId,
): PlayerKnowledgeAccess {
  const player = world.players[playerId]
  const viewer = getUserTeam(world)
  if (player === undefined || viewer === undefined) {
    return { kind: 'unknown', organizationId: null, viewingTeamId: null, knownDimensions: [], knownPotential: [] }
  }

  const record = world.organizationKnowledge.find(
    (entry) => entry.organizationId === viewer.organizationId && entry.subjectPlayerId === playerId,
  )
  const evaluate = (dimension: string, label: string): AuthorizedScoutingDimension | undefined => {
    const evaluation = getOrganizationRatingEvaluation({
      organizationId: viewer.organizationId,
      playerId,
      dimension,
      knowledge: world.organizationKnowledge,
      currentDate: world.currentDate,
      publicPosition: player.basketball.primaryPosition,
    })
    if (evaluation.mode === 'UNKNOWN') return undefined
    return {
      id: dimension,
      label,
      evaluation,
      displayLabel: formatRatingEvaluation(evaluation),
      coveragePercent: Math.round((record?.dimensions[dimension]?.coverage ?? 0) * 100),
    }
  }

  const knownDimensions = CURRENT_DIMENSIONS.flatMap(([dimension, label]) => {
    const result = evaluate(dimension, label)
    return result === undefined ? [] : [result]
  })
  const knownPotential = DEVELOPMENT_DOMAINS.flatMap((domain) => {
    const dimension = `potential:${domain}`
    const result = evaluate(dimension, domain[0]!.toUpperCase() + domain.slice(1))
    return result === undefined ? [] : [result]
  })
  const base: PlayerKnowledgeAccessBase = {
    organizationId: viewer.organizationId,
    viewingTeamId: viewer.id,
    knownDimensions,
    knownPotential,
  }

  if (viewer.rosterPlayerIds.includes(playerId)) {
    return { ...base, kind: 'own-roster', currentRatings: player.basketball.ratings }
  }
  return { ...base, kind: knownDimensions.length + knownPotential.length > 0 ? 'scouted' : 'unknown' }
}
