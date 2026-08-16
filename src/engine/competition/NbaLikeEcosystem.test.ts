import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getCompetitionTemporalStatus } from './CompetitionLifecycle'
import { getCompetitionTier } from './PromotionRelegation'
import { getEcosystemsByKind, isNbaLikeCompetition } from '@/domain/world'
import { calculateStandingsForCompetition } from './standings'

describe('NBA-like ecosystem', () => {
  it('coexists with the FIBA-like world as an independent closed franchise league', () => {
    const world = createNewGame()
    const nba = getEcosystemsByKind(world, 'nbaLike')[0]!
    const fiba = getEcosystemsByKind(world, 'fibaLike')[0]!
    const nbaCompetition = Object.values(world.competitions).find((competition) => competition.ecosystemId === nba.id)!
    const fibaCompetition = Object.values(world.competitions).find((competition) => competition.ecosystemId === fiba.id && competition.id === 'generated-competition-0001')!
    const nbaSeason = Object.values(world.seasons).find((season) => season.competitionId === nbaCompetition.id)!
    const fibaSeason = Object.values(world.seasons).find((season) => season.competitionId === fibaCompetition.id)!

    expect(nba.kind).toBe('nbaLike')
    expect(nba.domesticTiers).toEqual([])
    expect(nba.tierMovementRules).toEqual([])
    expect(isNbaLikeCompetition(world, nbaCompetition.id)).toBe(true)
    expect(getCompetitionTier(world, nbaCompetition.id)).toBeUndefined()
    expect(nbaCompetition.participantTeamIds).toHaveLength(4)
    expect(nbaCompetition.participantTeamIds.some((id) => fibaCompetition.participantTeamIds.includes(id))).toBe(false)
    expect(nbaSeason.startDate > fibaSeason.startDate).toBe(true)
    expect(getCompetitionTemporalStatus(world, nbaCompetition.id, fibaSeason.startDate)).toBe('scheduled')
    expect(calculateStandingsForCompetition(world, nbaCompetition.id)).toHaveLength(nbaCompetition.participantTeamIds.length)
  })
})
