import { getCurrentSeason } from '@/app/game'
import type { CompetitionId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

export interface GameContext {
  readonly clubName?: string
  readonly competitionName?: string
  readonly seasonLabel?: string
  /** Competition phases are not yet canonical Domain data, so this stays absent. */
  readonly phaseLabel?: string
  readonly ecosystemName?: string
  readonly ecosystemKind?: 'fibaLike' | 'nbaLike' | 'ncaaLike'
  readonly currentDate: GameWorld['currentDate']
}

export interface GameCapabilities {
  readonly hasDraft: boolean
  readonly hasTrades: boolean
  readonly hasSalaryCap: boolean
  readonly isNcaa: boolean
}

/** Derives display context from the canonical world without creating UI-owned game state. */
export function resolveGameContext(world: GameWorld, competitionId?: CompetitionId): GameContext {
  const team = getUserTeam(world)
  const currentSeason = getCurrentSeason(world)
  const selectedCompetitionId = competitionId ?? currentSeason.competitionId
  const competition = world.competitions[selectedCompetitionId]
  const season = competition === undefined
    ? undefined
    : currentSeason.competitionId === competition.id
      ? currentSeason
      : Object.values(world.seasons).find((candidate) => candidate.competitionId === competition.id)
  const ecosystem = competition === undefined ? undefined : world.ecosystems[competition.ecosystemId]

  return {
    ...(team === undefined ? {} : { clubName: team.name }),
    ...(competition === undefined ? {} : { competitionName: competition.name }),
    ...(season === undefined ? {} : { seasonLabel: season.label }),
    ...(ecosystem === undefined ? {} : { ecosystemName: ecosystem.name, ecosystemKind: ecosystem.kind }),
    currentDate: world.currentDate,
  }
}

/** Facts backed by currently configured world data; no ecosystem rule is inferred here. */
export function resolveGameCapabilities(world: GameWorld, competitionId?: CompetitionId): GameCapabilities {
  const ecosystemId = competitionId === undefined
    ? world.competitions[getCurrentSeason(world).competitionId]?.ecosystemId
    : world.competitions[competitionId]?.ecosystemId
  const seasonId = competitionId === undefined ? world.currentSeasonId : Object.values(world.seasons).find((season) => season.competitionId === competitionId)?.id
  return {
    hasDraft: ecosystemId !== undefined && Object.values(world.draftsById).some((draft) => draft.ecosystemId === ecosystemId),
    hasTrades: seasonId !== undefined && world.tradeRulesBySeasonId[seasonId] !== undefined,
    hasSalaryCap: seasonId !== undefined && world.salaryRulesBySeasonId[seasonId] !== undefined,
    isNcaa: ecosystemId !== undefined && world.ecosystems[ecosystemId]?.kind === 'ncaaLike',
  }
}
