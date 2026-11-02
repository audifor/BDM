import { getCurrentSeason } from '@/app/game'
import type { CompetitionId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { resolveActiveCompetitionSeasonsForTeam } from '@/engine/competition'
import { resolveTradeSeasonAuthorityForTeam } from '@/engine/trade'

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

/** Active competition editions for the organisation currently coached by the user. */
export function resolveClubActiveSeasons(world: GameWorld, competitionId?: CompetitionId) {
  const team = getUserTeam(world)
  if (team === undefined) return [] as const
  const seasons = resolveActiveCompetitionSeasonsForTeam(world, team.id, world.currentDate)
  return competitionId === undefined ? seasons : seasons.filter((season) => season.competitionId === competitionId)
}

function governingClubSeasons(world: GameWorld, competitionId?: CompetitionId) {
  const active = resolveClubActiveSeasons(world, competitionId)
  if (active.length > 0) return active
  const team = getUserTeam(world)
  if (team === undefined) return [] as const
  const fallback = competitionId === undefined
    ? world.seasons[world.currentSeasonId]
    : Object.values(world.seasons).find((season) => season.competitionId === competitionId)
  if (fallback === undefined) return [] as const
  const competition = world.competitions[fallback.competitionId]
  const participants = fallback.participantTeamIds?.length ? fallback.participantTeamIds : competition?.participantTeamIds ?? []
  return participants.includes(team.id) ? [fallback] : [] as const
}

/** Derives display context from the canonical world without creating UI-owned game state. */
export function resolveGameContext(world: GameWorld, competitionId?: CompetitionId): GameContext {
  const team = getUserTeam(world)
  const currentSeason = getCurrentSeason(world)
  const selectedCompetitionId = competitionId ?? resolveClubActiveSeasons(world)[0]?.competitionId ?? currentSeason.competitionId
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

/**
 * Facts backed by currently configured world data; no ecosystem rule is inferred here.
 * `hasTrades` follows the user club's own trade authority (`resolveTradeSeasonAuthorityForTeam`),
 * so a manager in an NBA-like/WNBA-like competition keeps the Trades app even when the world's
 * `currentSeasonId` pointer selects another competition; it falls back to that pointer's season
 * when the club has no trade-enabled edition.
 */
export function resolveGameCapabilities(world: GameWorld, competitionId?: CompetitionId): GameCapabilities {
  const seasons = governingClubSeasons(world, competitionId)
  const userTeam = getUserTeam(world)
  const seasonIds = new Set(seasons.map((season) => season.id))
  const ecosystemIds = new Set(seasons.map((season) => world.competitions[season.competitionId]?.ecosystemId).filter((id): id is NonNullable<typeof id> => id !== undefined))
  const tradeAuthority = userTeam === undefined || competitionId !== undefined ? undefined : resolveTradeSeasonAuthorityForTeam(world, userTeam.id)
  return {
    hasDraft: Object.values(world.draftsById).some((draft) => seasonIds.has(draft.sourceSeasonId) && ecosystemIds.has(draft.ecosystemId)),
    hasTrades: tradeAuthority !== undefined
      ? true
      : seasons.some((season) => world.tradeRulesBySeasonId[season.id] !== undefined),
    hasSalaryCap: seasons.some((season) => {
      const rules = world.salaryRulesBySeasonId[season.id]
      return rules !== undefined && rules.capModel !== 'none' && rules.capAccounting !== 'NOT_APPLICABLE'
    }),
    isNcaa: [...ecosystemIds].some((id) => world.ecosystems[id]?.kind === 'ncaaLike'),
  }
}
