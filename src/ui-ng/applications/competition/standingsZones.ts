import type { CompetitionId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

/** Presentation-only standings bands (not simulation / playoff resolution). */
export type StandingsZone = 'playoff' | 'promotion' | 'relegation' | 'midtable'

export type StandingsZoneBands = {
  readonly teamCount: number
  readonly playoffThrough: number
  readonly promotionThrough: number
  readonly relegationFrom: number | null
}

export const STANDINGS_ZONE_LABELS: Readonly<Record<Exclude<StandingsZone, 'midtable'>, string>> = {
  playoff: 'Playoff',
  promotion: 'Ascenso',
  relegation: 'Descenso',
}

/**
 * Resolves indicative standings bands for NG chrome.
 * Promotion/relegation prefer ecosystem tierMovementRules; FIBA-like leagues without
 * configured movement still get a conventional top-half playoff cut and bottom-two
 * danger band so the table remains readable (board survival uses the same bottom-two idea).
 */
export function resolveStandingsZoneBands(world: GameWorld, competitionId: CompetitionId): StandingsZoneBands {
  const competition = world.competitions[competitionId]
  const teamCount = competition?.participantTeamIds.length ?? 0
  if (competition === undefined || teamCount === 0) {
    return { teamCount: 0, playoffThrough: 0, promotionThrough: 0, relegationFrom: null }
  }

  const ecosystem = competition.ecosystemId === undefined ? undefined : world.ecosystems[competition.ecosystemId]
  const rules = ecosystem?.tierMovementRules ?? []
  const relegationCount = rules
    .filter((rule) => rule.upperCompetitionId === competitionId)
    .reduce((max, rule) => Math.max(max, rule.exchangeCount), 0)
  const promotionCount = rules
    .filter((rule) => rule.lowerCompetitionId === competitionId)
    .reduce((max, rule) => Math.max(max, rule.exchangeCount), 0)

  const kind = ecosystem?.kind ?? 'fibaLike'
  let playoffThrough = 0
  let effectiveRelegation = relegationCount
  let effectivePromotion = promotionCount

  if (kind === 'fibaLike') {
    if (teamCount >= 8 && effectivePromotion === 0) {
      playoffThrough = Math.min(8, Math.floor(teamCount / 2))
    }
    if (effectiveRelegation === 0 && teamCount >= 12) {
      effectiveRelegation = 2
    }
  } else if (kind === 'nbaLike' && teamCount >= 8) {
    playoffThrough = Math.min(8, Math.floor(teamCount / 2))
  }

  const relegationFrom =
    effectiveRelegation > 0 ? Math.max(1, teamCount - effectiveRelegation + 1) : null

  return {
    teamCount,
    playoffThrough,
    promotionThrough: effectivePromotion,
    relegationFrom,
  }
}

export function standingsZoneForPosition(position: number, bands: StandingsZoneBands): StandingsZone {
  if (!Number.isInteger(position) || position < 1 || bands.teamCount === 0) return 'midtable'
  if (bands.promotionThrough > 0 && position <= bands.promotionThrough) return 'promotion'
  if (bands.relegationFrom !== null && position >= bands.relegationFrom) return 'relegation'
  if (bands.playoffThrough > 0 && position <= bands.playoffThrough) return 'playoff'
  return 'midtable'
}

export function standingsZoneClassName(zone: StandingsZone): string | undefined {
  return zone === 'midtable' ? undefined : `is-zone-${zone}`
}
