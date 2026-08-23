import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createCompetition } from '@/domain/competition'
import { createSportsEcosystem } from '@/domain/ecosystem'
import { createSeason } from '@/domain/season'
import { createGameWorld } from '@/domain/world'
import { competitionIdFromString, seasonIdFromString } from '@/domain/ids'
import { parseGameDate } from '@/domain/date'
import { generateRoundRobinSchedule } from './schedule'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { buildNextCompetitionParticipants, getCompetitionTier, resolvePromotionRelegation } from './PromotionRelegation'

describe('promotion and relegation', () => {
  it('waits for both independent editions, resolves deterministically, and only changes future participants', () => {
    const base = createNewGame(); const teams = Object.values(base.teams); const upperId = competitionIdFromString('tier-one'); const lowerId = competitionIdFromString('tier-two')
    const upper = createCompetition({ id: upperId, name: 'Tier 1', gender: 'male', participantTeamIds: teams.slice(0, 4).map((team) => team.id) })
    const lower = createCompetition({ id: lowerId, name: 'Tier 2', gender: 'male', participantTeamIds: teams.slice(4, 8).map((team) => team.id) })
    const upperSeason = createSeason({ id: seasonIdFromString('tier-one-2032'), competitionId: upperId, label: 'Tier 1 2032', startDate: parseGameDate('2032-10-01'), endDate: parseGameDate('2033-05-20'), participantTeamIds: upper.participantTeamIds })
    const lowerSeason = createSeason({ id: seasonIdFromString('tier-two-2032'), competitionId: lowerId, label: 'Tier 2 2032', startDate: parseGameDate('2032-09-01'), endDate: parseGameDate('2033-05-05'), participantTeamIds: lower.participantTeamIds })
    const ecosystem = createSportsEcosystem({ id: base.ecosystems[upper.ecosystemId]!.id, name: 'Virelia', kind: 'fibaLike', domesticTiers: [{ competitionId: upperId, level: 1 }, { competitionId: lowerId, level: 2 }], tierMovementRules: [{ upperCompetitionId: upperId, lowerCompetitionId: lowerId, exchangeCount: 1 }] })
    let world = createGameWorld({ currentDate: base.currentDate, currentSeasonId: upperSeason.id, userCoachId: base.userCoachId, countries: Object.values(base.countries), coaches: Object.values(base.coaches), players: Object.values(base.players), teams, competitions: [upper, lower], ecosystems: [ecosystem], seasons: [upperSeason, lowerSeason], games: [] })
    const games = [generateRoundRobinSchedule({ world, seasonId: upperSeason.id }), generateRoundRobinSchedule({ world, seasonId: lowerSeason.id })].flat()
    world = createGameWorld({ currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: [upper, lower], ecosystems: [ecosystem], seasons: [upperSeason, lowerSeason], games })
    const preserved = { ecosystems: world.ecosystems, competitions: world.competitions, training: world.trainingPlansByTeamId, fatigue: world.careerFatigueByPlayerId, inbox: world.inboxItemsById, news: world.newsItemsById, seasons: world.seasons }
    const complete = (input: typeof world, seasonId: string) => Object.values(input.games).filter((game) => game.seasonId === seasonId).reduce((current, game) => applyMatchResult(current, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 }), input)
    world = finalizeSeason(complete(world, lowerSeason.id), lowerSeason.id)
    expect(Object.keys(world.promotionRelegationResolutionsById)).toHaveLength(0)
    expect(world.ecosystems).toEqual(preserved.ecosystems); expect(world.competitions).toEqual(preserved.competitions); expect(world.trainingPlansByTeamId).toEqual(preserved.training); expect(world.careerFatigueByPlayerId).toEqual(preserved.fatigue); expect(world.inboxItemsById).toEqual(preserved.inbox); expect(world.seasons[lowerSeason.id]!.participantTeamIds).toEqual(preserved.seasons[lowerSeason.id]!.participantTeamIds)
    world = finalizeSeason(complete(world, upperSeason.id), upperSeason.id)
    const resolved = resolvePromotionRelegation(world, upperSeason.id, lowerSeason.id)
    const resolution = Object.values(resolved.promotionRelegationResolutionsById)[0]!
    expect(resolution.id).toBe(`promotion-relegation:${upperSeason.id}:${lowerSeason.id}`)
    expect(resolved).toEqual(world)
    expect(buildNextCompetitionParticipants(world, upperSeason.id)).toEqual([...upper.participantTeamIds.slice(0, 3), resolution.promotedTeamIds[0]!])
    expect(buildNextCompetitionParticipants(world, lowerSeason.id)).toEqual([...lower.participantTeamIds.slice(1), resolution.relegatedTeamIds[0]!])
    expect(world.seasons[upperSeason.id]!.participantTeamIds).toEqual(upper.participantTeamIds)
    expect(getCompetitionTier(world, lowerId)?.level).toBe(2)
    expect(Object.values(world.memoriesById)).toEqual(expect.arrayContaining([expect.objectContaining({ tags: expect.arrayContaining(['promotion']), permanent: true }), expect.objectContaining({ tags: expect.arrayContaining(['relegation']), permanent: true })]))
  })
})
